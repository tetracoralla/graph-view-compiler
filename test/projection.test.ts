import { describe, expect, it } from "vitest";
import {
  GRAPH_PROJECTION_VERSION,
  MAX_PROJECTION_EDGES,
  MAX_PROJECTION_NODES,
  MAX_SEMANTIC_PATH_STATES,
  allocateRectanglePorts,
  dependencyRelationToProjectionEdge,
  endpointStylesForDirection,
  inspectRoutedGraph,
  collapseSemanticGroups,
  compareGraphIds,
  filterSemanticGraph,
  findSemanticPaths,
  groupSemanticNodes,
  layoutLayeredGraph,
  normalizeSemanticGraph,
  projectLayeredGraph,
  roundedOrthogonalPath,
  routeCrossings,
  routeOrthogonal,
  semanticGraphToProjectionGraph,
  sliceSemanticGraph,
  validateProjectionGraph,
  validateSemanticGraph,
  type NodeBox,
  type RoutedEdge,
  type SemanticGraphV1,
} from "../src/index.js";

const semanticGraph = {
  version: 1 as const,
  nodes: [
    { id: "publish", label: "Publish", groupId: "release" },
    { id: "schema", label: "Schema", groupId: "foundation", ports: [{ id: "out", preferredSide: "right" as const }] },
    { id: "build", label: "Build", groupId: "release", ports: [{ id: "in", preferredSide: "left" as const }] },
    { id: "review", label: "Review", groupId: "release" },
  ],
  relations: [
    { id: "schema-build", source: "schema", target: "build", direction: "directed" as const, kind: "requires", sourcePort: "out", targetPort: "in" },
    { id: "build-review", source: "build", target: "review", direction: "directed" as const, kind: "requires" },
    { id: "review-publish", source: "review", target: "publish", direction: "directed" as const, kind: "requires" },
  ],
  groups: [
    { id: "foundation", label: "Foundation" },
    { id: "release", label: "Release" },
  ],
};

