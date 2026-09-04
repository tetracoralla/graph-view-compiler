import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("package.json", "utf8"));
const readme = await readFile("README.md", "utf8");
const changelog = await readFile("CHANGELOG.md", "utf8");
const version = manifest.version;
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const releaseHeading = changelog.match(
  new RegExp(`^## ${escapedVersion} - (\\d{4}-\\d{2}-\\d{2})$`, "mu"),
);
const currentUtcDate = new Date().toISOString().slice(0, 10);

assert.ok(
  releaseHeading,
  `CHANGELOG.md must give ${version} an exact release date instead of Unreleased`,
);
assert.equal(
  releaseHeading[1],
  currentUtcDate,
  `CHANGELOG.md release date for ${version} must be today's UTC date (${currentUtcDate})`,
);
assert.match(
  readme,
  new RegExp(`npm install @openadam/graph-view-compiler@${escapedVersion}`, "u"),
  `README.md install command must use ${version}`,
);
assert.match(
  readme,
  new RegExp(`"@openadam/graph-view-compiler": "${escapedVersion}"`, "u"),
  `README.md dependency example must use ${version}`,
);

process.stdout.write(`Publication metadata for ${version} is aligned.\n`);
