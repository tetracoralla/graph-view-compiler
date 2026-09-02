# Graph view compiler contract

Version 0.3 adds one high-level `compileGraphView` entry point. It converts a
versioned semantic graph into a renderer-neutral 2D view plan without taking
ownership of the product's source graph, renderer, style, camera, interaction,
or persistence.

Import the compiler-specific surface when low-level geometry functions are not
needed:

```ts
import {
  compileGraphView,
  type SemanticGraphV1,
} from "@openadam/graph-view-compiler/compiler";
```

## Ordered compile

One compile call has these stages:

1. validate and normalize the semantic graph;
2. run zero or more named passes in caller order;
3. map the resulting semantic objects to measured node dimensions;
4. apply one explicit projection profile;
5. allocate boundary ports and route relations;
6. optionally align a layered result to one retained node in a previous plan;
7. report bounds, membership, changes, geometric quality, and diagnostics.

The supported passes are `filter`, `slice`, `group`, and `collapse`. Each pass
requires a unique stable id and records its input and output node and relation
counts. A compile accepts at most 64 passes. The compiler does not reorder,
merge, infer, or retry passes.

## Projection profiles

`layered` uses the current deterministic Dagre-backed placement and accepts the
documented direction, gap, and margin options. `fixed` uses caller-owned node
positions while still applying shared port allocation, orthogonal routing,
endpoint semantics, bounds, change reconciliation, and diagnostics.

Fixed positions are authoritative. Anchor alignment is therefore available
only to layered views. With `preserve-anchor`, the compiler translates the new
layered result so one node retained from the previous plan stays at the same
coordinates. It reports the selected anchor and translation; it does not claim
that every relative position was preserved.

An external layout engine integrates by producing a stable position record and
using the fixed profile. This keeps backend code and licensing outside the
compiler while preserving one output, routing, membership, change, and
diagnostic contract. The fixed-profile validator rejects missing or non-finite
positions. Determinism of the external position producer remains its adapter's
conformance responsibility.

## Measurements and routing

The caller supplies a finite positive width and height for every node that
exists after all passes and for every visible relation label. A collapsed group
proxy is a derived node and therefore needs its own measured size. Label boxes
are retained in the view plan and included in bounds and collision diagnostics.
The compiler never measures fonts, wraps text, or selects product typography.
Callers may also supply finite positive edge weights as layout hints. Weights
influence layered placement only; they do not change relation meaning and are
never added to the semantic graph.

Routing accepts only `stub`, `clearance`, `turnCost`, and
`maximumObstacles`. Obstacle-aware routing is capped at 96 unrelated nodes per
edge. When the selected lower budget is exceeded, the compiler uses its
deterministic simple orthogonal fallback and returns a
`routing_obstacle_limit` diagnostic instead of silently implying full obstacle
inspection. A simple route used because an edge has no unrelated obstacles is
normal and produces no fallback warning; `routing_fallback` is reserved for an
edge that had obstacles but no obstacle-avoiding corridor.

## View plan

`GraphViewPlanV1` contains:

- the normalized derived semantic graph;
- ordered pass traces;
- a named backend/profile summary;
- positioned nodes and routed edges with stable ids;
- source-node and source-relation membership for every visible object;
- exact view bounds;
- a change set against the optional previous plan;
- aggregate geometric quality and object-linked diagnostics for crossings,
  edge-node intersections, node overlap, label-node overlap, label-edge
  intersection, and label overlap;
- the explicit alignment translation.

The plan contains no color, font, component, viewport, selection, product
revision, Agent trace, or business conclusion. It is a derived value, not a new
source of truth.

## Bounded diagnostics

Detailed geometric inspection is quadratic in the worst case. The compiler
performs it only when the declared node-edge and edge-pair work estimate is at
most 100,000 checks. Larger views receive `complete: false`, null aggregate
metrics, and an `inspection_limit` diagnostic. At most 256 distinct geometric
diagnostics are returned, followed by an explicit `diagnostic_limit` notice if
more were found.

These limits prevent a useful projection from being discarded only because a
quadratic quality audit is too expensive. A partial inspection is never
reported as complete.

## Failure model

Malformed passes, profiles, routing options, prior plans, and stability requests
throw `GraphViewCompileError` with stable issue codes. Semantic graph failures
remain `SemanticGraphError`; projection dimensions, endpoints, and fixed
positions remain `GraphProjectionError`. The compiler rejects unknown routing,
layout, and pass fields instead of letting product metadata override internal
geometry inputs.

The semantic graph limits remain 5,000 nodes, 20,000 relations, and 2,000
groups. A 2D plan remains limited to 2,000 visible nodes and 8,000 visible
relations after the ordered passes.
