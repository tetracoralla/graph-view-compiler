import { layoutLayeredGraph } from "./layered.js";
import {
  allocateRectanglePorts,
  roundedOrthogonalPath,
  routeOrthogonalBetweenPorts,
} from "./routing.js";
import { assertProjectionGraph, endpointStylesForDirection } from "./semantics.js";
import type {
  EndpointStyles,
  LayeredLayoutOptions,
  NodeBox,
  OrthogonalRoute,
  ProjectionGraphV1,
} from "./types.js";

export interface ProjectedEdge {
  id: string;
  source: string;
  target: string;
  direction: ProjectionGraphV1["edges"][number]["direction"];
  endpoints: EndpointStyles;
  route: OrthogonalRoute;
  path: string;
  label?: { text: string; x: number; y: number };
}

export interface ProjectedGraph {
  width: number;
  height: number;
  nodes: NodeBox[];
  edges: ProjectedEdge[];
}

function routeMidpoint(route: OrthogonalRoute): { x: number; y: number } {
  const lengths = route.points.slice(1).map((point, index) =>
    Math.hypot(point.x - route.points[index]!.x, point.y - route.points[index]!.y),
  );
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = total / 2;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!;
    if (remaining <= length || index === lengths.length - 1) {
      const source = route.points[index]!;
      const target = route.points[index + 1]!;
      const ratio = length === 0 ? 0 : remaining / length;
      return {
        x: source.x + (target.x - source.x) * ratio,
        y: source.y + (target.y - source.y) * ratio,
      };
    }
    remaining -= length;
  }
  return route.source;
}

export function projectLayeredGraph(
  graph: ProjectionGraphV1,
  options: LayeredLayoutOptions,
): ProjectedGraph {
  assertProjectionGraph(graph);
  const layered = layoutLayeredGraph(
    graph.nodes,
    graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.weight === undefined ? {} : { weight: edge.weight }),
      labelWidth: edge.label ? Math.min(160, Math.max(24, edge.label.length * 12)) : 0,
      labelHeight: edge.label ? 18 : 0,
    })),
    options,
  );
  const nodes = layered.nodes;
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
    });
    const midpoint = routeMidpoint(route);
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
        : { label: { text: edge.label, x: midpoint.x, y: midpoint.y } }),
    }];
  });
  return {
    width: layered.width,
    height: layered.height,
    nodes,
    edges,
  };
}
