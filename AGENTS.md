# Graph Projection repository contract

This repository owns a deterministic, renderer-neutral graph projection
library. It owns a renderer-neutral semantic interchange graph, bounded pure
graph operations, and reusable geometry for products that already own a typed
domain graph. It does not infer business relations, call a model, own a document
format, or replace Deterministic Dependency Engine.

## Product invariants

- Semantic direction is explicit: `directed`, `undirected`, or
  `bidirectional`. Endpoint decoration is derived from that value and is never
  guessed from visual placement.
- Dependency adapters preserve the named `prerequisite` and `dependent` roles;
  generic `source` and `target` fields are only introduced after that mapping.
- Nodes connect at declared rectangle-side ports. Routes start and end exactly
  at those boundary points.
- Layout and routing are deterministic for the same ordered input and options.
- Semantic normalization, filtering, slicing, path enumeration, grouping, and
  collapse are deterministic; collapse returns explicit source membership.
- Product colors, typography, selection, camera, persistence, and interaction
  state remain with consumers.
- A projection graph is a derived in-memory boundary. Consumers keep their own
  document or domain graph as the source of truth unless their product contract
  explicitly adopts this schema.

## Delivery boundaries

- The npm package must work from a packed install without a sibling checkout.
- `dist`, declarations, legal files, and public documentation are the only
  release payload. Tests, campaign notes, and workstation paths stay out.
- Do not add MCP, a Codex plugin, or an Agent Skill unless a current independent
  user operation exists. Structured application input calls the library
  directly with zero Agent calls.
- Do not publish, push, or install globally without explicit owner authority.
- Development checks, packed-install checks, consumer runtime checks, and owner
  visual acceptance are separate conclusions.
