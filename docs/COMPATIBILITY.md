# Compatibility and change policy

The npm package version and semantic graph format version solve different
problems.

- `SemanticGraphV1.version` changes only when the portable JSON meaning is no
  longer backward compatible.
- Adding an optional field or a new pure operation keeps the current graph
  format version.
- Removing or changing an exported TypeScript symbol, changing deterministic
  ordering, or changing endpoint meaning is an npm breaking change.
- While the package is below 1.0, breaking API changes require a new minor
  version. After 1.0 they require a new major version.
- Consumer applications pin an exact npm version until cross-product
  compatibility has been rechecked. Dependency update automation may propose a
  new version but must not bypass the consumer runtime checks.

The 0.2 line preserves all 0.1 projection exports. It adds the semantic graph
contract and deterministic graph operations without changing the existing
`ProjectionGraphV1` geometry boundary. The `/semantic` subpath is the supported
low-cost entry for consumers that must not load the 2D backend.

The 0.3 line preserves the 0.1 and 0.2 exports. It adds the `/compiler` subpath,
fixed-position projection, ordered graph passes, versioned view plans, source
membership, bounded diagnostics, and change reconciliation. Compiler view-plan
versioning is independent from both npm versioning and `SemanticGraphV1`.

The 0.4 line keeps the graph and view-plan format versions at 1 while hardening
layout depth, obstacle routing, crossing bridges, diagnostic bounds, and
ordered-pass performance. `compileGraphView` now consistently throws
`GraphViewCompileError`; callers that caught `SemanticGraphError` or
`GraphProjectionError` from that high-level entry must migrate their catch
logic. Low-level entry points retain their prior error classes.

Every release must pass:

1. library typecheck, unit tests, build, legal and payload inventory;
2. isolated installation of the generated npm tarball;
3. all cross-product example fixtures;
4. Calligram and Laniakea adapter/runtime regressions;
5. Dependency Engine core and Sphere regressions when it consumes the package.

Registry publication does not establish product visual acceptance. Products
own their renderer and interaction acceptance separately.
