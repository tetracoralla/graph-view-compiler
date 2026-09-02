# Graph Projection repository contract

`Graph Projection` and `@openadam/graph-projection` are working identifiers,
not an approved public brand. The owner-confirmed north star is a
renderer-neutral graph view compiler: applications adapt one authoritative
typed graph into a versioned interchange graph, run explicit deterministic
passes, and receive inspectable view plans and quality diagnostics without
adopting a shared renderer. The current 0.2 implementation is only the first
semantic and 2D-projection slice of that target. Do not describe the target as
implemented or publish the working identifiers as the final product name.

Read `docs/NORTH_STAR.md` when planning product expansion and
`docs/PRODUCT_MODEL.md` when stating what the current release actually owns.

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

## Product development rule

- Start from recurrent user friction and first principles. Incumbent products,
  popularity, funding, and category labels are demand and comparison inputs,
  not authority and not a reason to leave a real pain unresolved.
- Overlap is acceptable when a current benchmark, dogfood flow, or direct user
  observation can falsify or support a materially better route. Do not claim
  superiority from taste, novelty, or an implementation-authored checklist.
- Do not let the first extracted module become an accidental product ceiling.
  Also do not drift into a universal graph platform: every expansion must serve
  the same developer job, remain inside the compile boundary, answer current
  demand, and preserve the explicit non-goals in `docs/NORTH_STAR.md`.
- Visual quality is a product requirement, not a shared-renderer mandate. The
  compiler owns deterministic view plans, membership, change information, and
  diagnostics. Consumers own typography, color, interaction, camera, and the
  final human experience.
