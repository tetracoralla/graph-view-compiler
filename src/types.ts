export const GRAPH_PROJECTION_VERSION = 1 as const;
export const SEMANTIC_GRAPH_VERSION = 1 as const;
export const MAX_PROJECTION_NODES = 2_000 as const;
export const MAX_PROJECTION_EDGES = 8_000 as const;
export const MAX_SEMANTIC_NODES = 5_000 as const;
export const MAX_SEMANTIC_RELATIONS = 20_000 as const;
export const MAX_SEMANTIC_GROUPS = 2_000 as const;
export const MAX_SEMANTIC_PATHS = 256 as const;
export const MAX_SEMANTIC_PATH_STATES = 10_000 as const;
export const MAX_GRAPH_VIEW_PASSES = 64 as const;
export const MAX_GRAPH_VIEW_ROUTING_OBSTACLES = 96 as const;
export const MAX_GRAPH_VIEW_INSPECTION_WORK = 100_000 as const;
export const MAX_GRAPH_VIEW_ROUTE_CROSSINGS_WORK = 250_000 as const;
export const MAX_GRAPH_VIEW_DIAGNOSTICS = 256 as const;
export const MAX_LAYERED_LAYOUT_DEPTH = 1_000 as const;

export type RelationDirection = "directed" | "undirected" | "bidirectional";
export type EndpointStyle = "none" | "arrow" | "dot" | "ring";
export type PortSide = "top" | "right" | "bottom" | "left";

export interface SemanticPort {
  id: string;
  kind?: string;
  preferredSide?: PortSide;
}

export interface SemanticNode {
  id: string;
  label?: string;
  kind?: string;
  groupId?: string;
  ports?: SemanticPort[];
}

export interface SemanticRelation {
  id: string;
  source: string;
  target: string;
  direction: RelationDirection;
  label?: string;
  kind?: string;
  sourcePort?: string;
  targetPort?: string;
}

export interface SemanticGroup {
  id: string;
  label?: string;
  parentGroupId?: string;
}

export interface SemanticGraphV1 {
  version: typeof SEMANTIC_GRAPH_VERSION;
  nodes: SemanticNode[];
  relations: SemanticRelation[];
  groups?: SemanticGroup[];
}

export interface SemanticGraphIssue {
  code:
    | "invalid_graph"
    | "invalid_version"
    | "invalid_identifier"
    | "invalid_direction"
    | "duplicate_node_id"
    | "duplicate_relation_id"
    | "duplicate_group_id"
    | "duplicate_graph_id"
    | "duplicate_port_id"
    | "missing_source"
    | "missing_target"
    | "missing_group"
    | "missing_parent_group"
    | "group_cycle"
    | "missing_source_port"
    | "missing_target_port"
    | "missing_node_size"
    | "unknown_selection"
    | "invalid_option"
    | "too_many_nodes"
    | "too_many_relations"
    | "too_many_groups"
    | "work_limit_exceeded";
  message: string;
  id: string;
}

export interface SemanticGraphFilter {
  nodeIds?: readonly string[];
  groupIds?: readonly string[];
  /**
   * Matched against relation.kind. Relations without a kind survive only
   * when "" is listed explicitly.
   */
  relationKinds?: readonly string[];
}

export interface SemanticGraphSlice {
  focus: readonly string[];
  direction: "outgoing" | "incoming" | "both";
  maxDepth?: number;
}

export interface SemanticPathQuery {
  from: string;
  to: string;
  direction?: "outgoing" | "incoming" | "both";
  maxDepth?: number;
  maxPaths?: number;
}

export interface SemanticPath {
  nodes: string[];
  relations: string[];
}

export interface SemanticGroupAssignment {
  group: SemanticGroup;
  nodeIds: readonly string[];
}

export interface CollapsedSemanticGraph {
  graph: SemanticGraphV1;
  nodeMembers: Readonly<Record<string, readonly string[]>>;
  relationMembers: Readonly<Record<string, readonly string[]>>;
  /**
   * Source relations whose endpoints collapsed into one proxy node and
   * therefore have no surviving edge in the collapsed graph.
   */
  absorbedRelationIds: readonly string[];
}

