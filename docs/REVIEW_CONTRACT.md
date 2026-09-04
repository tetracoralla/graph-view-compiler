# Review contract

Before release or consumer migration, independently verify current source and:

1. direction-to-endpoint mapping, including a true bidirectional case;
2. semantic graph validation, code-point normalization, ports, groups, bounded
   slice/path behavior, and collapse provenance;
3. compiler pass ordering, fixed and layered profiles, composed source
   membership, prior-plan change reconciliation, anchor alignment, rejected
   undeclared options, and explicit inspection/routing budget diagnostics;
4. ports landing on rectangle-side boundaries;
5. obstacle avoidance, route determinism, crossings, and degenerate inputs;
6. fixed-view corridor constraints, including final points, endpoint stubs,
   crossing bridges, bounds, collision diagnostics, malformed input, hidden
   source relations, and unknown relation ids;
7. dependency-role mapping from prerequisite to dependent;
8. package exports, declarations, legal inventory, examples, and an isolated packed
   install that cannot resolve a sibling checkout;
9. one unrelated typed consumer compiled and run against only the packed public
   package;
10. Calligram, Laniakea, and Dependency Engine adapters against their own
   runtime regressions.

Development checks do not establish visual acceptance. Consumer screenshots
and user flows are reviewed separately.
