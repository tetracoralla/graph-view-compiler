import { Graph, layout as runDagreLayout } from "@dagrejs/dagre";
import type { EdgeLabel, GraphLabel, NodeLabel, Point as DagrePoint } from "@dagrejs/dagre";
import { GraphProjectionError } from "./semantics.js";
import type {
  LayeredEdgeInput,
  LayeredLayoutOptions,
  LayeredLayoutResult,
  LayeredNodeInput,
  Point,
} from "./types.js";
import { MAX_LAYERED_LAYOUT_DEPTH } from "./types.js";

// Dagre's acyclizer and rankers recurse once per rank on deep graphs; past
// roughly 1,500 ranks the call stack overflows with an untyped RangeError on
// current V8 builds (browsers overflow earlier). The declared bound sits well
// below the observed threshold so rejection is deterministic across runtimes.
// Acyclic graphs are measured by their weighted longest path; cyclic graphs
// fall back to the node count because dagre's DFS depth is bounded by it.
function assertLayoutDepth(
  nodes: readonly LayeredNodeInput[],
  edges: readonly LayeredEdgeInput[],
): void {
  const remaining = new Map<string, number>();
  const outgoing = new Map<string, Array<{ target: string; minimumLength: number }>>();
  for (const node of nodes) remaining.set(node.id, 0);
  for (const edge of edges) {
    if (!remaining.has(edge.source) || !remaining.has(edge.target)) continue;
    const targets = outgoing.get(edge.source) ?? [];
    targets.push({ target: edge.target, minimumLength: Math.max(1, edge.minimumLength ?? 1) });
    outgoing.set(edge.source, targets);
    remaining.set(edge.target, (remaining.get(edge.target) ?? 0) + 1);
  }
  const depth = new Map<string, number>();
  const queue = [...remaining.entries()].filter(([, count]) => count === 0).map(([id]) => id);
  let maximumDepth = queue.length > 0 ? 1 : 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const nodeId = queue[cursor]!;
    const nodeDepth = depth.get(nodeId) ?? 1;
    maximumDepth = Math.max(maximumDepth, nodeDepth);
    for (const step of outgoing.get(nodeId) ?? []) {
      depth.set(step.target, Math.max(depth.get(step.target) ?? 1, nodeDepth + step.minimumLength));
      remaining.set(step.target, (remaining.get(step.target) ?? 0) - 1);
      if (remaining.get(step.target) === 0) queue.push(step.target);
    }
  }
  const estimatedDepth = queue.length < remaining.size ? nodes.length : maximumDepth;
  if (estimatedDepth > MAX_LAYERED_LAYOUT_DEPTH) {
    throw new GraphProjectionError([{
      code: "layout_depth_exceeded",
      id: "layout",
      message: `Layered layout depth is ${estimatedDepth} ranks; the maximum is ${MAX_LAYERED_LAYOUT_DEPTH}`,
    }]);
  }
}

export function layoutLayeredGraph(
  nodes: readonly LayeredNodeInput[],
  edges: readonly LayeredEdgeInput[],
  options: LayeredLayoutOptions,
): LayeredLayoutResult {
  assertLayoutDepth(nodes, edges);
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
  try {
    runDagreLayout(graph);
  } catch (error) {
    throw new GraphProjectionError([{
      code: "layout_failed",
      id: "layout",
      message: `Layered layout failed: ${error instanceof Error ? error.message : String(error)}`,
    }]);
  }

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
