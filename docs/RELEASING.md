# Releasing

Publication is separate from development completion. Do not publish until the
repository is public at `tetracoralla/graph-view-compiler`, the reviewed commit
is on `main`, and `npm run check` passes from a clean checkout.

## First npm release

npm requires the package to exist before a trusted publisher can be attached.
The first release therefore uses the maintainer's interactive npm session and
2FA. It is the one release that is not expected to carry CI provenance:

```sh
npm login --auth-type=web --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm run check
npm publish --access public --registry=https://registry.npmjs.org/
```

Before confirming publication, verify that the package name is
`@openadam/graph-view-compiler`, the version is the intended immutable version,
and the tarball inventory contains only the files reported by
`npm pack --dry-run`.

After npm confirms the first publication, tag that exact reviewed commit as
`v<package-version>` and create the matching GitHub Release. The release
workflow is deliberately manual, so this archival tag cannot accidentally
publish the package a second time.

## Trusted publishing

After the first version exists on npm, configure its GitHub trusted publisher:

- GitHub owner: `tetracoralla`
- repository: `graph-view-compiler`
- workflow: `release.yml`
- environment: `npm`
- allowed action: `npm publish`

The repository release workflow uses GitHub OIDC and a GitHub-hosted runner.
npm automatically adds provenance to a public package published from a public
repository through trusted publishing; no package-wide provenance setting is
used because it would break the interactive first release. The workflow does
not require a long-lived npm publish token. Once the trusted publisher works,
set npm publishing access to require 2FA and disallow traditional tokens.

## Later releases

1. Update the version and changelog.
2. Run `npm run check` and review `npm pack --dry-run`.
3. Commit and push the reviewed source to `main`.
4. Run the repository's `Release package` workflow with the exact package
   version. The workflow refuses a mismatched version and publishes from the
   selected reviewed commit.
5. Verify the registry version, provenance, tarball contents, and a clean
   temporary install.
6. Tag the published commit as `v<package-version>` and create the matching
   GitHub Release.
7. Only after the registry version resolves, migrate consumers from the vendored
   tarball to an exact compatible registry version and rerun their checks.

Never reuse or assume a published name-and-version pair: npm versions remain
consumed even when a release is later deprecated or removed.
