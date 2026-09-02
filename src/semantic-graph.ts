import type {
  CollapsedSemanticGraph,
  SemanticGraphFilter,
  SemanticGraphIssue,
  SemanticGraphSlice,
  SemanticGraphV1,
  SemanticGroup,
  SemanticGroupAssignment,
  SemanticNode,
  SemanticPath,
  SemanticPathQuery,
  SemanticProjectionOptions,
  SemanticRelation,
} from "./types.js";
import {
  GRAPH_PROJECTION_VERSION,
  MAX_SEMANTIC_GROUPS,
  MAX_SEMANTIC_NODES,
  MAX_SEMANTIC_PATHS,
  MAX_SEMANTIC_PATH_STATES,
  MAX_SEMANTIC_RELATIONS,
  SEMANTIC_GRAPH_VERSION,
} from "./types.js";

const MAX_IDENTIFIER_LENGTH = 256;
const MAX_TRAVERSAL_DEPTH = MAX_SEMANTIC_NODES;

export class SemanticGraphError extends Error {
  readonly issues: readonly SemanticGraphIssue[];

  constructor(issues: readonly SemanticGraphIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "SemanticGraphError";
    this.issues = issues;
  }
}

export function compareGraphIds(left: string, right: string): number {
  const leftPoints = [...left];
  const rightPoints = [...right];
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index]?.codePointAt(0) ?? 0;
    const rightPoint = rightPoints[index]?.codePointAt(0) ?? 0;
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
  }
  return leftPoints.length < rightPoints.length
    ? -1
    : leftPoints.length > rightPoints.length
      ? 1
      : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= MAX_IDENTIFIER_LENGTH && value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function optionalText(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function issue(
  code: SemanticGraphIssue["code"],
  id: string,
  message: string,
): SemanticGraphIssue {
  return { code, id, message };
}

function relationDirection(value: unknown): boolean {
  return value === "directed" || value === "undirected" || value === "bidirectional";
}

export function validateSemanticGraph(value: unknown): readonly SemanticGraphIssue[] {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.relations)) {
    return [issue("invalid_graph", "graph", "Semantic graph must contain node and relation arrays")];
  }
  const issues: SemanticGraphIssue[] = [];
  if (value.version !== SEMANTIC_GRAPH_VERSION) {
    issues.push(issue(
      "invalid_version",
      "graph",
      `Semantic graph version must be ${SEMANTIC_GRAPH_VERSION}`,
    ));
  }
  const groups = value.groups === undefined
    ? []
    : Array.isArray(value.groups)
      ? value.groups
      : null;
  if (groups === null) {
    issues.push(issue("invalid_graph", "groups", "Semantic graph groups must be an array"));
  }
  if (value.nodes.length > MAX_SEMANTIC_NODES) {
    issues.push(issue(
      "too_many_nodes",
      "graph",
      `Graph has ${value.nodes.length} nodes; the maximum is ${MAX_SEMANTIC_NODES}`,
    ));
  }
  if (value.relations.length > MAX_SEMANTIC_RELATIONS) {
    issues.push(issue(
      "too_many_relations",
      "graph",
      `Graph has ${value.relations.length} relations; the maximum is ${MAX_SEMANTIC_RELATIONS}`,
    ));
  }
  if (groups !== null && groups.length > MAX_SEMANTIC_GROUPS) {
    issues.push(issue(
      "too_many_groups",
      "graph",
      `Graph has ${groups.length} groups; the maximum is ${MAX_SEMANTIC_GROUPS}`,
    ));
  }

  const groupIds = new Set<string>();
  const groupParents = new Map<string, string>();
  for (const [index, candidate] of (groups ?? []).entries()) {
    if (!isRecord(candidate) || !validIdentifier(candidate.id) ||
        !optionalText(candidate.label) || !optionalText(candidate.parentGroupId)) {
      issues.push(issue("invalid_identifier", `groups[${index}]`, `Invalid semantic group at index ${index}`));
      continue;
    }
    if (groupIds.has(candidate.id)) {
      issues.push(issue("duplicate_group_id", candidate.id, `Duplicate group id: ${candidate.id}`));
    }
    groupIds.add(candidate.id);
    if (typeof candidate.parentGroupId === "string") {
      groupParents.set(candidate.id, candidate.parentGroupId);
    }
  }
  for (const [id, parent] of groupParents) {
    if (!groupIds.has(parent)) {
      issues.push(issue("missing_parent_group", id, `Group ${id} references missing parent group ${parent}`));
    }
  }
  const reportedCycles = new Set<string>();
  for (const id of [...groupIds].sort(compareGraphIds)) {
    const path: string[] = [];
    const position = new Map<string, number>();
    let cursor: string | undefined = id;
    while (cursor !== undefined && groupIds.has(cursor)) {
      const seenAt = position.get(cursor);
      if (seenAt !== undefined) {
        const members = path.slice(seenAt).sort(compareGraphIds);
        const key = members.join("\u0000");
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          issues.push(issue("group_cycle", members[0] ?? cursor, `Group cycle: ${members.join(" -> ")}`));
        }
        break;
      }
      position.set(cursor, path.length);
      path.push(cursor);
      cursor = groupParents.get(cursor);
    }
  }

  const nodeIds = new Set<string>();
  const portsByNode = new Map<string, Set<string>>();
  for (const [index, candidate] of value.nodes.entries()) {
    if (!isRecord(candidate) || !validIdentifier(candidate.id) ||
        !optionalText(candidate.label) || !optionalText(candidate.kind) ||
        !optionalText(candidate.groupId)) {
      issues.push(issue("invalid_identifier", `nodes[${index}]`, `Invalid semantic node at index ${index}`));
      continue;
    }
    if (nodeIds.has(candidate.id)) {
      issues.push(issue("duplicate_node_id", candidate.id, `Duplicate node id: ${candidate.id}`));
    }
    if (groupIds.has(candidate.id)) {
      issues.push(issue("duplicate_graph_id", candidate.id, `Node and group ids share one namespace: ${candidate.id}`));
    }
    nodeIds.add(candidate.id);
    if (typeof candidate.groupId === "string" && !groupIds.has(candidate.groupId)) {
      issues.push(issue("missing_group", candidate.id, `Node ${candidate.id} references missing group ${candidate.groupId}`));
    }
    if (candidate.ports !== undefined && !Array.isArray(candidate.ports)) {
      issues.push(issue("invalid_graph", candidate.id, `Node ${candidate.id} ports must be an array`));
      continue;
    }
    const portIds = new Set<string>();
    for (const [portIndex, port] of (candidate.ports ?? []).entries()) {
      if (!isRecord(port) || !validIdentifier(port.id) || !optionalText(port.kind) ||
          (port.preferredSide !== undefined &&
            (typeof port.preferredSide !== "string" ||
              !["top", "right", "bottom", "left"].includes(port.preferredSide)))) {
        issues.push(issue("invalid_identifier", `${candidate.id}.ports[${portIndex}]`, `Invalid port on node ${candidate.id}`));
        continue;
      }
      if (portIds.has(port.id)) {
        issues.push(issue("duplicate_port_id", `${candidate.id}:${port.id}`, `Duplicate port ${port.id} on node ${candidate.id}`));
      }
      portIds.add(port.id);
    }
    portsByNode.set(candidate.id, portIds);
  }

  const relationIds = new Set<string>();
  for (const [index, candidate] of value.relations.entries()) {
    if (!isRecord(candidate) || !validIdentifier(candidate.id) ||
        !validIdentifier(candidate.source) || !validIdentifier(candidate.target) ||
        !optionalText(candidate.label) || !optionalText(candidate.kind) ||
        !optionalText(candidate.sourcePort) || !optionalText(candidate.targetPort)) {
      issues.push(issue("invalid_identifier", `relations[${index}]`, `Invalid semantic relation at index ${index}`));
      continue;
    }
    if (!relationDirection(candidate.direction)) {
      issues.push(issue("invalid_direction", candidate.id, `Relation ${candidate.id} has an invalid direction`));
    }
    if (relationIds.has(candidate.id)) {
      issues.push(issue("duplicate_relation_id", candidate.id, `Duplicate relation id: ${candidate.id}`));
    }
    relationIds.add(candidate.id);
    if (!nodeIds.has(candidate.source)) {
      issues.push(issue("missing_source", candidate.id, `Relation ${candidate.id} references missing source ${candidate.source}`));
    }
    if (!nodeIds.has(candidate.target)) {
      issues.push(issue("missing_target", candidate.id, `Relation ${candidate.id} references missing target ${candidate.target}`));
    }
    if (typeof candidate.sourcePort === "string" &&
        !portsByNode.get(candidate.source)?.has(candidate.sourcePort)) {
      issues.push(issue("missing_source_port", candidate.id, `Relation ${candidate.id} references missing source port ${candidate.sourcePort}`));
    }
    if (typeof candidate.targetPort === "string" &&
        !portsByNode.get(candidate.target)?.has(candidate.targetPort)) {
      issues.push(issue("missing_target_port", candidate.id, `Relation ${candidate.id} references missing target port ${candidate.targetPort}`));
    }
  }
  return issues;
}

