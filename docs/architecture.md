# Architecture

## Public API

The library exposes a small framework-agnostic API so any host web application can initialize it inside a supplied element.

```ts
import { createGreyEditor } from '@grey/editor-ui';

const editor = createGreyEditor({
  target: '#grey-editor',
  allowFolders: true,
  maxParallelDecodes: 2,
});
```

Available methods:

* `createGreyEditor(options)` — mounts the editor into the target element
* `editor.openFiles(FileList | File[])` — programmatically open files
* `editor.openDirectory(FileSystemDirectoryHandle)` — open a directory handle
* `editor.getActiveDocument()` — returns a snapshot of the active `GreyDocumentRecord`
* `editor.destroy()` — unmounts the editor and terminates the worker

## Runtime Layers

1. **Host integration layer** (`packages/editor-ui`)
   Mounts the editor into a DOM element and exposes the public API. Manages all UI state and canvas interaction on the main thread.

2. **UI state layer** (`GreyEditorApp` class inside `editor-ui`)
   Manages open tabs, active mode (rotate vs crop vs level), crop draft state, rotation preview, levels controls, save panel, and keyboard shortcuts. The toolbar is mode-sensitive: rotate mode shows the angle number input, grid toggle, and reset button; crop mode shows confirm and reset crop buttons; level mode shows black point, midtone gamma, white point, and reset levels controls.

3. **Document model layer** (`packages/editor-core`)
   Stores immutable source image metadata plus an ordered list of user operations. The original pixel data is never mutated.

4. **Worker processing layer** (`packages/image-worker`)
   Runs in a dedicated Web Worker using `OffscreenCanvas`. Handles all decode, rotation, crop, grayscale conversion, scaling, and encode operations off the main thread. A single `GreyWorkerClient` owns the worker and serialises requests via a promise map keyed by request ID.

## Document Model

Each open file maps to one document record. The source file is decoded immediately into the worker on load; only metadata is kept on the main thread.

```ts
type GreyDocumentRecord = {
  id: string;
  name: string;
  sourceType: string;   // MIME type of the original file
  sourceWidth: number;
  sourceHeight: number;
  operations: Operation[];
  exportSettings: ExportSettings;
  dirty: boolean;
};

type Operation = RotateOperation | CropOperation | LevelOperation;

type ExportSettings = {
  format: 'jpeg' | 'png' | 'tiff';
  quality: number;   // 0.1–1.0; default 0.75
  scale: number;     // default 1.0
  longEdge: number | null;
};
```

`editor-ui` extends this with runtime-only preview state (`previewBitmap`, `previewWidth`, `previewHeight`, etc.) that is never serialised.

Operations are append-only:

* `rotate` — degrees stored as a float, clamped to -359..+359; only the trailing rotate operation is kept (set-trailing-rotate strategy)
* `crop` — rectangle stored in the coordinate space at the time of the action
* `level` — input levels stored as `{ blackPoint, whitePoint, gamma }`; only the trailing level operation is kept (set-trailing-level strategy)

Color space conversion is not yet an `Operation` type. It is applied globally at export time (currently always greyscale).

## File Intake

Three entry points are implemented:

1. Drag and drop files or folders onto the editor surface (handled via `DataTransfer` items with `webkitGetAsEntry` fallback)
2. Browse/open through a hidden `<input type="file" multiple>` triggered by clicking the empty state button
3. Directory selection via a hidden `<input webkitdirectory>` and a public `openDirectory(handle)` API for programmatic use

Supported formats: `.jpg`, `.jpeg`, `.png`, `.tif`, `.tiff`. Unsupported files in a batch are skipped with per-file error chips rather than aborting the whole batch. One tab is created per file.

## Canvas and Preview

The editor uses two stacked `<canvas>` elements — one for the image content and one for the interactive overlay (rotation grid or crop selection).

* The canvas stack is sized to match the preview dimensions returned by the worker
* No zoom or pan; the preview auto-fits to the available space via CSS
* During pointer-drag rotation the canvas is rotated with a CSS `transform` for low-latency feedback; a full worker re-render is triggered when the pointer is released
* During crop, the overlay canvas renders a dashed selection rect while dragging and a Photoshop-style darkened mask once the selection is complete
* Preview renders are throttled with a 120 ms debounce and can be cancelled if a newer request is enqueued

