import type {
  EdgeRouteConstraint,
  NodeBox,
  OrthogonalRoute,
  Point,
  PortSide,
  RectanglePort,
  RouteJump,
  RoutedEdge,
} from "./types.js";
import { compareGraphIds } from "./semantic-graph.js";

const EPSILON = 0.01;

export interface AllocatePortEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: PortSide;
  targetPort?: PortSide;
}

export interface OrthogonalRouteOptions {
  sourcePort?: PortSide;
  targetPort?: PortSide;
  obstacles?: readonly NodeBox[];
  stub?: number;
  clearance?: number;
  turnCost?: number;
  maximumObstacles?: number;
}

export type OrthogonalRouteGeometryOptions = Omit<
  OrthogonalRouteOptions,
  "sourcePort" | "targetPort"
>;

interface SideRetryPolicy {
  source: boolean;
  target: boolean;
}

function center(node: NodeBox): Point {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

export function oppositePort(port: PortSide): PortSide {
  return port === "left" ? "right" :
    port === "right" ? "left" :
      port === "top" ? "bottom" : "top";
}

export function sideToward(
  node: NodeBox,
  target: Point,
  horizontalBias = 0.8,
): PortSide {
  const origin = center(node);
  const deltaX = target.x - origin.x;
  const deltaY = target.y - origin.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY) * horizontalBias) {
    return deltaX >= 0 ? "right" : "left";
  }
  return deltaY >= 0 ? "bottom" : "top";
}

export function portVector(port: PortSide): Point {
  return port === "left" ? { x: -1, y: 0 } :
    port === "right" ? { x: 1, y: 0 } :
      port === "top" ? { x: 0, y: -1 } : { x: 0, y: 1 };
}

export function portOnRectangle(
  node: NodeBox,
  side: PortSide,
  offset = 0,
): RectanglePort {
  const normal = portVector(side);
  if (side === "top") {
    return {
      side,
      x: node.x + node.width / 2 + offset,
      y: node.y,
      normalX: normal.x,
      normalY: normal.y,
    };
  }
  if (side === "right") {
    return {
      side,
      x: node.x + node.width,
      y: node.y + node.height / 2 + offset,
      normalX: normal.x,
      normalY: normal.y,
    };
  }
  if (side === "bottom") {
    return {
      side,
      x: node.x + node.width / 2 + offset,
      y: node.y + node.height,
      normalX: normal.x,
      normalY: normal.y,
    };
  }
  return {
    side,
    x: node.x,
    y: node.y + node.height / 2 + offset,
    normalX: normal.x,
    normalY: normal.y,
  };
}

function oppositeRectanglePort(node: NodeBox, port: RectanglePort): RectanglePort {
  const offset = port.side === "left" || port.side === "right"
    ? port.y - (node.y + node.height / 2)
    : port.x - (node.x + node.width / 2);
  return portOnRectangle(node, oppositePort(port.side), offset);
}

export function choosePorts(
  source: NodeBox,
  target: NodeBox,
  preferredSource?: PortSide,
  preferredTarget?: PortSide,
): { sourcePort: PortSide; targetPort: PortSide } {
  const automaticSource = sideToward(source, center(target));
  const sourcePort = preferredSource ?? automaticSource;
  return {
    sourcePort,
    targetPort: preferredTarget ?? oppositePort(sourcePort),
  };
}

interface PortRequest {
  key: string;
  node: NodeBox;
  side: PortSide;
  other: Point;
}

export function allocateRectanglePorts(
  nodes: readonly NodeBox[],
  edges: readonly AllocatePortEdge[],
): ReadonlyMap<string, RectanglePort> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const requests: PortRequest[] = [];
  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    const sourceCenter = center(source);
    const targetCenter = center(target);
    requests.push({
      key: `${edge.id}:source`,
      node: source,
      side: edge.sourcePort ?? sideToward(source, targetCenter),
      other: targetCenter,
    });
    requests.push({
      key: `${edge.id}:target`,
      node: target,
      side: edge.targetPort ?? sideToward(target, sourceCenter),
      other: sourceCenter,
    });
  }
  const groups = new Map<string, PortRequest[]>();
  requests.forEach((request) => {
    const key = `${request.node.id}:${request.side}`;
    groups.set(key, [...(groups.get(key) ?? []), request]);
  });
  const result = new Map<string, RectanglePort>();
  groups.forEach((group) => {
    const first = group[0];
    if (!first) return;
    const vertical = first.side === "left" || first.side === "right";
    group.sort((left, right) => {
      const delta = vertical
        ? left.other.y - right.other.y
        : left.other.x - right.other.x;
      return Math.abs(delta) > EPSILON ? delta : compareGraphIds(left.key, right.key);
    });
    const length = vertical ? first.node.height : first.node.width;
    const span = group.length === 1
      ? 0
      : Math.max(0, Math.min(length - 26, (group.length - 1) * 18));
    group.forEach((request, index) => {
      const offset = group.length === 1
        ? 0
        : -span / 2 + (index * span) / (group.length - 1);
      result.set(request.key, portOnRectangle(request.node, request.side, offset));
    });
  });
  return result;
}

