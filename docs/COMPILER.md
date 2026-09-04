# Graph view compiler contract

Version 0.3 introduced the high-level `compileGraphView` entry point. Version
0.4 hardened its deterministic routing, bounded diagnostics, and unified error
surface. Version 0.5 adds a narrow fixed-view input for product-authored
orthogonal corridors while keeping the compiler authoritative for final
geometry. It converts a
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
5. allocate boundary ports, route relations, and apply any fixed-view corridor
   constraints;
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
`maximumObstacles`. Each edge may avoid at most 96 unrelated obstacles
(40 by default). When a view has more unrelated obstacles than the budget, the
router spends it on the obstacles nearest the edge corridor and still attempts
obstacle-aware routing; a simple orthogonal route is used only when the route
already clears every in-budget obstacle, when the budget is zero, or when no
corridor exists. When an auto-chosen port side leaves no corridor (for
example, a wrap edge whose approach stub lands in a neighbour's clearance
box), the router escalates through deterministic side flips for each
auto-chosen endpoint independently while retaining its allocated side offset;
declared sides are never overridden. A `routing_fallback` diagnostic is
reserved for an edge that had in-budget obstacles but no obstacle-avoiding
corridor from any eligible side; a zero budget is reported as
`routing_obstacle_limit`. Any geometric
intersection that remains is reported by the quality metrics and
`edge_node_intersection` diagnostics when detailed inspection fits its own
declared work budget.

Fixed-position views may additionally provide `edgeRouteConstraints`, keyed by
stable source relation id. Version 0.5 supports one deliberately narrow shape:

```ts
edgeRouteConstraints: {
  relationId: {
    type: "orthogonal-corridor",
    axis: "x",
    coordinate: 240,
  },
}
```

The compiler keeps the allocated boundary ports, adds the configured routing
stub, resolves the corridor into a final orthogonal point sequence, and marks
the route strategy as `constrained`. Crossing bridges, labels, bounds, change
reconciliation, and all geometry diagnostics are computed from those final
points. A constrained route expresses user placement and therefore does not
claim automatic obstacle avoidance; intersections remain visible through the
normal diagnostics. Unknown source relation ids and malformed constraints are
typed failures. A valid constraint for a source relation hidden by an ordered
pass is ignored for that view, so products need not destroy saved arrangement
state while filtering. Constraints are rejected for layered profiles because
their absolute coordinate system is compiler-generated rather than
product-authoritative.

Eligible unrelated route crossings are bridged with non-overlapping jump arcs
in the generated path and exposed as `route.jumps` when the conservative
segment-pair work estimate fits the declared route-crossing budget. An empty
array means the pass completed without an eligible bridge; an absent field
means the view exceeded the budget and declined jump computation entirely.

Layered placement is additionally bounded by layout depth: the weighted
longest rank path (or the node count for cyclic graphs, an upper bound on
Dagre's recursion depth) may not exceed 1,000. Deeper graphs are rejected with
a typed `layout_depth_exceeded` issue instead of overflowing the call stack
inside the layout backend.

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
metrics, and an `inspection_limit` diagnostic. At most 256 diagnostics are
returned in total. When truncation is necessary, the final slot is an explicit
`diagnostic_limit` notice and the first 255 deterministically ordered geometric
and routing diagnostics precede it.

These limits prevent a useful projection from being discarded only because a
quadratic quality audit is too expensive. A partial inspection is never
reported as complete.

## Failure model

All failures from `compileGraphView` throw `GraphViewCompileError` with stable
issue codes. Invalid semantic graphs and rejected projections are retyped as
`invalid_semantic_graph` and `invalid_projection`; each issue keeps the
original identifier, exposes the original machine-readable `causeCode`, and
prefixes the message with that cause code.
Low-level entry points (`semanticGraphToProjectionGraph`, `projectLayeredGraph`,
`projectFixedGraph`, and the semantic operations) keep throwing
`SemanticGraphError` and `GraphProjectionError` for their own callers. The
compiler rejects unknown routing, layout, and pass fields instead of letting
product metadata override internal geometry inputs.

The semantic graph limits remain 5,000 nodes, 20,000 relations, and 2,000
groups. A 2D plan remains limited to 2,000 visible nodes and 8,000 visible
relations after the ordered passes, and layered placement to the declared
layout depth.