export function assertSemanticGraph(value: unknown): asserts value is SemanticGraphV1 {
  const issues = validateSemanticGraph(value);
  if (issues.length > 0) throw new SemanticGraphError(issues);
}

function cloneNode(node: SemanticNode): SemanticNode {
  return {
    id: node.id,
    ...(node.label === undefined ? {} : { label: node.label }),
    ...(node.kind === undefined ? {} : { kind: node.kind }),
    ...(node.groupId === undefined ? {} : { groupId: node.groupId }),
    ...(node.ports === undefined
      ? {}
      : {
          ports: node.ports.map((port) => ({
            id: port.id,
            ...(port.kind === undefined ? {} : { kind: port.kind }),
            ...(port.preferredSide === undefined ? {} : { preferredSide: port.preferredSide }),
          })).sort((left, right) => compareGraphIds(left.id, right.id)),
        }),
  };
}

function cloneRelation(relation: SemanticRelation): SemanticRelation {
  return {
    id: relation.id,
    source: relation.source,
    target: relation.target,
    direction: relation.direction,
    ...(relation.label === undefined ? {} : { label: relation.label }),
    ...(relation.kind === undefined ? {} : { kind: relation.kind }),
    ...(relation.sourcePort === undefined ? {} : { sourcePort: relation.sourcePort }),
    ...(relation.targetPort === undefined ? {} : { targetPort: relation.targetPort }),
  };
}