function samePoint(left: Point, right: Point): boolean {
  return Math.abs(left.x - right.x) < EPSILON &&
    Math.abs(left.y - right.y) < EPSILON;
}

export function compactOrthogonalPoints(points: readonly Point[]): Point[] {
  const distinct = points.filter((point, index) =>
    index === 0 || !samePoint(point, points[index - 1]!),
  );
  return distinct.filter((point, index) => {
    if (index === 0 || index === distinct.length - 1) return true;
    const previous = distinct[index - 1]!;
    const next = distinct[index + 1]!;
    const vertical = Math.abs(previous.x - point.x) < EPSILON &&
      Math.abs(point.x - next.x) < EPSILON;
    const horizontal = Math.abs(previous.y - point.y) < EPSILON &&
      Math.abs(point.y - next.y) < EPSILON;
    return !vertical && !horizontal;
  });
}

/**
 * Resolve a product-authored orthogonal corridor into the compiler's one final
 * route geometry. The route remains anchored to the allocated rectangle ports
 * and keeps a short outward stub at each endpoint. Collision inspection and
 * crossing bridges run later against these constrained points.
 */
export function applyOrthogonalRouteConstraint(
  route: OrthogonalRoute,
  constraint: EdgeRouteConstraint,
  stub = 30,
): OrthogonalRoute {
  const sourceVector = portVector(route.sourcePort);
  const targetVector = portVector(route.targetPort);
  const sourceStub = {
    x: route.source.x + sourceVector.x * stub,
    y: route.source.y + sourceVector.y * stub,
  };
  const targetStub = {
    x: route.target.x + targetVector.x * stub,
    y: route.target.y + targetVector.y * stub,
  };
  const corridor = constraint.axis === "x"
    ? [
        { x: constraint.coordinate, y: sourceStub.y },
        { x: constraint.coordinate, y: targetStub.y },
      ]
    : [
        { x: sourceStub.x, y: constraint.coordinate },
        { x: targetStub.x, y: constraint.coordinate },
      ];
  const { fallbackReason: _fallbackReason, jumps: _jumps, ...base } = route;
  return {
    ...base,
    points: compactOrthogonalPoints([
      route.source,
      sourceStub,
      ...corridor,
      targetStub,
      route.target,
    ]),
    strategy: "constrained",
  };
}

function pointOutside(point: Point, port: PortSide, distance: number): Point {
  const vector = portVector(port);
  return { x: point.x + vector.x * distance, y: point.y + vector.y * distance };
}

