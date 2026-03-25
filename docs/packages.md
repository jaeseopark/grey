# Project Folder Structure

## Workspace Layout

```text
grey/
  apps/
    demo/           # Manual QA harness and reference integration
  packages/
    editor-core/    # Document state, transform pipeline, save pipeline, math utilities
    editor-ui/      # DOM mounting, tabbed interface, file intake, keyboard shortcuts, canvas interaction
    image-worker/   # Rotation, crop, grayscale conversion, scaling, encode — runs in Web Worker
    shared-types/   # Common interfaces: operations, export settings, worker messages
  docs/             # Project documentation
  AGENTS.md         # Entry point for AI agents
  app.md            # Legacy — see docs/index.md
```

## Package Responsibilities

| Package | Responsibility | Implementation |
|---|---|---|
| `packages/editor-core` | Document state, operation reducers, export setting normalisation, bounding box math, file type helpers | [editor-core.md](../packages/editor-core/editor-core.md) |
| `packages/editor-ui` | Public `createGreyEditor` API, `GreyEditorApp` class, all DOM/canvas UI, toolbar, tabs, sidebar, keyboard shortcuts | [editor-ui.md](../packages/editor-ui/editor-ui.md) |
| `packages/image-worker` | All pixel work: decode (JPEG/PNG/TIFF), rotate, crop, levels, grayscale, scale, encode — runs fully off-thread in a Web Worker | [image-worker.md](../packages/image-worker/image-worker.md) |
| `packages/shared-types` | Shared TypeScript interfaces for `GreyDocumentRecord`, `Operation`, `ExportSettings`, and all worker request/response message types | [shared-types.md](../packages/shared-types/shared-types.md) |
| `apps/demo` | Vite dev app that imports local workspace packages for interactive testing; never published | — |

## Publish Policy

| Package | Published |
|---|---|
| `packages/editor-ui` | Yes — public package, ships both ES module (`grey-editor.js`) and IIFE (`grey-editor.iife.js`) with all internals, worker, and CSS fully bundled |
| `packages/editor-core` | Optional — publish if intended as a standalone dependency |
| `packages/image-worker` | No — bundled into `editor-ui` |
| `packages/shared-types` | Optional — only if consumers need the raw types |
| `apps/demo` | No — private, never published |
