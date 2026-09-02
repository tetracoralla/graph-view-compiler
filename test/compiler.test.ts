import { describe, expect, it } from "vitest";
import {
  GRAPH_VIEW_PLAN_VERSION,
  MAX_GRAPH_VIEW_PASSES,
  compileGraphView,
  type CompileGraphViewInput,
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
      name: "GraphProjectionError",
      issues: expect.arrayContaining([expect.objectContaining({ code: "missing_position", id: "b" })]),
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
  });
});
