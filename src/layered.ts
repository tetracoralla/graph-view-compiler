import { Graph, layout as runDagreLayout } from "@dagrejs/dagre";
import type { EdgeLabel, GraphLabel, NodeLabel, Point as DagrePoint } from "@dagrejs/dagre";
import type {
  LayeredEdgeInput,
  LayeredLayoutOptions,
  LayeredLayoutResult,
  LayeredNodeInput,
  Point,
} from "./types.js";

export function layoutLayeredGraph(
  nodes: readonly LayeredNodeInput[],
  edges: readonly LayeredEdgeInput[],
  options: LayeredLayoutOptions,
): LayeredLayoutResult {
  const graph = new Graph<GraphLabel, NodeLabel, EdgeLabel>({ multigraph: true });
  graph.setGraph({
    rankdir: options.direction === "left-to-right" ? "LR" : "TB",
    ranker: "network-simplex",
    acyclicer: "greedy",
    nodesep: options.nodeGap ?? 38,
    edgesep: options.edgeGap ?? 24,
    ranksep: options.rankGap ?? 92,
    marginx: options.marginX ?? 0,
    marginy: options.marginY ?? 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((node) => graph.setNode(node.id, {
    width: node.width,
    height: node.height,
  }));
  edges.forEach((edge) => graph.setEdge(
    edge.source,
    edge.target,
    {
      width: edge.labelWidth ?? 0,
      height: edge.labelHeight ?? 0,
      labelpos: "c",
      minlen: edge.minimumLength ?? 1,
      weight: edge.weight ?? 1,
    },
    edge.id,
  ));
  runDagreLayout(graph);

  const positionedNodes = nodes.map((node) => {
    const positioned = graph.node(node.id);
    const centerX = typeof positioned?.x === "number" ? positioned.x : 0;
    const centerY = typeof positioned?.y === "number" ? positioned.y : 0;
    return {
      id: node.id,
      x: centerX - node.width / 2,
      y: centerY - node.height / 2,
      width: node.width,
      height: node.height,
    };
  });
  const positionedEdges = edges.map((edge) => {
    const positioned = graph.edge({ v: edge.source, w: edge.target, name: edge.id });
    const points = (positioned?.points ?? [])
      .filter((point: DagrePoint) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .map((point: DagrePoint): Point => ({ x: point.x, y: point.y }));
    const label = typeof positioned?.x === "number" && typeof positioned?.y === "number"
      ? { x: positioned.x, y: positioned.y }
      : undefined;
    return {
      id: edge.id,
      points,
      ...(label === undefined ? {} : { label }),
    };
  });
  const bounds = graph.graph();
  return {
    width: typeof bounds?.width === "number" ? bounds.width : 0,
    height: typeof bounds?.height === "number" ? bounds.height : 0,
    nodes: positionedNodes,
    edges: positionedEdges,
  };
}
