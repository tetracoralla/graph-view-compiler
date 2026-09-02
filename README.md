# Graph Projection

Deterministic geometry for applications that already own a typed graph.

The package provides three deliberately separate layers:

- a versioned renderer-neutral semantic graph with deterministic filtering,
  slicing, paths, grouping, and collapse;
- a deterministic 2D projection boundary for consumer-measured nodes;
- an ordered graph view compiler that combines named semantic passes, layered
  or fixed-position projection, source membership, change reconciliation, and
  bounded quality diagnostics.

The projection layer provides:

- layered node placement backed by Dagre;
- rectangle-side port selection and allocation;
- orthogonal routing with node-obstacle avoidance;
- rounded SVG path generation and crossing locations;
- explicit endpoint semantics for directed, undirected, and bidirectional
  relations;
- a dependency-role adapter that maps `prerequisite -> dependent` without
  exposing ambiguous dependency edges.

It does not infer graph meaning, store product documents, render a product UI,
or call an Agent. Calligram and Laniakea adapt their own authoritative formats
to this library at runtime.

See [engine selection](docs/ENGINE_SELECTION.md) for the Dagre/ELK.js/
Graphviz/libavoid boundary and why this package is not an Agent replacement for
traditional graph libraries.

The owner-confirmed product is a renderer-neutral
[graph view compiler](docs/NORTH_STAR.md). The current 0.3 API implements its
stable narrow waist for layered and caller-positioned 2D views; the document
also defines explicit non-goals and the conditions for future expansion. The
public contract is described by the [compiler contract](docs/COMPILER.md).
The [user-pain conformance matrix](docs/PAIN_CASES.md) records which recurrent
integration failures are supported, rejected, or still bounded.
See the [performance boundary](docs/PERFORMANCE.md) for hard work limits and a
rerunnable package, cold-import, determinism, and compile-time measurement.

## Develop

Use Node.js 22.12 or newer.

```sh
npm ci
npm run check
```

`npm run check:packed-install` builds a real tarball, installs it into a fresh
temporary project, and imports the public entry point without access to this
source checkout.

## Consume

After public registry publication, applications pin an exact compatible
version:

```json
{
  "dependencies": {
      "@openadam/graph-projection": "0.3.0"
  }
}
```

Before registry publication, Calligram, Laniakea, and Dependency Engine keep the exact packed
tarball in their own `vendor/` directories so a standalone source checkout can
run `npm ci`. After changing this package, refresh all three consumers with:

```sh
npm run sync:consumers -- ../visual-document ../laniakea ../graph-dependency-solver
```

The consumers verify the tarball SHA-256 and installed package version in their
normal regression commands. The release workflow can publish a version-tagged
package with npm provenance after the public repository and npm trusted
publisher are deliberately configured.

The high-level portable graph contract accepts at most 2,000 nodes and 8,000
edges per projection call. Products with tighter interaction or document
budgets should enforce their smaller product-specific limits before calling the
library.

The semantic graph accepts at most 5,000 nodes, 20,000 relations, and 2,000
groups. Path results and traversal depth are separately bounded. See the
[semantic graph contract](docs/SEMANTIC_GRAPH.md) and
[compatibility policy](docs/COMPATIBILITY.md).

Semantic-only consumers import `@openadam/graph-projection/semantic` so the
layered layout backend is not part of their runtime module graph.

## License

Copyright 2026 openAdam. Licensed under the Apache License 2.0.
