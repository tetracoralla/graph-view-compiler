import {
  collapseNormalizedSemanticGraph,
  compareGraphIds,
  filterNormalizedSemanticGraph,
  groupNormalizedSemanticGraph,
  normalizeSemanticGraph,
  projectNormalizedSemanticGraph,
  sliceNormalizedSemanticGraph,
  SemanticGraphError,
} from "./semantic-graph.js";
import {
  projectFixedGraph,
  projectLayeredGraph,
  type ProjectedEdge,
  type ProjectedGraph,
  type ProjectionRoutingOptions,
} from "./project.js";
import { GraphProjectionError } from "./semantics.js";
import { inspectCompiledView } from "./view-inspection.js";
import { roundedOrthogonalPath } from "./routing.js";
import {
  MAX_GRAPH_VIEW_PASSES,
  MAX_GRAPH_VIEW_DIAGNOSTICS,
  MAX_GRAPH_VIEW_ROUTING_OBSTACLES,
  MAX_PROJECTION_EDGES,
  MAX_PROJECTION_NODES,
  MAX_SEMANTIC_NODES,
  MAX_SEMANTIC_RELATIONS,
  type CollapsedSemanticGraph,
  type EdgeRouteConstraints,
  type LayeredLayoutOptions,
  type NodeBox,
  type Point,
  type SemanticGraphFilter,
  type SemanticGraphSlice,
  type SemanticGraphV1,
  type SemanticGroupAssignment,
} from "./types.js";
import {
  GRAPH_VIEW_PLAN_VERSION,
  GraphViewCompileError,
  type CompileGraphViewInput,
  type GraphViewAlignment,
  type GraphViewBounds,
  type GraphViewChangeSet,
  type GraphViewCompileIssue,
  type GraphViewDiagnostic,
  type GraphViewEdge,
  type GraphViewMembership,
  type GraphViewNode,
  type GraphViewPass,
  type GraphViewPassTrace,
  type GraphViewPlanV1,
  type GraphViewProfileSummary,
  type GraphViewStability,
} from "./compiler-contract.js";

export * from "./compiler-contract.js";

function issue(
  code: GraphViewCompileIssue["code"],
  id: string,
  message: string,
): GraphViewCompileIssue {
  return { code, id, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const known = new Set(allowed);
  return Object.keys(value).every((key) => known.has(key));
}

function optionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value);
}

function validFilter(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["nodeIds", "groupIds", "relationKinds"]) &&
    optionalStringArray(value.nodeIds) &&
    optionalStringArray(value.groupIds) && optionalStringArray(value.relationKinds);
}

function validSlice(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["focus", "direction", "maxDepth"]) &&
    isStringArray(value.focus) && value.focus.length > 0 &&
    typeof value.direction === "string" &&
    ["outgoing", "incoming", "both"].includes(value.direction) &&
    (value.maxDepth === undefined || (typeof value.maxDepth === "number" &&
      Number.isInteger(value.maxDepth) &&
      value.maxDepth >= 0 && value.maxDepth <= MAX_SEMANTIC_NODES));
}

function validAssignment(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ["group", "nodeIds"]) ||
      !isStringArray(value.nodeIds) || !isRecord(value.group) ||
      !hasOnlyKeys(value.group, ["id", "label", "parentGroupId"])) return false;
  return isIdentifier(value.group.id) &&
    (value.group.label === undefined || typeof value.group.label === "string") &&
    (value.group.parentGroupId === undefined || isIdentifier(value.group.parentGroupId));
}