function simpleOrthogonalPoints(
  source: Point,
  target: Point,
  sourcePort: PortSide,
  targetPort: PortSide,
  stub: number,
): Point[] {
  const detour = stub + 12;
  const sourceStub = pointOutside(source, sourcePort, stub);
  const targetStub = pointOutside(target, targetPort, stub);
  const sourceHorizontal = sourcePort === "left" || sourcePort === "right";
  const targetHorizontal = targetPort === "left" || targetPort === "right";
  const sourceVector = portVector(sourcePort);
  const targetVector = portVector(targetPort);
  const points: Point[] = [source, sourceStub];

  if (sourceHorizontal && targetHorizontal) {
    const sourceFaces = sourceVector.x > 0
      ? sourceStub.x <= targetStub.x
      : sourceStub.x >= targetStub.x;
    const targetFaces = targetVector.x > 0
      ? targetStub.x <= sourceStub.x
      : targetStub.x >= sourceStub.x;
    const middleX = sourceFaces && targetFaces
      ? (sourceStub.x + targetStub.x) / 2
      : sourceVector.x > 0
        ? Math.max(sourceStub.x, targetStub.x) + detour
        : Math.min(sourceStub.x, targetStub.x) - detour;
    points.push(
      { x: middleX, y: sourceStub.y },
      { x: middleX, y: targetStub.y },
    );
  } else if (!sourceHorizontal && !targetHorizontal) {
    const sourceFaces = sourceVector.y > 0
      ? sourceStub.y <= targetStub.y
      : sourceStub.y >= targetStub.y;
    const targetFaces = targetVector.y > 0
      ? targetStub.y <= sourceStub.y
      : targetStub.y >= sourceStub.y;
    const middleY = sourceFaces && targetFaces
      ? (sourceStub.y + targetStub.y) / 2
      : sourceVector.y > 0
        ? Math.max(sourceStub.y, targetStub.y) + detour
        : Math.min(sourceStub.y, targetStub.y) - detour;
    points.push(
      { x: sourceStub.x, y: middleY },
      { x: targetStub.x, y: middleY },
    );
  } else if (sourceHorizontal) {
    const reverses = sourceVector.x > 0
      ? targetStub.x < sourceStub.x
      : targetStub.x > sourceStub.x;
    if (reverses) {
      const detourX = sourceStub.x + sourceVector.x * detour;
      points.push(
        { x: detourX, y: sourceStub.y },
        { x: detourX, y: targetStub.y },
      );
    } else {
      points.push({ x: targetStub.x, y: sourceStub.y });
    }
  } else {
    const reverses = sourceVector.y > 0
      ? targetStub.y < sourceStub.y
      : targetStub.y > sourceStub.y;
    if (reverses) {
      const detourY = sourceStub.y + sourceVector.y * detour;
      points.push(
        { x: sourceStub.x, y: detourY },
        { x: targetStub.x, y: detourY },
      );
    } else {
      points.push({ x: sourceStub.x, y: targetStub.y });
    }
  }
  points.push(targetStub, target);
  return compactOrthogonalPoints(points);
}

