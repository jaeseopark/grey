# editor-ui

`@grey/editor-ui` is the main publishable package for Grey. It mounts a self-contained image editor into a host DOM element, manages all UI state, communicates with the image worker via `GreyWorkerClient`, and exposes a small public API to host applications.

## Usage

### ES Module (npm / bundler)

```ts
import { createGreyEditor } from '@grey/editor-ui';
import '@grey/editor-ui/styles.css'; // optional: import the default editor styles

const editor = createGreyEditor({
  target: '#grey-editor',
  allowFolders: true,
  maxParallelDecodes: 2,
});
```

### IIFE (single `<script>` tag)

The package ships a self-contained IIFE build at `dist/grey-editor.iife.js`. The worker is bundled inside the file. A separate `dist/styles.css` is emitted alongside it.

```html
<link rel="stylesheet" href="styles.css" />
<script src="grey-editor.iife.js"></script>
<script>
  const editor = GreyEditor.createGreyEditor({ target: '#grey-editor' });
</script>
```

This file is also served via the `unpkg` field in `package.json`, so it can be referenced from a CDN:

```html
<link rel="stylesheet" href="https://unpkg.com/@grey/editor-ui/dist/styles.css" />
<script src="https://unpkg.com/@grey/editor-ui/dist/grey-editor.iife.js"></script>
```

## Public API

### `createGreyEditor(options): GreyEditorInstance`

Factory function that creates a `GreyEditorApp` instance and mounts it inside `options.target`.

**Options (`CreateGreyEditorOptions`)**

| Option | Type | Default | Description |
|---|---|---|---|
| `target` | `string \| HTMLElement` | — | CSS selector or element to mount into |
| `allowFolders` | `boolean` | `true` | Whether to show the folder-open button |
| `maxParallelDecodes` | `number` | `2` | Max concurrent file decode operations during batch open |

**Returned instance (`GreyEditorInstance`)**

| Method | Description |
|---|---|
| `openFiles(files)` | Programmatically open a `FileList` or `File[]` |
| `openDirectory(handle)` | Open a `FileSystemDirectoryHandle` (or compatible object) |
| `getActiveDocument()` | Returns a snapshot of the active `GreyDocumentRecord`, or `null` |
| `destroy()` | Closes all `ImageBitmap` handles, removes the DOM, terminates the worker |

---

## Modules

### `GreyEditor.ts`

The core implementation file. Contains three main classes and the exported factory function.

#### `GreyWorkerClient`

Manages the lifecycle of a single `Worker` instance and serialises all requests to it via a promise map keyed by an auto-incrementing `requestId`.

- **Constructor** — instantiates `grey.worker.ts` using Vite's `?worker&inline` import, which embeds the compiled worker as a base64 `Blob` URL so no separate worker file is emitted. Registers a `message` listener that resolves or rejects pending promises.
- **`loadDocument(documentId, file)`** — reads the file into an `ArrayBuffer` (transferred, not copied) and sends a `load-document` request.
- **`renderPreview(documentId, operations, previewMaxEdge)`** — sends a `render-preview` request and tracks the latest `requestId` in `lastRenderPreviewRequestId` so stale responses can be detected.
- **`exportDocument(documentId, fileName, operations, settings)`** — sends an `export-document` request.
- **`deleteDocument(documentId)`** — sends a `delete-document` request so the worker can free the cached `ImageBitmap`.
- **`cancelRenderPreview(documentId, targetRequestId)`** — fire-and-forget post (no promise) that tells the worker to discard a pending preview render if it hasn't started yet.
- **`destroy()`** — clears the pending map and calls `worker.terminate()`.

#### `GreyEditorApp`

Implements `GreyEditorInstance`. Owns the entire UI, state, and event handling.

**State fields**

