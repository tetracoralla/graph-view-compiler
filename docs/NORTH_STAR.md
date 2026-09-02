# North star: a renderer-neutral graph view compiler

Status: owner-confirmed target product definition. This document directs future
work; it is not a claim that every capability below exists in the current
package. `Graph Projection` remains a working name until the product boundary is
proven and the owner approves a public brand.

## The job

The product lets a developer keep one authoritative typed graph, write one
explicit adapter, and produce stable, inspectable graph views for documents,
interactive canvases, exports, and specialized renderers without surrendering
product semantics or adopting a shared UI runtime.

> Domain graph in; deterministic, renderer-neutral view plan and quality
> diagnostics out.

It is a compiler rather than a layout-algorithm wrapper. Layout and routing are
replaceable passes inside a versioned contract. The durable value is the narrow
waist around semantics, transformations, output membership, stability,
diagnostics, and backend-independent conformance.

## Why this product exists

Graph UI developers repeatedly reconstruct the same fragile integration layer:
dynamic ports after layout, direction-dependent handles, fitting a newly laid
out view, nested ports, fixed node dimensions, overlapping edges, unstable
same-input output, and regressions around grouped graphs. Current public issue
reports include:

- React Flow requests and defects around [dynamic handles after layout](https://github.com/xyflow/xyflow/issues/1303),
  [direction-aware handles](https://github.com/xyflow/xyflow/issues/935), and
  [fitting after layout](https://github.com/xyflow/xyflow/issues/4801);
- ELK integration defects around [nested ports](https://github.com/kieler/elkjs/issues/240)
  and [fixed node dimensions](https://github.com/kieler/elkjs/issues/311);
- Mermaid reports of [edge overlap](https://github.com/mermaid-js/mermaid/issues/1006),
  [non-deterministic output from the same source](https://github.com/mermaid-js/mermaid/issues/6166),
  and a current [subgraph regression](https://github.com/mermaid-js/mermaid/issues/8066).

These reports establish recurring demand and comparison scenarios, not proof
that this product already solves them or that every incumbent is deficient.
Each claimed advantage must survive a current fixture, benchmark, dogfood flow,
or direct user observation.

## Compile boundary

```text
authoritative product graph
        |
        v
explicit product adapter
        |
        v
versioned semantic interchange graph
        |
        v
ordered deterministic graph passes
        |
        v
named projection profile and replaceable backend
        |
        v
renderer-neutral view plan + membership + diagnostics + change information
        |
        v
product-owned renderer and interaction
```

The compiler must never silently infer business meaning, mutate the source
graph, or hide a lossy transformation. Every pass is named, ordered, bounded,
and testable. Derived objects retain enough membership to relate a visible
result back to authoritative source objects.

## Target capabilities

### Stable interchange and graph operations

- Versioned nodes, relations, groups, ports, and explicit relation direction.
- Deterministic normalization, filtering, slicing, paths, grouping, collapse,
  expansion, and source membership.
- Explicit work budgets, partial-result rules, typed failures, and compatibility
  policy.

### Ordered compilation

- One public compile entry point with explicit pass ordering.
- Named profiles for common projection jobs instead of bags of undocumented
  algorithm flags.
- Pure pass contracts so a consumer can compare, replace, or omit one pass
  without replacing the product boundary.
- Adapter and conformance helpers that catch unstable ids, undeclared fields,
  invalid ports, ambiguous direction, and nondeterministic output.

### View planning and stability

- Layered 2D projection for semantic diagrams and readable document export.
- Fixed-position planning for product-owned canvases that need ports, routing,
  labels, diagnostics, and export without surrendering node placement.
- Change reconciliation that reports retained, added, removed, and moved view
  objects and supports mental-map-preserving updates.
- Bounded label and node measurement inputs; typography remains product-owned.

### Inspectable quality

- Machine-readable observations for crossings, overlaps, occlusion, route
  detours, clipped labels, invalid geometry, and budget pressure.
- Diagnostics name affected source and view objects. They do not convert taste
  into a false mechanical quality score.
- Comparative fixtures exercise known user pain across supported backends and
  profiles. A backend is selected from current measurements, not reputation.

### Delivery

- Works from an isolated packed install in browser, Node.js, build tooling, and
  bundled desktop contexts.
- Cold import, package size, deterministic output, compatibility, and bounded
  performance are measured against declared limits.
- A small unrelated integration fixture proves the public contract is usable
  without sibling repositories; it is a conformance probe, not adoption proof.

## Explicit non-goals

This product is not:

- a graph database, knowledge base, ontology, or query language;
- a universal canvas, diagram editor, document format, or design system;
- a business-reasoning engine, dependency analyzer, model, Agent planner, MCP
  geometry tool, or autonomous visualization designer;
- a shared renderer, typography system, color system, camera, selection model,
  persistence layer, or interaction runtime;
- a shared 3D or spherical renderer before a second real 3D consumer proves a
  stable cross-product contract.

Products may use different renderers and still share the compiler. The end
state is the strongest coherent solution to this developer job, not the largest
collection of graph-related features.

## Terminal product test

The product has reached a defensible end state when:

1. an unrelated developer can adapt a typed graph once and produce stable
   layered and fixed-position view plans without reading repository internals;
2. Calligram, Laniakea, and Deterministic Dependency Engine consume the same
   packed version while retaining their own source models and experiences;
3. recurring integration failures above are represented by executable fixtures
   with explicit supported, rejected, and bounded outcomes;
4. same-input determinism, change stability, package delivery, and compatibility
   claims are independently rerunnable;
5. adding a backend or product adapter does not change the semantic contract or
   require consumers to adopt another product's renderer.

## Current gap from 0.2

The current 0.3 package implements the semantic graph, bounded core operations,
ordered compiler contract, layered and fixed-position profiles, shared routing,
source membership, change reconciliation, anchor alignment, and bounded
geometric diagnostics. Node dimensions are an explicit caller-owned measurement
boundary. Backend comparison fixtures and broader browser/build performance
baselines remain unfinished; those are implementation work, not documentation
claims.
