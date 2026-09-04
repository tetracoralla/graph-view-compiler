import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const manifest = JSON.parse(await readFile("package.json", "utf8"));
const license = await readFile("LICENSE", "utf8");
const notice = await readFile("NOTICE", "utf8");

assert.equal(manifest.name, "@openadam/graph-view-compiler");
assert.equal(manifest.version, "0.5.0");
assert.equal(manifest.private, undefined, "the independently distributable package cannot be private");
assert.equal(manifest.license, "Apache-2.0");
assert.equal(manifest.publishConfig?.access, "public");
assert.equal(manifest.publishConfig?.registry, "https://registry.npmjs.org/");
assert.equal(
  manifest.publishConfig?.provenance,
  undefined,
  "local first publication cannot generate CI provenance; trusted publishing adds it automatically",
);
assert.match(notice, /Copyright 2026 openAdam/u);
assert.equal(
  createHash("sha256").update(license).digest("hex"),
  "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
  "LICENSE must remain the official Apache License 2.0 text",
);

const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  encoding: "utf8",
  env: { ...process.env, npm_config_update_notifier: "false" },
});
assert.equal(packed.status, 0, packed.stderr || "npm pack --dry-run failed");
const report = JSON.parse(packed.stdout);
assert.equal(report.length, 1);
const files = new Set(report[0].files.map((entry) => entry.path));
for (const required of [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/semantic.js",
  "dist/semantic.d.ts",
  "dist/compiler.js",
  "dist/compiler.d.ts",
  "examples/calligram.semantic-graph.json",
  "examples/dependency-engine.semantic-graph.json",
  "examples/laniakea.semantic-graph.json",
  "docs/COMPATIBILITY.md",
  "docs/ENGINE_SELECTION.md",
  "docs/PRODUCT_MODEL.md",
  "docs/NORTH_STAR.md",
  "docs/COMPILER.md",
  "docs/PAIN_CASES.md",
  "docs/PERFORMANCE.md",
  "docs/RELEASING.md",
  "docs/SEMANTIC_GRAPH.md",
  "CHANGELOG.md",
  "README.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "NOTICE",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
]) {
  assert.equal(files.has(required), true, `${required} is missing from the npm package`);
}
assert.equal(
  [...files].some((path) =>
    path.startsWith("test/") || path.startsWith("fixtures/") || path.includes("CAMPAIGN_ANCHOR"),
  ),
  false,
  "tests and campaign state must not ship in the package",
);

process.stdout.write("Release inventory checks passed.\n");
