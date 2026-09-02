# Semantic graph contract

`SemanticGraphV1` is the renderer-neutral interchange boundary shared by
products that already know what their nodes and relations mean. It does not
replace a product document or a domain engine result.

Consumers that need graph operations but not 2D projection import the
`@openadam/graph-view-compiler/semantic` subpath. This keeps Dagre and routing
modules out of Dependency Engine and other semantic-only cold starts.

## Shape

```json
{
  "version": 1,
  "nodes": [
    {
      "id": "review",
      "label": "Review",
      "kind": "step",
      "groupId": "release",
      "ports": [{ "id": "out", "preferredSide": "right" }]
    }
  ],
  "relations": [
    {
      "id": "review-publish",
      "source": "review",
      "target": "publish",
      "direction": "directed",
      "kind": "requires",
      "sourcePort": "out"
    }
  ],
  "groups": [{ "id": "release", "label": "Release" }]
}
```

Node, relation, group, and port ids are stable opaque strings. Node and group
ids share one namespace so a collapsed group can become a derived view node
without inventing an unrelated identity. Relation direction is always one of
`directed`, `undirected`, or `bidirectional`; renderers never infer direction
from placement.

Ports express stable endpoint identity and may carry a preferred rectangle
side. They do not contain coordinates. Groups express membership and optional
parentage. Collapse is a pure derived operation: the source graph is unchanged,
and the result includes node and relation membership maps.

## Deterministic operations

- `normalizeSemanticGraph` produces code-point ordered arrays.
- `filterSemanticGraph` returns an induced node/group/kind subgraph.
- `sliceSemanticGraph` performs a bounded incoming, outgoing, or bidirectional
  traversal and returns the induced result.
- `findSemanticPaths` returns bounded simple paths with relation ids.
- `groupSemanticNodes` assigns selected nodes to one new group without mutating
  the input.
- `collapseSemanticGroups` returns a derived graph plus explicit membership.
- `semanticGraphToProjectionGraph` combines the semantic graph with
  consumer-measured node sizes and preferred port sides. `projectLayeredGraph`
  then owns deterministic rectangles and routes.

Operations validate their input and reject unknown selections. They do not
repair missing nodes, guess relations, discover dependencies, or call a model.
Path enumeration stops with `work_limit_exceeded` after 10,000 explored states
instead of silently returning an incomplete answer or allowing exponential
work. Callers can reduce `maxDepth` or slice the graph before retrying.

Normalization emits only fields declared by this interchange contract. Product
color, camera, selection, persistence, and other undeclared fields are not
carried into derived graphs.

## Product adapters

- Calligram maps one `visual-document` block to a semantic graph, measures the
  reading surface, and requests a deterministic 2D projection.
- Laniakea maps a Flow Space to a semantic graph while retaining positions,
  editing, viewport, and interaction in Laniakea.
- Deterministic Dependency Engine maps `prerequisite -> dependent` to a
  directed semantic relation after domain validation. Its reasoning core and
  Sphere renderer remain private to the product.

The package never persists a second copy of any product graph by default.