| Field | Type | Description |
|---|---|---|
| `documents` | `InternalDocument[]` | All open files; extends `GreyDocumentRecord` with preview bitmaps and render dimensions |
| `activeDocumentId` | `string \| null` | ID of the currently selected tab |
| `mode` | `'rotate' \| 'crop' \| 'level'` | Current editing mode |
| `rotationDrag` | object \| null | Tracks the start position and angle of a canvas drag gesture |
| `rotationPreviewing` | `boolean` | `true` while a CSS-transform live preview is in progress |
| `currentRotationPreview` | `number` | The angle currently shown via CSS transform |
| `rotationGrid` | `boolean` | Whether the rotation guide grid overlay is rendered |
| `cropDraft` | `CropDraftState \| null` | Pointer start/current coordinates of the in-progress crop rectangle |
| `cropReady` | `boolean` | `true` after a crop rectangle has been drawn and is awaiting confirmation |
| `previewMaxEdge` | `1200` | Maximum pixel length of the long edge of a preview bitmap |
| `zoomLevel` | `number` | Current display zoom multiplier (default `1.0`, range `0.1`–`8.0`) |

**DOM structure**

The editor renders a fixed HTML shell (`renderShell()`) with `data-role` attributes used to locate and bind each element. Key roles:

- `tabs` — tab bar above the canvas
- `dropzone` — full-surface drag-and-drop overlay that activates on `dragenter`
- `canvas` / `overlay` — stacked canvases; `canvas` shows the preview bitmap, `overlay` handles crop and rotation guide drawing
- `edit-fieldset` / `save-fieldset` — sidebar panels for editing controls and export settings
- `rotate-controls` / `crop-controls` / `level-controls` — mode-specific control groups within the edit fieldset

The shell is laid out as a five-row grid: top toolbar, tabs, edit toolbar, workspace, and status bar. The workspace row is the only flexible track (`minmax(0, 1fr)`), so zoomed canvases scroll inside the canvas pane instead of pushing the status bar out of view.

The preview canvas (`.grey-editor__canvas`) applies a CSS black-and-white simulation via `filter: grayscale(100%)`, while the overlay canvas remains unfiltered so crop and rotation guides stay high-contrast. Levels adjustments are baked into the worker preview bitmap and then shown through this grayscale filter.

**File intake**

Three entry points are supported:

1. **Drag and drop** — `dragenter` / `dragover` / `dragleave` / `drop` listeners on the root element. Folder entries are recursed via `webkitGetAsEntry` and the `DirectoryEntryLike` fallback interface.
2. **File input** — a hidden `<input type="file" multiple>` triggered by the empty-state open button.
3. **Directory input** — a hidden `<input webkitdirectory>` and the public `openDirectory(handle)` API.

**Preview pipeline**

Preview renders are debounced via `schedulePreview(documentId)` with a short delay. The method sets a flag (`pendingPreview`) and starts a timer. When the timer fires, `runPreview()` sends a `render-preview` request to the worker. If another preview comes in while one is already running, it is queued as `queuedPreview` and dispatched immediately after the current one completes.

Stale responses from the worker are discarded by checking `response.requestId` against `lastPreviewRequestId`.

**Rotation interaction**

Two input mechanisms update the rotation angle:
- **Number input** — directly sets the angle via `handleRotationChange`, triggers a CSS-transform live preview on the canvas element before committing.
- **Canvas drag** — `pointerdown` on the canvas in rotate mode begins a drag; horizontal pointer delta is converted to degrees (1 px ≈ 0.25°). The CSS transform is applied in real time via `setRotationPreview(degrees)`, and committed to the operations list on `pointerup` via `applyRotationFromPreview()`.

After rotation is committed, the editor schedules a worker preview rerender so the displayed canvas dimensions update to the rotated image bounds (including protruding corners).

**Crop interaction**

In crop mode, `pointerdown`, `pointermove`, and `pointerup` listeners on the overlay canvas track the crop rectangle. The draft is drawn on the overlay in `drawOverlay()`. While dragging, Grey dims the area outside the draft rectangle so the selected region is easier to read against busy backgrounds. Once the drag is released (`cropReady`), the same masked overlay remains until crop confirm/reset.

