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
  for (const [edgeId, candidate] of Object.entries(value)) {
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
    const automaticRoute = routeOrthogonalBetweenPortsWithRetries(
      sourceNode,
      targetNode,
      source,
      target,
      { obstacles: nodes, ...safeRouting },
      {
        source: edge.sourcePort === undefined,
        target: edge.targetPort === undefined,
      },
    );
    const constraint = edgeRouteConstraints[edge.id];
    const route = constraint === undefined
      ? automaticRoute
      : applyOrthogonalRouteConstraint(automaticRoute, constraint, safeRouting.stub ?? 30);
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
  const jumpsById = boundedRouteCrossingJumps(routed);
  const edges = routed.map((edge) => {
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
    const position = options.positions[node.id];
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
