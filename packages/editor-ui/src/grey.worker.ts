import { decodeImageBuffer, exportDocument, renderPreview, type LoadedSource } from '@grey/image-worker';
import type { CancelRenderPreviewRequest, WorkerRequest, WorkerResponse } from '@grey/shared-types';

const documents = new Map<string, LoadedSource>();
let activePreviewRequestId: number | null = null;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    switch (request.type) {
      case 'load-document': {
        const loadedSource = await decodeImageBuffer(request.buffer, request.fileName, request.mimeType);
        documents.set(request.documentId, loadedSource);

        const response: WorkerResponse = {
          requestId: request.requestId,
          type: 'document-loaded',
          documentId: request.documentId,
          width: loadedSource.width,
          height: loadedSource.height
        };

        self.postMessage(response);
        return;
      }
      case 'render-preview': {
        const source = documents.get(request.documentId);

        if (!source) {
          throw new Error('Document source is missing from worker cache.');
        }

        activePreviewRequestId = request.requestId;
        const preview = await renderPreview(source, request.operations, request.previewMaxEdge);

        if (activePreviewRequestId !== request.requestId) {
          preview.bitmap.close();
          return;
        }

        const response: WorkerResponse = {
          requestId: request.requestId,
          type: 'preview-rendered',
          documentId: request.documentId,
          bitmap: preview.bitmap,
          renderedWidth: preview.renderedWidth,
          renderedHeight: preview.renderedHeight,
          previewWidth: preview.previewWidth,
          previewHeight: preview.previewHeight
        };

        self.postMessage(response, [preview.bitmap]);
        return;
      }

      case 'cancel-render-preview': {
        const cancelRequest = request as CancelRenderPreviewRequest;

        if (activePreviewRequestId === cancelRequest.targetRequestId) {
          activePreviewRequestId = null;
        }

        return;
      }

      case 'export-document': {
        const source = documents.get(request.documentId);

        if (!source) {
          throw new Error('Document source is missing from worker cache.');
        }

        const exported = await exportDocument(source, request.operations, request.settings);
        const response: WorkerResponse = {
          requestId: request.requestId,
          type: 'document-exported',
          documentId: request.documentId,
          blob: exported.blob,
          outputWidth: exported.width,
          outputHeight: exported.height,
          format: request.settings.format
        };

        self.postMessage(response);
        return;
      }
      case 'delete-document': {
        const source = documents.get(request.documentId);
        source?.bitmap.close();
        documents.delete(request.documentId);

        const response: WorkerResponse = {
          requestId: request.requestId,
          type: 'document-deleted',
          documentId: request.documentId
        };

        self.postMessage(response);
        return;
      }
      default:
        throw new Error('Unknown worker request.');
    }
  } catch (error) {
    const response: WorkerResponse = {
      requestId: request.requestId,
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown worker error.'
    };

    self.postMessage(response);
  }
};
