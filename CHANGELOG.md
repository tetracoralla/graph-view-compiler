# Changelog

## Unreleased

- Reject layered graphs deeper than 1,000 ranks with a typed
  `layout_depth_exceeded` issue before layout instead of overflowing the call
  stack inside Dagre on deep chains; unexpected layout failures are retyped as
  `layout_failed`. Cyclic layered graphs keep compiling within the declared
  conservative node-count bound.
- Spend the per-edge obstacle budget on the unrelated obstacles nearest the
  edge corridor instead of giving up when a view exceeds the budget. Edges
  whose simple route already clears every in-budget obstacle use it directly.
  When an auto-chosen port side leaves no corridor, the router escalates
  through deterministic per-endpoint side flips that preserve allocated port
  offsets; declared semantic port sides are never overridden. Large fixed
  views gain obstacle-aware geometry that previously degraded to the simple
  fallback above roughly 40 obstacles per edge.
- Bridge eligible unrelated route crossings with non-overlapping jump arcs in
  the generated edge path and expose them as `route.jumps` when the
  conservative segment-pair estimate fits the new 250,000-check
  route-crossing work budget. Empty arrays distinguish a completed pass with
  no eligible bridge from an absent field when the budget is declined.
- Unify the compile failure surface: `compileGraphView` now always throws
  `GraphViewCompileError`. Semantic graph failures are retyped as
  `invalid_semantic_graph` and projection failures (including missing or
  invalid fixed positions and the layout depth bound) as `invalid_projection`,
  each keeping the original identifier and exposing the original issue code as
  machine-readable `causeCode` as well as in the message.
  Low-level entry points keep their own error types. Consumers that caught
  `GraphProjectionError` or `SemanticGraphError` from `compileGraphView` must
  catch `GraphViewCompileError` instead.
- Cap returned diagnostics at 256 total across geometric and routing entries,
  including the limit notice, so per-edge fallback reasons can no longer
  bypass the declared response bound; the notice reports the true total.
- Stop re-validating, cloning, and re-sorting the whole semantic graph after
  every ordered pass; passes operate on the normalized graph and preserve it.
- Rewrite `compareGraphIds` without per-comparison allocations while keeping
  the exact Unicode code-point order.
- Measure obstacle-aware routing and a 1,000-node layered chain in
  `npm run measure:compiler`, failing if no edge reports the
  `obstacle-avoiding` strategy so the suite cannot skip the routing path.

## 0.3.0 - 2026-09-02

- Add the versioned renderer-neutral `GraphViewPlanV1` compiler contract and
  `/compiler` package subpath.
- Add explicitly ordered filter, slice, group, and collapse passes with trace
  counts and composed source membership.
- Add layered and fixed-position profiles with shared ports, orthogonal
  routing, bounds, endpoint semantics, and diagnostics.
- Keep product-owned label measurements and non-semantic edge weights explicit
  at the compiler boundary.
- Add prior-plan change reconciliation and explicit retained-anchor alignment
  for layered views.
- Bound routing options, quadratic geometric inspection, and returned
  diagnostics; partial inspection is reported rather than presented as complete.
- Reject undeclared pass, layout, and routing fields at the compiler boundary.
- Validate projection versions, identifiers, directions, ports, and finite
  relation weights before low-level layout or routing work begins.
- Distinguish ordinary direct routes from obstacle-limit and no-corridor
  fallbacks so diagnostics report actual degradation rather than simple graphs.
- Keep opaque graph identifiers such as `__proto__` and `constructor` safe in
  collapse provenance and route-crossing results.
- Publish the package as Graph View Compiler under
  `@openadam/graph-view-compiler` with Apache-2.0 release assets.

## 0.2.0 - 2026-09-02

- Add the versioned `SemanticGraphV1` contract for nodes, directed meaning,
  groups, and stable ports.
- Add bounded deterministic normalize, filter, slice, path, group, and collapse
  operations.
- Add the semantic-to-2D projection adapter while preserving all 0.1 exports.
- Add compatibility policy, cross-product fixtures, and packed-install probes.
- Bound path-search work and prevent undeclared product fields from leaking
  through normalized interchange values.

## 0.1.0 - 2026-09-01

- Extract deterministic layered placement, rectangle ports, orthogonal
  routing, endpoint semantics, and projection quality inspection from the
  initial Calligram and Laniakea consumers.
