# User-pain conformance cases

This matrix turns recurring public integration complaints into falsifiable
compiler scenarios. Linked issue reports are demand observations, not proof that
the compiler solves every case or that another project is categorically worse.

| Recurring pain | Current 0.3 contract | Executable check | Honest boundary |
| --- | --- | --- | --- |
| Dynamic or direction-dependent handles after layout ([React Flow #1303](https://github.com/xyflow/xyflow/issues/1303), [#935](https://github.com/xyflow/xyflow/issues/935)) | Semantic ports retain explicit ids and preferred rectangle sides; the projection allocates exact boundary points. | Port validation, semantic-to-projection mapping, and tied port allocation tests. | The product renderer still owns handle components and interaction. |
| Fitting a view after asynchronous layout ([React Flow #4801](https://github.com/xyflow/xyflow/issues/4801)) | Every plan returns bounds covering nodes, routes, and measured labels. | Fixed negative-position and measured-label bounds tests. | Camera animation and viewport fitting remain product-owned. |
| Fixed node dimensions and nested ports ([ELK #311](https://github.com/kieler/elkjs/issues/311), [#240](https://github.com/kieler/elkjs/issues/240)) | Node and label sizes are caller measurements; ports are validated against their declared node before projection. | Missing size, invalid size, missing port, and rectangle-boundary tests. | 0.3 does not expose a compound-layout backend for expanded nested groups. Group collapse is supported with source membership. |
| Edge overlap and unreadable collisions ([Mermaid #1006](https://github.com/mermaid-js/mermaid/issues/1006)) | Orthogonal routing, obstacle limits, crossings, node overlap, and label collision diagnostics are explicit. | Obstacle, crossing, node-overlap, label-overlap, and inspection-budget tests. | Diagnostics identify defects; they do not promise that every dense graph can be made collision-free. |
| Same source produces unstable geometry ([Mermaid #6166](https://github.com/mermaid-js/mermaid/issues/6166)) | Inputs normalize by Unicode code-point order and both profiles produce stable ids and deterministic plans. | Shuffled-source equality, repeated layout, path ordering, and packed-consumer checks. | An external position producer used through the fixed profile must establish its own determinism. |
| Group/subgraph regressions ([Mermaid #8066](https://github.com/mermaid-js/mermaid/issues/8066)) | Grouping and collapse are explicit ordered passes with composed source-node and source-relation membership. | Group-then-collapse compiler test and semantic collapse provenance test. | Expanded compound-group placement is not claimed. |
| Layout updates destroy the reader's mental anchor | A new layered plan can align one retained node to its previous coordinates and reports every added, removed, moved, and rerouted object. | Previous-plan anchor and change-reconciliation test. | This is anchor preservation, not a claim of optimal incremental layout for every retained node. |
| A product already owns node positions | The fixed profile preserves those positions and still supplies shared ports, routes, bounds, membership, change information, and diagnostics. | Fixed-profile routing and unrelated typed-consumer checks. | The compiler does not overwrite product-owned placement or camera state. |

New claims belong here only after a current reproducer and a supported, rejected,
or explicitly bounded executable outcome exist.