Confirming with the toolbar button or keyboard shortcut calls `applyCrop()`, which reads `cropDraft`, converts coordinates from preview space to rendered-source space using the stored `renderedWidth` / `renderedHeight` ratio, and calls `appendCropOperation`.

Crop pointer coordinates are not clamped to the visible canvas bounds, so users can drag past the current image edge to create a larger crop region.

**Level interaction**

Level mode exposes Photoshop-style controls for:
- black point (`0..254`)
- midtone position (`0..255`, default `128`)
- white point (`1..255`)

Each change updates or appends a trailing `LevelOperation`, schedules a worker preview render, and marks the document dirty. Midtone UI values are mapped to the internal gamma representation used by the worker. The toolbar includes a **Reset levels** button that restores `0 / 128 / 255`.

**Export / save**

Pressing save (button or Cmd/Ctrl+S) swaps the sidebar from `edit-fieldset` to `save-fieldset`. Confirming export calls `worker.exportDocument()`, receives a `Blob`, and downloads it using a temporary `<a download>` element.

**Zoom interaction**

Scrolling the mouse wheel over the canvas pane zooms in (scroll up) or out (scroll down) by a factor of 1.1 per step, clamped to a range of 0.1×–8×. Zoom only affects the CSS display size — the canvas drawing buffer stays at `previewWidth × previewHeight` and `getCanvasPoint` automatically compensates via `getBoundingClientRect`, so crop and rotation coordinates remain accurate at any zoom level. The scroll position is adjusted after each zoom step so the point under the cursor stays fixed (zoom-to-cursor). `zoomLevel` is reset to `1.0` whenever a new document is opened or the active tab changes. After each zoom step `drawOverlay` is called so the rotation grid re-renders; all pixel-space drawing constants (spacing, line widths, dash lengths, crosshair dot radius) are divided by `zoomLevel` so the grid appears at a consistent physical size regardless of zoom.

**Keyboard shortcuts**

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + S` | Open save panel (or confirm export if already open) |
| `Escape` | Close save panel / cancel crop draft |

#### `InternalDocument`

Extends `GreyDocumentRecord` with runtime-only fields that are never serialised:

| Field | Description |
|---|---|
| `previewBitmap` | Latest `ImageBitmap` returned by the worker |
| `previewWidth` / `previewHeight` | Dimensions of the preview bitmap |
| `renderedWidth` / `renderedHeight` | Dimensions of the fully-rendered (non-scaled) image for coordinate mapping |
| `previewRevision` | Incremented on each successful preview render, used to force canvas redraws |

---

### `grey.worker.ts`

The Web Worker entry point. Handles a `message` event carrying a `WorkerRequest` and dispatches to the appropriate function from `@grey/image-worker`.

**Request handlers**

| Request type | Action |
|---|---|
| `load-document` | Calls `decodeImageBuffer`, stores result in a `Map<documentId, LoadedSource>`, responds with `document-loaded` |
| `render-preview` | Calls `renderPreview`, responds with `preview-rendered` (transfers the bitmap); silently discards the result if `activePreviewRequestId` has changed (i.e. a newer request superseded this one) |
| `cancel-render-preview` | Clears `activePreviewRequestId` if it matches the target ID, causing any in-progress render to discard its result |
| `export-document` | Calls `exportDocument`, responds with `document-exported` |
| `delete-document` | Closes the cached `ImageBitmap` and removes it from the map, responds with `document-deleted` |

Errors from any handler are caught and posted back as a `WorkerFailure` response with `type: 'error'`.

---

### `index.ts`

Re-exports `createGreyEditor`, `CreateGreyEditorOptions`, and `GreyEditorInstance` as the package's public surface. The package does **not** auto-import `styles.css` — consumers opt in by importing `@grey/editor-ui/styles.css` explicitly.