function cloneGroup(group: SemanticGroup): SemanticGroup {
  return {
    id: group.id,
    ...(group.label === undefined ? {} : { label: group.label }),
    ...(group.parentGroupId === undefined ? {} : { parentGroupId: group.parentGroupId }),
  };
}

export function normalizeSemanticGraph(graph: SemanticGraphV1): SemanticGraphV1 {
  assertSemanticGraph(graph);
  const groups = graph.groups?.map(cloneGroup).sort((left, right) => compareGraphIds(left.id, right.id));
  return {
    version: SEMANTIC_GRAPH_VERSION,
    nodes: graph.nodes.map(cloneNode).sort((left, right) => compareGraphIds(left.id, right.id)),
    relations: graph.relations.map(cloneRelation).sort((left, right) => compareGraphIds(left.id, right.id)),
    ...(groups === undefined || groups.length === 0 ? {} : { groups }),
  };
}

function groupDescendants(groups: readonly SemanticGroup[]): ReadonlyMap<string, ReadonlySet<string>> {
  const children = new Map<string, string[]>();
  for (const group of groups) {
    if (group.parentGroupId === undefined) continue;
    const list = children.get(group.parentGroupId) ?? [];
    list.push(group.id);
    children.set(group.parentGroupId, list);
  }
  const result = new Map<string, ReadonlySet<string>>();
  for (const group of groups) {
    const found = new Set([group.id]);
    const pending = [group.id];
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) continue;
      for (const child of (children.get(current) ?? []).sort(compareGraphIds)) {
        if (found.has(child)) continue;
        found.add(child);
        pending.push(child);
      }
    }
    result.set(group.id, found);
  }
  return result;
}