## Rotation

Rotation is implemented mathematically in the worker using `OffscreenCanvas`.

* Allowed input range: `-359` to `+359` degrees
* Only the trailing rotate operation is stored (set-trailing-rotate strategy)
* The rotated bounding box is computed before rendering so padding is deterministic
* The image is centred in the expanded canvas after rotation; background fill is white

Bounding box math (implemented in `packages/editor-core/src/math.ts`):

$$rotatedWidth = |w \cos\theta| + |h \sin\theta|$$

$$rotatedHeight = |w \sin\theta| + |h \cos\theta|$$

UI controls in rotate mode:

* **Angle number input** — type a value directly (−359 to 359, step 0.5)
* **Canvas drag** — click and drag on the canvas to rotate; the angle is computed from the mouse cursor's position relative to the center of the image
* **Grid toggle** — shows/hides the dashed alignment grid overlay
* **Reset angle** — sets rotation back to 0 and triggers a re-render

## Crop

* `CropOperation` stores a rectangle in the coordinate space at the time of the crop action (post-rotation if rotation was applied first)
* Multiple crops are supported by appending to the operation list
* Crop rectangles are normalised to integer pixels and clamped to canvas bounds in the worker
* UI shows a dashed selection outline while dragging; once released it shows a darkened mask around the selected area
* Press **Enter** or click **Confirm crop** to apply; press **Escape** or click **Reset crop** to cancel
* Reset crop removes all crop operations from the document and triggers a re-render

## Color Space

Color space selection is **not yet exposed in the UI**. The export pipeline currently always converts to greyscale using the luma formula:

```
Y = 0.2126R + 0.7152G + 0.0722B
```

Alpha is forced to 255 (fully opaque) in the worker. Applied unconditionally at export time in `applyColorSpace` within `packages/image-worker/src/rendering.ts`. JPEG exports are then encoded through MozJPEG with grayscale output enabled so the downloaded file is single-channel grayscale, not RGB pixels that merely look gray.

Planned support matrix:

| Format | RGB | RGBA | Greyscale |
|---|---|---|---|
| JPEG | Yes | No | Yes |
| PNG | Yes | Yes | Yes |
| TIFF | Yes | Yes | Yes |

When color space selection is added, a `colorSpace` field will be introduced to `ExportSettings` and the worker's `applyColorSpace` function will branch on it.

## Save and Export

The save panel lives in the sidebar, always visible when a document is open. Also triggered by `Cmd/Ctrl+S`.

Current controls:

* **File type** — JPEG is the default and the only currently enabled option; PNG and TIFF are backend-ready but disabled in the format `<select>` pending colour-space selection UI
* **Compression / quality** — 0.1–1.0, default 0.75; applies to JPEG and TIFF
* **Scale factor** — default 1.0; disabled when long edge is set
* **Long edge in pixels** — optional; when set, the scale factor is derived from this value

Processing order in the worker:

1. Decode source image from its stored `ArrayBuffer`
2. Replay document operations in sequence (rotate → crop → level, depending on user order)
3. Apply colour space conversion (currently always greyscale)
4. Compute output dimensions from scale factor or long edge
5. Encode to target format via MozJPEG WASM (JPEG grayscale), `OffscreenCanvas.convertToBlob` (PNG), or UTIF (TIFF)
6. Return the `Blob` to the main thread; main thread triggers download via object URL

## Offline and Performance

* All image processing runs in a dedicated Web Worker; no image data leaves the browser
* TIFF support uses the bundled `utif` library — no CDN dependency
* Preview renders are capped at `previewMaxEdge = 1200` pixels on the long edge; export runs at full resolution
* Previews are debounced (120 ms) and cancellable — if a new preview is enqueued while one is running, the in-flight request is cancelled in the worker
* The worker stores decoded source bitmaps keyed by document ID and only discards them on explicit delete
