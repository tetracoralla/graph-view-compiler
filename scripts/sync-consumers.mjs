import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const consumers = process.argv.slice(2).map((value) => path.resolve(value));
assert.ok(consumers.length > 0, "pass one or more consumer repository paths");
const workspace = await mkdtemp(path.join(os.tmpdir(), "graph-projection-sync-"));

try {
  const packed = spawnSync("npm", ["pack", "--json", "--pack-destination", workspace], {
    encoding: "utf8",
    env: { ...process.env, npm_config_update_notifier: "false" },
  });
  assert.equal(packed.status, 0, packed.stderr || "npm pack failed");
  const report = JSON.parse(packed.stdout);
  const filename = report[0].filename;
  const source = path.join(workspace, filename);
  const bytes = await readFile(source);
  const hash = createHash("sha256").update(bytes).digest("hex");

  for (const consumer of consumers) {
    const manifest = JSON.parse(await readFile(path.join(consumer, "package.json"), "utf8"));
    const expected = `file:vendor/${filename}`;
    assert.equal(
      manifest.dependencies?.["@openadam/graph-projection"],
      expected,
      `${consumer} must pin ${expected} before synchronization`,
    );
    const vendor = path.join(consumer, "vendor");
    await mkdir(vendor, { recursive: true });
    await copyFile(source, path.join(vendor, filename));
    await writeFile(
      path.join(vendor, `${filename}.sha256`),
      `${hash}  ${filename}\n`,
      "utf8",
    );
    const installed = spawnSync("npm", ["install", "--ignore-scripts"], {
      cwd: consumer,
      encoding: "utf8",
      env: { ...process.env, npm_config_update_notifier: "false" },
    });
    assert.equal(installed.status, 0, installed.stderr || `npm install failed in ${consumer}`);
  }
  process.stdout.write(`Synchronized ${filename} (${hash}) to ${consumers.length} consumer(s).\n`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}