function selectionIssues(known: ReadonlySet<string>, selected: readonly string[], kind: string): SemanticGraphIssue[] {
  return [...new Set(selected)].filter((id) => !known.has(id)).sort(compareGraphIds).map((id) =>
    issue("unknown_selection", id, `Unknown ${kind}: ${id}`),
  );
}

export function filterSemanticGraph(
  graph: SemanticGraphV1,
  filter: SemanticGraphFilter,
): SemanticGraphV1 {
  const normalized = normalizeSemanticGraph(graph);
  const groups = normalized.groups ?? [];
  const nodeIds = new Set(normalized.nodes.map((node) => node.id));
  const groupIds = new Set(groups.map((group) => group.id));
  const problems = [
    ...selectionIssues(nodeIds, filter.nodeIds ?? [], "node"),
    ...selectionIssues(groupIds, filter.groupIds ?? [], "group"),
  ];
  if (problems.length > 0) throw new SemanticGraphError(problems);
  const hasNodeSelection = filter.nodeIds !== undefined || filter.groupIds !== undefined;
  const selectedNodes = hasNodeSelection ? new Set(filter.nodeIds ?? []) : new Set(nodeIds);
  const descendants = groupDescendants(groups);
  for (const groupId of filter.groupIds ?? []) {
    const includedGroups = descendants.get(groupId) ?? new Set([groupId]);
    for (const node of normalized.nodes) {
      if (node.groupId !== undefined && includedGroups.has(node.groupId)) selectedNodes.add(node.id);
    }
  }
  const allowedKinds = filter.relationKinds === undefined
    ? null
    : new Set(filter.relationKinds);
  const nodes = normalized.nodes.filter((node) => selectedNodes.has(node.id));
  const relations = normalized.relations.filter((relation) =>
    selectedNodes.has(relation.source) && selectedNodes.has(relation.target) &&
    (allowedKinds === null || allowedKinds.has(relation.kind ?? "")),
  );
  const retainedGroups = new Set(nodes.flatMap((node) => node.groupId === undefined ? [] : [node.groupId]));
  const parentById = new Map(groups.map((group) => [group.id, group.parentGroupId]));
  for (const id of [...retainedGroups]) {
    let parent = parentById.get(id);
    while (parent !== undefined) {
      retainedGroups.add(parent);
      parent = parentById.get(parent);
    }
  }
  const keptGroups = groups.filter((group) => retainedGroups.has(group.id));
  return {
    version: SEMANTIC_GRAPH_VERSION,
    nodes,
    relations,
    ...(keptGroups.length === 0 ? {} : { groups: keptGroups }),
  };
}

interface AdjacencyStep {
  nodeId: string;
  relationId: string;
}

function adjacencyFor(
  graph: SemanticGraphV1,
  direction: "outgoing" | "incoming" | "both",
): ReadonlyMap<string, readonly AdjacencyStep[]> {
  const adjacency = new Map<string, AdjacencyStep[]>(graph.nodes.map((node) => [node.id, []]));
  const add = (from: string, to: string, relationId: string) => {
    adjacency.get(from)?.push({ nodeId: to, relationId });
  };
  for (const relation of graph.relations) {
    const symmetric = relation.direction !== "directed" || direction === "both";
    if (direction !== "incoming") add(relation.source, relation.target, relation.id);
    if (direction !== "outgoing" || symmetric) add(relation.target, relation.source, relation.id);
    if (direction === "incoming" && symmetric) add(relation.source, relation.target, relation.id);
  }
  for (const steps of adjacency.values()) {
    steps.sort((left, right) => compareGraphIds(left.nodeId, right.nodeId) || compareGraphIds(left.relationId, right.relationId));
  }
  return adjacency;
}

