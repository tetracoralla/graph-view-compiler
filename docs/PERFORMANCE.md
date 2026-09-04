# Performance and cost boundary

Graph View Compiler has deterministic input and work limits. Timing observations
are environment-specific measurements, not universal performance claims.

## Hard limits

- semantic graph: 5,000 nodes, 20,000 relations, and 2,000 groups;
- visible 2D plan after passes: 2,000 nodes and 8,000 relations;
- layered layout depth: 1,000 ranks (weighted longest path; node count for
  cyclic graphs) — deeper graphs are rejected with a typed issue before the
  layout backend can overflow the call stack;
- ordered passes: 64;
- path enumeration: 256 returned paths and 10,000 explored states;
- obstacle-aware routing: caller-selected budget from 0 to 96 unrelated nodes
  per edge, spent on the obstacles nearest the edge corridor, with an explicit
  reason when a simple route is a fallback;
- route-crossing jump arcs: computed only when the conservative segment-pair
  comparison estimate is at most 250,000 checks; larger views omit the `jumps`
  field rather than implying that the pass found none;
- detailed geometric inspection: 100,000 estimated pair checks;
- returned diagnostics: 256 total, including an explicit final limit notice
  when entries are truncated.

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
- median and p95 compile time, serialized plan bytes, and output SHA-256 for
  the same 100-node chain under layered, caller-positioned, and fully
  constrained caller-positioned profiles, a
  250-node layered fan, a 500-node caller-positioned chain, a 45-node
  caller-positioned chain that exercises obstacle-aware routing, and a
  1,000-node layered chain at the layout depth boundary.

Each case runs five times and fails if its serialized output hash changes
between repetitions. The obstacle-aware and constrained cases also fail if
their expected strategies are absent, so the measured suite cannot silently
skip the routing path it claims to measure. The timing values are deliberately
not a mechanical gate: compare the same fixture, machine, Node.js version, and
warm/cold condition before making a regression claim.

Package inventory and the independent typed consumer remain enforced by
`npm run check`; those checks are separate from timing measurements.
