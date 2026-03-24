# editor-core

`@grey/editor-core` is a framework-agnostic TypeScript package that provides the document model, operation management, file utilities, and pure math helpers used throughout the Grey monorepo. It has no runtime dependencies on browser APIs and can be used in both the main thread and Web Workers.

## Modules

### `document.ts`

Contains all functions for creating and mutating `GreyDocumentRecord` objects.

#### `createDocumentRecord(input)`

Creates a fresh document record from decoded image metadata. Populates default export settings, an empty operations list, and sets `dirty` to `false`.

```ts
const record = createDocumentRecord({
  id: 'abc123',
  name: 'scan.jpg',
  sourceType: 'image/jpeg',
  sourceWidth: 2480,
  sourceHeight: 3508,
});
```

#### `createDefaultExportSettings(format?)`

Returns an `ExportSettings` object with sensible defaults: `quality: 0.75`, `scale: 1`, `longEdge: null`. Defaults to `'jpeg'` format if not specified.

#### `setTrailingRotationOperation(operations, degrees)`

Implements the **set-trailing-rotate strategy**: if the last operation in the list is already a `rotate`, it is replaced in-place rather than appended. This keeps the operations list compact regardless of how many times the user adjusts the angle.

Degrees are clamped to the range `[-359, +359]` before storing.

```ts
// First call — appends a rotate op
let ops = setTrailingRotationOperation([], 15);
// ops = [{ kind: 'rotate', degrees: 15 }]

// Second call — replaces the trailing rotate
ops = setTrailingRotationOperation(ops, 30);
// ops = [{ kind: 'rotate', degrees: 30 }]
```

#### `appendCropOperation(operations, rect, currentWidth, currentHeight)`

Appends a `CropOperation` to the operations list. The supplied rect is normalized (negative dimensions corrected, integer pixel coordinates) via `normalizeCropRect` before being stored.

Crop operations are intentionally **not clamped** to current canvas bounds. This allows selecting crop regions that extend outside the current image and lets downstream rendering grow the output canvas when needed.

#### `updateExportSettings(document, settings)`

Returns a new document record with the export settings merged and normalized. Normalization enforces:
- `quality` clamped to `[0.1, 1.0]`
- `scale` clamped to `[0.05, 8.0]`
- `longEdge` set to `null` if ≤ 0

#### Format helpers

| Function | Returns |
|---|---|
| `getFormatMimeType(format)` | MIME type string (`'image/jpeg'`, etc.) |
| `getExtensionForFormat(format)` | File extension (`'jpg'`, `'png'`, `'tiff'`) |
| `getDownloadFileName(inputName, format)` | Output file name with the correct extension, stripping the original extension from the base name |

---

### `files.ts`

Utilities for validating and inspecting image files.

#### `isSupportedImageFile(file)`

Returns `true` if the file extension is one of `jpg`, `jpeg`, `png`, `tif`, `tiff`, or if `file.type` starts with `'image/'`.

#### `getFileExtension(fileName)`

Extracts the lowercase extension from a file name. Returns an empty string if there is no extension.

#### `getAcceptAttribute()`

Returns the string to use as an `<input accept="...">` attribute value, covering all supported image types.

#### `isTiffFile(fileName, mimeType)`

Returns `true` when the file is a TIFF, determined by extension (`tif` / `tiff`) or MIME type (`image/tiff`). Used by the worker to route TIFF files through the UTIF decode path instead of the browser-native `createImageBitmap` path.

---

### `math.ts`

Pure math utilities for geometry calculations. All functions are side-effect free and unit-tested in `math.test.ts`.

#### `clamp(value, min, max)`

Clamps a number to a closed interval.

#### `degreesToRadians(degrees)`

Converts degrees to radians.

#### `calculateRotatedBounds(width, height, degrees)`

Calculates the bounding box dimensions of an axis-aligned rectangle after rotation. Uses the formula:

$$
\text{width}' = w \cdot |\cos\theta| + h \cdot |\sin\theta|
$$
$$
\text{height}' = w \cdot |\sin\theta| + h \cdot |\cos\theta|
$$

Results are rounded up to the nearest integer with a minimum of 1. This is used by the worker's `rotateCanvas` function to size the output canvas and to display preview dimensions on the main thread.

#### `normalizeCropRect(rect)`

Normalizes a `CropRect` that may have been drawn in either direction (negative width/height). Floors coordinates to integer pixels and ensures a minimum dimension of 1 in each axis.

Coordinates are preserved even when they are outside image bounds, so crop operations can request larger output canvases with padded areas.

#### `resolveScale(width, height, settings)`

Resolves the effective scale factor for export:
- If `settings.longEdge` is set and positive, computes scale as `longEdge / max(width, height)`.
- Otherwise uses `settings.scale`.
- Result is always clamped to `[0.05, 8.0]`.

#### `scaleDimensions(width, height, settings)`

Returns the output `{ width, height, scale }` after applying `resolveScale`. Output dimensions are rounded to the nearest integer with a minimum of 1.