function checkedDepth(value: number | undefined, fallback: number): number {
  const depth = value ?? fallback;
  if (!Number.isInteger(depth) || depth < 0 || depth > MAX_TRAVERSAL_DEPTH) {
    throw new SemanticGraphError([
      issue("invalid_option", "maxDepth", `maxDepth must be an integer from 0 to ${MAX_TRAVERSAL_DEPTH}`),
    ]);
  }
  return depth;
}

function checkedDirection(
  value: unknown,
  fallback?: "outgoing" | "incoming" | "both",
): "outgoing" | "incoming" | "both" {
  const direction = value ?? fallback;
  if (direction !== "outgoing" && direction !== "incoming" && direction !== "both") {
    throw new SemanticGraphError([
      issue("invalid_option", "direction", `direction must be "outgoing", "incoming", or "both"`),
    ]);
  }
  return direction;
}

export function sliceSemanticGraph(
  graph: SemanticGraphV1,
  options: SemanticGraphSlice,
): SemanticGraphV1 {
  const normalized = normalizeSemanticGraph(graph);
  const known = new Set(normalized.nodes.map((node) => node.id));
  const problems = selectionIssues(known, options.focus, "focus node");
  if (options.focus.length === 0) {
    problems.push(issue("invalid_option", "focus", "Semantic slice requires at least one focus node"));
  }
  if (problems.length > 0) throw new SemanticGraphError(problems);
  const maxDepth = checkedDepth(options.maxDepth, MAX_TRAVERSAL_DEPTH);
  const direction = checkedDirection(options.direction);
  const adjacency = adjacencyFor(normalized, direction);
  const selected = new Set(options.focus);
  const pending = [...new Set(options.focus)].sort(compareGraphIds).map((id) => ({ id, depth: 0 }));
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const current = pending[cursor];
    if (current === undefined || current.depth >= maxDepth) continue;
    for (const step of adjacency.get(current.id) ?? []) {
      if (selected.has(step.nodeId)) continue;
      selected.add(step.nodeId);
      pending.push({ id: step.nodeId, depth: current.depth + 1 });
    }
  }
  return filterSemanticGraph(normalized, { nodeIds: [...selected] });
}

export function findSemanticPaths(
  graph: SemanticGraphV1,
  query: SemanticPathQuery,
): readonly SemanticPath[] {
  const normalized = normalizeSemanticGraph(graph);
  const known = new Set(normalized.nodes.map((node) => node.id));
  const problems = selectionIssues(known, [query.from, query.to], "path node");
  if (problems.length > 0) throw new SemanticGraphError(problems);
  const maxDepth = checkedDepth(query.maxDepth, Math.min(64, MAX_TRAVERSAL_DEPTH));
  const maxPaths = query.maxPaths ?? 64;
  if (!Number.isInteger(maxPaths) || maxPaths < 1 || maxPaths > MAX_SEMANTIC_PATHS) {
    throw new SemanticGraphError([
      issue("invalid_option", "maxPaths", `maxPaths must be an integer from 1 to ${MAX_SEMANTIC_PATHS}`),
    ]);
  }
  if (query.from === query.to) return [{ nodes: [query.from], relations: [] }];
  const direction = checkedDirection(query.direction, "outgoing");
  const adjacency = adjacencyFor(normalized, direction);
  const found: SemanticPath[] = [];
  let exploredStates = 0;
  const stack: Array<{ nodeId: string; nodes: string[]; relations: string[]; visited: Set<string> }> = [{
    nodeId: query.from,
    nodes: [query.from],
    relations: [],
    visited: new Set([query.from]),
  }];
  while (stack.length > 0 && found.length < maxPaths) {
    if (exploredStates >= MAX_SEMANTIC_PATH_STATES) {
      throw new SemanticGraphError([
        issue(
          "work_limit_exceeded",
          "path",
          `Path search exceeds ${MAX_SEMANTIC_PATH_STATES} explored states; reduce maxDepth or narrow the graph`,
        ),
      ]);
    }
    exploredStates += 1;
    const current = stack.pop();
    if (current === undefined) continue;
    if (current.nodeId === query.to) {
      found.push({ nodes: current.nodes, relations: current.relations });
      continue;
    }
    if (current.relations.length >= maxDepth) continue;
    const steps = adjacency.get(current.nodeId) ?? [];
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      const step = steps[index];
      if (step === undefined || current.visited.has(step.nodeId)) continue;
      const nodes = [...current.nodes, step.nodeId];
      const relations = [...current.relations, step.relationId];
      stack.push({
        nodeId: step.nodeId,
        nodes,
        relations,
        visited: new Set([...current.visited, step.nodeId]),
      });
    }
  }
  return found;
}

