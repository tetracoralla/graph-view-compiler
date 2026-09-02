import { compareGraphIds } from "./semantic-graph.js";
import { inspectRoutedGraphDetails } from "./quality.js";
import {
  MAX_GRAPH_VIEW_INSPECTION_WORK,
  type Point,
} from "./types.js";
import type {
  GraphViewDiagnostic,
  GraphViewEdge,
  GraphViewNode,
  GraphViewQuality,
} from "./compiler-contract.js";

const EPSILON = 0.01;

interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ViewInspectionDiagnostic = Pick<
  GraphViewDiagnostic,
  "code" | "message" | "viewIds"
>;

export interface ViewInspectionResult {
  quality: GraphViewQuality;
  diagnostics: readonly ViewInspectionDiagnostic[];
}

function boxesOverlap(left: Box, right: Box): boolean {
  return left.x < right.x + right.width - EPSILON &&
    left.x + left.width > right.x + EPSILON &&
    left.y < right.y + right.height - EPSILON &&
    left.y + left.height > right.y + EPSILON;
}

function segmentIntersectsBox(source: Point, target: Point, box: Box): boolean {
  const left = box.x;
  const right = box.x + box.width;
  const top = box.y;
  const bottom = box.y + box.height;
  if (Math.abs(source.x - target.x) < EPSILON) {
    return source.x > left + EPSILON && source.x < right - EPSILON &&
      Math.max(source.y, target.y) > top + EPSILON &&
      Math.min(source.y, target.y) < bottom - EPSILON;
  }
  if (Math.abs(source.y - target.y) < EPSILON) {
    return source.y > top + EPSILON && source.y < bottom - EPSILON &&
      Math.max(source.x, target.x) > left + EPSILON &&
      Math.min(source.x, target.x) < right - EPSILON;
  }
  return true;
}

function diagnosticKey(diagnostic: ViewInspectionDiagnostic): string {
  return `${diagnostic.code}\0${diagnostic.viewIds.join("\0")}`;
}

function labelBoxes(edges: readonly GraphViewEdge[]): Box[] {
  return edges.flatMap((edge) => edge.label === undefined ? [] : [{
    id: edge.id,
    x: edge.label.x - edge.label.width / 2,
    y: edge.label.y - edge.label.height / 2,
    width: edge.label.width,
    height: edge.label.height,
  }]);
}

function incompleteQuality(): GraphViewQuality {
  return {
    complete: false,
    edgeCrossings: null,
    edgeNodeIntersections: null,
    nonOrthogonalSegments: null,
    duplicateEndpointPairs: null,
    nodeOverlaps: null,
    labelNodeOverlaps: null,
    labelEdgeIntersections: null,
    labelOverlaps: null,
  };
}

export function inspectCompiledView(
  nodes: readonly GraphViewNode[],
  edges: readonly GraphViewEdge[],
): ViewInspectionResult {
  const labels = labelBoxes(edges);
  const work = nodes.length * edges.length +
    (edges.length * Math.max(0, edges.length - 1)) / 2 +
    (nodes.length * Math.max(0, nodes.length - 1)) / 2 +
    labels.length * nodes.length +
    labels.length * edges.length +
    (labels.length * Math.max(0, labels.length - 1)) / 2;
  if (work > MAX_GRAPH_VIEW_INSPECTION_WORK) {
    return {
      quality: incompleteQuality(),
      diagnostics: [{
        code: "inspection_limit",
        message: `Detailed geometric inspection requires ${work} pair checks; the bounded limit is ${MAX_GRAPH_VIEW_INSPECTION_WORK}`,
        viewIds: [],
      }],
    };
  }

  const base = inspectRoutedGraphDetails(nodes, edges.map((edge) => ({
    id: edge.id,
    sourceId: edge.source,
    targetId: edge.target,
    route: edge.route,
  })));
  const diagnostics = new Map<string, ViewInspectionDiagnostic>();
  const add = (diagnostic: ViewInspectionDiagnostic) => {
    diagnostics.set(diagnosticKey(diagnostic), diagnostic);
  };
  base.diagnostics.forEach(add);

  let nodeOverlaps = 0;
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const right = nodes[rightIndex]!;
      if (!boxesOverlap(left, right)) continue;
      nodeOverlaps += 1;
      const viewIds = [left.id, right.id].sort(compareGraphIds);
      add({
        code: "node_overlap",
        message: `Nodes ${viewIds[0]} and ${viewIds[1]} overlap`,
        viewIds,
      });
    }
  }

  let labelNodeOverlaps = 0;
  for (const label of labels) {
    for (const node of nodes) {
      if (!boxesOverlap(label, node)) continue;
      labelNodeOverlaps += 1;
      const viewIds = [label.id, node.id].sort(compareGraphIds);
      add({
        code: "label_node_overlap",
        message: `Label for edge ${label.id} overlaps node ${node.id}`,
        viewIds,
      });
    }
  }

  let labelEdgeIntersections = 0;
  for (const label of labels) {
    for (const edge of edges) {
      if (edge.id === label.id) continue;
      if (!edge.route.points.slice(1).some((point, index) =>
        segmentIntersectsBox(edge.route.points[index]!, point, label),
      )) continue;
      labelEdgeIntersections += 1;
      const viewIds = [label.id, edge.id].sort(compareGraphIds);
      add({
        code: "label_edge_intersection",
        message: `Label for edge ${label.id} is crossed by edge ${edge.id}`,
        viewIds,
      });
    }
  }

  let labelOverlaps = 0;
  for (let leftIndex = 0; leftIndex < labels.length; leftIndex += 1) {
    const left = labels[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < labels.length; rightIndex += 1) {
      const right = labels[rightIndex]!;
      if (!boxesOverlap(left, right)) continue;
      labelOverlaps += 1;
      const viewIds = [left.id, right.id].sort(compareGraphIds);
      add({
        code: "label_overlap",
        message: `Labels for edges ${viewIds[0]} and ${viewIds[1]} overlap`,
        viewIds,
      });
    }
  }

  return {
    quality: {
      complete: true,
      ...base.quality,
      nodeOverlaps,
      labelNodeOverlaps,
      labelEdgeIntersections,
      labelOverlaps,
    },
    diagnostics: [...diagnostics.values()].sort((left, right) =>
      compareGraphIds(diagnosticKey(left), diagnosticKey(right)),
    ),
  };
}