interface ExpandedObstacle {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

function expandObstacles(
  obstacleNodes: readonly NodeBox[],
  clearance: number,
): ExpandedObstacle[] {
  return obstacleNodes.map((node) => ({
    left: node.x - clearance,
    right: node.x + node.width + clearance,
    top: node.y - clearance,
    bottom: node.y + node.height + clearance,
  }));
}

function pointInsideObstacle(point: Point, obstacle: ExpandedObstacle): boolean {
  return point.x > obstacle.left + EPSILON &&
    point.x < obstacle.right - EPSILON &&
    point.y > obstacle.top + EPSILON &&
    point.y < obstacle.bottom - EPSILON;
}

function segmentClear(
  source: Point,
  target: Point,
  obstacles: readonly ExpandedObstacle[],
): boolean {
  if (Math.abs(source.y - target.y) < EPSILON) {
    const left = Math.min(source.x, target.x);
    const right = Math.max(source.x, target.x);
    return obstacles.every((obstacle) =>
      source.y <= obstacle.top + EPSILON ||
      source.y >= obstacle.bottom - EPSILON ||
      right <= obstacle.left + EPSILON ||
      left >= obstacle.right - EPSILON,
    );
  }
  if (Math.abs(source.x - target.x) < EPSILON) {
    const top = Math.min(source.y, target.y);
    const bottom = Math.max(source.y, target.y);
    return obstacles.every((obstacle) =>
      source.x <= obstacle.left + EPSILON ||
      source.x >= obstacle.right - EPSILON ||
      bottom <= obstacle.top + EPSILON ||
      top >= obstacle.bottom - EPSILON,
    );
  }
  return false;
}

function obstacleAvoidingPoints(
  source: Point,
  target: Point,
  sourcePort: PortSide,
  targetPort: PortSide,
  obstacleNodes: readonly NodeBox[],
  stub: number,
  clearance: number,
  turnCost: number,
  maximumObstacles: number,
): Point[] | undefined {
  if (obstacleNodes.length === 0 || obstacleNodes.length > maximumObstacles) {
    return undefined;
  }
  const sourceStub = pointOutside(source, sourcePort, stub);
  const targetStub = pointOutside(target, targetPort, stub);
  const obstacles = expandObstacles(obstacleNodes, clearance);
  if (obstacles.some((obstacle) => pointInsideObstacle(sourceStub, obstacle)) ||
      obstacles.some((obstacle) => pointInsideObstacle(targetStub, obstacle))) {
    return undefined;
  }

  const unique = (values: number[]) => [...new Set(values.map((value) =>
    Number(value.toFixed(3)),
  ))].sort((left, right) => left - right);
  const xs = unique([
    sourceStub.x,
    targetStub.x,
    ...obstacles.flatMap((obstacle) => [obstacle.left, obstacle.right]),
  ]);
  const ys = unique([
    sourceStub.y,
    targetStub.y,
    ...obstacles.flatMap((obstacle) => [obstacle.top, obstacle.bottom]),
  ]);
  // A segment or grid point on a line can only interact with obstacles whose
  // perpendicular interval contains that line, so pre-filter per candidate
  // line instead of scanning every obstacle everywhere.
  const obstaclesOnVerticalLine = new Map<number, ExpandedObstacle[]>();
  const obstaclesOnHorizontalLine = new Map<number, ExpandedObstacle[]>();
  for (const x of xs) {
    obstaclesOnVerticalLine.set(x, obstacles.filter((obstacle) =>
      x > obstacle.left + EPSILON && x < obstacle.right - EPSILON,
    ));
  }
  for (const y of ys) {
    obstaclesOnHorizontalLine.set(y, obstacles.filter((obstacle) =>
      y > obstacle.top + EPSILON && y < obstacle.bottom - EPSILON,
    ));
  }
  const ysLength = ys.length;
  const cellIndexes = new Array<number | undefined>(xs.length * ysLength);
  const points: Point[] = [];
  xs.forEach((x, xIndex) => {
    const column = obstaclesOnVerticalLine.get(x) ?? [];
    ys.forEach((y, yIndex) => {
      const row = obstaclesOnHorizontalLine.get(y) ?? [];
      const relevant = column.length <= row.length
        ? column.filter((obstacle) => row.includes(obstacle))
        : row.filter((obstacle) => column.includes(obstacle));
      const point = { x, y };
      if (relevant.some((obstacle) => pointInsideObstacle(point, obstacle))) return;
      cellIndexes[xIndex * ysLength + yIndex] = points.length;
      points.push(point);
    });
  });
  const cellOf = (point: Point): number | undefined => {
    const xIndex = xs.indexOf(Number(point.x.toFixed(3)));
    const yIndex = ys.indexOf(Number(point.y.toFixed(3)));
    if (xIndex < 0 || yIndex < 0) return undefined;
    return cellIndexes[xIndex * ysLength + yIndex];
  };
  const sourceIndex = cellOf(sourceStub);
  const targetIndex = cellOf(targetStub);
  if (sourceIndex === undefined || targetIndex === undefined) return undefined;

  const adjacency = new Map<number, number[]>();
  const connect = (left: number, right: number, relevant: readonly ExpandedObstacle[]) => {
    const leftPoint = points[left];
    const rightPoint = points[right];
    if (!leftPoint || !rightPoint || !segmentClear(leftPoint, rightPoint, relevant)) return;
    const leftNeighbors = adjacency.get(left);
    if (leftNeighbors === undefined) adjacency.set(left, [right]);
    else leftNeighbors.push(right);
    const rightNeighbors = adjacency.get(right);
    if (rightNeighbors === undefined) adjacency.set(right, [left]);
    else rightNeighbors.push(left);
  };
  xs.forEach((x, xIndex) => {
    const relevant = obstaclesOnVerticalLine.get(x) ?? [];
    let previous: number | undefined;
    for (let yIndex = 0; yIndex < ysLength; yIndex += 1) {
      const index = cellIndexes[xIndex * ysLength + yIndex];
      if (index === undefined) continue;
      if (previous !== undefined) connect(previous, index, relevant);
      previous = index;
    }
  });
  ys.forEach((y, yIndex) => {
    const relevant = obstaclesOnHorizontalLine.get(y) ?? [];
    let previous: number | undefined;
    for (let xIndex = 0; xIndex < xs.length; xIndex += 1) {
      const index = cellIndexes[xIndex * ysLength + yIndex];
      if (index === undefined) continue;
      if (previous !== undefined) connect(previous, index, relevant);
      previous = index;
    }
  });

  type Axis = "horizontal" | "vertical" | "none";
  interface SearchState {
    cost: number;
    axis: Axis;
    point: number;
    previous?: number;
  }
  // Numeric state keys numbered in code-point order of the axis names, so
  // (cost, point, axis) remains the deterministic total order the heap pops in.
  const axisCode: Record<Axis, number> = { horizontal: 0, none: 1, vertical: 2 };
  const stateKey = (point: number, axis: Axis) => point * 3 + axisCode[axis];
  const statePrecedes = (left: SearchState, right: SearchState): boolean =>
    left.cost < right.cost ||
    (left.cost === right.cost &&
      (left.point < right.point ||
        (left.point === right.point && compareGraphIds(left.axis, right.axis) < 0)));
  const heap: SearchState[] = [];
  const heapPush = (state: SearchState) => {
    heap.push(state);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!statePrecedes(heap[index]!, heap[parent]!)) break;
      const temporary = heap[index]!;
      heap[index] = heap[parent]!;
      heap[parent] = temporary;
      index = parent;
    }
  };
  const heapPop = (): SearchState | undefined => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0 && last !== undefined) {
      heap[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < heap.length && statePrecedes(heap[left]!, heap[smallest]!)) smallest = left;
        if (right < heap.length && statePrecedes(heap[right]!, heap[smallest]!)) smallest = right;
        if (smallest === index) break;
        const temporary = heap[index]!;
        heap[index] = heap[smallest]!;
        heap[smallest] = temporary;
        index = smallest;
      }
    }
    return top;
  };
  const best = new Map<number, SearchState>();
  const first: SearchState = { cost: 0, axis: "none", point: sourceIndex };
  best.set(stateKey(sourceIndex, "none"), first);
  heapPush(first);
  let resolved: SearchState | undefined;
  while (heap.length > 0) {
    const current = heapPop();
    if (current === undefined) continue;
    if (best.get(stateKey(current.point, current.axis)) !== current) continue;
    if (current.point === targetIndex) {
      resolved = current;
      break;
    }
    for (const neighbor of adjacency.get(current.point) ?? []) {
      const from = points[current.point]!;
      const to = points[neighbor]!;
      const axis: Axis = Math.abs(from.x - to.x) < EPSILON
        ? "vertical"
        : "horizontal";
      const distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
      const bend = current.axis !== "none" && current.axis !== axis ? turnCost : 0;
      const nextKey = stateKey(neighbor, axis);
      const cost = current.cost + distance + bend;
      if ((best.get(nextKey)?.cost ?? Number.POSITIVE_INFINITY) <= cost) continue;
      const next: SearchState = {
        cost,
        axis,
        point: neighbor,
        previous: stateKey(current.point, current.axis),
      };
      best.set(nextKey, next);
      heapPush(next);
    }
  }
  if (!resolved) return undefined;
  const result: Point[] = [];
  let current: SearchState | undefined = resolved;
  while (current) {
    result.push(points[current.point]!);
    current = current.previous === undefined ? undefined : best.get(current.previous);
  }
  result.reverse();
  return compactOrthogonalPoints([source, ...result, target]);
}

