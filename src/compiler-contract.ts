import type {
  ProjectedEdge,
  ProjectionRoutingOptions,
} from "./project.js";
import type {
  LayeredLayoutOptions,
  NodeBox,
  Point,
  SemanticGraphFilter,
  SemanticGraphSlice,
  SemanticGraphV1,
  SemanticGroupAssignment,
} from "./types.js";

export const GRAPH_VIEW_PLAN_VERSION = 1 as const;

export interface FilterGraphViewPass {
  id: string;
  type: "filter";
  filter: SemanticGraphFilter;
}

export interface SliceGraphViewPass {
  id: string;
  type: "slice";
  slice: SemanticGraphSlice;
}

export interface GroupGraphViewPass {
  id: string;
  type: "group";
  assignment: SemanticGroupAssignment;
}

export interface CollapseGraphViewPass {
  id: string;
  type: "collapse";
  groupIds: readonly string[];
}

export type GraphViewPass =
  | FilterGraphViewPass
  | SliceGraphViewPass
  | GroupGraphViewPass
  | CollapseGraphViewPass;

export interface LayeredGraphViewProfile {
  type: "layered";
  layout: LayeredLayoutOptions;
}

export interface FixedGraphViewProfile {
  type: "fixed";
  positions: Readonly<Record<string, Point>>;
}

export type GraphViewProfile = LayeredGraphViewProfile | FixedGraphViewProfile;

export type GraphViewStability =
  | { mode: "none" }
  | { mode: "preserve-anchor"; anchorNodeId?: string };

export interface CompileGraphViewInput {
  graph: SemanticGraphV1;
  passes?: readonly GraphViewPass[];
  nodeSizes: Readonly<Record<string, { width: number; height: number }>>;
  labelSizes?: Readonly<Record<string, { width: number; height: number }>>;
  edgeWeights?: Readonly<Record<string, number>>;
  profile: GraphViewProfile;
  routing?: ProjectionRoutingOptions;
  previousPlan?: GraphViewPlanV1;
  stability?: GraphViewStability;
}

export interface GraphViewCompileIssue {
  code:
    | "invalid_input"
    | "invalid_pass"
    | "duplicate_pass_id"
    | "too_many_passes"
    | "invalid_profile"
    | "invalid_routing_option"
    | "missing_label_size"
    | "invalid_label_size"
    | "invalid_previous_plan"
    | "missing_previous_plan"
    | "unknown_anchor";
  id: string;
  message: string;
}

export class GraphViewCompileError extends Error {
  readonly issues: readonly GraphViewCompileIssue[];

  constructor(issues: readonly GraphViewCompileIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "GraphViewCompileError";
    this.issues = issues;
  }
}

export interface GraphViewPassTrace {
  id: string;
  type: GraphViewPass["type"];
  inputNodes: number;
  inputRelations: number;
  outputNodes: number;
  outputRelations: number;
}

export interface GraphViewMembership {
  nodes: Readonly<Record<string, readonly string[]>>;
  relations: Readonly<Record<string, readonly string[]>>;
}

export interface GraphViewNode extends NodeBox {
  label?: string;
  kind?: string;
}

export interface GraphViewEdge extends ProjectedEdge {
  kind?: string;
}

export interface GraphViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphViewDiagnostic {
  code:
    | "edge_crossing"
    | "edge_node_intersection"
    | "non_orthogonal_segment"
    | "duplicate_endpoint_pair"
    | "node_overlap"
    | "label_node_overlap"
    | "label_edge_intersection"
    | "label_overlap"
    | "routing_obstacle_limit"
    | "inspection_limit"
    | "diagnostic_limit";
  severity: "warning";
  message: string;
  viewIds: readonly string[];
  sourceIds: readonly string[];
}

export interface GraphViewQuality {
  complete: boolean;
  edgeCrossings: number | null;
  edgeNodeIntersections: number | null;
  nonOrthogonalSegments: number | null;
  duplicateEndpointPairs: number | null;
  nodeOverlaps: number | null;
  labelNodeOverlaps: number | null;
  labelEdgeIntersections: number | null;
  labelOverlaps: number | null;
}

export interface GraphViewMove {
  id: string;
  deltaX: number;
  deltaY: number;
  distance: number;
}

export interface GraphViewChangeSet {
  addedNodeIds: readonly string[];
  removedNodeIds: readonly string[];
  retainedNodeIds: readonly string[];
  movedNodes: readonly GraphViewMove[];
  addedEdgeIds: readonly string[];
  removedEdgeIds: readonly string[];
  retainedEdgeIds: readonly string[];
  reroutedEdgeIds: readonly string[];
}

export interface GraphViewAlignment {
  mode: GraphViewStability["mode"];
  anchorNodeId?: string;
  deltaX: number;
  deltaY: number;
}

export type GraphViewProfileSummary =
  | {
      type: "layered";
      backend: "dagre-layered-v1";
      layout: LayeredLayoutOptions;
    }
  | {
      type: "fixed";
      backend: "fixed-position-v1";
    };

export interface GraphViewPlanV1 {
  version: typeof GRAPH_VIEW_PLAN_VERSION;
  profile: GraphViewProfileSummary;
  semanticGraph: SemanticGraphV1;
  passes: readonly GraphViewPassTrace[];
  bounds: GraphViewBounds;
  nodes: readonly GraphViewNode[];
  edges: readonly GraphViewEdge[];
  membership: GraphViewMembership;
  quality: GraphViewQuality;
  diagnostics: readonly GraphViewDiagnostic[];
  alignment: GraphViewAlignment;
  change: GraphViewChangeSet;
}
