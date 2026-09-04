import { describe, expect, it } from "vitest";
import * as rootApi from "../src/index.js";
import {
  GRAPH_PROJECTION_VERSION,
  MAX_PROJECTION_EDGES,
  MAX_PROJECTION_NODES,
  MAX_SEMANTIC_PATH_STATES,
  applyOrthogonalRouteConstraint,
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
  type SemanticGraphSlice,
  type SemanticGraphV1,
  type SemanticPathQuery,
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
  it("keeps normalized-input fast paths out of the public package API", () => {
    expect(Object.keys(rootApi).filter((key) => key.includes("NormalizedSemantic"))).toEqual([]);
    expect("routeOrthogonalBetweenPortsWithRetries" in rootApi).toBe(false);
    expect("jumpsForRoundedOrthogonalPath" in rootApi).toBe(false);
  });

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

  it("rejects traversal directions and port sides that are not exact literals", () => {
    expect(() => findSemanticPaths(semanticGraph, {
      from: "schema",
      to: "publish",
      direction: "sideways",
    } as unknown as SemanticPathQuery)).toThrow(expect.objectContaining({
      name: "SemanticGraphError",
      issues: [expect.objectContaining({ code: "invalid_option", id: "direction" })],
    }));
    expect(() => sliceSemanticGraph(semanticGraph, {
      focus: ["build"],
      direction: ["outgoing"],
    } as unknown as SemanticGraphSlice)).toThrow(expect.objectContaining({
      name: "SemanticGraphError",
      issues: [expect.objectContaining({ code: "invalid_option", id: "direction" })],
    }));
    expect(validateSemanticGraph({
      version: 1,
      nodes: [{ id: "a", ports: [{ id: "p", preferredSide: ["top"] }] }],
      relations: [],
    } as unknown as SemanticGraphV1)).toEqual([
      expect.objectContaining({ code: "invalid_identifier", id: "a.ports[0]" }),
    ]);
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
    expect(collapsed.absorbedRelationIds).toEqual(["ab"]);
    expect(collapseSemanticGroups(grouped, []).absorbedRelationIds).toEqual([]);
  });

  it("treats prototype-shaped graph ids as ordinary opaque ids", () => {
    const grouped = groupSemanticNodes({
      version: 1,
      nodes: [{ id: "a" }, { id: "constructor" }],
      relations: [{
        id: "toString",
        source: "a",
        target: "constructor",
        direction: "directed",
      }],
    }, {
      group: { id: "__proto__", label: "Opaque group" },
      nodeIds: ["a", "constructor"],
    });
    const collapsed = collapseSemanticGroups(grouped, ["__proto__"]);
    expect(collapsed.graph.nodes).toEqual([
      { id: "__proto__", kind: "group", label: "Opaque group" },
    ]);
    expect(collapsed.nodeMembers["__proto__"]).toEqual(["a", "constructor"]);
    expect(collapsed.absorbedRelationIds).toEqual(["toString"]);
    expect(() => semanticGraphToProjectionGraph({
      version: 1,
      nodes: [{ id: "constructor" }],
      relations: [],
    }, { nodeSizes: {} })).toThrow(expect.objectContaining({
      issues: [expect.objectContaining({
        code: "missing_node_size",
        id: "constructor",
      })],
    }));

    const leftNode: NodeBox = { id: "left", x: 0, y: 100, width: 196, height: 54 };
    const rightNode: NodeBox = { id: "right", x: 620, y: 100, width: 196, height: 54 };
    const horizontal = routeOrthogonal(leftNode, rightNode, {
      sourcePort: "right",
      targetPort: "left",
    });
    const top: NodeBox = { id: "top", x: 202, y: -120, width: 196, height: 54 };
    const bottom: NodeBox = { id: "bottom", x: 202, y: 300, width: 196, height: 54 };
    const vertical = routeOrthogonal(top, bottom, {
      sourcePort: "bottom",
      targetPort: "top",
    });
    expect(routeCrossings([
      { id: "__proto__", sourceId: "left", targetId: "right", route: horizontal },
      { id: "constructor", sourceId: "top", targetId: "bottom", route: vertical },
    ])["__proto__"]).toHaveLength(1);
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

  it("turns one neutral corridor constraint into an orthogonal final route", () => {
    const automatic = routeOrthogonal(left, right);
    const constrained = applyOrthogonalRouteConstraint(automatic, {
      type: "orthogonal-corridor",
      axis: "y",
      coordinate: 40,
    });
    expect(constrained.strategy).toBe("constrained");
    expect(constrained.points).toEqual([
      automatic.source,
      { x: 226, y: 127 },
      { x: 226, y: 40 },
      { x: 590, y: 40 },
      { x: 590, y: 127 },
      automatic.target,
    ]);
    expect(constrained.points.slice(1).every((point, index) => {
      const previous = constrained.points[index]!;
      return previous.x === point.x || previous.y === point.y;
    })).toBe(true);
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
    expect(route.strategy).toBe("obstacle-avoiding");
    expect(route.points.some((point) =>
      point.y <= obstacle.y - 14 || point.y >= obstacle.y + obstacle.height + 14,
    )).toBe(true);
    expect(routeOrthogonal(left, right, {
      obstacles: [left, obstacle, right],
      maximumObstacles: 0,
    })).toMatchObject({ strategy: "simple", fallbackReason: "obstacle-limit" });
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

  it("never emits a backward path for jumps near corners or one another", () => {
    const nearCorner = roundedOrthogonalPath(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
      [{ x: 91, y: 0, segmentIndex: 0 }],
    );
    expect(nearCorner).not.toContain("Q 91 -6");
    expect(nearCorner).toBe("M 0 0 L 88 0 Q 100 0 100 12 L 100 100");

    const crowded = roundedOrthogonalPath(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [
        { x: 40, y: 0, segmentIndex: 0 },
        { x: 45, y: 0, segmentIndex: 0 },
      ],
    );
    expect(crowded.match(/ Q /gu)).toHaveLength(1);
    expect(crowded).toBe("M 0 0 L 34 0 Q 40 -6 46 0 L 100 0");
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

  it("rejects non-literal low-level direction, ports, versions, and weights", () => {
    const malformed = {
      version: 2,
      nodes: [
        { id: "source", width: 100, height: 50 },
        { id: "target", width: 100, height: 50 },
      ],
      edges: [{
        id: "edge",
        source: "source",
        target: "target",
        direction: ["directed"],
        sourcePort: ["right"],
        weight: 0,
      }],
    } as unknown as Parameters<typeof validateProjectionGraph>[0];
    expect(validateProjectionGraph(malformed)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid_version", id: "graph" }),
      expect.objectContaining({ code: "invalid_direction", id: "edge" }),
      expect.objectContaining({ code: "invalid_port", id: "edge" }),
      expect.objectContaining({ code: "invalid_weight", id: "edge" }),
    ]));
    expect(() => projectLayeredGraph(malformed, {
      direction: "left-to-right",
    })).toThrow(expect.objectContaining({ name: "GraphProjectionError" }));
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
