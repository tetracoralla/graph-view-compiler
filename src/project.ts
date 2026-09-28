import { layoutLayeredGraph } from "./layered.js";
import {
  applyOrthogonalRouteConstraint,
  allocateRectanglePorts,
  jumpsForRoundedOrthogonalPath,
  pointOnRoute,
  roundedOrthogonalPath,
  routeCrossings,
  routeOrthogonalBetweenPortsWithRetries,
} from "./routing.js";
import { segmentIntersectsNode } from "./quality.js";
import {
  GraphProjectionError,
  assertProjectionGraph,
  endpointStylesForDirection,
} from "./semantics.js";
import type {
  EdgeRouteConstraints,
  EndpointStyles,
  LayeredLayoutOptions,
  NodeBox,
  OrthogonalRoute,
  Point,
  ProjectionGraphV1,
  ProjectionIssue,
  RouteJump,
  RoutedEdge,
} from "./types.js";
import { MAX_GRAPH_VIEW_ROUTE_CROSSINGS_WORK } from "./types.js";
import type { OrthogonalRouteGeometryOptions } from "./routing.js";
import { compareGraphIds } from "./semantic-graph.js";

export interface ProjectedEdge {
  id: string;
  source: string;
  target: string;
  direction: ProjectionGraphV1["edges"][number]["direction"];
  endpoints: EndpointStyles;
  route: OrthogonalRoute;
  path: string;
  label?: { text: string; x: number; y: number; width: number; height: number };
}

export interface ProjectedGraph {
  width: number;
  height: number;
  nodes: NodeBox[];
  edges: ProjectedEdge[];
}

export type ProjectionRoutingOptions = Omit<
  OrthogonalRouteGeometryOptions,
  "obstacles"
>;

export interface FixedProjectionOptions {
  positions: Readonly<Record<string, Point>>;
  routing?: ProjectionRoutingOptions;
  edgeRouteConstraints?: EdgeRouteConstraints;
}

function assertEdgeRouteConstraints(
  graph: ProjectionGraphV1,
  value: unknown,
): asserts value is EdgeRouteConstraints | undefined {
  if (value === undefined) return;
  const issues: ProjectionIssue[] = [];
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GraphProjectionError([{
      code: "invalid_route_constraint",
      id: "edgeRouteConstraints",
      message: "Edge route constraints must be an object keyed by edge id",
    }]);
  }
  const entries = Object.entries(value);
  if (entries.length > graph.edges.length) {
    throw new GraphProjectionError([{
      code: "invalid_route_constraint",
      id: "edgeRouteConstraints",
      message: `Edge route constraints contain ${entries.length} entries for ${graph.edges.length} edges`,
    }]);
  }
  for (const [edgeId, candidate] of entries) {
    if (!edgeIds.has(edgeId)) {
      issues.push({
        code: "unknown_route_constraint",
        id: edgeId,
        message: `Edge route constraint refers to unknown edge ${edgeId}`,
      });
      continue;
    }
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate) ||
        Object.keys(candidate).some((key) => !["type", "axis", "coordinate"].includes(key)) ||
        (candidate as { type?: unknown }).type !== "orthogonal-corridor" ||
        !["x", "y"].includes(String((candidate as { axis?: unknown }).axis)) ||
        typeof (candidate as { coordinate?: unknown }).coordinate !== "number" ||
        !Number.isFinite((candidate as { coordinate: number }).coordinate)) {
      issues.push({
        code: "invalid_route_constraint",
        id: edgeId,
        message: `Edge ${edgeId} requires a finite orthogonal-corridor constraint`,
      });
    }
  }
  if (issues.length > 0) throw new GraphProjectionError(issues);
}

function sanitizedRouting(options: ProjectionRoutingOptions): ProjectionRoutingOptions {
  return {
    ...(options.stub === undefined ? {} : { stub: options.stub }),
    ...(options.clearance === undefined ? {} : { clearance: options.clearance }),
    ...(options.turnCost === undefined ? {} : { turnCost: options.turnCost }),
    ...(options.maximumObstacles === undefined
      ? {}
      : { maximumObstacles: options.maximumObstacles }),
  };
}

function routeMidpoint(route: OrthogonalRoute): { x: number; y: number } {
  return pointOnRoute(route, 0.5);
}

interface LabelBox extends Point {
  width: number;
  height: number;
}

function boxesOverlap(left: LabelBox, right: LabelBox, gap = 0): boolean {
  return left.x - left.width / 2 - gap < right.x + right.width / 2 &&
    left.x + left.width / 2 + gap > right.x - right.width / 2 &&
    left.y - left.height / 2 - gap < right.y + right.height / 2 &&
    left.y + left.height / 2 + gap > right.y - right.height / 2;
}

