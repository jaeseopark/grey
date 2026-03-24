# image-worker

`@grey/image-worker` is an internal package that runs inside a Web Worker (`OffscreenCanvas` context). It provides all pixel-level image processing: decoding, rotation, crop, grayscale conversion, scaling, and encoding. It is consumed exclusively by `grey.worker.ts` in `@grey/editor-ui` and has no direct connection to the main thread.

## Modules

### `rendering.ts`

All rendering logic lives here. The module exports three async entry-point functions and exposes the `LoadedSource`, `PreviewRenderResult`, and `ExportRenderResult` interfaces.

---

#### Public interfaces

```ts
interface LoadedSource {
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

interface PreviewRenderResult {
  bitmap: ImageBitmap;
  renderedWidth: number;   // dimensions after all operations, before scaling to previewMaxEdge
  renderedHeight: number;
  previewWidth: number;    // dimensions of the downscaled preview bitmap
  previewHeight: number;
}

interface ExportRenderResult {
  blob: Blob;
  width: number;
  height: number;
}
```

---

#### `decodeImageBuffer(buffer, fileName, mimeType): Promise<LoadedSource>`

Decodes a raw `ArrayBuffer` into a `LoadedSource`. Two decode paths are used:

- **TIFF** (detected via `isTiffFile` from `@grey/editor-core`): routes through `decodeTiffBuffer`, which uses the `utif` library to decode the IFD, converts the first frame to RGBA8 bytes with `UTIF.toRGBA8`, writes those bytes into an `OffscreenCanvas` via `ImageData`, and returns a bitmap via `canvas.transferToImageBitmap()`.
- **All other types** (JPEG, PNG): wraps the buffer in a `Blob` and calls the browser-native `createImageBitmap(blob)`.

---

#### `renderPreview(source, operations, previewMaxEdge): Promise<PreviewRenderResult>`

Renders all operations into a full-resolution canvas, then produces a downscaled preview bitmap:

1. `renderOperations(source, operations)` — returns an `OffscreenCanvas` at full rendered size.
2. `scaleCanvasToEdge(canvas, previewMaxEdge)` — if the longest edge exceeds `previewMaxEdge` (1200 px by default), downscales proportionally; otherwise clones the canvas unchanged.
3. Converts the preview canvas to an `ImageBitmap` and returns it along with both sets of dimensions.

The `renderedWidth` / `renderedHeight` values are the full-resolution dimensions and are used by the main thread to map crop coordinates back from preview space to source space.

---

#### `exportDocument(source, operations, settings): Promise<ExportRenderResult>`

Produces the final export `Blob`:

1. Normalizes `settings` via `normalizeExportSettings` from `@grey/editor-core`.
2. Renders all operations into a full-resolution canvas via `renderOperations`.
3. If the output dimensions differ from the rendered canvas, scales with `scaleCanvas` (high-quality bicubic via `imageSmoothingQuality: 'high'`).
4. Applies grayscale conversion via `applyColorSpace`.
5. Encodes to the target format via `encodeCanvas`.

---

### Internal rendering functions

These are module-private helpers that implement each step of the pipeline.

#### `renderOperations(source, operations)`

Iterates the `Operation[]` list in order and applies each to the running canvas:

- `rotate` → `rotateCanvas`
- `crop` → `cropCanvas`

Returns an `OffscreenCanvas` at the final rendered dimensions.

#### `rotateCanvas(sourceCanvas, degrees)`

1. Normalizes degrees into `[0, 360)`.
2. Returns a clone if the normalized angle is 0.
3. Otherwise calls `calculateRotatedBounds` (from `@grey/editor-core`) to size the output canvas.
4. Fills the output canvas with **white** (so rotated areas outside the original image appear white, not transparent).
5. Translates to the center, rotates via `context.rotate`, and draws the source canvas centered.

#### `cropCanvas(sourceCanvas, rect)`

Normalizes the crop rectangle via `normalizeCropRect` (from `@grey/editor-core`), creates a new `OffscreenCanvas` at the crop dimensions, and fills the canvas white.

If the crop rectangle extends outside the source image, the worker copies only the overlapping source region and offsets it into the destination canvas. Non-overlapping regions remain white, which effectively allows crop operations to increase canvas size.

#### `scaleCanvasToEdge(sourceCanvas, maxEdge)`

Returns a clone unchanged if the longest edge is already ≤ `maxEdge`. Otherwise computes a proportional scale and delegates to `scaleCanvas`.

#### `scaleCanvas(sourceCanvas, width, height)`

Creates an `OffscreenCanvas` at the target dimensions, enables `imageSmoothingEnabled` with `imageSmoothingQuality: 'high'`, and draws the source.

#### `applyColorSpace(sourceCanvas, settings)`

Applies grayscale conversion to every pixel using the **Rec. 709 luminance formula**:

$$
Y = 0.2126 \cdot R + 0.7152 \cdot G + 0.0722 \cdot B
$$

The alpha channel is forced to 255 (fully opaque). For JPEG exports, an additional flattening step composites onto a white background to remove any residual transparency artifacts.

#### `encodeCanvas(canvas, settings)`

Dispatches to the appropriate encoder:

| Format | Encoder |
|---|---|
| `jpeg` | `canvas.convertToBlob({ type: 'image/jpeg', quality: settings.quality })` |
| `png` | `canvas.convertToBlob({ type: 'image/png' })` |
| `tiff` | `UTIF.encodeImage(rgba, width, height, {})` wrapped in a `Blob` |

---

### `index.ts`

Re-exports everything from `rendering.ts` as the package's public surface.