// Distance from an obstacle rectangle to the axis-aligned source/target
// bounding box. Used to spend the per-edge obstacle budget on the boxes the
// route can actually meet instead of giving up on whole-graph size.
function rectangleCorridorDistance(
  node: NodeBox,
  left: number,
  right: number,
  top: number,
  bottom: number,
): number {
  const dx = Math.max(left - (node.x + node.width), node.x - right, 0);
  const dy = Math.max(top - (node.y + node.height), node.y - bottom, 0);
  return Math.hypot(dx, dy);
}

function selectCorridorObstacles(
  obstacleNodes: readonly NodeBox[],
  source: Point,
  target: Point,
  budget: number,
): NodeBox[] {
  if (budget <= 0) return [];
  const left = Math.min(source.x, target.x);
  const right = Math.max(source.x, target.x);
  const top = Math.min(source.y, target.y);
  const bottom = Math.max(source.y, target.y);
  return obstacleNodes
    .map((node) => ({
      distance: rectangleCorridorDistance(node, left, right, top, bottom),
      node,
    }))
    .sort((leftEntry, rightEntry) =>
      leftEntry.distance !== rightEntry.distance
        ? leftEntry.distance - rightEntry.distance
        : compareGraphIds(leftEntry.node.id, rightEntry.node.id),
    )
    .slice(0, budget)
    .map((entry) => entry.node);
}

function simpleRouteIsClear(
  points: readonly Point[],
  sourceStub: Point,
  targetStub: Point,
  expanded: readonly ExpandedObstacle[],
): boolean {
  if (expanded.length === 0) return true;
  if (expanded.some((obstacle) => pointInsideObstacle(sourceStub, obstacle)) ||
      expanded.some((obstacle) => pointInsideObstacle(targetStub, obstacle))) {
    return false;
  }
  return points.every((point, index) =>
    index === 0 || segmentClear(points[index - 1]!, point, expanded),
  );
}

