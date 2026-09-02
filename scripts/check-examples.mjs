import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { normalizeSemanticGraph, validateSemanticGraph } from "../dist/index.js";

const files = (await readdir("examples"))
  .filter((filename) => filename.endsWith(".semantic-graph.json"))
  .sort();
assert.deepEqual(files, [
  "calligram.semantic-graph.json",
  "dependency-engine.semantic-graph.json",
  "laniakea.semantic-graph.json",
]);

for (const filename of files) {
  const graph = JSON.parse(await readFile(`examples/${filename}`, "utf8"));
  assert.deepEqual(validateSemanticGraph(graph), [], `${filename} is invalid`);
  const first = normalizeSemanticGraph(graph);
  const second = normalizeSemanticGraph(JSON.parse(JSON.stringify(first)));
  assert.deepEqual(second, first, `${filename} does not normalize idempotently`);
}

process.stdout.write(`Validated ${files.length} cross-product semantic graph examples.\n`);
