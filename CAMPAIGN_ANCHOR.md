# Graph view compiler campaign

## North star

Build the strongest coherent renderer-neutral graph view compiler: one explicit
adapter from a product's authoritative typed graph, one versioned semantic
boundary, ordered deterministic passes, and inspectable view plans and quality
diagnostics for different product-owned renderers.

The current phase is implementation and independent validation. `Graph
Projection` and `@openadam/graph-projection` remain working identifiers until
the product boundary is proven and the owner approves a public brand.

## Current campaign finish line

- Product definition, current-release model, pass ordering, pain baseline, and
  comparative scenarios are explicit and do not overclaim implementation.
- The packed public API compiles bounded semantic graphs through ordered passes
  into layered and fixed-position 2D view plans with typed failures, explicit
  membership, diagnostics, and change information.
- Calligram, Laniakea, and Deterministic Dependency Engine consume one exact
  package artifact from clean commits while retaining their own authoritative
  models, renderers, and experiences.
- One unrelated integration fixture exercises the public contract as a
  conformance and usability probe. It is not presented as market adoption.
- Packed install, browser and Node import, cold import, package size,
  deterministic performance, compatibility, and representative product flows
  are rerunnable from current source.
- Final brand, package migration, public repository creation, push, npm
  publication, signing credentials, and other public distribution remain
  owner-only external actions.

## Current state

- Graph Projection commit `0b057856af3e` contains the 0.2 semantic graph,
  bounded operations, current 2D projection, compatibility policy, examples,
  and packed-install checks. Nineteen current tests, build, examples, release
  inventory, isolated packed install, and production dependency audit passed
  before this campaign definition.
- Calligram commit `06489fa3c590` contains its desktop and portable delivery plus
  the 0.2 adapter. Ninety current tests, Web/Server/Desktop/MCP/Plugin builds,
  isolated packed install, and production dependency audit passed.
- Laniakea and Deterministic Dependency Engine contain uncommitted prior 0.2
  consumer integrations. They must be independently reviewed and committed
  before further cross-repository changes.
- All three consumers still vendor the same earlier 0.2 tarball with SHA-256
  `13cfa6b7df2bdef0995525478c12a67bf1edfd3aca0244d55131de3aef7cdaf9`.
  It predates the committed Unicode ordering, path-work bound, and undeclared
  field isolation fixes and must be refreshed from commit `0b057856af3e`.
- No final public identity or publication is approved.

## Validation ladder

1. Current source: type checks, tests, builds, examples, deterministic negative
   cases, and limits.
2. Package: release inventory, isolated pack/install/import, subpath imports,
   dependency audit, cold import, and package-size measurements.
3. Consumers: exact artifact checksum plus composed product adapter, runtime,
   build, and persistence or export flows where applicable.
4. Experience: representative Calligram and Laniakea human flows, dense and
   degraded states, interaction stability, and owner visual/task acceptance.
5. Public release: final identity, provenance, registry authentication, public
   repository, publication, clean registry install, and post-publication
   consumer checks. This lane starts only with owner authorization.

Green development checks are narrow vetoes. They do not establish runtime,
experience, market, or public-release acceptance.

## Autonomy and stop conditions

Continue through local implementation, documentation, tests, deterministic
fixtures, packed artifacts, consumer integration, local commits, and corrective
repair without asking the owner for routine substeps. Keep this anchor current
after every committed slice.

Stop only for a real external or owner-only decision: final public brand,
credentials or permissions unavailable to the agent, spending, legal/privacy
exposure, signing identity, public repository mutation, push, npm publication,
or a product-value choice that changes the north star.

## Next action

Review the existing Laniakea and Deterministic Dependency Engine 0.2 consumer
changes, refresh all consumers to the exact artifact from `0b057856af3e`, rerun
current checks, and create clean local baseline commits. Then implement the
ordered compiler contract from that stable cross-product boundary.