describe("versioned semantic graph", () => {
  it("orders full Unicode code points and strips undeclared product state", () => {
    expect(compareGraphIds("\uE000", "😀")).toBeLessThan(0);
    const normalized = normalizeSemanticGraph({
      version: 1,
      nodes: [{ id: "node", ports: [{ id: "port", preferredSide: "right", color: "red" }] }],
      relations: [{
        id: "edge",
        source: "node",
        target: "node",
        direction: "directed",
        camera: { zoom: 2 },
      }],
      groups: [{ id: "group", selection: true }],
    } as unknown as SemanticGraphV1);
    expect(normalized).toEqual({
      version: 1,
      nodes: [{ id: "node", ports: [{ id: "port", preferredSide: "right" }] }],
      relations: [{ id: "edge", source: "node", target: "node", direction: "directed" }],
      groups: [{ id: "group" }],
    });
  });

  it("normalizes nodes, relations, groups, and ports with code-point ordering", () => {
    const shuffled = {
      ...semanticGraph,
      nodes: [...semanticGraph.nodes].reverse(),
      relations: [...semanticGraph.relations].reverse(),
      groups: [...semanticGraph.groups].reverse(),
    };
    expect(validateSemanticGraph(shuffled)).toEqual([]);
    const normalized = normalizeSemanticGraph(shuffled);
    expect(normalized.nodes.map((node) => node.id)).toEqual(["build", "publish", "review", "schema"]);
    expect(normalized.relations.map((relation) => relation.id)).toEqual([
      "build-review",
      "review-publish",
      "schema-build",
    ]);
  });

  it("filters and slices without inventing relations", () => {
    expect(filterSemanticGraph(semanticGraph, { groupIds: ["release"] }).nodes.map((node) => node.id)).toEqual([
      "build",
      "publish",
      "review",
    ]);
    const slice = sliceSemanticGraph(semanticGraph, {
      focus: ["build"],
      direction: "outgoing",
      maxDepth: 1,
    });
    expect(slice.nodes.map((node) => node.id)).toEqual(["build", "review"]);
    expect(slice.relations.map((relation) => relation.id)).toEqual(["build-review"]);
  });

  it("finds deterministic bounded paths with relation provenance", () => {
    expect(findSemanticPaths(semanticGraph, { from: "schema", to: "publish" })).toEqual([{
      nodes: ["schema", "build", "review", "publish"],
      relations: ["schema-build", "build-review", "review-publish"],
    }]);
  });

  it("fails explicitly when path exploration exceeds its deterministic work budget", () => {
    const connectedNodeCount = 20;
    const graph = {
      version: 1 as const,
      nodes: [
        ...Array.from({ length: connectedNodeCount }, (_, index) => ({ id: `n${index}` })),
        { id: "isolated-target" },
      ],
      relations: Array.from({ length: connectedNodeCount }, (_, source) =>
        Array.from({ length: connectedNodeCount - source - 1 }, (_unused, offset) => {
          const target = source + offset + 1;
          return {
            id: `n${source}-n${target}`,
            source: `n${source}`,
            target: `n${target}`,
            direction: "directed" as const,
          };
        })).flat(),
    };
    expect(MAX_SEMANTIC_PATH_STATES).toBe(10_000);
    try {
      findSemanticPaths(graph, { from: "n0", to: "isolated-target", maxDepth: 20 });
      throw new Error("expected path work limit");
    } catch (error) {
      expect(error).toMatchObject({
        issues: [expect.objectContaining({ code: "work_limit_exceeded" })],
      });
    }
  });

  it("groups and collapses as a derived view while retaining membership", () => {
    const ungrouped = {
      version: 1 as const,
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      relations: [
        { id: "ab", source: "a", target: "b", direction: "directed" as const },
        { id: "bc", source: "b", target: "c", direction: "directed" as const },
      ],
    };
    const grouped = groupSemanticNodes(ungrouped, {
      group: { id: "pair", label: "Pair" },
      nodeIds: ["a", "b"],
    });
    const collapsed = collapseSemanticGroups(grouped, ["pair"]);
    expect(collapsed.graph.nodes).toEqual([
      { id: "c" },
      { id: "pair", kind: "group", label: "Pair" },
    ]);
    expect(collapsed.graph.relations).toEqual([
      { id: "bc", source: "pair", target: "c", direction: "directed" },
    ]);
    expect(collapsed.nodeMembers.pair).toEqual(["a", "b"]);
    expect(collapsed.relationMembers.bc).toEqual(["bc"]);
  });

  it("maps semantic port intent and measured sizes into the 2D projection boundary", () => {
    const projected = semanticGraphToProjectionGraph(semanticGraph, {
      nodeSizes: Object.fromEntries(semanticGraph.nodes.map((node) => [node.id, { width: 120, height: 56 }])),
    });
    expect(projected.edges.find((edge) => edge.id === "schema-build")).toMatchObject({
      sourcePort: "right",
      targetPort: "left",
    });
    expect(projectLayeredGraph(projected, { direction: "left-to-right" }).nodes).toHaveLength(4);
  });

  it("rejects dangling ports and cross-namespace group ids", () => {
    expect(validateSemanticGraph({
      version: 1,
      nodes: [{ id: "same", ports: [{ id: "known" }] }],
      relations: [{ id: "edge", source: "same", target: "same", direction: "directed", sourcePort: "missing" }],
      groups: [{ id: "same" }],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate_graph_id", id: "same" }),
      expect.objectContaining({ code: "missing_source_port", id: "edge" }),
    ]));
  });
});

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

  it("orders supplementary-plane port ids by Unicode code point", () => {
    const nodes = [
      left,
      { id: "target-private", x: 400, y: 100, width: 120, height: 54 },
      { id: "target-emoji", x: 400, y: 100, width: 120, height: 54 },
    ];
    const ports = allocateRectanglePorts(nodes, [
      { id: "\uE000", source: "left", target: "target-private" },
      { id: "😀", source: "left", target: "target-emoji" },
    ]);
    expect(ports.get("\uE000:source")!.y).toBeLessThan(ports.get("😀:source")!.y);
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
