import { describe, expect, it } from "vitest";
import {
  GRAPH_PROJECTION_VERSION,
  MAX_PROJECTION_EDGES,
  MAX_PROJECTION_NODES,
  allocateRectanglePorts,
  dependencyRelationToProjectionEdge,
  endpointStylesForDirection,
  inspectRoutedGraph,
  layoutLayeredGraph,
  projectLayeredGraph,
  roundedOrthogonalPath,
  routeCrossings,
  routeOrthogonal,
  validateProjectionGraph,
  type NodeBox,
  type RoutedEdge,
} from "../src/index.js";

describe("semantic direction", () => {
  it("only uses two arrows for an explicitly bidirectional relation", () => {
    expect(endpointStylesForDirection("directed")).toEqual({
      source: "none",
      target: "arrow",
    });
    expect(endpointStylesForDirection("undirected")).toEqual({
      source: "none",
      target: "none",
    });
    expect(endpointStylesForDirection("bidirectional")).toEqual({
      source: "arrow",
      target: "arrow",
    });
  });

  it("maps dependency roles from prerequisite to dependent", () => {
    expect(dependencyRelationToProjectionEdge({
      id: "release-needs-build",
      dependent: "release",
      prerequisite: "build",
    })).toMatchObject({
      source: "build",
      target: "release",
      direction: "directed",
    });
  });
});

describe("layered placement", () => {
  it("is deterministic and preserves stable ids", () => {
    const nodes = [
      { id: "a", width: 120, height: 60 },
      { id: "b", width: 120, height: 60 },
      { id: "c", width: 120, height: 60 },
    ];
    const edges = [
      { id: "ab", source: "a", target: "b" },
      { id: "bc", source: "b", target: "c" },
    ];
    const first = layoutLayeredGraph(nodes, edges, { direction: "left-to-right" });
    const second = layoutLayeredGraph(nodes, edges, { direction: "left-to-right" });
    expect(second).toEqual(first);
    expect(first.nodes.map((node) => node.id)).toEqual(["a", "b", "c"]);
    expect(first.nodes[0]!.x).toBeLessThan(first.nodes[1]!.x);
  });
});

