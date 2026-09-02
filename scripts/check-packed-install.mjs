import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const workspace = await mkdtemp(path.join(os.tmpdir(), "graph-view-compiler-install-"));
const packageDirectory = path.join(workspace, "package");
const consumerDirectory = path.join(workspace, "consumer");
await Promise.all([
  mkdir(packageDirectory, { recursive: true }),
  mkdir(consumerDirectory, { recursive: true }),
]);

try {
  const packed = spawnSync("npm", ["pack", "--json", "--pack-destination", packageDirectory], {
    encoding: "utf8",
    env: { ...process.env, npm_config_update_notifier: "false" },
  });
  assert.equal(packed.status, 0, packed.stderr || "npm pack failed");
  const report = JSON.parse(packed.stdout);
  const tarball = path.join(packageDirectory, report[0].filename);
  await writeFile(path.join(consumerDirectory, "package.json"), JSON.stringify({
    name: "graph-view-compiler-packed-consumer",
    private: true,
    type: "module",
  }, null, 2));
  const installed = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", tarball], {
    cwd: consumerDirectory,
    encoding: "utf8",
    env: { ...process.env, npm_config_update_notifier: "false" },
  });
  assert.equal(installed.status, 0, installed.stderr || "packed install failed");
  await writeFile(path.join(consumerDirectory, "probe.mjs"), `
    import {
      GRAPH_PROJECTION_VERSION,
      endpointStylesForDirection,
      projectLayeredGraph,
    } from "@openadam/graph-view-compiler";
    import {
      SEMANTIC_GRAPH_VERSION,
      findSemanticPaths,
      semanticGraphToProjectionGraph,
    } from "@openadam/graph-view-compiler/semantic";
    const projected = projectLayeredGraph({
      version: GRAPH_PROJECTION_VERSION,
      nodes: [
        { id: "a", width: 100, height: 50 },
        { id: "b", width: 100, height: 50 }
      ],
      edges: [
        { id: "ab", source: "a", target: "b", direction: "directed" }
      ]
    }, { direction: "left-to-right" });
    if (projected.edges.length !== 1) process.exit(2);
    if (endpointStylesForDirection("undirected").target !== "none") process.exit(3);
    const semantic = {
      version: SEMANTIC_GRAPH_VERSION,
      nodes: [{ id: "a" }, { id: "b" }],
      relations: [{ id: "ab", source: "a", target: "b", direction: "directed" }]
    };
    const paths = findSemanticPaths(semantic, { from: "a", to: "b" });
    if (paths[0]?.relations[0] !== "ab") process.exit(4);
    const portable = semanticGraphToProjectionGraph(semantic, {
      nodeSizes: { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } }
    });
    if (portable.version !== GRAPH_PROJECTION_VERSION) process.exit(5);
  `);
  const probed = spawnSync(process.execPath, ["probe.mjs"], {
    cwd: consumerDirectory,
    encoding: "utf8",
  });
  assert.equal(probed.status, 0, probed.stderr || "packed import probe failed");
  await Promise.all([
    copyFile(
      "fixtures/independent-consumer/consumer.ts",
      path.join(consumerDirectory, "consumer.ts"),
    ),
    copyFile(
      "fixtures/independent-consumer/tsconfig.json",
      path.join(consumerDirectory, "tsconfig.json"),
    ),
  ]);
  const typescript = path.resolve("node_modules/typescript/bin/tsc");
  const compiled = spawnSync(process.execPath, [typescript, "-p", "tsconfig.json"], {
    cwd: consumerDirectory,
    encoding: "utf8",
  });
  assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout || "typed consumer compile failed");
  const consumer = spawnSync(process.execPath, ["dist/consumer.js"], {
    cwd: consumerDirectory,
    encoding: "utf8",
  });
  assert.equal(consumer.status, 0, consumer.stderr || "typed consumer runtime failed");
  const consumerResult = JSON.parse(consumer.stdout);
  assert.equal(consumerResult.version, 1);
  assert.equal(consumerResult.backend, "dagre-layered-v1");
  assert.deepEqual(consumerResult.nodeIds, ["client", "contract", "release"]);
  const installedManifest = JSON.parse(await readFile(
    path.join(consumerDirectory, "node_modules/@openadam/graph-view-compiler/package.json"),
    "utf8",
  ));
  assert.equal(installedManifest.version, "0.3.0");
  process.stdout.write("Packed install and independent typed consumer checks passed.\n");
} finally {
  await rm(workspace, { recursive: true, force: true });
}
