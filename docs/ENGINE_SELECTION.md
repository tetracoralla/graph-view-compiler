# Engine selection

Graph Projection is not a new graph-drawing research project. It wraps mature
layout work and owns only the cross-product contract and the missing browser
geometry needed by current consumers.

## Current backend

- [Dagre](https://github.com/dagrejs/dagre) supplies synchronous JavaScript
  layered placement. Calligram already depended on it before this package was
  extracted.
- The orthogonal router is the formerly product-local, tested Laniakea router,
  generalized around rectangle ports and obstacles. Moving it here removes the
  second implementation; it does not claim a new routing algorithm.

## Alternatives considered

- [ELK.js](https://github.com/kieler/elkjs) is the strongest candidate for a
  future whole-graph backend when compound graphs or more advanced layered
  constraints become current requirements. Its asynchronous, larger engine is
  not needed for today's quiet Calligram documents, and Laniakea must reroute
  edges after users fix arbitrary node positions. ELK's current port-selection
  boundary also requires callers to preselect ports in cases where a candidate
  set would be preferable.
- [Graphviz orthogonal splines](https://graphviz.org/docs/attrs/splines/) are
  unsuitable as the common browser path because the official documentation
  notes that orthogonal routing does not currently handle ports or `dot` edge
  labels together.
- [libavoid](https://github.com/TypeFox/libavoid-server) specializes in
  connector routing around fixed shapes and remains a useful native/Wasm
  candidate. The maintained integration currently introduces a separate
  native/server boundary rather than one portable TypeScript dependency for
  web, Tauri, CLI, and Codex Plugin builds.

## Replacement rule

Backends are internal. A replacement must preserve direction-to-endpoint
semantics, deterministic ordered output, boundary ports, packed installation,
and both consumer fixture suites. Performance or visual gains must be measured
on the same graphs; a new backend is not accepted solely because it has more
options.

No part of this selection is Agent-specific. Already structured graph input
must call deterministic code directly. An Agent may help a person propose the
semantic graph, but it is not a layout engine and is not required at runtime.
