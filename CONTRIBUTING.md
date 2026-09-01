# Contributing

Use Node.js 22.12 or newer. Install with `npm ci --ignore-scripts` and run
`npm run check` before proposing a change.

Changes to the public contract require tests for deterministic ordering,
endpoint semantics, packed installation, and every affected consumer adapter.
Do not add product UI, persistence, business inference, or Agent transport to
this package.
