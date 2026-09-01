# Review contract

Before release or consumer migration, independently verify current source and:

1. direction-to-endpoint mapping, including a true bidirectional case;
2. ports landing on rectangle-side boundaries;
3. obstacle avoidance, route determinism, crossings, and degenerate inputs;
4. dependency-role mapping from prerequisite to dependent;
5. package exports, declarations, legal inventory, and an isolated packed
   install that cannot resolve a sibling checkout;
6. Calligram and Laniakea adapters against their own runtime regressions.

Development checks do not establish visual acceptance. Consumer screenshots
and user flows are reviewed separately.
