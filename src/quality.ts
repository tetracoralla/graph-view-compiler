import { compareGraphIds } from "./semantic-graph.js";
import type { NodeBox, Point, RoutedEdge } from "./types.js";

const EPSILON = 0.01;

function orientation(source: Point, target: Point, point: Point): number {
  return (target.y - source.y) * (point.x - target.x) -
    (target.x - source.x) * (point.y - target.y);
}

function segmentsCross(
  firstSource: Point,
  firstTarget: Point,
  secondSource: Point,
  secondTarget: Point,
): boolean {
  if ([firstSource, firstTarget].some((point) =>
    Math.hypot(point.x - secondSource.x, point.y - secondSource.y) < EPSILON ||
    Math.hypot(point.x - secondTarget.x, point.y - secondTarget.y) < EPSILON,
  )) return false;
  const first = orientation(firstSource, firstTarget, secondSource);
  const second = orientation(firstSource, firstTarget, secondTarget);
  const third = orientation(secondSource, secondTarget, firstSource);
  const fourth = orientation(secondSource, secondTarget, firstTarget);
  return first * second < -EPSILON && third * fourth < -EPSILON;
}

export function segmentIntersectsNode(source: Point, target: Point, node: NodeBox): boolean {
  const left = node.x;
  const right = node.x + node.width;
  const top = node.y;
  const bottom = node.y + node.height;
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

export interface ProjectionQuality {
  edgeCrossings: number;
  edgeNodeIntersections: number;
  nonOrthogonalSegments: number;
  duplicateEndpointPairs: number;
}

export interface ProjectionDiagnostic {
  code:
    | "edge_crossing"
    | "edge_node_intersection"
    | "non_orthogonal_segment"
    | "duplicate_endpoint_pair";
  message: string;
  viewIds: readonly string[];
}

export interface ProjectionInspection {
  quality: ProjectionQuality;
  diagnostics: readonly ProjectionDiagnostic[];
}

function diagnosticKey(diagnostic: ProjectionDiagnostic): string {
  return `${diagnostic.code}\0${diagnostic.viewIds.join("\0")}`;
}

export function inspectRoutedGraphDetails(
  nodes: readonly NodeBox[],
  edges: readonly RoutedEdge[],
): ProjectionInspection {
  let edgeCrossings = 0;
  let edgeNodeIntersections = 0;
  let nonOrthogonalSegments = 0;
  const endpointPairs = new Map<string, string[]>();
  const diagnostics = new Map<string, ProjectionDiagnostic>();
  const addDiagnostic = (diagnostic: ProjectionDiagnostic) => {
    diagnostics.set(diagnosticKey(diagnostic), diagnostic);
  };
  edges.forEach((edge) => {
    const source = edge.route.points[0];
    const target = edge.route.points.at(-1);
    if (source && target) {
      const key = `${source.x.toFixed(3)}:${source.y.toFixed(3)}>${target.x.toFixed(3)}:${target.y.toFixed(3)}`;
      endpointPairs.set(key, [...(endpointPairs.get(key) ?? []), edge.id]);
    }
    edge.route.points.slice(1).forEach((point, index) => {
      const previous = edge.route.points[index]!;
      if (Math.abs(previous.x - point.x) >= EPSILON &&
          Math.abs(previous.y - point.y) >= EPSILON) {
        nonOrthogonalSegments += 1;
        addDiagnostic({
          code: "non_orthogonal_segment",
          message: `Edge ${edge.id} contains a non-orthogonal route segment`,
          viewIds: [edge.id],
        });
      }
      // Boundary contact at the first and last point is excluded by the
      // strict interior check in segmentIntersectsNode. Inspect endpoint nodes
      // too so a persisted manual corridor that re-enters either node is not
      // incorrectly reported as collision-free.
      nodes.forEach((node) => {
        if (!segmentIntersectsNode(previous, point, node)) return;
        edgeNodeIntersections += 1;
        const viewIds = [edge.id, node.id].sort(compareGraphIds);
        addDiagnostic({
          code: "edge_node_intersection",
          message: `Edge ${edge.id} intersects node ${node.id}`,
          viewIds,
        });
      });
    });
  });
  for (let leftIndex = 0; leftIndex < edges.length; leftIndex += 1) {
    const left = edges[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < edges.length; rightIndex += 1) {
      const right = edges[rightIndex]!;
      if (left.sourceId === right.sourceId || left.sourceId === right.targetId ||
          left.targetId === right.sourceId || left.targetId === right.targetId) continue;
      left.route.points.slice(1).forEach((leftPoint, leftSegment) => {
        right.route.points.slice(1).forEach((rightPoint, rightSegment) => {
          if (!segmentsCross(
            left.route.points[leftSegment]!,
            leftPoint,
            right.route.points[rightSegment]!,
            rightPoint,
          )) return;
          edgeCrossings += 1;
          const viewIds = [left.id, right.id].sort(compareGraphIds);
          addDiagnostic({
            code: "edge_crossing",
            message: `Edges ${viewIds[0]} and ${viewIds[1]} cross`,
            viewIds,
          });
        });
      });
    }
  }
  const duplicateEndpointPairs = [...endpointPairs.values()].filter((ids) => ids.length > 1);
  for (const ids of duplicateEndpointPairs) {
    const viewIds = [...ids].sort(compareGraphIds);
    addDiagnostic({
      code: "duplicate_endpoint_pair",
      message: `Edges ${viewIds.join(", ")} share the same routed endpoint pair`,
      viewIds,
    });
  }
  return {
    quality: {
      edgeCrossings,
      edgeNodeIntersections,
      nonOrthogonalSegments,
      duplicateEndpointPairs: duplicateEndpointPairs.length,
    },
    diagnostics: [...diagnostics.values()].sort((left, right) =>
      compareGraphIds(diagnosticKey(left), diagnosticKey(right)),
    ),
  };
}

export function inspectRoutedGraph(
  nodes: readonly NodeBox[],
  edges: readonly RoutedEdge[],
): ProjectionQuality {
  return inspectRoutedGraphDetails(nodes, edges).quality;
}
