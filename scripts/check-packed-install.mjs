import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const workspace = await mkdtemp(path.join(os.tmpdir(), "graph-projection-install-"));
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
    name: "graph-projection-packed-consumer",
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
    } from "@openadam/graph-projection";
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
  `);
  const probed = spawnSync(process.execPath, ["probe.mjs"], {
    cwd: consumerDirectory,
    encoding: "utf8",
  });
  assert.equal(probed.status, 0, probed.stderr || "packed import probe failed");
  const installedManifest = JSON.parse(await readFile(
    path.join(consumerDirectory, "node_modules/@openadam/graph-projection/package.json"),
    "utf8",
  ));
  assert.equal(installedManifest.version, "0.1.0");
  process.stdout.write("Packed install checks passed.\n");
} finally {
  await rm(workspace, { recursive: true, force: true });
}
