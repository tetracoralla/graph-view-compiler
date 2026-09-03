import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { compileGraphView } from "../dist/compiler.js";

function chainGraph(count) {
  return {
    version: 1,
    nodes: Array.from({ length: count }, (_, index) => ({ id: `node-${String(index).padStart(4, "0")}` })),
    relations: Array.from({ length: Math.max(0, count - 1) }, (_, index) => ({
      id: `edge-${String(index).padStart(4, "0")}`,
      source: `node-${String(index).padStart(4, "0")}`,
      target: `node-${String(index + 1).padStart(4, "0")}`,
      direction: "directed",
    })),
  };
}

function fanGraph(count) {
  return {
    version: 1,
    nodes: Array.from({ length: count }, (_, index) => ({ id: `node-${String(index).padStart(4, "0")}` })),
    relations: Array.from({ length: Math.max(0, count - 1) }, (_, index) => ({
      id: `edge-${String(index).padStart(4, "0")}`,
      source: "node-0000",
      target: `node-${String(index + 1).padStart(4, "0")}`,
      direction: "directed",
    })),
  };
}

// A caller-positioned row whose skip edges cross intermediate nodes. The row
// has more unrelated obstacles than the default budget, so this fixture
// exercises nearest-corridor obstacle selection and the route search.
function rowJumpGraph(count, jumpLength) {
  return {
    version: 1,
    nodes: Array.from({ length: count }, (_, index) => ({ id: `node-${String(index).padStart(4, "0")}` })),
    relations: Array.from(
      { length: Math.max(1, Math.floor((count - 1) / jumpLength)) },
      (_, index) => ({
        id: `jump-${String(index).padStart(4, "0")}`,
        source: `node-${String(index * jumpLength).padStart(4, "0")}`,
        target: `node-${String(Math.min(count - 1, (index + 1) * jumpLength)).padStart(4, "0")}`,
        direction: "directed",
      }),
    ),
  };
}

function nodeSizes(graph) {
  return Object.fromEntries(graph.nodes.map((node) => [node.id, { width: 120, height: 52 }]));
}

function fixedPositions(graph) {
  return Object.fromEntries(graph.nodes.map((node, index) => [node.id, {
    x: (index % 25) * 180,
    y: Math.floor(index / 25) * 110,
  }]));
}

function percentile(values, ratio) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * ratio))] ?? 0;
}

function measureCase(name, input, runs = 5, verify) {
  const durations = [];
  const hashes = [];
  let bytes = 0;
  let lastPlan;
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    const plan = compileGraphView(input);
    durations.push(performance.now() - started);
    lastPlan = plan;
    const serialized = JSON.stringify(plan);
    bytes = Buffer.byteLength(serialized);
    hashes.push(createHash("sha256").update(serialized).digest("hex"));
  }
  assert.equal(new Set(hashes).size, 1, `${name} produced non-deterministic output`);
  if (verify !== undefined) verify(lastPlan);
  return {
    name,
    runs,
    medianMs: Number(percentile(durations, 0.5).toFixed(3)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(3)),
    serializedBytes: bytes,
    sha256: hashes[0],
  };
}

function coldImport(subpath, runs = 5) {
  const durations = [];
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    const imported = spawnSync(process.execPath, [
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(subpath)})`,
    ], { encoding: "utf8" });
    assert.equal(imported.status, 0, imported.stderr || `cold import failed: ${subpath}`);
    durations.push(performance.now() - started);
  }
  return {
    subpath,
    runs,
    medianMs: Number(percentile(durations, 0.5).toFixed(3)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(3)),
  };
}

const chain100 = chainGraph(100);
const fan250 = fanGraph(250);
const chain500 = chainGraph(500);
const chain1000 = chainGraph(1000);
const rowJump45 = rowJumpGraph(45, 6);
const cases = [
  measureCase("layered-chain-100", {
    graph: chain100,
    nodeSizes: nodeSizes(chain100),
    profile: { type: "layered", layout: { direction: "left-to-right" } },
  }),
  measureCase("caller-positioned-chain-100", {
    graph: chain100,
    nodeSizes: nodeSizes(chain100),
    profile: { type: "fixed", positions: fixedPositions(chain100) },
  }),
  measureCase("layered-fan-250", {
    graph: fan250,
    nodeSizes: nodeSizes(fan250),
    profile: { type: "layered", layout: { direction: "top-to-bottom" } },
  }),
  measureCase("caller-positioned-chain-500", {
    graph: chain500,
    nodeSizes: nodeSizes(chain500),
    profile: { type: "fixed", positions: fixedPositions(chain500) },
  }),
  measureCase("caller-positioned-row-jump-45", {
    graph: rowJump45,
    nodeSizes: nodeSizes(rowJump45),
    profile: {
      type: "fixed",
      positions: Object.fromEntries(rowJump45.nodes.map((node, index) => [
        node.id,
        { x: index * 180, y: 0 },
      ])),
    },
  }, 5, (plan) => {
    const strategies = new Set(plan.edges.map((edge) => edge.route.strategy));
    assert.ok(
      strategies.has("obstacle-avoiding"),
      `expected obstacle-aware routing to run; strategies were ${[...strategies].join(", ")}`,
    );
  }),
  measureCase("layered-chain-1000", {
    graph: chain1000,
    nodeSizes: nodeSizes(chain1000),
    profile: { type: "layered", layout: { direction: "left-to-right" } },
  }),
];

const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  encoding: "utf8",
  env: { ...process.env, npm_config_update_notifier: "false" },
});
assert.equal(packed.status, 0, packed.stderr || "package measurement failed");
const packageReport = JSON.parse(packed.stdout)[0];

process.stdout.write(`${JSON.stringify({
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  package: {
    version: packageReport.version,
    packedBytes: packageReport.size,
    unpackedBytes: packageReport.unpackedSize,
    files: packageReport.files.length,
  },
  coldImports: [
    coldImport("@openadam/graph-view-compiler/semantic"),
    coldImport("@openadam/graph-view-compiler/compiler"),
    coldImport("@openadam/graph-view-compiler"),
  ],
  cases,
}, null, 2)}\n`);
