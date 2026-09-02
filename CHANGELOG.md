# Changelog

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
