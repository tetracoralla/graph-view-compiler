# Review contract

Before release or consumer migration, independently verify current source and:

1. direction-to-endpoint mapping, including a true bidirectional case;
2. semantic graph validation, code-point normalization, ports, groups, bounded
   slice/path behavior, and collapse provenance;
3. ports landing on rectangle-side boundaries;
4. obstacle avoidance, route determinism, crossings, and degenerate inputs;
5. dependency-role mapping from prerequisite to dependent;
6. package exports, declarations, legal inventory, examples, and an isolated packed
   install that cannot resolve a sibling checkout;
7. Calligram, Laniakea, and Dependency Engine adapters against their own
   runtime regressions.

Development checks do not establish visual acceptance. Consumer screenshots
and user flows are reviewed separately.