describe("ports and routing", () => {
  const left: NodeBox = { id: "left", x: 0, y: 100, width: 196, height: 54 };
  const right: NodeBox = { id: "right", x: 620, y: 100, width: 196, height: 54 };

  it("starts and ends on rectangle boundaries with an orthogonal route", () => {
    const route = routeOrthogonal(left, right);
    expect(route.source).toEqual({ x: 196, y: 127, side: "right", normalX: 1, normalY: 0 });
    expect(route.target).toEqual({ x: 620, y: 127, side: "left", normalX: -1, normalY: 0 });
    expect(route.points.slice(1).every((point, index) => {
      const previous = route.points[index]!;
      return Math.abs(previous.x - point.x) < 0.01 ||
        Math.abs(previous.y - point.y) < 0.01;
    })).toBe(true);
    expect(roundedOrthogonalPath(route.points)).toMatch(/^M 196 127/);
  });

  it("routes around an unrelated node", () => {
    const obstacle: NodeBox = {
      id: "obstacle",
      x: 270,
      y: 70,
      width: 196,
      height: 114,
    };
    const route = routeOrthogonal(left, right, { obstacles: [left, obstacle, right] });
    expect(route.points.some((point) =>
      point.y <= obstacle.y - 14 || point.y >= obstacle.y + obstacle.height + 14,
    )).toBe(true);
    expect(inspectRoutedGraph([left, obstacle, right], [{
      id: "edge",
      sourceId: left.id,
      targetId: right.id,
      route,
    }]).edgeNodeIntersections).toBe(0);
  });

  it("allocates distinct ports for several relations on one side", () => {
    const nodes = [
      left,
      { id: "one", x: 400, y: 20, width: 120, height: 54 },
      { id: "two", x: 400, y: 100, width: 120, height: 54 },
      { id: "three", x: 400, y: 180, width: 120, height: 54 },
    ];
    const ports = allocateRectanglePorts(nodes, [
      { id: "one", source: "left", target: "one" },
      { id: "two", source: "left", target: "two" },
      { id: "three", source: "left", target: "three" },
    ]);
    const positions = ["one", "two", "three"].map((id) =>
      ports.get(`${id}:source`)?.y,
    );
    expect(new Set(positions).size).toBe(3);
  });

  it("uses locale-independent code-point order for tied port requests", () => {
    const nodes = [
      left,
      { id: "target-z", x: 400, y: 100, width: 120, height: 54 },
      { id: "target-umlaut", x: 400, y: 100, width: 120, height: 54 },
    ];
    const ports = allocateRectanglePorts(nodes, [
      { id: "z", source: "left", target: "target-z" },
      { id: "ä", source: "left", target: "target-umlaut" },
    ]);
    expect(ports.get("z:source")!.y).toBeLessThan(ports.get("ä:source")!.y);
  });

  it("assigns one bridge owner at an unrelated crossing", () => {
    const top: NodeBox = { id: "top", x: 202, y: -120, width: 196, height: 54 };
    const bottom: NodeBox = { id: "bottom", x: 202, y: 300, width: 196, height: 54 };
    const horizontal = routeOrthogonal(left, right, {
      sourcePort: "right",
      targetPort: "left",
    });
    const vertical = routeOrthogonal(top, bottom, {
      sourcePort: "bottom",
      targetPort: "top",
    });
    const routed: RoutedEdge[] = [
      { id: "horizontal", sourceId: "left", targetId: "right", route: horizontal },
      { id: "vertical", sourceId: "top", targetId: "bottom", route: vertical },
    ];
    const crossings = routeCrossings(routed);
    expect(crossings.horizontal).toHaveLength(1);
    expect(crossings.vertical).toHaveLength(0);
  });
});

describe("high-level projection", () => {
  it("validates and projects a portable graph", () => {
    const graph = {
      version: GRAPH_PROJECTION_VERSION,
      nodes: [
        { id: "source", width: 144, height: 62 },
        { id: "target", width: 144, height: 62 },
      ],
      edges: [{
        id: "relation",
        source: "source",
        target: "target",
        direction: "undirected" as const,
        label: "相处",
      }],
    };
    expect(validateProjectionGraph(graph)).toEqual([]);
    const result = projectLayeredGraph(graph, { direction: "left-to-right" });
    expect(result.edges[0]!.endpoints).toEqual({ source: "none", target: "none" });
    expect(result.edges[0]!.route.points.at(-1)).toEqual(result.edges[0]!.route.target);
  });

  it("reports missing endpoints without inventing nodes", () => {
    expect(validateProjectionGraph({
      version: GRAPH_PROJECTION_VERSION,
      nodes: [{ id: "known", width: 100, height: 50 }],
      edges: [{
        id: "broken",
        source: "known",
        target: "missing",
        direction: "directed",
      }],
    })).toEqual([
      expect.objectContaining({ code: "missing_target", id: "broken" }),
    ]);
  });

  it("rejects graphs beyond the documented deterministic work envelope", () => {
    const nodes = Array.from({ length: MAX_PROJECTION_NODES + 1 }, (_, index) => ({
      id: `node-${index}`,
      width: 100,
      height: 50,
    }));
    const edges = Array.from({ length: MAX_PROJECTION_EDGES + 1 }, (_, index) => ({
      id: `edge-${index}`,
      source: "node-0",
      target: "node-1",
      direction: "directed" as const,
    }));
    const issues = validateProjectionGraph({
      version: GRAPH_PROJECTION_VERSION,
      nodes,
      edges,
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "too_many_nodes" }),
      expect.objectContaining({ code: "too_many_edges" }),
    ]));
  });
});
