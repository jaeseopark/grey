export type ExportFormat = 'jpeg' | 'png' | 'tiff';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RotateOperation {
  kind: 'rotate';
  degrees: number;
}

export interface CropOperation {
  kind: 'crop';
  rect: CropRect;
}

export type Operation = RotateOperation | CropOperation;

export interface ExportSettings {
  format: ExportFormat;
  quality: number;
  scale: number;
  longEdge: number | null;
}

export interface GreyDocumentRecord {
  id: string;
  name: string;
  sourceType: string;
  sourceWidth: number;
  sourceHeight: number;
  operations: Operation[];
  exportSettings: ExportSettings;
  dirty: boolean;
}

export interface LoadDocumentRequest {
  requestId: number;
  type: 'load-document';
  documentId: string;
  fileName: string;
  mimeType: string;
  buffer: ArrayBuffer;
}

export interface RenderPreviewRequest {
  requestId: number;
  type: 'render-preview';
  documentId: string;
  operations: Operation[];
  previewMaxEdge: number;
}

export interface ExportDocumentRequest {
  requestId: number;
  type: 'export-document';
  documentId: string;
  fileName: string;
  operations: Operation[];
  settings: ExportSettings;
}

export interface DeleteDocumentRequest {
  requestId: number;
  type: 'delete-document';
  documentId: string;
}

export interface CancelRenderPreviewRequest {
  requestId: number;
  type: 'cancel-render-preview';
  documentId: string;
  targetRequestId: number;
}

export type WorkerRequest =
  | LoadDocumentRequest
  | RenderPreviewRequest
  | ExportDocumentRequest
  | DeleteDocumentRequest
  | CancelRenderPreviewRequest;

export interface WorkerFailure {
  requestId: number;
  type: 'error';
  message: string;
}

export interface DocumentLoadedResponse {
  requestId: number;
  type: 'document-loaded';
  documentId: string;
  width: number;
  height: number;
}

export interface PreviewRenderedResponse {
  requestId: number;
  type: 'preview-rendered';
  documentId: string;
  bitmap: ImageBitmap;
  renderedWidth: number;
  renderedHeight: number;
  previewWidth: number;
  previewHeight: number;
}

export interface DocumentExportedResponse {
  requestId: number;
  type: 'document-exported';
  documentId: string;
  blob: Blob;
  outputWidth: number;
  outputHeight: number;
  format: ExportFormat;
}

export interface DocumentDeletedResponse {
  requestId: number;
  type: 'document-deleted';
  documentId: string;
}

export type WorkerResponse =
  | WorkerFailure
  | DocumentLoadedResponse
  | PreviewRenderedResponse
  | DocumentExportedResponse
  | DocumentDeletedResponse;