function validatePasses(value: unknown): readonly GraphViewCompileIssue[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    return [issue("invalid_input", "passes", "Graph view passes must be an array")];
  }
  const issues: GraphViewCompileIssue[] = [];
  if (value.length > MAX_GRAPH_VIEW_PASSES) {
    issues.push(issue(
      "too_many_passes",
      "passes",
      `A graph view compile accepts at most ${MAX_GRAPH_VIEW_PASSES} passes`,
    ));
  }
  const ids = new Set<string>();
  value.forEach((candidate, index) => {
    if (!isRecord(candidate) || !isIdentifier(candidate.id)) {
      issues.push(issue("invalid_pass", `passes[${index}]`, `Pass ${index} requires a stable id`));
      return;
    }
    if (ids.has(candidate.id)) {
      issues.push(issue("duplicate_pass_id", candidate.id, `Duplicate pass id: ${candidate.id}`));
    }
    ids.add(candidate.id);
    const valid = candidate.type === "filter"
      ? hasOnlyKeys(candidate, ["id", "type", "filter"]) && validFilter(candidate.filter)
      : candidate.type === "slice"
        ? hasOnlyKeys(candidate, ["id", "type", "slice"]) && validSlice(candidate.slice)
        : candidate.type === "group"
          ? hasOnlyKeys(candidate, ["id", "type", "assignment"]) && validAssignment(candidate.assignment)
          : candidate.type === "collapse"
            ? hasOnlyKeys(candidate, ["id", "type", "groupIds"]) && isStringArray(candidate.groupIds)
            : false;
    if (!valid) {
      issues.push(issue(
        "invalid_pass",
        candidate.id,
        `Pass ${candidate.id} has invalid ${String(candidate.type)} options`,
      ));
    }
  });
  return issues;
}