export function groupSemanticNodes(
  graph: SemanticGraphV1,
  assignment: SemanticGroupAssignment,
): SemanticGraphV1 {
  const normalized = normalizeSemanticGraph(graph);
  const knownNodes = new Set(normalized.nodes.map((node) => node.id));
  const groups = normalized.groups ?? [];
  const knownGroups = new Set(groups.map((group) => group.id));
  const problems = selectionIssues(knownNodes, assignment.nodeIds, "node");
  if (!validIdentifier(assignment.group.id)) {
    problems.push(issue("invalid_identifier", "group", "Group id must be a stable non-empty identifier"));
  } else if (knownGroups.has(assignment.group.id) || knownNodes.has(assignment.group.id)) {
    problems.push(issue("duplicate_graph_id", assignment.group.id, `Graph id already exists: ${assignment.group.id}`));
  }
  if (assignment.group.parentGroupId !== undefined && !knownGroups.has(assignment.group.parentGroupId)) {
    problems.push(issue("missing_parent_group", assignment.group.id, `Missing parent group ${assignment.group.parentGroupId}`));
  }
  if (problems.length > 0) throw new SemanticGraphError(problems);
  const selected = new Set(assignment.nodeIds);
  return normalizeSemanticGraph({
    version: SEMANTIC_GRAPH_VERSION,
    nodes: normalized.nodes.map((node) => selected.has(node.id) ? { ...node, groupId: assignment.group.id } : node),
    relations: normalized.relations,
    groups: [...groups, cloneGroup(assignment.group)],
  });
}

function selectedCollapseGroup(
  groupId: string | undefined,
  selected: ReadonlySet<string>,
  parentById: ReadonlyMap<string, string | undefined>,
): string | undefined {
  let cursor = groupId;
  let selectedAncestor: string | undefined;
  while (cursor !== undefined) {
    if (selected.has(cursor)) selectedAncestor = cursor;
    cursor = parentById.get(cursor);
  }
  return selectedAncestor;
}

