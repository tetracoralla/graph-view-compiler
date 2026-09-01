import type {
  DependencyRelation,
  EndpointStyles,
  ProjectionEdgeInput,
  ProjectionGraphV1,
  ProjectionIssue,
  RelationDirection,
} from "./types.js";
import {
  MAX_PROJECTION_EDGES,
  MAX_PROJECTION_NODES,
} from "./types.js";

export class GraphProjectionError extends Error {
  readonly issues: readonly ProjectionIssue[];

  constructor(issues: readonly ProjectionIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "GraphProjectionError";
    this.issues = issues;
  }
}

export function endpointStylesForDirection(
  direction: RelationDirection,
): EndpointStyles {
  if (direction === "undirected") return { source: "none", target: "none" };
  if (direction === "bidirectional") return { source: "arrow", target: "arrow" };
  return { source: "none", target: "arrow" };
}

export function dependencyRelationToProjectionEdge(
  relation: DependencyRelation,
): ProjectionEdgeInput {
  return {
    id: relation.id,
    source: relation.prerequisite,
    target: relation.dependent,
    direction: "directed",
    ...(relation.label === undefined ? {} : { label: relation.label }),
    weight: 3,
  };
}

export function validateProjectionGraph(
  graph: ProjectionGraphV1,
): readonly ProjectionIssue[] {
  const issues: ProjectionIssue[] = [];
  if (graph.nodes.length > MAX_PROJECTION_NODES) {
    issues.push({
      code: "too_many_nodes",
      id: "graph",
      message: `Graph has ${graph.nodes.length} nodes; the maximum is ${MAX_PROJECTION_NODES}`,
    });
  }
  if (graph.edges.length > MAX_PROJECTION_EDGES) {
    issues.push({
      code: "too_many_edges",
      id: "graph",
      message: `Graph has ${graph.edges.length} edges; the maximum is ${MAX_PROJECTION_EDGES}`,
    });
  }
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({
        code: "duplicate_node_id",
        id: node.id,
        message: `Duplicate node id: ${node.id}`,
      });
    }
    nodeIds.add(node.id);
    if (!Number.isFinite(node.width) || node.width <= 0 ||
        !Number.isFinite(node.height) || node.height <= 0) {
      issues.push({
        code: "invalid_dimension",
        id: node.id,
        message: `Node ${node.id} must have finite positive dimensions`,
      });
    }
  }
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push({
        code: "duplicate_edge_id",
        id: edge.id,
        message: `Duplicate edge id: ${edge.id}`,
      });
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source)) {
      issues.push({
        code: "missing_source",
        id: edge.id,
        message: `Edge ${edge.id} references missing source ${edge.source}`,
      });
    }
    if (!nodeIds.has(edge.target)) {
      issues.push({
        code: "missing_target",
        id: edge.id,
        message: `Edge ${edge.id} references missing target ${edge.target}`,
      });
    }
  }
  return issues;
}

export function assertProjectionGraph(graph: ProjectionGraphV1): void {
  const issues = validateProjectionGraph(graph);
  if (issues.length > 0) throw new GraphProjectionError(issues);
}