export function routeOrthogonal(
  sourceNode: NodeBox,
  targetNode: NodeBox,
  options: OrthogonalRouteOptions = {},
): OrthogonalRoute {
  const ports = choosePorts(
    sourceNode,
    targetNode,
    options.sourcePort,
    options.targetPort,
  );
  const source = portOnRectangle(sourceNode, ports.sourcePort);
  const target = portOnRectangle(targetNode, ports.targetPort);
  return routeOrthogonalBetweenPortsWithRetries(
    sourceNode,
    targetNode,
    source,
    target,
    options,
    {
      source: options.sourcePort === undefined,
      target: options.targetPort === undefined,
    },
  );
}

function sideRetryCandidates(
  sourceNode: NodeBox,
  targetNode: NodeBox,
  source: RectanglePort,
  target: RectanglePort,
  policy: SideRetryPolicy,
): Array<{ source: RectanglePort; target: RectanglePort }> {
  const oppositeSource = oppositeRectanglePort(sourceNode, source);
  const oppositeTarget = oppositeRectanglePort(targetNode, target);
  return [
    ...(policy.source ? [{ source: oppositeSource, target }] : []),
    ...(policy.target ? [{ source, target: oppositeTarget }] : []),
    ...(policy.source && policy.target
      ? [{ source: oppositeSource, target: oppositeTarget }]
      : []),
  ];
}

// A center-to-center side choice can park a stub inside a neighbouring node's
// clearance box (wrap edges in dense grids), which no corridor search can
// recover from. Internal projection calls can escalate through deterministic
// flips for only the auto-chosen endpoint sides. The public between-ports entry
// treats both supplied rectangle ports as authoritative.
export function routeOrthogonalBetweenPorts(
  sourceNode: NodeBox,
  targetNode: NodeBox,
  source: RectanglePort,
  target: RectanglePort,
  options: OrthogonalRouteGeometryOptions = {},
): OrthogonalRoute {
  return attemptOrthogonalRoute(sourceNode, targetNode, source, target, options);
}

/** Internal projection seam; intentionally not re-exported by the package. */
export function routeOrthogonalBetweenPortsWithRetries(
  sourceNode: NodeBox,
  targetNode: NodeBox,
  source: RectanglePort,
  target: RectanglePort,
  options: OrthogonalRouteGeometryOptions,
  policy: SideRetryPolicy,
): OrthogonalRoute {
  const route = attemptOrthogonalRoute(sourceNode, targetNode, source, target, options);
  if (route.fallbackReason !== "no-corridor") return route;
  for (const candidate of sideRetryCandidates(sourceNode, targetNode, source, target, policy)) {
    const retry = attemptOrthogonalRoute(sourceNode, targetNode, candidate.source, candidate.target, options);
    if (retry.fallbackReason === undefined) return retry;
  }
  return route;
}

function attemptOrthogonalRoute(
  sourceNode: NodeBox,
  targetNode: NodeBox,
  source: RectanglePort,
  target: RectanglePort,
  options: OrthogonalRouteGeometryOptions,
): OrthogonalRoute {
  const stub = options.stub ?? 30;
  const clearance = options.clearance ?? 14;
  const turnCost = options.turnCost ?? 28;
  const maximumObstacles = options.maximumObstacles ?? 40;
  const obstacleNodes = (options.obstacles ?? []).filter((node) =>
    node.id !== sourceNode.id && node.id !== targetNode.id,
  );
  const truncated = obstacleNodes.length > maximumObstacles;
  const selected = truncated
    ? selectCorridorObstacles(obstacleNodes, source, target, maximumObstacles)
    : obstacleNodes;
  const expanded = expandObstacles(selected, clearance);
  const simplePoints = simpleOrthogonalPoints(source, target, source.side, target.side, stub);
  // An empty selection only means "clear" when there was nothing to avoid;
  // an exhausted budget is degradation, not clearance.
  const clear = selected.length === 0
    ? obstacleNodes.length === 0
    : simpleRouteIsClear(
        simplePoints,
        pointOutside(source, source.side, stub),
        pointOutside(target, target.side, stub),
        expanded,
      );
  const avoiding = selected.length > 0 && !clear
    ? obstacleAvoidingPoints(
        source,
        target,
        source.side,
        target.side,
        selected,
        stub,
        clearance,
        turnCost,
        maximumObstacles,
      )
    : undefined;
  const points = avoiding ?? simplePoints;
  const fallbackReason = obstacleNodes.length === 0 || clear
    ? undefined
    : avoiding === undefined && selected.length === 0
      ? "obstacle-limit"
      : avoiding === undefined
        ? "no-corridor"
        : undefined;
  return {
    source,
    target,
    sourcePort: source.side,
    targetPort: target.side,
    points,
    strategy: avoiding === undefined ? "simple" : "obstacle-avoiding",
    ...(fallbackReason === undefined ? {} : { fallbackReason }),
  };
}