export function collapseSemanticGroups(
  graph: SemanticGraphV1,
  groupIds: readonly string[],
): CollapsedSemanticGraph {
  const normalized = normalizeSemanticGraph(graph);
  const groups = normalized.groups ?? [];
  const knownGroups = new Set(groups.map((group) => group.id));
  const problems = selectionIssues(knownGroups, groupIds, "group");
  if (problems.length > 0) throw new SemanticGraphError(problems);
  const selected = new Set(groupIds);
  if (selected.size === 0) {
    return {
      graph: normalized,
      nodeMembers: Object.fromEntries(normalized.nodes.map((node) => [node.id, [node.id]])),
      relationMembers: Object.fromEntries(normalized.relations.map((relation) => [relation.id, [relation.id]])),
      absorbedRelationIds: [],
    };
  }
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const parentById = new Map(groups.map((group) => [group.id, group.parentGroupId]));
  const proxyByNode = new Map(normalized.nodes.map((node) => [
    node.id,
    selectedCollapseGroup(node.groupId, selected, parentById) ?? node.id,
  ]));
  const usedProxies = new Set([...proxyByNode.values()].filter((id) => selected.has(id)));
  const nodes: SemanticNode[] = [];
  const nodeMembers: Record<string, string[]> = {};
  for (const node of normalized.nodes) {
    const proxyId = proxyByNode.get(node.id) ?? node.id;
    const members = nodeMembers[proxyId] ?? [];
    members.push(node.id);
    nodeMembers[proxyId] = members;
    if (proxyId === node.id) nodes.push(cloneNode(node));
  }
  for (const groupId of [...usedProxies].sort(compareGraphIds)) {
    const group = groupById.get(groupId);
    if (group === undefined) continue;
    const parentGroupId = selectedCollapseGroup(group.parentGroupId, selected, parentById) ?? group.parentGroupId;
    nodes.push({
      id: group.id,
      label: group.label ?? group.id,
      kind: "group",
      ...(parentGroupId === undefined ? {} : { groupId: parentGroupId }),
    });
  }
  const relations: SemanticRelation[] = [];
  const relationMembers: Record<string, string[]> = {};
  const absorbedRelationIds: string[] = [];
  for (const relation of normalized.relations) {
    const source = proxyByNode.get(relation.source) ?? relation.source;
    const target = proxyByNode.get(relation.target) ?? relation.target;
    if (source === target) {
      absorbedRelationIds.push(relation.id);
      continue;
    }
    const {
      sourcePort: _sourcePort,
      targetPort: _targetPort,
      ...baseRelation
    } = relation;
    relations.push({
      ...baseRelation,
      source,
      target,
      ...(source === relation.source && relation.sourcePort !== undefined
        ? { sourcePort: relation.sourcePort }
        : {}),
      ...(target === relation.target && relation.targetPort !== undefined
        ? { targetPort: relation.targetPort }
        : {}),
    });
    relationMembers[relation.id] = [relation.id];
  }
  const descendants = groupDescendants(groups);
  const removedGroups = new Set<string>();
  for (const groupId of selected) {
    for (const descendant of descendants.get(groupId) ?? [groupId]) removedGroups.add(descendant);
  }
  const remainingGroups = groups.filter((group) => !removedGroups.has(group.id));
  const collapsed = normalizeSemanticGraph({
    version: SEMANTIC_GRAPH_VERSION,
    nodes,
    relations,
    ...(remainingGroups.length === 0 ? {} : { groups: remainingGroups }),
  });
  for (const members of Object.values(nodeMembers)) members.sort(compareGraphIds);
  absorbedRelationIds.sort(compareGraphIds);
  return { graph: collapsed, nodeMembers, relationMembers, absorbedRelationIds };
}

export function semanticGraphToProjectionGraph(
  graph: SemanticGraphV1,
  options: SemanticProjectionOptions,
): import("./types.js").ProjectionGraphV1 {
  const normalized = normalizeSemanticGraph(graph);
  const problems: SemanticGraphIssue[] = [];
  const nodeById = new Map(normalized.nodes.map((node) => [node.id, node]));
  const nodes = normalized.nodes.flatMap((node) => {
    const size = options.nodeSizes[node.id];
    if (size === undefined) {
      problems.push(issue("missing_node_size", node.id, `Missing projection size for node ${node.id}`));
      return [];
    }
    return [{ id: node.id, width: size.width, height: size.height }];
  });
  if (problems.length > 0) throw new SemanticGraphError(problems);
  const portSide = (nodeId: string, portId: string | undefined) => {
    if (portId === undefined) return undefined;
    return nodeById.get(nodeId)?.ports?.find((port) => port.id === portId)?.preferredSide;
  };
  return {
    version: GRAPH_PROJECTION_VERSION,
    nodes,
    edges: normalized.relations.map((relation) => {
      const sourcePort = portSide(relation.source, relation.sourcePort);
      const targetPort = portSide(relation.target, relation.targetPort);
      const labelSize = options.labelSizes?.[relation.id];
      return {
        id: relation.id,
        source: relation.source,
        target: relation.target,
        direction: relation.direction,
        ...(relation.label === undefined ? {} : { label: relation.label }),
        ...(labelSize === undefined
          ? {}
          : { labelWidth: labelSize.width, labelHeight: labelSize.height }),
        ...(sourcePort === undefined ? {} : { sourcePort }),
        ...(targetPort === undefined ? {} : { targetPort }),
      };
    }),
  };
}
