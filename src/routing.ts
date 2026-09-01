import type {
  NodeBox,
  OrthogonalRoute,
  Point,
  PortSide,
  RectanglePort,
  RouteJump,
  RoutedEdge,
} from "./types.js";

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

export function choosePorts(
  source: NodeBox,
  target: NodeBox,
  preferredSource?: PortSide,
  preferredTarget?: PortSide,
): { sourcePort: PortSide; targetPort: PortSide } {
  const automaticSource = sideToward(source, center(target), 1);
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
      return Math.abs(delta) > EPSILON ? delta : left.key.localeCompare(right.key);
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
  const obstacles = obstacleNodes.map((node) => ({
    left: node.x - clearance,
    right: node.x + node.width + clearance,
    top: node.y - clearance,
    bottom: node.y + node.height + clearance,
  }));
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
  const points: Point[] = [];
  const indexes = new Map<string, number>();
  const key = (point: Point) => `${point.x.toFixed(3)}:${point.y.toFixed(3)}`;
  xs.forEach((x) => ys.forEach((y) => {
    const point = { x, y };
    if (obstacles.some((obstacle) => pointInsideObstacle(point, obstacle))) return;
    indexes.set(key(point), points.length);
    points.push(point);
  }));
  const sourceIndex = indexes.get(key(sourceStub));
  const targetIndex = indexes.get(key(targetStub));
  if (sourceIndex === undefined || targetIndex === undefined) return undefined;

  const adjacency = new Map<number, number[]>();
  const connect = (left: number, right: number) => {
    const leftPoint = points[left];
    const rightPoint = points[right];
    if (!leftPoint || !rightPoint || !segmentClear(leftPoint, rightPoint, obstacles)) return;
    adjacency.set(left, [...(adjacency.get(left) ?? []), right]);
    adjacency.set(right, [...(adjacency.get(right) ?? []), left]);
  };
  xs.forEach((x) => {
    const line = ys.flatMap((y) => {
      const index = indexes.get(key({ x, y }));
      return index === undefined ? [] : [index];
    });
    line.slice(0, -1).forEach((index, offset) => connect(index, line[offset + 1]!));
  });
  ys.forEach((y) => {
    const line = xs.flatMap((x) => {
      const index = indexes.get(key({ x, y }));
      return index === undefined ? [] : [index];
    });
    line.slice(0, -1).forEach((index, offset) => connect(index, line[offset + 1]!));
  });

  type Axis = "horizontal" | "vertical" | "none";
  interface SearchState {
    cost: number;
    axis: Axis;
    point: number;
    previous?: string;
  }
  const stateKey = (point: number, axis: Axis) => `${point}:${axis}`;
  const best = new Map<string, SearchState>();
  const first: SearchState = { cost: 0, axis: "none", point: sourceIndex };
  const pending = [first];
  best.set(stateKey(sourceIndex, "none"), first);
  let resolved: SearchState | undefined;
  while (pending.length > 0) {
    pending.sort((left, right) =>
      left.cost - right.cost || left.point - right.point || left.axis.localeCompare(right.axis),
    );
    const current = pending.shift()!;
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
      pending.push(next);
    }
  }
  if (!resolved) return undefined;
  const result: Point[] = [];
  let current: SearchState | undefined = resolved;
  while (current) {
    result.push(points[current.point]!);
    current = current.previous ? best.get(current.previous) : undefined;
  }
  result.reverse();
  return compactOrthogonalPoints([source, ...result, target]);
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
  return routeOrthogonalBetweenPorts(sourceNode, targetNode, source, target, options);
}

export function routeOrthogonalBetweenPorts(
  sourceNode: NodeBox,
  targetNode: NodeBox,
  source: RectanglePort,
  target: RectanglePort,
  options: OrthogonalRouteGeometryOptions = {},
): OrthogonalRoute {
  const obstacleNodes = (options.obstacles ?? []).filter((node) =>
    node.id !== sourceNode.id && node.id !== targetNode.id,
  );
  const stub = options.stub ?? 30;
  const points = obstacleAvoidingPoints(
    source,
    target,
    source.side,
    target.side,
    obstacleNodes,
    stub,
    options.clearance ?? 14,
    options.turnCost ?? 28,
    options.maximumObstacles ?? 40,
  ) ?? simpleOrthogonalPoints(source, target, source.side, target.side, stub);
  return {
    source,
    target,
    sourcePort: source.side,
    targetPort: target.side,
    points,
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

export function roundedOrthogonalPath(
  points: readonly Point[],
  jumps: readonly RouteJump[] = [],
  radius = 12,
): string {
  const compact = compactOrthogonalPoints(points);
  const first = compact[0];
  if (!first) return "";
  if (compact.length === 1) return `M ${first.x} ${first.y}`;
  let path = `M ${first.x} ${first.y}`;
  for (let index = 1; index < compact.length - 1; index += 1) {
    const previous = compact[index - 1]!;
    const current = compact[index]!;
    const next = compact[index + 1]!;
    const beforeLength = distance(previous, current);
    const afterLength = distance(current, next);
    if (beforeLength < EPSILON || afterLength < EPSILON) continue;
    const cornerRadius = Math.min(radius, beforeLength / 2, afterLength / 2);
    const before = offsetToward(current, previous, cornerRadius);
    const after = offsetToward(current, next, cornerRadius);
    const segmentJumps = jumps.filter((jump) => jump.segmentIndex === index - 1);
    path += lineWithJumps(previous, before, segmentJumps);
    path += ` Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }
  const lastIndex = compact.length - 1;
  path += lineWithJumps(
    compact[lastIndex - 1]!,
    compact[lastIndex]!,
    jumps.filter((jump) => jump.segmentIndex === lastIndex - 1),
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
  const crossings: Record<string, RouteJump[]> = {};
  edges.forEach((edge) => { crossings[edge.id] = []; });
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
          crossings[bridgeEdge.id]!.push({ ...crossing, segmentIndex });
        });
      });
    }
  }
  return crossings;
}