function distance(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function offsetToward(source: Point, target: Point, offset: number): Point {
  const length = distance(source, target);
  if (length < EPSILON) return source;
  return {
    x: source.x + ((target.x - source.x) / length) * offset,
    y: source.y + ((target.y - source.y) / length) * offset,
  };
}

function lineWithJumps(
  source: Point,
  target: Point,
  jumps: readonly RouteJump[],
): string {
  if (jumps.length === 0) return ` L ${target.x} ${target.y}`;
  const ordered = [...jumps].sort((left, right) =>
    Math.abs(source.x - target.x) >= Math.abs(source.y - target.y)
      ? Math.abs(source.x - left.x) - Math.abs(source.x - right.x)
      : Math.abs(source.y - left.y) - Math.abs(source.y - right.y),
  );
  let path = "";
  for (const jump of ordered) {
    const before = offsetToward(jump, source, 6);
    const after = offsetToward(jump, target, 6);
    const control = Math.abs(source.x - target.x) >= Math.abs(source.y - target.y)
      ? { x: jump.x, y: jump.y - 6 }
      : { x: jump.x + 6, y: jump.y };
    path += ` L ${before.x} ${before.y} Q ${control.x} ${control.y} ${after.x} ${after.y}`;
  }
  return `${path} L ${target.x} ${target.y}`;
}

interface RoundedCorner {
  before: Point;
  after: Point;
}

const ROUTE_JUMP_RADIUS = 6;

function roundedCorners(
  points: readonly Point[],
  radius: number,
): Array<RoundedCorner | undefined> {
  const corners: Array<RoundedCorner | undefined> = new Array(points.length);
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const beforeLength = distance(previous, current);
    const afterLength = distance(current, next);
    if (beforeLength < EPSILON || afterLength < EPSILON) continue;
    const cornerRadius = Math.min(radius, beforeLength / 2, afterLength / 2);
    corners[index] = {
      before: offsetToward(current, previous, cornerRadius),
      after: offsetToward(current, next, cornerRadius),
    };
  }
  return corners;
}

function pointFitsSegment(
  point: Point,
  source: Point,
  target: Point,
  margin: number,
): boolean {
  if (Math.abs(source.y - target.y) < EPSILON && Math.abs(point.y - source.y) < EPSILON) {
    return point.x >= Math.min(source.x, target.x) + margin - EPSILON &&
      point.x <= Math.max(source.x, target.x) - margin + EPSILON;
  }
  if (Math.abs(source.x - target.x) < EPSILON && Math.abs(point.x - source.x) < EPSILON) {
    return point.y >= Math.min(source.y, target.y) + margin - EPSILON &&
      point.y <= Math.max(source.y, target.y) - margin + EPSILON;
  }
  return false;
}

/** Internal compiler seam; intentionally not re-exported by the package. */
export function jumpsForRoundedOrthogonalPath(
  points: readonly Point[],
  jumps: readonly RouteJump[],
  radius = 12,
): RouteJump[] {
  const compact = compactOrthogonalPoints(points);
  if (compact.length < 2 || jumps.length === 0) return [];
  const corners = roundedCorners(compact, radius);
  const result: RouteJump[] = [];
  const lastSegment = compact.length - 2;
  for (let segmentIndex = 0; segmentIndex <= lastSegment; segmentIndex += 1) {
    const source = segmentIndex === 0
      ? compact[0]!
      : corners[segmentIndex]?.after ?? compact[segmentIndex]!;
    const target = segmentIndex === lastSegment
      ? compact.at(-1)!
      : corners[segmentIndex + 1]?.before ?? compact[segmentIndex + 1]!;
    const ordered = jumps
      .filter((jump) => jump.segmentIndex === segmentIndex &&
        pointFitsSegment(jump, source, target, ROUTE_JUMP_RADIUS))
      .sort((left, right) => distance(source, left) - distance(source, right));
    let previousDistance = Number.NEGATIVE_INFINITY;
    for (const jump of ordered) {
      const currentDistance = distance(source, jump);
      if (currentDistance - previousDistance < ROUTE_JUMP_RADIUS * 2 - EPSILON) continue;
      result.push(jump);
      previousDistance = currentDistance;
    }
  }
  return result;
}

