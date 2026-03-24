# Local Development

## Prerequisites

* Node.js (LTS)
* `pnpm` installed globally

## Setup

```sh
pnpm install
```

This automatically installs the Git hooks defined in `.husky/` via the `prepare` lifecycle script.

## Pre-push Hook

A Git pre-push hook is configured via [husky](https://typicode.github.io/husky/). Before every `git push`, it runs:

```sh
pnpm ci
```

This mirrors the CI pipeline (lint → test → build) and blocks the push if any check fails.

## Start the Dev Server

```sh
pnpm dev
```

Opens the demo app via Vite, typically at `http://localhost:5173`. The demo imports local workspace packages directly so changes to any package are reflected immediately without a publish step.

## Root Scripts

```json
{
  "scripts": {
    "dev":     "pnpm --filter @grey/demo dev",
    "build":   "pnpm -r build",
    "test":    "pnpm -r test",
    "lint":    "pnpm -r lint",
    "preview": "pnpm --filter @grey/demo preview"
  }
}
```

## Package-Level Scripts

| Package | Scripts |
|---|---|
| `apps/demo` | `dev`, `build`, `preview` |
| `packages/editor-ui` | `build`, `test`, `lint` |
| `packages/editor-core` | `build`, `test`, `lint` |
| `packages/image-worker` | `build`, `test` |
| `packages/shared-types` | `lint` |

## Workflow

1. `pnpm install` — install all workspace dependencies
2. `pnpm dev` — start the interactive demo
3. Make changes to any package; Vite hot-reloads automatically
4. `pnpm lint` — type-check all packages
5. `pnpm test` — run Vitest unit tests across all packages
6. `pnpm build` — verify all library bundles compile cleanly
7. `pnpm preview` — validate the production-built demo

## Running E2e Tests

Playwright tests live in `apps/demo/e2e/` and must be run separately from Vitest:

```sh
pnpm exec playwright test
```

> **Note:** Do not run Playwright specs via `pnpm test` — the Vitest runner will error on Playwright's `test.beforeEach`. See [testing.md](testing.md) for details.
