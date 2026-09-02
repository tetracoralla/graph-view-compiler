# Performance and cost boundary

Graph Projection has deterministic input and work limits. Timing observations
are environment-specific measurements, not universal performance claims.

## Hard limits

- semantic graph: 5,000 nodes, 20,000 relations, and 2,000 groups;
- visible 2D plan after passes: 2,000 nodes and 8,000 relations;
- ordered passes: 64;
- path enumeration: 256 returned paths and 10,000 explored states;
- obstacle-aware routing: caller-selected limit from 0 to 96 unrelated nodes
  per edge, with explicit simple-route fallback;
- detailed geometric inspection: 100,000 estimated pair checks;
- returned geometric diagnostics: 256 distinct entries plus an explicit limit
  notice.

These limits bound accepted work. They do not say that every graph at the
maximum is suitable for synchronous foreground interaction. Products may and
should apply tighter interaction budgets.

## Rerunnable measurement

Run:

```sh
npm run measure:compiler
```

The command builds current source and reports one JSON observation containing:

- Node.js, platform, and architecture;
- packed and unpacked package bytes and file count;
- whole-process cold imports for `/semantic`, `/compiler`, and the full entry;
- median and p95 compile time, serialized plan bytes, and output SHA-256 for the
  same 100-node chain under layered and caller-positioned profiles, a 250-node
  layered fan, and a 500-node caller-positioned chain.

Each case runs five times and fails if its serialized output hash changes
between repetitions. The timing values are deliberately not a mechanical gate:
compare the same fixture, machine, Node.js version, and warm/cold condition
before making a regression claim.

Package inventory and the independent typed consumer remain enforced by
`npm run check`; those checks are separate from timing measurements.