export interface SemanticProjectionOptions {
  nodeSizes: Readonly<Record<string, { width: number; height: number }>>;
  labelSizes?: Readonly<Record<string, { width: number; height: number }>>;
}

export interface Point {
  x: number;
  y: number;
}

export interface NodeBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProjectionNodeInput {
  id: string;
  width: number;
  height: number;
}

export interface ProjectionEdgeInput {
  id: string;
  source: string;
  target: string;
  direction: RelationDirection;
  label?: string;
  labelWidth?: number;
  labelHeight?: number;
  sourcePort?: PortSide;
  targetPort?: PortSide;
  weight?: number;
}

export interface ProjectionGraphV1 {
  version: typeof GRAPH_PROJECTION_VERSION;
  nodes: ProjectionNodeInput[];
  edges: ProjectionEdgeInput[];
}

export interface EndpointStyles {
  source: EndpointStyle;
  target: EndpointStyle;
}

export interface RectanglePort extends Point {
  side: PortSide;
  normalX: number;
  normalY: number;
}

export interface OrthogonalRoute {
  source: Point;
  target: Point;
  sourcePort: PortSide;
  targetPort: PortSide;
  points: Point[];
  /** Set by this library: which authority produced the final geometry. */
  strategy?: "obstacle-avoiding" | "simple" | "constrained";
  /**
   * Present only when a simple route was used as a bounded fallback. A simple
   * route without this field either had no obstacles in budget or already
   * clears every in-budget obstacle.
   */
  fallbackReason?: "obstacle-limit" | "no-corridor";
  /**
   * Renderable crossing bridge arcs for this route. An empty array means the
   * bounded crossing pass completed and found no eligible bridge. The field is
   * absent when the view-level route-crossing work budget is declined.
   */
  jumps?: readonly RouteJump[];
}

/**
 * A product-authored movable corridor for one otherwise automatic orthogonal
 * route. The compiler retains authority for endpoint stubs, the final point
 * sequence, crossing bridges, bounds, and geometric diagnostics.
 */
export interface OrthogonalCorridorConstraint {
  type: "orthogonal-corridor";
  axis: "x" | "y";
  coordinate: number;
}

export type EdgeRouteConstraint = OrthogonalCorridorConstraint;
export type EdgeRouteConstraints = Readonly<Record<string, EdgeRouteConstraint>>;

export interface RouteJump extends Point {
  segmentIndex: number;
}

export interface RoutedEdge {
  id: string;
  sourceId: string;
  targetId: string;
  route: OrthogonalRoute;
}

export interface LayeredNodeInput {
  id: string;
  width: number;
  height: number;
}

export interface LayeredEdgeInput {
  id: string;
  source: string;
  target: string;
  labelWidth?: number;
  labelHeight?: number;
  weight?: number;
  minimumLength?: number;
}

export interface LayeredLayoutOptions {
  direction: "left-to-right" | "top-to-bottom";
  nodeGap?: number;
  edgeGap?: number;
  rankGap?: number;
  marginX?: number;
  marginY?: number;
}

export interface LayeredNodePlacement extends NodeBox {}

export interface LayeredEdgePlacement {
  id: string;
  points: Point[];
  label?: Point;
}

export interface LayeredLayoutResult {
  width: number;
  height: number;
  nodes: LayeredNodePlacement[];
  edges: LayeredEdgePlacement[];
}

export interface DependencyRelation {
  id: string;
  dependent: string;
  prerequisite: string;
  label?: string;
}

export interface ProjectionIssue {
  code:
    | "invalid_version"
    | "invalid_identifier"
    | "invalid_direction"
    | "invalid_port"
    | "invalid_weight"
    | "duplicate_node_id"
    | "duplicate_edge_id"
    | "missing_source"
    | "missing_target"
    | "missing_position"
    | "invalid_position"
    | "invalid_route_constraint"
    | "unknown_route_constraint"
    | "invalid_dimension"
    | "too_many_nodes"
    | "too_many_edges"
    | "layout_depth_exceeded"
    | "layout_failed";
  message: string;
  id: string;
}
