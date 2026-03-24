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

| Package | Responsibility |
|---|---|
| `packages/editor-core` | Document state, operation reducers, export setting normalisation, bounding box math, file type helpers |
| `packages/editor-ui` | Public `createGreyEditor` API, `GreyEditorApp` class, all DOM/canvas UI, toolbar, tabs, sidebar, keyboard shortcuts |
| `packages/image-worker` | All pixel work: decode (JPEG/PNG/TIFF), rotate, crop, grayscale, scale, encode — runs fully off-thread in a Web Worker |
| `packages/shared-types` | Shared TypeScript interfaces for `GreyDocumentRecord`, `Operation`, `ExportSettings`, and all worker request/response message types |
| `apps/demo` | Vite dev app that imports local workspace packages for interactive testing; never published |

## Publish Policy

| Package | Published |
|---|---|
| `packages/editor-ui` | Yes — public package, includes type declarations and worker references |
| `packages/editor-core` | Optional — publish if intended as a standalone dependency |
| `packages/image-worker` | No — bundled through `editor-ui` |
| `packages/shared-types` | Optional — only if consumers need the raw types |
| `apps/demo` | No — private, never published |
