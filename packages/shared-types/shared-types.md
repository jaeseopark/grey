# shared-types

`@grey/shared-types` is an internal types-only package. It contains all TypeScript interfaces and type aliases that are shared across the Grey monorepo — primarily the document model and the worker message protocol. It has no runtime code; every export is a type or interface.

## Types

### Document model

#### `ExportFormat`

```ts
type ExportFormat = 'jpeg' | 'png' | 'tiff';
```

The three supported output formats.

#### `CropRect`

```ts
interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

A rectangle in the coordinate space of the canvas at the time the crop was applied. Stored un-normalized in the operations list; normalization is applied lazily when the worker processes the operation.

#### `RotateOperation` / `CropOperation` / `Operation`

```ts
interface RotateOperation { kind: 'rotate'; degrees: number; }
interface CropOperation  { kind: 'crop';   rect: CropRect;  }
type Operation = RotateOperation | CropOperation;
```

A discriminated union of all supported edit operations. Operations are append-only and applied in order.

#### `ExportSettings`

```ts
interface ExportSettings {
  format: ExportFormat;
  quality: number;    // 0.1–1.0
  scale: number;      // 0.05–8.0
  longEdge: number | null;
}
```

Controls the output of the export pipeline. `longEdge` takes precedence over `scale` when set to a positive integer.

#### `GreyDocumentRecord`

```ts
interface GreyDocumentRecord {
  id: string;
  name: string;
  sourceType: string;
  sourceWidth: number;
  sourceHeight: number;
  operations: Operation[];
  exportSettings: ExportSettings;
  dirty: boolean;
}
```

The serialisable representation of one open file. `dirty` is `true` when the document has unsaved edits. Source pixel data is never stored here; only metadata and the operations list travel on the main thread.

---

### Worker message protocol

The worker protocol uses a request/response pattern. Every message carries a `requestId` (auto-incrementing integer) that the worker echoes back so the client can resolve the correct promise.

#### Request types

| Interface | `type` value | Purpose |
|---|---|---|
| `LoadDocumentRequest` | `'load-document'` | Send an `ArrayBuffer` to the worker to decode and cache |
| `RenderPreviewRequest` | `'render-preview'` | Render all operations and return a scaled preview bitmap |
| `ExportDocumentRequest` | `'export-document'` | Render, scale, apply color space, and encode to a `Blob` |
| `DeleteDocumentRequest` | `'delete-document'` | Free the cached `ImageBitmap` for a document ID |
| `CancelRenderPreviewRequest` | `'cancel-render-preview'` | Ask the worker to discard a pending preview render |

```ts
type WorkerRequest =
  | LoadDocumentRequest
  | RenderPreviewRequest
  | ExportDocumentRequest
  | DeleteDocumentRequest
  | CancelRenderPreviewRequest;
```

#### Response types

| Interface | `type` value | Payload |
|---|---|---|
| `DocumentLoadedResponse` | `'document-loaded'` | `documentId`, `width`, `height` |
| `PreviewRenderedResponse` | `'preview-rendered'` | `documentId`, `bitmap` (transferred), `renderedWidth`, `renderedHeight`, `previewWidth`, `previewHeight` |
| `DocumentExportedResponse` | `'document-exported'` | `documentId`, `blob`, `outputWidth`, `outputHeight`, `format` |
| `DocumentDeletedResponse` | `'document-deleted'` | `documentId` |
| `WorkerFailure` | `'error'` | `message` |

```ts
type WorkerResponse =
  | DocumentLoadedResponse
  | PreviewRenderedResponse
  | DocumentExportedResponse
  | DocumentDeletedResponse
  | WorkerFailure;
```

`PreviewRenderedResponse.bitmap` is transferred (not copied) from the worker to the main thread using the `Transferable` mechanism, avoiding a full pixel-data copy.
