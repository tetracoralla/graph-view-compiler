import { layoutLayeredGraph } from "./layered.js";
import {
  allocateRectanglePorts,
  pointOnRoute,
  roundedOrthogonalPath,
  routeOrthogonalBetweenPorts,
} from "./routing.js";
import {
  GraphProjectionError,
  assertProjectionGraph,
  endpointStylesForDirection,
} from "./semantics.js";
import type {
  EndpointStyles,
  LayeredLayoutOptions,
  NodeBox,
  OrthogonalRoute,
  Point,
  ProjectionGraphV1,
  ProjectionIssue,
} from "./types.js";
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

function projectPositionedGraph(
  graph: ProjectionGraphV1,
  nodes: readonly NodeBox[],
  routing: ProjectionRoutingOptions,
  dimensions?: { width: number; height: number },
): ProjectedGraph {
  const safeRouting = sanitizedRouting(routing);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ports = allocateRectanglePorts(nodes, graph.edges);
  const edges = graph.edges.flatMap((edge) => {
    const sourceNode = byId.get(edge.source);
    const targetNode = byId.get(edge.target);
    const source = ports.get(`${edge.id}:source`);
    const target = ports.get(`${edge.id}:target`);
    if (!sourceNode || !targetNode || !source || !target) return [];
    const route = routeOrthogonalBetweenPorts(sourceNode, targetNode, source, target, {
      obstacles: nodes,
      ...safeRouting,
    });
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
      path: roundedOrthogonalPath(route.points),
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
    { width: layered.width, height: layered.height },
  );
}

export function projectFixedGraph(
  graph: ProjectionGraphV1,
  options: FixedProjectionOptions,
): ProjectedGraph {
  assertProjectionGraph(graph);
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
  return projectPositionedGraph(graph, nodes, options.routing ?? {});
}