export function roundedOrthogonalPath(
  points: readonly Point[],
  jumps: readonly RouteJump[] = [],
  radius = 12,
): string {
  const compact = compactOrthogonalPoints(points);
  const first = compact[0];
  if (!first) return "";
  if (compact.length === 1) return `M ${first.x} ${first.y}`;
  const safeJumps = jumpsForRoundedOrthogonalPath(compact, jumps, radius);
  const corners = roundedCorners(compact, radius);
  let path = `M ${first.x} ${first.y}`;
  let segmentSource = first;
  for (let index = 1; index < compact.length - 1; index += 1) {
    const current = compact[index]!;
    const corner = corners[index];
    if (!corner) continue;
    const segmentJumps = safeJumps.filter((jump) => jump.segmentIndex === index - 1);
    path += lineWithJumps(segmentSource, corner.before, segmentJumps);
    path += ` Q ${current.x} ${current.y} ${corner.after.x} ${corner.after.y}`;
    segmentSource = corner.after;
  }
  const lastIndex = compact.length - 1;
  path += lineWithJumps(
    segmentSource,
    compact[lastIndex]!,
    safeJumps.filter((jump) => jump.segmentIndex === lastIndex - 1),
  );
  return path;
}

export function pointOnRoute(route: OrthogonalRoute, ratio = 0.5): Point {
  const lengths = route.points.slice(1).map((point, index) =>
    distance(route.points[index]!, point),
  );
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total < EPSILON) return route.source;
  let remaining = total * Math.max(0, Math.min(1, ratio));
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!;
    if (remaining <= length || index === lengths.length - 1) {
      const source = route.points[index]!;
      const target = route.points[index + 1]!;
      const local = length < EPSILON ? 0 : remaining / length;
      return {
        x: source.x + (target.x - source.x) * local,
        y: source.y + (target.y - source.y) * local,
      };
    }
    remaining -= length;
  }
  return route.target;
}

function interiorCrossing(
  leftSource: Point,
  leftTarget: Point,
  rightSource: Point,
  rightTarget: Point,
): Point | undefined {
  const leftHorizontal = Math.abs(leftSource.y - leftTarget.y) < EPSILON;
  const rightHorizontal = Math.abs(rightSource.y - rightTarget.y) < EPSILON;
  if (leftHorizontal === rightHorizontal) return undefined;
  const horizontalSource = leftHorizontal ? leftSource : rightSource;
  const horizontalTarget = leftHorizontal ? leftTarget : rightTarget;
  const verticalSource = leftHorizontal ? rightSource : leftSource;
  const verticalTarget = leftHorizontal ? rightTarget : leftTarget;
  const x = verticalSource.x;
  const y = horizontalSource.y;
  const between = (value: number, first: number, second: number) =>
    value > Math.min(first, second) + 8 && value < Math.max(first, second) - 8;
  return between(x, horizontalSource.x, horizontalTarget.x) &&
    between(y, verticalSource.y, verticalTarget.y)
    ? { x, y }
    : undefined;
}

export function routeCrossings(
  edges: readonly RoutedEdge[],
): Readonly<Record<string, readonly RouteJump[]>> {
  const crossings = new Map<string, RouteJump[]>();
  edges.forEach((edge) => { crossings.set(edge.id, []); });
  for (let leftIndex = 0; leftIndex < edges.length; leftIndex += 1) {
    const left = edges[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < edges.length; rightIndex += 1) {
      const right = edges[rightIndex]!;
      if (left.sourceId === right.sourceId || left.sourceId === right.targetId ||
          left.targetId === right.sourceId || left.targetId === right.targetId) continue;
      left.route.points.slice(1).forEach((leftTarget, leftSegment) => {
        const leftSource = left.route.points[leftSegment]!;
        right.route.points.slice(1).forEach((rightTarget, rightSegment) => {
          const rightSource = right.route.points[rightSegment]!;
          const crossing = interiorCrossing(leftSource, leftTarget, rightSource, rightTarget);
          if (!crossing) return;
          const leftHorizontal = Math.abs(leftSource.y - leftTarget.y) < EPSILON;
          const bridgeEdge = leftHorizontal ? left : right;
          const segmentIndex = leftHorizontal ? leftSegment : rightSegment;
          crossings.get(bridgeEdge.id)?.push({ ...crossing, segmentIndex });
        });
      });
    }
  }
  return Object.fromEntries(crossings);
}
