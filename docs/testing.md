# Testing

## Current Coverage

### Unit Tests (Vitest)

4 tests in `packages/editor-core/src/math.test.ts`:

* Rotation bounding box calculations
* Crop rect normalisation

Run with:

```sh
pnpm test
```

### E2e Tests (Playwright)

`apps/demo/e2e/editor.spec.ts` is scaffolded but **not integrated into the `pnpm test` run**. The Vitest runner in `apps/demo` errors on Playwright's `test.beforeEach` because the two test frameworks conflict.

Run Playwright tests separately:

```sh
pnpm exec playwright test
```

## Known Test Gaps

* Export dimension calculations from scale factor and long edge
* Keyboard shortcut handling for save (`Cmd/Ctrl+S`)
* Drag/drop intake with a batch of mixed valid and invalid files
* Multi-tab document isolation
* Worker message contracts (request/response round-trips)

## Open Issues

* **E2e integration:** Playwright tests must be excluded from the Vitest config in `apps/demo`, or the `pnpm test` script for that package must be replaced with the Playwright CLI command.
* **CI browser tests:** Playwright flows are not yet running in CI.
