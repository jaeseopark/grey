# Publishing

## Policy

The library is published through an automated CI workflow. Manual `npm publish` from a developer machine is not the intended path.

## Publish Triggers

* Push of a version tag such as `v0.1.0`, or
* A release workflow triggered after a changeset/versioning step is merged to `main`

## Root Scripts

```json
{
  "scripts": {
    "ci":              "pnpm lint && pnpm test && pnpm build",
    "release:check":   "pnpm ci",
    "release:version": "changeset version",
    "release:publish": "pnpm -r publish --access public --no-git-checks"
  }
}
```

## CI Stages

| Stage | Commands |
|---|---|
| **validate** | `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm build` |
| **browser tests** | `pnpm exec playwright test` against the demo app |
| **release** | publish only from `main` or tags, never from pull requests |

## Release Sequence

```sh
pnpm install --frozen-lockfile
pnpm ci
pnpm release:version
pnpm build
pnpm release:publish
```

If Changesets is adopted, the release workflow should commit version bumps or open an automated release pull request before the publish step.

## Safeguards

* Require passing CI before merge
* Restrict publishing credentials to the CI environment
* Publish only the intended library packages, not the demo app
* Fail release if working tree version metadata and lockfile are inconsistent
* Store npm token in repository or organization secrets

## Package Metadata (publishable packages)

Each publishable package should include:

* `name`, `version`, `type`
* `main`, `module`, `types`
* `exports`, `files`
* `publishConfig`