function optionalNonnegative(value: unknown): boolean {
  return value === undefined || typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateProfile(value: unknown): readonly GraphViewCompileIssue[] {
  if (!isRecord(value)) {
    return [issue("invalid_profile", "profile", "A graph view profile is required")];
  }
  if (value.type === "layered") {
    if (!hasOnlyKeys(value, ["type", "layout"]) || !isRecord(value.layout) ||
        !hasOnlyKeys(value.layout, ["direction", "nodeGap", "edgeGap", "rankGap", "marginX", "marginY"]) ||
        typeof value.layout.direction !== "string" ||
        !["left-to-right", "top-to-bottom"].includes(value.layout.direction) ||
        !optionalNonnegative(value.layout.nodeGap) ||
        !optionalNonnegative(value.layout.edgeGap) ||
        !optionalNonnegative(value.layout.rankGap) ||
        !optionalNonnegative(value.layout.marginX) ||
        !optionalNonnegative(value.layout.marginY)) {
      return [issue("invalid_profile", "profile", "The layered profile has invalid layout options")];
    }
    return [];
  }
  if (value.type === "fixed" && hasOnlyKeys(value, ["type", "positions"]) &&
      isRecord(value.positions)) return [];
  return [issue("invalid_profile", "profile", `Unsupported graph view profile: ${String(value.type)}`)];
}

function validateRouting(value: unknown): readonly GraphViewCompileIssue[] {
  if (value === undefined) return [];
  if (!isRecord(value)) {
    return [issue("invalid_routing_option", "routing", "Routing options must be an object")];
  }
  const issues: GraphViewCompileIssue[] = [];
  const unknown = Object.keys(value).filter((key) =>
    !["stub", "clearance", "turnCost", "maximumObstacles"].includes(key),
  );
  for (const key of unknown.sort(compareGraphIds)) {
    issues.push(issue(
      "invalid_routing_option",
      key,
      `Unknown routing option: ${key}`,
    ));
  }
  for (const key of ["stub", "clearance", "turnCost"] as const) {
    if (!optionalNonnegative(value[key])) {
      issues.push(issue(
        "invalid_routing_option",
        key,
        `${key} must be a finite non-negative number`,
      ));
    }
  }
  if (value.maximumObstacles !== undefined &&
      (!Number.isInteger(value.maximumObstacles) ||
       Number(value.maximumObstacles) < 0 ||
       Number(value.maximumObstacles) > MAX_GRAPH_VIEW_ROUTING_OBSTACLES)) {
    issues.push(issue(
      "invalid_routing_option",
      "maximumObstacles",
      `maximumObstacles must be an integer from 0 to ${MAX_GRAPH_VIEW_ROUTING_OBSTACLES}`,
    ));
  }
  return issues;
}

function validateEdgeRouteConstraints(value: unknown): readonly GraphViewCompileIssue[] {
  if (value === undefined) return [];
  if (!isRecord(value)) {
    return [issue(
      "invalid_edge_route_constraint",
      "edgeRouteConstraints",
      "Edge route constraints must be an object keyed by source relation id",
    )];
  }
  const issues: GraphViewCompileIssue[] = [];
  const entries = Object.entries(value);
  if (entries.length > MAX_SEMANTIC_RELATIONS) {
    return [issue(
      "invalid_edge_route_constraint",
      "edgeRouteConstraints",
      `Edge route constraints may contain at most ${MAX_SEMANTIC_RELATIONS} entries`,
    )];
  }
  for (const [edgeId, candidate] of entries) {
    if (!isIdentifier(edgeId) || !isRecord(candidate) ||
        !hasOnlyKeys(candidate, ["type", "axis", "coordinate"]) ||
        candidate.type !== "orthogonal-corridor" ||
        (candidate.axis !== "x" && candidate.axis !== "y") ||
        typeof candidate.coordinate !== "number" || !Number.isFinite(candidate.coordinate)) {
      issues.push(issue(
        "invalid_edge_route_constraint",
        edgeId,
        `Edge ${edgeId} requires a finite orthogonal-corridor constraint`,
      ));
    }
  }
  return issues;
}

function activeEdgeRouteConstraints(
  value: EdgeRouteConstraints | undefined,
  sourceRelationIds: ReadonlySet<string>,
  projectedEdgeIds: ReadonlySet<string>,
): EdgeRouteConstraints {
  if (value === undefined) return {};
  const unknown = Object.keys(value)
    .filter((edgeId) => !sourceRelationIds.has(edgeId))
    .sort(compareGraphIds);
  if (unknown.length > 0) {
    throw new GraphViewCompileError(unknown.map((edgeId) => issue(
      "unknown_edge_route_constraint",
      edgeId,
      `Edge route constraint refers to unknown source relation ${edgeId}`,
    )));
  }
  return Object.fromEntries(Object.entries(value)
    .filter(([edgeId]) => projectedEdgeIds.has(edgeId))
    .sort(([left], [right]) => compareGraphIds(left, right)));
}

function validateStability(
  value: unknown,
  previousPlan: unknown,
): readonly GraphViewCompileIssue[] {
  if (value === undefined) return [];
  if (!isRecord(value)) {
    return [issue("invalid_input", "stability", "Unsupported graph view stability options")];
  }
  if (value.mode === "none") {
    return hasOnlyKeys(value, ["mode"])
      ? []
      : [issue("invalid_input", "stability", "Unsupported graph view stability options")];
  }
  if (value.mode !== "preserve-anchor" || !hasOnlyKeys(value, ["mode", "anchorNodeId"]) ||
      (value.anchorNodeId !== undefined && !isIdentifier(value.anchorNodeId))) {
    return [issue("invalid_input", "stability", "Unsupported graph view stability options")];
  }
  if (previousPlan === undefined) {
    return [issue(
      "missing_previous_plan",
      "stability",
      "preserve-anchor stability requires a previous graph view plan",
    )];
  }
  return [];
}

function validatePreviousPlan(value: unknown): readonly GraphViewCompileIssue[] {
  if (value === undefined) return [];
  if (!isRecord(value) || value.version !== GRAPH_VIEW_PLAN_VERSION ||
      !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return [issue(
      "invalid_previous_plan",
      "previousPlan",
      `Previous graph view plan must use version ${GRAPH_VIEW_PLAN_VERSION}`,
    )];
  }
  if (value.nodes.length > MAX_PROJECTION_NODES || value.edges.length > MAX_PROJECTION_EDGES) {
    return [issue(
      "invalid_previous_plan",
      "previousPlan",
      "Previous graph view plan exceeds the current projection limits",
    )];
  }
  const nodeIds = value.nodes.map((node) =>
    isRecord(node) && isIdentifier(node.id) &&
      typeof node.x === "number" && Number.isFinite(node.x) &&
      typeof node.y === "number" && Number.isFinite(node.y) &&
      typeof node.width === "number" && Number.isFinite(node.width) && node.width > 0 &&
      typeof node.height === "number" && Number.isFinite(node.height) && node.height > 0
      ? node.id
      : null,
  );
  const edgeIds = value.edges.map((edge) =>
    isRecord(edge) && isIdentifier(edge.id) && typeof edge.path === "string"
      ? edge.id
      : null,
  );
  if (nodeIds.includes(null) || edgeIds.includes(null) ||
      new Set(nodeIds).size !== nodeIds.length || new Set(edgeIds).size !== edgeIds.length) {
    return [issue(
      "invalid_previous_plan",
      "previousPlan",
      "Previous graph view plan contains invalid or duplicate node or edge records",
    )];
  }
  return [];
}

function validSizes(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.values(value).every((size) =>
    isRecord(size) && typeof size.width === "number" && Number.isFinite(size.width) && size.width > 0 &&
    typeof size.height === "number" && Number.isFinite(size.height) && size.height > 0,
  );
}

function validEdgeWeights(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((weight) =>
    typeof weight === "number" && Number.isFinite(weight) && weight > 0,
  );
}

function sanitizedRouting(value: ProjectionRoutingOptions | undefined): ProjectionRoutingOptions {
  if (value === undefined) return {};
  return {
    ...(value.stub === undefined ? {} : { stub: value.stub }),
    ...(value.clearance === undefined ? {} : { clearance: value.clearance }),
    ...(value.turnCost === undefined ? {} : { turnCost: value.turnCost }),
    ...(value.maximumObstacles === undefined ? {} : { maximumObstacles: value.maximumObstacles }),
  };
}

function sanitizedLayout(value: LayeredLayoutOptions): LayeredLayoutOptions {
  return {
    direction: value.direction,
    ...(value.nodeGap === undefined ? {} : { nodeGap: value.nodeGap }),
    ...(value.edgeGap === undefined ? {} : { edgeGap: value.edgeGap }),
    ...(value.rankGap === undefined ? {} : { rankGap: value.rankGap }),
    ...(value.marginX === undefined ? {} : { marginX: value.marginX }),
    ...(value.marginY === undefined ? {} : { marginY: value.marginY }),
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareGraphIds);
}

function initialMembership(graph: SemanticGraphV1): GraphViewMembership {
  return {
    nodes: Object.fromEntries(graph.nodes.map((node) => [node.id, [node.id]])),
    relations: Object.fromEntries(graph.relations.map((relation) => [relation.id, [relation.id]])),
  };
}

function retainMembership(
  membership: GraphViewMembership,
  graph: SemanticGraphV1,
): GraphViewMembership {
  return {
    nodes: Object.fromEntries(graph.nodes.map((node) => [
      node.id,
      membership.nodes[node.id] ?? [node.id],
    ])),
    relations: Object.fromEntries(graph.relations.map((relation) => [
      relation.id,
      membership.relations[relation.id] ?? [relation.id],
    ])),
  };
}

function composeCollapsedMembership(
  current: GraphViewMembership,
  collapsed: CollapsedSemanticGraph,
): GraphViewMembership {
  return {
    nodes: Object.fromEntries(collapsed.graph.nodes.map((node) => [
      node.id,
      uniqueSorted((collapsed.nodeMembers[node.id] ?? [node.id]).flatMap((id) =>
        current.nodes[id] ?? [id],
      )),
    ])),
    relations: Object.fromEntries(collapsed.graph.relations.map((relation) => [
      relation.id,
      uniqueSorted((collapsed.relationMembers[relation.id] ?? [relation.id]).flatMap((id) =>
        current.relations[id] ?? [id],
      )),
    ])),
  };
}

function runPasses(
  source: SemanticGraphV1,
  passes: readonly GraphViewPass[],
): {
  graph: SemanticGraphV1;
  membership: GraphViewMembership;
  trace: readonly GraphViewPassTrace[];
} {
  // One normalization up front; pass variants trust and preserve it.
  let graph = normalizeSemanticGraph(source);
  let membership = initialMembership(graph);
  const trace: GraphViewPassTrace[] = [];
  for (const pass of passes) {
    const inputNodes = graph.nodes.length;
    const inputRelations = graph.relations.length;
    if (pass.type === "filter") {
      graph = filterNormalizedSemanticGraph(graph, pass.filter);
      membership = retainMembership(membership, graph);
    } else if (pass.type === "slice") {
      graph = sliceNormalizedSemanticGraph(graph, pass.slice);
      membership = retainMembership(membership, graph);
    } else if (pass.type === "group") {
      graph = groupNormalizedSemanticGraph(graph, pass.assignment);
    } else {
      const collapsed = collapseNormalizedSemanticGraph(graph, pass.groupIds);
      membership = composeCollapsedMembership(membership, collapsed);
      graph = collapsed.graph;
    }
    trace.push({
      id: pass.id,
      type: pass.type,
      inputNodes,
      inputRelations,
      outputNodes: graph.nodes.length,
      outputRelations: graph.relations.length,
    });
  }
  return { graph, membership, trace };
}

function retypedCompileFailure(
  code: "invalid_semantic_graph" | "invalid_projection",
  error: SemanticGraphError | GraphProjectionError,
): GraphViewCompileError {
  return new GraphViewCompileError(error.issues.map((entry) => ({
    ...issue(code, entry.id, `${entry.code}: ${entry.message}`),
    causeCode: entry.code,
  })));
}

function translateProjectedGraph(
  graph: ProjectedGraph,
  deltaX: number,
  deltaY: number,
): ProjectedGraph {
  if (deltaX === 0 && deltaY === 0) return graph;
  const translatePoint = <T extends Point>(point: T): T => ({
    ...point,
    x: point.x + deltaX,
    y: point.y + deltaY,
  });
  return {
    ...graph,
    nodes: graph.nodes.map((node) => translatePoint(node)),
    edges: graph.edges.map((edge) => {
      const points = edge.route.points.map(translatePoint);
      const jumps = edge.route.jumps?.map(translatePoint);
      return {
        ...edge,
        route: {
          ...edge.route,
          source: translatePoint(edge.route.source),
          target: translatePoint(edge.route.target),
          points,
          ...(jumps === undefined ? {} : { jumps }),
        },
        path: roundedOrthogonalPath(points, jumps ?? []),
        ...(edge.label === undefined
          ? {}
          : { label: { ...edge.label, x: edge.label.x + deltaX, y: edge.label.y + deltaY } }),
      };
    }),
  };
}

function alignProjectedGraph(
  projected: ProjectedGraph,
  previousPlan: GraphViewPlanV1 | undefined,
  stability: GraphViewStability,
): { projected: ProjectedGraph; alignment: GraphViewAlignment } {
  if (stability.mode === "none") {
    return { projected, alignment: { mode: "none", deltaX: 0, deltaY: 0 } };
  }
  const currentById = new Map(projected.nodes.map((node) => [node.id, node]));
  const previousById = new Map((previousPlan?.nodes ?? []).map((node) => [node.id, node]));
  const retained = [...currentById.keys()].filter((id) => previousById.has(id)).sort(compareGraphIds);
  const anchorNodeId = stability.anchorNodeId ?? retained[0];
  const current = anchorNodeId === undefined ? undefined : currentById.get(anchorNodeId);
  const previous = anchorNodeId === undefined ? undefined : previousById.get(anchorNodeId);
  if (anchorNodeId === undefined || current === undefined || previous === undefined) {
    throw new GraphViewCompileError([issue(
      "unknown_anchor",
      stability.anchorNodeId ?? "stability",
      stability.anchorNodeId === undefined
        ? "preserve-anchor stability requires at least one retained node"
        : `Anchor node ${stability.anchorNodeId} is not present in both plans`,
    )]);
  }
  const deltaX = previous.x - current.x;
  const deltaY = previous.y - current.y;
  return {
    projected: translateProjectedGraph(projected, deltaX, deltaY),
    alignment: {
      mode: "preserve-anchor",
      anchorNodeId,
      deltaX,
      deltaY,
    },
  };
}

function graphBounds(nodes: readonly NodeBox[], edges: readonly ProjectedEdge[]): GraphViewBounds {
  const xs = [
    ...nodes.flatMap((node) => [node.x, node.x + node.width]),
    ...edges.flatMap((edge) => edge.route.points.map((point) => point.x)),
    ...edges.flatMap((edge) => edge.label === undefined
      ? []
      : [edge.label.x - edge.label.width / 2, edge.label.x + edge.label.width / 2]),
  ];
  const ys = [
    ...nodes.flatMap((node) => [node.y, node.y + node.height]),
    ...edges.flatMap((edge) => edge.route.points.map((point) => point.y)),
    ...edges.flatMap((edge) => edge.label === undefined
      ? []
      : [edge.label.y - edge.label.height / 2, edge.label.y + edge.label.height / 2]),
  ];
  if (xs.length === 0 || ys.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let x = Number.POSITIVE_INFINITY;
  let y = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (const value of xs) {
    x = Math.min(x, value);
    maximumX = Math.max(maximumX, value);
  }
  for (const value of ys) {
    y = Math.min(y, value);
    maximumY = Math.max(maximumY, value);
  }
  return { x, y, width: maximumX - x, height: maximumY - y };
}

function roundChange(value: number): number {
  return Number(value.toFixed(3));
}

function reconcileChanges(
  previous: GraphViewPlanV1 | undefined,
  nodes: readonly GraphViewNode[],
  edges: readonly GraphViewEdge[],
): GraphViewChangeSet {
  const previousNodes = new Map((previous?.nodes ?? []).map((node) => [node.id, node]));
  const currentNodes = new Map(nodes.map((node) => [node.id, node]));
  const previousEdges = new Map((previous?.edges ?? []).map((edge) => [edge.id, edge]));
  const currentEdges = new Map(edges.map((edge) => [edge.id, edge]));
  const retainedNodeIds = [...currentNodes.keys()].filter((id) => previousNodes.has(id)).sort(compareGraphIds);
  const retainedEdgeIds = [...currentEdges.keys()].filter((id) => previousEdges.has(id)).sort(compareGraphIds);
  const movedNodes = retainedNodeIds.flatMap((id) => {
    const before = previousNodes.get(id)!;
    const after = currentNodes.get(id)!;
    const deltaX = roundChange(after.x - before.x);
    const deltaY = roundChange(after.y - before.y);
    const distance = roundChange(Math.hypot(deltaX, deltaY));
    return distance < 0.001 ? [] : [{ id, deltaX, deltaY, distance }];
  });
  return {
    addedNodeIds: [...currentNodes.keys()].filter((id) => !previousNodes.has(id)).sort(compareGraphIds),
    removedNodeIds: [...previousNodes.keys()].filter((id) => !currentNodes.has(id)).sort(compareGraphIds),
    retainedNodeIds,
    movedNodes,
    addedEdgeIds: [...currentEdges.keys()].filter((id) => !previousEdges.has(id)).sort(compareGraphIds),
    removedEdgeIds: [...previousEdges.keys()].filter((id) => !currentEdges.has(id)).sort(compareGraphIds),
    retainedEdgeIds,
    reroutedEdgeIds: retainedEdgeIds.filter((id) =>
      previousEdges.get(id)?.path !== currentEdges.get(id)?.path,
    ),
  };
}

function diagnosticSourceIds(
  membership: GraphViewMembership,
  viewIds: readonly string[],
): string[] {
  return uniqueSorted(viewIds.flatMap((id) => [
    ...(membership.nodes[id] ?? []),
    ...(membership.relations[id] ?? []),
  ]));
}

export function compileGraphView(input: CompileGraphViewInput): GraphViewPlanV1 {
  const candidate = input as unknown;
  if (!isRecord(candidate)) {
    throw new GraphViewCompileError([issue(
      "invalid_input",
      "input",
      "Graph view compile input must be an object",
    )]);
  }
  const problems = [
    ...validatePasses(candidate.passes),
    ...validateProfile(candidate.profile),
    ...validateRouting(candidate.routing),
    ...validateEdgeRouteConstraints(candidate.edgeRouteConstraints),
    ...validatePreviousPlan(candidate.previousPlan),
    ...validateStability(candidate.stability, candidate.previousPlan),
  ];
  if (!validSizes(candidate.nodeSizes)) {
    problems.push(issue(
      "invalid_input",
      "nodeSizes",
      "nodeSizes must contain finite positive width and height values",
    ));
  }
  if (candidate.labelSizes !== undefined && !validSizes(candidate.labelSizes)) {
    problems.push(issue(
      "invalid_label_size",
      "labelSizes",
      "labelSizes must contain finite positive width and height values",
    ));
  }
  if (candidate.edgeWeights !== undefined && !validEdgeWeights(candidate.edgeWeights)) {
    problems.push(issue(
      "invalid_input",
      "edgeWeights",
      "edgeWeights must contain finite positive numbers",
    ));
  }
  if (isRecord(candidate.profile) && candidate.profile.type === "fixed" &&
      isRecord(candidate.stability) && candidate.stability.mode === "preserve-anchor") {
    problems.push(issue(
      "invalid_profile",
      "stability",
      "Fixed-position views already use authoritative positions and cannot be anchor-aligned",
    ));
  }
  if (candidate.edgeRouteConstraints !== undefined &&
      (!isRecord(candidate.profile) || candidate.profile.type !== "fixed")) {
    problems.push(issue(
      "invalid_edge_route_constraint",
      "edgeRouteConstraints",
      "Edge route constraints require the fixed-position profile",
    ));
  }
  if (problems.length > 0) throw new GraphViewCompileError(problems);

  const passes = (input.passes ?? []) as readonly GraphViewPass[];
  let compiled: ReturnType<typeof runPasses>;
  try {
    compiled = runPasses(input.graph, passes);
  } catch (error) {
    if (error instanceof SemanticGraphError) throw retypedCompileFailure("invalid_semantic_graph", error);
    throw error;
  }
  const missingLabelSizes = compiled.graph.relations
    .filter((relation) => relation.label !== undefined &&
      (input.labelSizes === undefined || !Object.hasOwn(input.labelSizes, relation.id)))
    .map((relation) => issue(
      "missing_label_size",
      relation.id,
      `Missing measured label size for relation ${relation.id}`,
    ));
  if (missingLabelSizes.length > 0) throw new GraphViewCompileError(missingLabelSizes);
  const missingNodeSizes = compiled.graph.nodes
    .filter((node) => !Object.hasOwn(input.nodeSizes, node.id))
    .map((node) => issue(
      "invalid_input",
      node.id,
      `Missing projection size for node ${node.id}`,
    ));
  if (missingNodeSizes.length > 0) throw new GraphViewCompileError(missingNodeSizes);
  const projectionBase = projectNormalizedSemanticGraph(compiled.graph, {
    nodeSizes: input.nodeSizes,
    ...(input.labelSizes === undefined ? {} : { labelSizes: input.labelSizes }),
  });
  const projection = {
    ...projectionBase,
    edges: projectionBase.edges.map((edge) => ({
      ...edge,
      ...(input.edgeWeights === undefined || !Object.hasOwn(input.edgeWeights, edge.id)
        ? {}
        : { weight: input.edgeWeights[edge.id] }),
    })),
  };
  const edgeRouteConstraints = activeEdgeRouteConstraints(
    input.edgeRouteConstraints,
    new Set(input.graph.relations.map((relation) => relation.id)),
    new Set(projection.edges.map((edge) => edge.id)),
  );
  const routing = sanitizedRouting(input.routing);
  const layout = input.profile.type === "layered"
    ? sanitizedLayout(input.profile.layout)
    : undefined;
  let projected: ProjectedGraph;
  try {
    projected = input.profile.type === "layered"
      ? projectLayeredGraph(projection, layout!, routing)
      : projectFixedGraph(projection, {
          positions: input.profile.positions,
          routing,
          edgeRouteConstraints,
        });
  } catch (error) {
    if (error instanceof GraphProjectionError) throw retypedCompileFailure("invalid_projection", error);
    throw error;
  }
  const aligned = alignProjectedGraph(
    projected,
    input.previousPlan,
    input.stability ?? { mode: "none" },
  );
  const semanticNodeById = new Map(compiled.graph.nodes.map((node) => [node.id, node]));
  const semanticRelationById = new Map(compiled.graph.relations.map((relation) => [relation.id, relation]));
  const nodes: GraphViewNode[] = aligned.projected.nodes.map((node) => {
    const semantic = semanticNodeById.get(node.id);
    return {
      ...node,
      ...(semantic?.label === undefined ? {} : { label: semantic.label }),
      ...(semantic?.kind === undefined ? {} : { kind: semantic.kind }),
    };
  });
  const edges: GraphViewEdge[] = aligned.projected.edges.map((edge) => {
    const semantic = semanticRelationById.get(edge.id);
    return {
      ...edge,
      ...(semantic?.kind === undefined ? {} : { kind: semantic.kind }),
    };
  });
  const inspection = inspectCompiledView(nodes, edges);
  // Inspection and routing diagnostics share one deterministic order and one
  // cap, so degradation reasons can never crowd the limit notice out of the
  // plan or bypass the declared returned-diagnostics bound.
  const candidates: Array<Pick<GraphViewDiagnostic, "code" | "message" | "viewIds">> = [
    ...inspection.diagnostics,
  ];
  if (edges.some((edge) => edge.route.fallbackReason === "obstacle-limit")) {
    candidates.push({
      code: "routing_obstacle_limit",
      message: `Obstacle-aware routing is bounded to ${routing.maximumObstacles ?? 40} of the nearest unrelated nodes per edge; simple orthogonal fallback was used`,
      viewIds: [],
    });
  }
  for (const edge of edges) {
    if (edge.route.fallbackReason !== "no-corridor") continue;
    candidates.push({
      code: "routing_fallback",
      message: `Edge ${edge.id} fell back to simple orthogonal routing because no obstacle-avoiding corridor was found`,
      viewIds: [edge.id],
    });
  }
  const keyedCandidates = candidates.map((candidate) => ({
    key: `${candidate.code}\0${candidate.viewIds.join("\0")}`,
    candidate,
  }));
  keyedCandidates.sort((left, right) => compareGraphIds(left.key, right.key));
  const truncated = keyedCandidates.length > MAX_GRAPH_VIEW_DIAGNOSTICS;
  const returnedCandidateLimit = truncated
    ? MAX_GRAPH_VIEW_DIAGNOSTICS - 1
    : MAX_GRAPH_VIEW_DIAGNOSTICS;
  const diagnostics: GraphViewDiagnostic[] = keyedCandidates
    .slice(0, returnedCandidateLimit)
    .map((entry) => ({
      ...entry.candidate,
      severity: "warning",
      sourceIds: diagnosticSourceIds(compiled.membership, entry.candidate.viewIds),
    }));
  if (truncated) {
    diagnostics.push({
      code: "diagnostic_limit",
      severity: "warning",
      message: `The view produced ${keyedCandidates.length} distinct geometric and routing diagnostics; only the first ${returnedCandidateLimit} are returned within the ${MAX_GRAPH_VIEW_DIAGNOSTICS}-diagnostic response limit`,
      viewIds: [],
      sourceIds: [],
    });
  }
  const profile: GraphViewProfileSummary = input.profile.type === "layered"
    ? { type: "layered", backend: "dagre-layered-v1", layout: layout! }
    : { type: "fixed", backend: "fixed-position-v1" };
  return {
    version: GRAPH_VIEW_PLAN_VERSION,
    profile,
    semanticGraph: compiled.graph,
    passes: compiled.trace,
    bounds: graphBounds(nodes, edges),
    nodes,
    edges,
    membership: compiled.membership,
    quality: inspection.quality,
    diagnostics,
    alignment: aligned.alignment,
    change: reconcileChanges(input.previousPlan, nodes, edges),
  };
}

export { SemanticGraphError } from "./semantic-graph.js";
export { GraphProjectionError } from "./semantics.js";
export type {
  EdgeRouteConstraint,
  EdgeRouteConstraints,
  LayeredLayoutOptions,
  Point,
  SemanticGraphFilter,
  SemanticGraphSlice,
  SemanticGraphV1,
  SemanticGroupAssignment,
} from "./types.js";
