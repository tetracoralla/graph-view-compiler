import { describe, expect, it } from "vitest";
import {
  GRAPH_VIEW_PLAN_VERSION,
  MAX_GRAPH_VIEW_PASSES,
  compileGraphView,
  roundedOrthogonalPath,
  type CompileGraphViewInput,
  type GraphViewPlanV1,
  type SemanticGraphV1,
} from "../src/index.js";

const chain: SemanticGraphV1 = {
  version: 1,
  nodes: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" },
  ],
  relations: [
    { id: "ab", source: "a", target: "b", direction: "directed" },
    { id: "bc", source: "b", target: "c", direction: "directed" },
  ],
};

const sizes = {
  a: { width: 100, height: 50 },
  b: { width: 100, height: 50 },
  c: { width: 100, height: 50 },
  pair: { width: 140, height: 64 },
};

describe("graph view compiler", () => {
  it("runs named passes in order and composes source membership", () => {
    const plan = compileGraphView({
      graph: chain,
      passes: [
        {
          id: "group-foundation",
          type: "group",
          assignment: {
            group: { id: "pair", label: "Pair" },
            nodeIds: ["a", "b"],
          },
        },
        { id: "collapse-foundation", type: "collapse", groupIds: ["pair"] },
      ],
      nodeSizes: sizes,
      profile: { type: "layered", layout: { direction: "left-to-right" } },
    });

    expect(plan.version).toBe(GRAPH_VIEW_PLAN_VERSION);
    expect(plan.passes).toEqual([
      expect.objectContaining({ id: "group-foundation", inputNodes: 3, outputNodes: 3 }),
      expect.objectContaining({ id: "collapse-foundation", inputNodes: 3, outputNodes: 2 }),
    ]);
    expect(plan.semanticGraph.nodes.map((node) => node.id)).toEqual(["c", "pair"]);
    expect(plan.membership.nodes.pair).toEqual(["a", "b"]);
    expect(plan.membership.relations.bc).toEqual(["bc"]);
    expect(plan.nodes.find((node) => node.id === "pair")).toMatchObject({
      label: "Pair",
      kind: "group",
    });
  });

  it("uses authoritative fixed positions while still routing and inspecting the view", () => {
    const graph: SemanticGraphV1 = {
      version: 1,
      nodes: [
        { id: "left" },
        { id: "right" },
        { id: "top" },
        { id: "bottom" },
      ],
      relations: [
        { id: "horizontal", source: "left", target: "right", direction: "directed" },
        { id: "vertical", source: "top", target: "bottom", direction: "directed" },
      ],
    };
    const plan = compileGraphView({
      graph,
      nodeSizes: Object.fromEntries(graph.nodes.map((node) => [node.id, { width: 80, height: 40 }])),
      profile: {
        type: "fixed",
        positions: {
          left: { x: -200, y: 0 },
          right: { x: 200, y: 0 },
          top: { x: 0, y: -200 },
          bottom: { x: 0, y: 200 },
        },
      },
    });

    expect(plan.profile).toEqual({ type: "fixed", backend: "fixed-position-v1" });
    expect(plan.nodes.find((node) => node.id === "left")?.x).toBe(-200);
    expect(plan.bounds.x).toBeLessThan(0);
    expect(plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "edge_crossing",
        viewIds: ["horizontal", "vertical"],
        sourceIds: ["horizontal", "vertical"],
      }),
    ]));
  });

  it("normalizes shuffled source input into the same deterministic plan", () => {
    const input: Omit<CompileGraphViewInput, "graph"> = {
      nodeSizes: sizes,
      profile: { type: "layered", layout: { direction: "top-to-bottom" } },
    };
    const first = compileGraphView({ graph: chain, ...input });
    const second = compileGraphView({
      graph: {
        ...chain,
        nodes: [...chain.nodes].reverse(),
        relations: [...chain.relations].reverse(),
      },
      ...input,
    });
    expect(second).toEqual(first);
  });

  it("requires caller-owned label measurements and preserves them in the plan", () => {
    const labelled: SemanticGraphV1 = {
      ...chain,
      relations: [{ ...chain.relations[0]!, label: "needs" }],
    };
    expect(() => compileGraphView({
      graph: labelled,
      nodeSizes: sizes,
      profile: { type: "layered", layout: { direction: "left-to-right" } },
    })).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: [expect.objectContaining({ code: "missing_label_size", id: "ab" })],
    }));
    const plan = compileGraphView({
      graph: labelled,
      nodeSizes: sizes,
      labelSizes: { ab: { width: 48, height: 18 } },
      profile: { type: "layered", layout: { direction: "left-to-right" } },
    });
    expect(plan.edges[0]?.label).toMatchObject({ text: "needs", width: 48, height: 18 });
  });

  it("reports node and measured-label collisions with affected source objects", () => {
    const graph: SemanticGraphV1 = {
      version: 1,
      nodes: [{ id: "a" }, { id: "b" }],
      relations: [{ id: "ab", source: "a", target: "b", direction: "directed", label: "wide" }],
    };
    const plan = compileGraphView({
      graph,
      nodeSizes: { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } },
      labelSizes: { ab: { width: 360, height: 32 } },
      profile: {
        type: "fixed",
        positions: { a: { x: 0, y: 0 }, b: { x: 80, y: 0 } },
      },
    });
    expect(plan.quality).toMatchObject({
      complete: true,
      nodeOverlaps: 1,
      labelNodeOverlaps: 2,
    });
    expect(plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "node_overlap", sourceIds: ["a", "b"] }),
      expect.objectContaining({ code: "label_node_overlap", sourceIds: ["a", "ab"] }),
    ]));
    expect(plan.bounds.width).toBe(360);
  });

  it("reconciles additions and can keep an explicit anchor stationary", () => {
    const firstGraph: SemanticGraphV1 = {
      ...chain,
      nodes: chain.nodes.slice(0, 2),
      relations: chain.relations.slice(0, 1),
    };
    const previousPlan = compileGraphView({
      graph: firstGraph,
      nodeSizes: sizes,
      profile: { type: "layered", layout: { direction: "left-to-right" } },
    });
    const nextPlan = compileGraphView({
      graph: chain,
      nodeSizes: sizes,
      profile: { type: "layered", layout: { direction: "left-to-right" } },
      previousPlan,
      stability: { mode: "preserve-anchor", anchorNodeId: "a" },
    });
    const previousAnchor = previousPlan.nodes.find((node) => node.id === "a");
    const nextAnchor = nextPlan.nodes.find((node) => node.id === "a");
    expect(nextAnchor).toMatchObject({ x: previousAnchor?.x, y: previousAnchor?.y });
    expect(nextPlan.alignment).toMatchObject({ mode: "preserve-anchor", anchorNodeId: "a" });
    expect(nextPlan.change.addedNodeIds).toEqual(["c"]);
    expect(nextPlan.change.addedEdgeIds).toEqual(["bc"]);
    expect(nextPlan.change.retainedNodeIds).toEqual(["a", "b"]);
  });

  it("reports routing fallback when the explicit obstacle budget is exceeded", () => {
    const plan = compileGraphView({
      graph: chain,
      nodeSizes: sizes,
      profile: { type: "layered", layout: { direction: "left-to-right" } },
      routing: { maximumObstacles: 0 },
    });
    expect(plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "routing_obstacle_limit" }),
    ]));
  });

  it("spends the obstacle budget on the nearest corridor obstacles instead of falling back", () => {
    const nodeCount = 45;
    const graph: SemanticGraphV1 = {
      version: 1,
      nodes: Array.from({ length: nodeCount }, (_, index) => ({ id: `n-${String(index).padStart(2, "0")}` })),
      relations: [{
        id: "long-edge",
        source: "n-00",
        target: "n-05",
        direction: "directed",
      }],
    };
    const plan = compileGraphView({
      graph,
      nodeSizes: Object.fromEntries(
        graph.nodes.map((node) => [node.id, { width: 120, height: 52 }]),
      ),
      profile: {
        type: "fixed",
        positions: Object.fromEntries(
          graph.nodes.map((node, index) => [node.id, { x: index * 180, y: 0 }]),
        ),
      },
    });
    const edge = plan.edges.find((candidate) => candidate.id === "long-edge");
    expect(edge?.route.strategy).toBe("obstacle-avoiding");
    expect(edge?.route.fallbackReason).toBeUndefined();
    expect(plan.quality.edgeNodeIntersections).toBe(0);
    expect(plan.diagnostics.some((diagnostic) =>
      diagnostic.code === "routing_obstacle_limit" || diagnostic.code === "edge_node_intersection",
    )).toBe(false);
  });

  it("bridges unrelated route crossings with jump arcs inside the plan path", () => {
    const graph: SemanticGraphV1 = {
      version: 1,
      nodes: [{ id: "left" }, { id: "right" }, { id: "top" }, { id: "bottom" }],
      relations: [
        { id: "horizontal", source: "left", target: "right", direction: "directed" },
        { id: "vertical", source: "top", target: "bottom", direction: "directed" },
      ],
    };
    const plan = compileGraphView({
      graph,
      nodeSizes: Object.fromEntries(graph.nodes.map((node) => [node.id, { width: 80, height: 40 }])),
      profile: {
        type: "fixed",
        positions: {
          left: { x: -200, y: 0 },
          right: { x: 200, y: 0 },
          top: { x: 0, y: -200 },
          bottom: { x: 0, y: 200 },
        },
      },
    });
    const horizontal = plan.edges.find((edge) => edge.id === "horizontal");
    const vertical = plan.edges.find((edge) => edge.id === "vertical");
    expect(horizontal?.route.jumps).toHaveLength(1);
    expect(horizontal?.path).toMatch(/Q /);
    expect(vertical?.route.jumps).toEqual([]);
    expect(vertical?.path).not.toMatch(/Q /);
  });

  it("translates jump metadata and generated paths together during anchor alignment", () => {
    const pairs: Array<readonly [number, number]> = [
      [0, 4], [0, 5], [1, 4], [2, 7], [3, 4], [4, 5], [4, 6], [4, 7],
    ];
    const ids = Array.from({ length: 8 }, (_, index) => `n${index}`);
    const graph: SemanticGraphV1 = {
      version: 1,
      nodes: ids.map((id) => ({ id })),
      relations: pairs.map(([source, target], index) => ({
        id: `e${index}`,
        source: ids[source]!,
        target: ids[target]!,
        direction: "directed",
      })),
    };
    const input = {
      graph,
      nodeSizes: Object.fromEntries(ids.map((id) => [id, { width: 80, height: 40 }])),
      profile: { type: "layered" as const, layout: { direction: "top-to-bottom" as const } },
    };
    const base = compileGraphView(input);
    const anchorOffset = { x: 100, y: 50 };
    const previousPlan = {
      ...base,
      nodes: base.nodes.map((node) => node.id === "n0"
        ? { ...node, x: node.x + anchorOffset.x, y: node.y + anchorOffset.y }
        : node),
    };
    const aligned = compileGraphView({
      ...input,
      previousPlan,
      stability: { mode: "preserve-anchor", anchorNodeId: "n0" },
    });
    expect(aligned.alignment).toMatchObject({ deltaX: 100, deltaY: 50 });
    const baseJumpEdge = base.edges.find((edge) => (edge.route.jumps?.length ?? 0) > 0)!;
    const alignedJumpEdge = aligned.edges.find((edge) => edge.id === baseJumpEdge.id)!;
    expect(alignedJumpEdge.route.jumps).toEqual(baseJumpEdge.route.jumps?.map((jump) => ({
      ...jump,
      x: jump.x + anchorOffset.x,
      y: jump.y + anchorOffset.y,
    })));
    expect(alignedJumpEdge.path).toBe(roundedOrthogonalPath(
      alignedJumpEdge.route.points,
      alignedJumpEdge.route.jumps,
    ));
  });

  it("caps combined geometric and routing diagnostics at the declared limit", () => {
    const pairCount = 260;
    const nodes: SemanticGraphV1["nodes"] = [];
    const relations: SemanticGraphV1["relations"] = [];
    const positions: Record<string, { x: number; y: number }> = {};
    for (let index = 0; index < pairCount; index += 1) {
      const suffix = String(index).padStart(3, "0");
      const left = `left-${suffix}`;
      const right = `right-${suffix}`;
      const shell = `shell-${suffix}`;
      const y = index * 200;
      nodes.push({ id: left }, { id: right }, { id: shell });
      relations.push({ id: `edge-${suffix}`, source: left, target: right, direction: "directed" });
      positions[left] = { x: 0, y };
      positions[right] = { x: 400, y };
      positions[shell] = { x: -50, y: y - 50 };
    }
    const plan = compileGraphView({
      graph: { version: 1, nodes, relations },
      nodeSizes: Object.fromEntries(nodes.map((node) => [node.id, node.id.startsWith("shell")
        ? { width: 200, height: 150 }
        : { width: 100, height: 50 }])),
      profile: { type: "fixed", positions },
    });
    expect(plan.diagnostics).toHaveLength(256);
    expect(plan.diagnostics.some((diagnostic) => diagnostic.code === "diagnostic_limit")).toBe(true);
    const limitNotice = plan.diagnostics.find((diagnostic) => diagnostic.code === "diagnostic_limit");
    // 260 routing fallbacks plus the inspection-limit entry for this view.
    expect(limitNotice?.message).toContain("261");
    expect(limitNotice?.message).toContain("first 255");
    expect(plan.edges.every((edge) => edge.route.jumps?.length === 0)).toBe(true);
  });

  it("marks route-crossing jumps absent when the view-level work budget is declined", () => {
    const edgeCount = 709;
    const nodes: SemanticGraphV1["nodes"] = [];
    const relations: SemanticGraphV1["relations"] = [];
    const positions: Record<string, { x: number; y: number }> = {};
    for (let index = 0; index < edgeCount; index += 1) {
      const suffix = String(index).padStart(3, "0");
      const source = `source-${suffix}`;
      const target = `target-${suffix}`;
      nodes.push({ id: source }, { id: target });
      relations.push({ id: `edge-${suffix}`, source, target, direction: "directed" });
      positions[source] = { x: 0, y: index * 100 };
      positions[target] = { x: 400, y: index * 100 };
    }
    const plan = compileGraphView({
      graph: { version: 1, nodes, relations },
      nodeSizes: Object.fromEntries(nodes.map((node) => [node.id, { width: 80, height: 40 }])),
      profile: { type: "fixed", positions },
      routing: { maximumObstacles: 0 },
    });
    expect(plan.edges.every((edge) => edge.route.jumps === undefined)).toBe(true);
  });

  it("rejects deep layered graphs with a typed layout depth issue", () => {
    const nodeCount = 1_200;
    const graph: SemanticGraphV1 = {
      version: 1,
      nodes: Array.from({ length: nodeCount }, (_, index) => ({ id: `n-${String(index).padStart(4, "0")}` })),
      relations: Array.from({ length: nodeCount - 1 }, (_, index) => ({
        id: `e-${String(index).padStart(4, "0")}`,
        source: `n-${String(index).padStart(4, "0")}`,
        target: `n-${String(index + 1).padStart(4, "0")}`,
        direction: "directed" as const,
      })),
    };
    expect(() => compileGraphView({
      graph,
      nodeSizes: Object.fromEntries(
        graph.nodes.map((node) => [node.id, { width: 120, height: 52 }]),
      ),
      profile: { type: "layered", layout: { direction: "left-to-right" } },
    })).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: [expect.objectContaining({
        code: "invalid_projection",
        causeCode: "layout_depth_exceeded",
        id: "layout",
      })],
    }));
  });

  it("still compiles cyclic layered graphs within the depth bound", () => {
    const graph: SemanticGraphV1 = {
      version: 1,
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      relations: [
        { id: "ab", source: "a", target: "b", direction: "directed" },
        { id: "bc", source: "b", target: "c", direction: "directed" },
        { id: "ca", source: "c", target: "a", direction: "directed" },
      ],
    };
    const plan = compileGraphView({
      graph,
      nodeSizes: sizes,
      profile: { type: "layered", layout: { direction: "left-to-right" } },
    });
    expect(plan.nodes).toHaveLength(3);
  });

  it("reports invalid semantic graphs as typed compile issues", () => {
    expect(() => compileGraphView({
      graph: {
        version: 1,
        nodes: [{ id: "a" }, { id: "a" }],
        relations: [],
      },
      nodeSizes: { a: { width: 100, height: 50 } },
      profile: { type: "layered", layout: { direction: "left-to-right" } },
    })).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: [expect.objectContaining({
        code: "invalid_semantic_graph",
        causeCode: "duplicate_node_id",
        id: "a",
      })],
    }));
  });

  it("does not report a fallback when a simple route has no obstacles to avoid", () => {
    const graph: SemanticGraphV1 = {
      version: 1,
      nodes: [{ id: "a" }, { id: "b" }],
      relations: [{ id: "ab", source: "a", target: "b", direction: "directed" }],
    };
    const plan = compileGraphView({
      graph,
      nodeSizes: { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } },
      profile: {
        type: "fixed",
        positions: { a: { x: 0, y: 0 }, b: { x: 300, y: 0 } },
      },
    });
    expect(plan.edges[0]?.route).toMatchObject({ strategy: "simple" });
    expect(plan.edges[0]?.route.fallbackReason).toBeUndefined();
    expect(plan.diagnostics.some((diagnostic) =>
      diagnostic.code === "routing_fallback" || diagnostic.code === "routing_obstacle_limit",
    )).toBe(false);
  });

  it("bounds quadratic inspection and reports that the metrics are incomplete", () => {
    const relations = Array.from({ length: 500 }, (_, index) => ({
      id: `edge-${String(index).padStart(3, "0")}`,
      source: "a",
      target: "b",
      direction: "directed" as const,
    }));
    const plan = compileGraphView({
      graph: {
        version: 1,
        nodes: [{ id: "a" }, { id: "b" }],
        relations,
      },
      nodeSizes: sizes,
      profile: {
        type: "fixed",
        positions: { a: { x: 0, y: 0 }, b: { x: 400, y: 0 } },
      },
    });
    expect(plan.quality).toEqual(expect.objectContaining({ complete: false, edgeCrossings: null }));
    expect(plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "inspection_limit", viewIds: [] }),
    ]));
  });

  it("rejects malformed pass options during validation instead of mid-pipeline", () => {
    const base = {
      graph: chain,
      nodeSizes: sizes,
      profile: {
        type: "fixed" as const,
        positions: { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 400, y: 0 } },
      },
    };
    expect(() => compileGraphView({
      ...base,
      passes: [{
        id: "slice",
        type: "slice",
        slice: { focus: ["a"], direction: ["incoming"] as unknown as "incoming" },
      }],
    })).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: [expect.objectContaining({ code: "invalid_pass", id: "slice" })],
    }));
    expect(() => compileGraphView({
      ...base,
      passes: [{
        id: "slice",
        type: "slice",
        slice: { focus: ["a"], direction: "outgoing", maxDepth: 99_999 },
      }],
    })).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: [expect.objectContaining({ code: "invalid_pass", id: "slice" })],
    }));
    expect(() => compileGraphView({
      ...base,
      passes: [{ id: "slice", type: "slice", slice: { focus: [], direction: "outgoing" } }],
    })).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: [expect.objectContaining({ code: "invalid_pass", id: "slice" })],
    }));
  });

  it("reports missing node sizes as compile input issues", () => {
    expect(() => compileGraphView({
      graph: chain,
      nodeSizes: { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } },
      profile: { type: "layered", layout: { direction: "left-to-right" } },
    })).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: [expect.objectContaining({ code: "invalid_input", id: "c" })],
    }));
  });

  it("rejects unknown stability keys and fixed-profile anchoring during validation", () => {
    expect(() => compileGraphView({
      graph: chain,
      nodeSizes: sizes,
      profile: { type: "layered", layout: { direction: "left-to-right" } },
      stability: { mode: "none", junk: 1 },
    } as unknown as CompileGraphViewInput)).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: [expect.objectContaining({ code: "invalid_input", id: "stability" })],
    }));
    const previousPlan = compileGraphView({
      graph: chain,
      nodeSizes: sizes,
      profile: { type: "layered", layout: { direction: "left-to-right" } },
    });
    expect(() => compileGraphView({
      graph: chain,
      nodeSizes: sizes,
      profile: {
        type: "fixed",
        positions: { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 400, y: 0 } },
      },
      previousPlan,
      stability: { mode: "preserve-anchor", anchorNodeId: "a" },
    })).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: [expect.objectContaining({ code: "invalid_profile", id: "stability" })],
    }));
  });

  it("rejects previous plans whose nodes lack dimensions", () => {
    const previousPlan = compileGraphView({
      graph: chain,
      nodeSizes: sizes,
      profile: { type: "layered", layout: { direction: "left-to-right" } },
    });
    const stripped = JSON.parse(JSON.stringify(previousPlan)) as GraphViewPlanV1;
    for (const node of stripped.nodes) {
      delete (node as { width?: number }).width;
    }
    expect(() => compileGraphView({
      graph: chain,
      nodeSizes: sizes,
      profile: { type: "layered", layout: { direction: "left-to-right" } },
      previousPlan: stripped,
      stability: { mode: "preserve-anchor", anchorNodeId: "a" },
    })).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: [expect.objectContaining({ code: "invalid_previous_plan" })],
    }));
  });

  it("reports per-edge fallback when no obstacle-avoiding corridor exists", () => {
    const graph: SemanticGraphV1 = {
      version: 1,
      nodes: [{ id: "a" }, { id: "b" }, { id: "shell" }],
      relations: [{ id: "ab", source: "a", target: "b", direction: "directed" }],
    };
    const plan = compileGraphView({
      graph,
      nodeSizes: {
        a: { width: 100, height: 50 },
        b: { width: 100, height: 50 },
        shell: { width: 200, height: 150 },
      },
      profile: {
        type: "fixed",
        positions: { a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, shell: { x: -50, y: -50 } },
      },
    });
    // Every stub of a sits inside shell's clearance box, so no corridor can
    // exist from any port side.
    expect(plan.edges.find((edge) => edge.id === "ab")?.route.strategy).toBe("simple");
    expect(plan.edges.find((edge) => edge.id === "ab")?.route.fallbackReason).toBe("no-corridor");
    expect(plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "routing_fallback", viewIds: ["ab"] }),
    ]));
  });

  it("recovers wrap-edge corridors with deterministic port-side flips", () => {
    const nodeCount = 12;
    const graph: SemanticGraphV1 = {
      version: 1,
      nodes: Array.from({ length: nodeCount }, (_, index) => ({ id: `n-${index}` })),
      relations: Array.from({ length: nodeCount - 1 }, (_, index) => ({
        id: `e-${index}`,
        source: `n-${index}`,
        target: `n-${index + 1}`,
        direction: "directed" as const,
      })),
    };
    const plan = compileGraphView({
      graph,
      nodeSizes: Object.fromEntries(
        graph.nodes.map((node) => [node.id, { width: 120, height: 52 }]),
      ),
      profile: {
        type: "fixed",
        positions: Object.fromEntries(
          graph.nodes.map((node, index) => [
            node.id,
            { x: (index % 4) * 160, y: Math.floor(index / 4) * 92 },
          ]),
        ),
      },
    });
    const wrapEdge = plan.edges.find((edge) => edge.id === "e-3");
    // The center-to-center side choice parks this edge's approach stub inside
    // the neighbouring node's clearance box; the flipped sides route it.
    expect(wrapEdge?.route.strategy).toBe("obstacle-avoiding");
    expect(wrapEdge?.route.fallbackReason).toBeUndefined();
    expect(plan.quality.edgeNodeIntersections).toBe(0);
    expect(plan.quality.complete).toBe(true);
  });

  it("does not flip declared semantic port sides when no corridor exists", () => {
    const graph: SemanticGraphV1 = {
      version: 1,
      nodes: [{ id: "a", ports: [{ id: "out", preferredSide: "right" }] }, { id: "b" }, { id: "shell" }],
      relations: [{
        id: "ab",
        source: "a",
        target: "b",
        direction: "directed",
        sourcePort: "out",
      }],
    };
    const plan = compileGraphView({
      graph,
      nodeSizes: {
        a: { width: 100, height: 50 },
        b: { width: 100, height: 50 },
        shell: { width: 200, height: 150 },
      },
      profile: {
        type: "fixed",
        positions: { a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, shell: { x: -50, y: -50 } },
      },
    });
    const edge = plan.edges.find((candidate) => candidate.id === "ab");
    expect(edge?.route.sourcePort).toBe("right");
    expect(edge?.route.fallbackReason).toBe("no-corridor");
  });

  it("retries only auto-chosen endpoint sides and preserves allocated offsets", () => {
    const graph: SemanticGraphV1 = {
      version: 1,
      nodes: [
        { id: "a1", ports: [{ id: "out", preferredSide: "right" }] },
        { id: "a2", ports: [{ id: "out", preferredSide: "right" }] },
        { id: "target" },
        { id: "blocker" },
      ],
      relations: [
        { id: "e1", source: "a1", target: "target", direction: "directed", sourcePort: "out" },
        { id: "e2", source: "a2", target: "target", direction: "directed", sourcePort: "out" },
      ],
    };
    const plan = compileGraphView({
      graph,
      nodeSizes: Object.fromEntries(graph.nodes.map((node) => [
        node.id,
        node.id === "blocker" ? { width: 40, height: 130 } : { width: 100, height: 50 },
      ])),
      profile: {
        type: "fixed",
        positions: {
          a1: { x: 0, y: 0 },
          a2: { x: 0, y: 80 },
          target: { x: 400, y: 40 },
          blocker: { x: 345, y: 0 },
        },
      },
    });
    const routed = plan.edges.filter((edge) => edge.id === "e1" || edge.id === "e2");
    expect(routed.map((edge) => edge.route.sourcePort)).toEqual(["right", "right"]);
    expect(routed.map((edge) => edge.route.targetPort)).toEqual(["right", "right"]);
    expect(new Set(routed.map((edge) => edge.route.target.y)).size).toBe(2);
    expect(routed.every((edge) => edge.route.fallbackReason === undefined)).toBe(true);
  });

  it("rejects malformed passes, unbounded routing, and missing fixed positions with typed issues", () => {
    expect(() => compileGraphView({
      graph: chain,
      passes: Array.from({ length: MAX_GRAPH_VIEW_PASSES + 1 }, (_, index) => ({
        id: `pass-${index}`,
        type: "filter" as const,
        filter: {},
      })),
      nodeSizes: sizes,
      profile: { type: "layered", layout: { direction: "left-to-right" } },
      routing: { maximumObstacles: 97 },
    })).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "too_many_passes" }),
        expect.objectContaining({ code: "invalid_routing_option" }),
      ]),
    }));

    expect(() => compileGraphView({
      graph: chain,
      nodeSizes: sizes,
      profile: { type: "fixed", positions: { a: { x: 0, y: 0 } } },
    })).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "invalid_projection", causeCode: "missing_position", id: "b" }),
        expect.objectContaining({ code: "invalid_projection", causeCode: "missing_position", id: "c" }),
      ]),
    }));

    expect(() => compileGraphView({
      graph: chain,
      nodeSizes: sizes,
      profile: { type: "layered", layout: { direction: "left-to-right" } },
      routing: { obstacles: [] },
    } as unknown as CompileGraphViewInput)).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: [expect.objectContaining({ code: "invalid_routing_option", id: "obstacles" })],
    }));

    expect(() => compileGraphView({
      graph: chain,
      nodeSizes: { ...sizes, a: { width: Number.NaN, height: 50 } },
      profile: { type: "layered", layout: { direction: "left-to-right" } },
    })).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: [expect.objectContaining({ code: "invalid_input", id: "nodeSizes" })],
    }));

    expect(() => compileGraphView({
      graph: chain,
      nodeSizes: sizes,
      edgeWeights: { ab: 0 },
      profile: { type: "layered", layout: { direction: "left-to-right" } },
    })).toThrow(expect.objectContaining({
      name: "GraphViewCompileError",
      issues: [expect.objectContaining({ code: "invalid_input", id: "edgeWeights" })],
    }));
  });
});
