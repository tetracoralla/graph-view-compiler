# Product model

Status: current implemented 0.4 boundary. The owner-confirmed target is defined
in the [North star](NORTH_STAR.md); target capabilities are not current-release
claims.

Graph View Compiler is a deterministic library boundary between a product's
authoritative graph and its renderer. It owns a portable semantic interchange
graph plus renderer-neutral 2D projection; products retain their domain graph
as source of truth.

## Owned inputs

- a versioned neutral graph with stable nodes, relations, groups, ports, and
  explicit relation direction;
- bounded structural filter, slice, path, group, and collapse options;
- at most 64 explicitly ordered, uniquely named compile passes;
- ordered nodes with stable ids and product-measured rectangle dimensions;
- ordered relations with explicit direction and product-measured label boxes
  when labels are visible;
- optional preferred ports, labels, weights, and already positioned nodes;
- layered or fixed-position projection profile, bounded layout and routing
  options, and an optional prior view plan for explicit anchor stability;
- at most 2,000 nodes and 8,000 edges in one portable projection call.

## Owned outputs

- deterministic derived semantic subgraphs and explicit collapse membership;
- deterministic node rectangles;
- boundary ports and orthogonal route points;
- endpoint styles derived from relation direction;
- label anchor candidates and bounded geometric quality observations;
- ordered pass traces, source membership, exact view bounds, change
  reconciliation, diagnostics, and explicit alignment information in a
  versioned renderer-neutral view plan.

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
separate Graph View Compiler installation.
