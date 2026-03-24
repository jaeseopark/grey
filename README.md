# Grey

Grey is an in-browser image post-processing library for scanned documents. It is intended to be embedded into any web application and provide a local-first editing surface for common scanner cleanup tasks such as rotation correction, crop adjustment, grayscale conversion, and export optimization.

The repository now includes a working pnpm workspace with an embeddable editor library, a worker-backed image pipeline, and a Vite demo app for local preview.

## Goals

Grey is designed to support:

* mounting into a host page using a supplied DOM element
* drag-and-drop or browse-based file opening
* multiple open documents with tabbed navigation
* JPEG, PNG, and TIFF-oriented workflows
* offline-only operation with no remote processing
* non-destructive document transforms
* configurable export settings and browser downloads

## Recommended Stack

The implementation plan currently targets the following toolchain:

* `pnpm` for package management and workspaces
* `Vite` for local development, demo hosting, and library builds
* `TypeScript` for shared types and browser-side logic
* HTML Canvas plus Web Workers for preview and export processing
* Vitest and Playwright for automated testing

## Workspace Layout

```text
grey/
  apps/
    demo/
  packages/
    editor-core/
    editor-ui/
    image-worker/
    shared-types/
```

## Local Development

The workspace is scaffolded and the commands below are runnable.

### Install

```sh
pnpm install
```

### Start the local demo app

```sh
pnpm dev
```

Expected result:

* Vite starts a local development server
* the demo app loads the local editor packages from the workspace
* the editor can be exercised in a browser before publishing any package

### Build all packages

```sh
pnpm build
```

Expected result:

* library bundles are generated for the editor packages
* worker bundles compile successfully
* the demo app builds against the local library output

### Preview the production build locally

```sh
pnpm preview
```

This should serve the built demo application so the production bundle can be verified locally.

### Run tests

```sh
pnpm test
```

Recommended coverage includes transform math, export settings validation, worker messaging, and browser flows such as upload, rotate, crop, and save.

### Run browser end-to-end tests

```sh
pnpm test:e2e
```

Playwright starts the demo app in preview mode and executes browser-level workflows against the mounted editor.

## Root Scripts

The workspace exposes these root-level scripts:

```json
{
  "scripts": {
    "dev": "pnpm --filter @grey/demo dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "preview": "pnpm --filter @grey/demo preview",
    "ci": "pnpm lint && pnpm test && pnpm build",
    "test:e2e": "playwright test",
    "release:check": "pnpm ci",
    "release:publish": "pnpm -r --filter ./packages/* publish --access public --no-git-checks"
  }
}
```

## Features Implemented

Current implementation includes:

* mountable editor API via `createGreyEditor`
* multi-file tabs with drag-and-drop and browse flows
* folder import through folder selection and best-effort dropped-directory traversal
* JPEG, PNG, and TIFF decode support
* live rotation preview with padded canvas bounds
* repeated non-destructive crop operations
* save dialog with format, quality, colour space, scale, and long-edge settings
* browser download export for JPEG, PNG, and TIFF
* worker-based rendering and export pipeline

## Package Entry Points

* `apps/demo`: local development host
* `packages/editor-ui`: embeddable library package
* `packages/editor-core`: shared document and export logic
* `packages/image-worker`: decode, render, and export helpers for the worker pipeline
* `packages/shared-types`: shared public and worker message types

## CI and Publishing

The repository includes workflow-ready scripts for validation and publishing. CI should run `pnpm ci` on pull requests, and publish should run from tags or protected release automation using `pnpm release:publish` with an npm token configured in CI.

## Planning Notes

The product and implementation plan remain in [app.md](app.md). The README describes the implemented scaffold and the commands needed to run it locally.