# Product model

Graph Projection is a deterministic library boundary between a product's
semantic graph and its renderer.

## Owned inputs

- ordered nodes with stable ids and rectangle dimensions;
- ordered relations with explicit direction;
- optional preferred ports, labels, weights, and already positioned nodes;
- bounded layout and routing options;
- at most 2,000 nodes and 8,000 edges in one portable projection call.

## Owned outputs

- deterministic node rectangles;
- boundary ports and orthogonal route points;
- endpoint styles derived from relation direction;
- label anchor candidates and geometric quality observations.

Outputs contain no color, font, camera, selection, document revision, Agent
trace, or business approval.

## Authority chain

- Calligram Markdown `visual-document` blocks remain authoritative for
  Calligram diagrams.
- Laniakea Flow spaces remain authoritative for Laniakea flowcharts.
- Deterministic Dependency Engine `agent-deps/v1` graphs remain authoritative
  for dependency reasoning. Its adapter maps each prerequisite to a directed
  projected edge only after dependency validation or analysis.
- `ProjectionGraphV1` is portable as a typed interchange value, but consumers do
  not persist a duplicate copy by default.

## Distribution

The source repository and npm tarball are independent release units. Before
registry publication, consumer repositories vendor one exact tarball and its
SHA-256 sidecar so standalone checkouts do not depend on a sibling directory.
Published consumers pin a registry version. Browser, desktop, and plugin builds
bundle the runtime code, so external product users do not need Node.js or a
separate Graph Projection installation.
