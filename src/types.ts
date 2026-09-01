export const GRAPH_PROJECTION_VERSION = 1 as const;
export const MAX_PROJECTION_NODES = 2_000 as const;
export const MAX_PROJECTION_EDGES = 8_000 as const;

export type RelationDirection = "directed" | "undirected" | "bidirectional";
export type EndpointStyle = "none" | "arrow" | "dot" | "ring";
export type PortSide = "top" | "right" | "bottom" | "left";

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
}

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
    | "duplicate_node_id"
    | "duplicate_edge_id"
    | "missing_source"
    | "missing_target"
    | "invalid_dimension"
    | "too_many_nodes"
    | "too_many_edges";
  message: string;
  id: string;
}