function labelIntersectsNode(label: LabelBox, node: NodeBox): boolean {
  return boxesOverlap(label, {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
    width: node.width,
    height: node.height,
  }, 4);
}

function edgeIntersectsLabel(edge: ProjectedEdge, label: LabelBox): boolean {
  const box = {
    id: edge.id,
    x: label.x - label.width / 2,
    y: label.y - label.height / 2,
    width: label.width,
    height: label.height,
  };
  return edge.route.points.slice(1).some((point, index) =>
    segmentIntersectsNode(edge.route.points[index]!, point, box),
  );
}

function labelCandidates(route: OrthogonalRoute): Point[] {
  const candidates = [0.5, 0.34, 0.66, 0.25, 0.75, 0.2, 0.8].map((fraction) =>
    pointOnRoute(route, fraction),
  );
  const segmentMidpoints = route.points.slice(1).map((point, index) => {
    const previous = route.points[index]!;
    return {
      point: { x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 },
      length: Math.abs(previous.x - point.x) + Math.abs(previous.y - point.y),
      index,
    };
  }).sort((left, right) => right.length - left.length || left.index - right.index);
  for (const segment of segmentMidpoints) candidates.push(segment.point);
  return candidates.filter((candidate, index) => candidates.findIndex((other) =>
    Math.abs(other.x - candidate.x) < 0.01 && Math.abs(other.y - candidate.y) < 0.01,
  ) === index);
}

function placeRouteLabels(
  nodes: readonly NodeBox[],
  edges: readonly ProjectedEdge[],
): ProjectedEdge[] {
  const labels = edges.filter((edge) => edge.label !== undefined).sort((left, right) => {
    const areaDelta = right.label!.width * right.label!.height -
      left.label!.width * left.label!.height;
    return areaDelta !== 0 ? areaDelta : compareGraphIds(left.id, right.id);
  });
  const placed = new Map<string, LabelBox>();
  for (const edge of labels) {
    const measured = edge.label!;
    const candidates = labelCandidates(edge.route);
    let best: { box: LabelBox; score: number } | undefined;
    candidates.forEach((point, index) => {
      const box = { ...point, width: measured.width, height: measured.height };
      const nodeHits = nodes.filter((node) => labelIntersectsNode(box, node)).length;
      const labelHits = [...placed.values()].filter((other) => boxesOverlap(box, other, 6)).length;
      const edgeHits = edges.filter((other) => other.id !== edge.id && edgeIntersectsLabel(other, box)).length;
      const score = nodeHits * 1_000_000_000 + labelHits * 1_000_000 +
        edgeHits * 1_000 + index;
      if (best === undefined || score < best.score) best = { box, score };
    });
    placed.set(edge.id, best?.box ?? {
      ...routeMidpoint(edge.route),
      width: measured.width,
      height: measured.height,
    });
  }
  return edges.map((edge) => edge.label === undefined
    ? edge
    : { ...edge, label: { ...edge.label, ...placed.get(edge.id)! } });
}

function extent(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return maximum - minimum;
}

// Bridge arcs require comparing segment pairs. This cheap conservative upper
// bound includes pairs later skipped for shared endpoints, so the whole view
// declines jumps before it can pay unbounded quadratic work.
function boundedRouteCrossingJumps(
  routed: readonly ProjectedEdge[],
): Readonly<Record<string, readonly RouteJump[]>> | undefined {
  let segmentsTotal = 0;
  let segmentsSquared = 0;
  for (const edge of routed) {
    const segments = Math.max(0, edge.route.points.length - 1);
    segmentsTotal += segments;
    segmentsSquared += segments * segments;
  }
  const pairChecks = (segmentsTotal * segmentsTotal - segmentsSquared) / 2;
  if (pairChecks > MAX_GRAPH_VIEW_ROUTE_CROSSINGS_WORK) return undefined;
  const routedEdges: RoutedEdge[] = routed.map((edge) => ({
    id: edge.id,
    sourceId: edge.source,
    targetId: edge.target,
    route: edge.route,
  }));
  return routeCrossings(routedEdges);
}

