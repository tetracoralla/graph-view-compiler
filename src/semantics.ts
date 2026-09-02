import type {
  DependencyRelation,
  EndpointStyles,
  ProjectionEdgeInput,
  ProjectionGraphV1,
  ProjectionIssue,
  RelationDirection,
} from "./types.js";
import {
  GRAPH_PROJECTION_VERSION,
  MAX_PROJECTION_EDGES,
  MAX_PROJECTION_NODES,
} from "./types.js";

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validPort(value: unknown): boolean {
  return value === undefined || value === "top" || value === "right" ||
    value === "bottom" || value === "left";
}

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
  if (graph.version !== GRAPH_PROJECTION_VERSION) {
    issues.push({
      code: "invalid_version",
      id: "graph",
      message: `Projection graph version must be ${GRAPH_PROJECTION_VERSION}`,
    });
  }
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
    if (!validIdentifier(node.id)) {
      issues.push({
        code: "invalid_identifier",
        id: "node",
        message: "Projection node ids must be stable non-empty identifiers",
      });
      continue;
    }
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
    if (!validIdentifier(edge.id) || !validIdentifier(edge.source) ||
        !validIdentifier(edge.target)) {
      issues.push({
        code: "invalid_identifier",
        id: "edge",
        message: "Projection edge ids and endpoints must be stable non-empty identifiers",
      });
      continue;
    }
    if (edgeIds.has(edge.id)) {
      issues.push({
        code: "duplicate_edge_id",
        id: edge.id,
        message: `Duplicate edge id: ${edge.id}`,
      });
    }
    edgeIds.add(edge.id);
    if (edge.direction !== "directed" && edge.direction !== "undirected" &&
        edge.direction !== "bidirectional") {
      issues.push({
        code: "invalid_direction",
        id: edge.id,
        message: `Edge ${edge.id} has an invalid direction`,
      });
    }
    if (!validPort(edge.sourcePort) || !validPort(edge.targetPort)) {
      issues.push({
        code: "invalid_port",
        id: edge.id,
        message: `Edge ${edge.id} has an invalid preferred port side`,
      });
    }
    if (edge.weight !== undefined &&
        (!Number.isFinite(edge.weight) || edge.weight <= 0)) {
      issues.push({
        code: "invalid_weight",
        id: edge.id,
        message: `Edge ${edge.id} weight must be finite and positive`,
      });
    }
    if ((edge.labelWidth !== undefined &&
         (!Number.isFinite(edge.labelWidth) || edge.labelWidth <= 0)) ||
        (edge.labelHeight !== undefined &&
         (!Number.isFinite(edge.labelHeight) || edge.labelHeight <= 0))) {
      issues.push({
        code: "invalid_dimension",
        id: edge.id,
        message: `Edge ${edge.id} label dimensions must be finite and positive`,
      });
    }
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