function projectPositionedGraph(
  graph: ProjectionGraphV1,
  nodes: readonly NodeBox[],
  routing: ProjectionRoutingOptions,
  edgeRouteConstraints: EdgeRouteConstraints = {},
  dimensions?: { width: number; height: number },
): ProjectedGraph {
  const safeRouting = sanitizedRouting(routing);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ports = allocateRectanglePorts(nodes, graph.edges);
  const routed = graph.edges.flatMap((edge) => {
    const sourceNode = byId.get(edge.source);
    const targetNode = byId.get(edge.target);
    const source = ports.get(`${edge.id}:source`);
    const target = ports.get(`${edge.id}:target`);
    if (!sourceNode || !targetNode || !source || !target) return [];
    const constraint = Object.hasOwn(edgeRouteConstraints, edge.id)
      ? edgeRouteConstraints[edge.id]
      : undefined;
    const route = constraint === undefined
      ? routeOrthogonalBetweenPortsWithRetries(
          sourceNode,
          targetNode,
          source,
          target,
          { obstacles: nodes, ...safeRouting },
          {
            source: edge.sourcePort === undefined,
            target: edge.targetPort === undefined,
          },
        )
      : applyOrthogonalRouteConstraint({
          source,
          target,
          sourcePort: source.side,
          targetPort: target.side,
          points: [source, target],
        }, constraint, safeRouting.stub ?? 30);
    const midpoint = routeMidpoint(route);
    const labelWidth = edge.labelWidth ??
      (edge.label ? Math.min(160, Math.max(24, edge.label.length * 12)) : 0);
    const labelHeight = edge.labelHeight ?? (edge.label ? 18 : 0);
    return [{
      id: edge.id,
      source: edge.source,
      target: edge.target,
      direction: edge.direction,
      endpoints: endpointStylesForDirection(edge.direction),
      route,
      path: "",
      ...(edge.label === undefined
        ? {}
        : {
            label: {
              text: edge.label,
              x: midpoint.x,
              y: midpoint.y,
              width: labelWidth,
              height: labelHeight,
            },
          }),
    }];
  });
  const labeled = placeRouteLabels(nodes, routed);
  const jumpsById = boundedRouteCrossingJumps(labeled);
  const edges = labeled.map((edge) => {
    const jumps = jumpsById === undefined
      ? undefined
      : jumpsForRoundedOrthogonalPath(edge.route.points, jumpsById[edge.id] ?? []);
    return {
      ...edge,
      route: jumps === undefined ? edge.route : { ...edge.route, jumps },
      path: roundedOrthogonalPath(edge.route.points, jumps ?? []),
    };
  });
  const xs = [
    ...nodes.flatMap((node) => [node.x, node.x + node.width]),
    ...edges.flatMap((edge) => edge.route.points.map((point) => point.x)),
  ];
  const ys = [
    ...nodes.flatMap((node) => [node.y, node.y + node.height]),
    ...edges.flatMap((edge) => edge.route.points.map((point) => point.y)),
  ];
  return {
    width: dimensions?.width ?? extent(xs),
    height: dimensions?.height ?? extent(ys),
    nodes: [...nodes],
    edges,
  };
}

export function projectLayeredGraph(
  graph: ProjectionGraphV1,
  options: LayeredLayoutOptions,
  routing: ProjectionRoutingOptions = {},
): ProjectedGraph {
  assertProjectionGraph(graph);
  const layered = layoutLayeredGraph(
    graph.nodes,
    graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.weight === undefined ? {} : { weight: edge.weight }),
      labelWidth: edge.labelWidth ??
        (edge.label ? Math.min(160, Math.max(24, edge.label.length * 12)) : 0),
      labelHeight: edge.labelHeight ?? (edge.label ? 18 : 0),
    })),
    options,
  );
  return projectPositionedGraph(
    graph,
    layered.nodes,
    routing,
    {},
    { width: layered.width, height: layered.height },
  );
}

export function projectFixedGraph(
  graph: ProjectionGraphV1,
  options: FixedProjectionOptions,
): ProjectedGraph {
  assertProjectionGraph(graph);
  assertEdgeRouteConstraints(graph, options.edgeRouteConstraints);
  const issues: ProjectionIssue[] = [];
  const nodes = graph.nodes.flatMap((node) => {
    const position = Object.hasOwn(options.positions, node.id)
      ? options.positions[node.id]
      : undefined;
    if (position === undefined) {
      issues.push({
        code: "missing_position",
        id: node.id,
        message: `Missing fixed position for node ${node.id}`,
      });
      return [];
    }
    if (typeof position !== "object" || position === null ||
        !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      issues.push({
        code: "invalid_position",
        id: node.id,
        message: `Fixed position for node ${node.id} must contain finite x and y values`,
      });
      return [];
    }
    return [{ ...node, x: position.x, y: position.y }];
  });
  if (issues.length > 0) {
    throw new GraphProjectionError(issues);
  }
  return projectPositionedGraph(
    graph,
    nodes,
    options.routing ?? {},
    options.edgeRouteConstraints,
  );
}
