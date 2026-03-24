import {
  appendCropOperation,
  createDocumentRecord,
  getAcceptAttribute,
  getDownloadFileName,
  isSupportedImageFile,
  scaleDimensions,
  setTrailingRotationOperation,
  updateExportSettings
} from '@grey/editor-core';
import GreyWorkerConstructor from './grey.worker.ts?worker&inline';
import type {
  CropRect,
  DocumentExportedResponse,
  ExportDocumentRequest,
  ExportFormat,
  GreyDocumentRecord,
  LoadDocumentRequest,
  Operation,
  PreviewRenderedResponse,
  RenderPreviewRequest,
  WorkerRequest,
  WorkerResponse
} from '@grey/shared-types';

interface InternalDocument extends GreyDocumentRecord {
  previewBitmap: ImageBitmap | null;
  previewWidth: number;
  previewHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  previewRevision: number;
}

interface DirectoryEntryLike {
  kind: 'file' | 'directory';
  getFile?: () => Promise<File>;
  values?: () => AsyncIterable<DirectoryEntryLike>;
}

export type OpenDirectoryHandle = FileSystemDirectoryHandle | { values: () => AsyncIterable<DirectoryEntryLike> };

export interface CreateGreyEditorOptions {
  target: string | HTMLElement;
  allowFolders?: boolean;
  maxParallelDecodes?: number;
}

export interface GreyEditorInstance {
  openFiles(files: FileList | File[]): Promise<void>;
  openDirectory(handle: OpenDirectoryHandle): Promise<void>;
  getActiveDocument(): GreyDocumentRecord | null;
  destroy(): void;
}

interface CropDraftState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface WorkerPendingRequest<TResponse extends WorkerResponse> {
  resolve: (value: TResponse) => void;
  reject: (reason?: unknown) => void;
}

type WorkerCommand = Omit<WorkerRequest, 'requestId'>;

class GreyWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, WorkerPendingRequest<WorkerResponse>>();
  private requestId = 0;
  public lastRenderPreviewRequestId = 0;

  constructor() {
    this.worker = new GreyWorkerConstructor();
    this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pendingRequest = this.pending.get(response.requestId);

      if (!pendingRequest) {
        return;
      }

      this.pending.delete(response.requestId);

      if (response.type === 'error') {
        pendingRequest.reject(new Error(response.message));
        return;
      }

      pendingRequest.resolve(response);
    });
  }

  destroy(): void {
    this.pending.clear();
    this.worker.terminate();
  }

  async loadDocument(documentId: string, file: File): Promise<{ width: number; height: number }> {
    const buffer = await file.arrayBuffer();
    const response = await this.request<Omit<LoadDocumentRequest, 'requestId'>, WorkerResponse>({
      type: 'load-document',
      documentId,
      fileName: file.name,
      mimeType: file.type,
      buffer
    }, [buffer]);

    if (response.type !== 'document-loaded') {
      throw new Error('Unexpected response when loading document.');
    }

    return {
      width: response.width,
      height: response.height
    };
  }

  async renderPreview(documentId: string, operations: Operation[], previewMaxEdge: number): Promise<PreviewRenderedResponse> {
    this.lastRenderPreviewRequestId = this.requestId + 1;

    const response = await this.request<Omit<RenderPreviewRequest, 'requestId'>, WorkerResponse>({
      type: 'render-preview',
      documentId,
      operations,
      previewMaxEdge
    });

    if (response.type !== 'preview-rendered') {
      throw new Error('Unexpected response when rendering preview.');
    }

    return response;
  }

  async exportDocument(
    documentId: string,
    fileName: string,
    operations: Operation[],
    settings: InternalDocument['exportSettings']
  ): Promise<DocumentExportedResponse> {
    const response = await this.request<Omit<ExportDocumentRequest, 'requestId'>, WorkerResponse>({
      type: 'export-document',
      documentId,
      fileName,
      operations,
      settings
    });

    if (response.type !== 'document-exported') {
      throw new Error('Unexpected response when exporting document.');
    }

    return response;
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.request<WorkerCommand, WorkerResponse>({
      type: 'delete-document',
      documentId
    });
  }

  cancelRenderPreview(documentId: string, targetRequestId: number): void {
    this.worker.postMessage({
      type: 'cancel-render-preview',
      requestId: ++this.requestId,
      documentId,
      targetRequestId
    });
  }

  private request<TRequest extends Omit<WorkerRequest, 'requestId'>, TResponse extends WorkerResponse>(
    request: TRequest,
    transferables: Transferable[] = []
  ): Promise<TResponse> {
    const requestId = ++this.requestId;

    return new Promise<TResponse>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as WorkerPendingRequest<WorkerResponse>['resolve'], reject });
      this.worker.postMessage({ ...request, requestId }, transferables);
    });
  }
}

export function createGreyEditor(options: CreateGreyEditorOptions): GreyEditorInstance {
  return new GreyEditorApp(options);
}

class GreyEditorApp implements GreyEditorInstance {
  private readonly options: Required<CreateGreyEditorOptions>;
  private readonly mountTarget: HTMLElement;
  private readonly worker = new GreyWorkerClient();
  private readonly documents: InternalDocument[] = [];
  private readonly cleanupCallbacks: Array<() => void> = [];

  private readonly root: HTMLDivElement;
  private readonly tabsElement: HTMLDivElement;
  private readonly dropzoneElement: HTMLDivElement;
  private readonly emptyElement: HTMLDivElement;
  private readonly canvasStackElement: HTMLDivElement;
  private readonly canvasElement: HTMLCanvasElement;
  private readonly overlayElement: HTMLCanvasElement;
  private readonly fileInput: HTMLInputElement;
  private readonly folderInput: HTMLInputElement;
  private readonly rotationNumber: HTMLInputElement;
  private readonly modeRotateButton: HTMLButtonElement;
  private readonly modeCropButton: HTMLButtonElement;
  private readonly rotationGridCheckbox: HTMLInputElement;
  private readonly rotateControlsElement: HTMLDivElement;
  private readonly cropControlsElement: HTMLDivElement;
  private readonly resetAngleButton: HTMLButtonElement;
  private readonly cropConfirmButton: HTMLButtonElement;
  private readonly resetCropButton: HTMLButtonElement;
  private readonly errorElement: HTMLDivElement;
  private readonly statusTextElement: HTMLDivElement;
  private readonly editFieldsetElement: HTMLFieldSetElement;
  private readonly saveFieldsetElement: HTMLFieldSetElement;
  private readonly formatSelect: HTMLSelectElement;
  private readonly qualityInput: HTMLInputElement;
  private readonly scaleInput: HTMLInputElement;
  private readonly longEdgeInput: HTMLInputElement;
  private readonly saveConfirmButton: HTMLButtonElement;

  private activeDocumentId: string | null = null;
  private mode: 'rotate' | 'crop' = 'rotate';
  private rotationDrag: { startX: number; startAngle: number } | null = null;
  private rotationPreviewing = false;
  private currentRotationPreview = 0;
  private rotationGrid = true;
  private cropDraft: CropDraftState | null = null;
  private cropReady = false;
  private pendingPreview = false;
  private previewTimer: number | null = null;
  private previewRunning = false;
  private queuedPreview = false;
  private lastPreviewRequestId = 0;
  private dragDepth = 0;
  private errors: string[] = [];
  private readonly previewMaxEdge = 1200;
  private zoomLevel = 1.0;
  private readonly zoomMin = 0.1;
  private readonly zoomMax = 8.0;

  constructor(options: CreateGreyEditorOptions) {
    this.options = {
      allowFolders: options.allowFolders ?? true,
      maxParallelDecodes: options.maxParallelDecodes ?? 2,
      target: options.target
    };
    this.mountTarget = resolveTarget(options.target);
    this.mountTarget.innerHTML = '';
    this.root = document.createElement('div');
    this.root.className = 'grey-editor';
    this.root.innerHTML = this.renderShell();
    this.mountTarget.append(this.root);

    this.tabsElement = this.requireElement('[data-role="tabs"]');
    this.dropzoneElement = this.requireElement('[data-role="dropzone"]');
    this.emptyElement = this.requireElement('[data-role="empty"]');
    this.canvasStackElement = this.requireElement('[data-role="canvas-stack"]');
    this.canvasElement = this.requireElement('[data-role="canvas"]');
    this.overlayElement = this.requireElement('[data-role="overlay"]');
    this.fileInput = this.requireElement('[data-role="file-input"]');
    this.folderInput = this.requireElement('[data-role="folder-input"]');
    this.rotationNumber = this.requireElement('[data-role="rotation-number"]');
    this.modeRotateButton = this.requireElement('[data-role="mode-rotate"]');
    this.modeCropButton = this.requireElement('[data-role="mode-crop"]');
    this.rotateControlsElement = this.requireElement('[data-role="rotate-controls"]');
    this.cropControlsElement = this.requireElement('[data-role="crop-controls"]');
    this.resetAngleButton = this.requireElement('[data-role="reset-angle"]');
    this.cropConfirmButton = this.requireElement('[data-role="crop-confirm"]');
    this.resetCropButton = this.requireElement('[data-role="reset-crop"]');
    this.rotationGridCheckbox = this.requireElement('[data-role="rotation-grid-checkbox"]');
    this.editFieldsetElement = this.requireElement('[data-role="edit-fieldset"]');
    this.saveFieldsetElement = this.requireElement('[data-role="save-fieldset"]');
    this.errorElement = this.requireElement('[data-role="errors"]');
    this.statusTextElement = this.requireElement('[data-role="status-text"]');
    this.formatSelect = this.requireElement('[data-role="format-select"]');
    this.qualityInput = this.requireElement('[data-role="quality-input"]');
    this.scaleInput = this.requireElement('[data-role="scale-input"]');
    this.longEdgeInput = this.requireElement('[data-role="long-edge-input"]');
    this.saveConfirmButton = this.requireElement('[data-role="save-confirm"]');

    this.fileInput.accept = getAcceptAttribute();
    this.fileInput.multiple = true;
    this.folderInput.accept = getAcceptAttribute();
    this.folderInput.multiple = true;
    this.folderInput.setAttribute('webkitdirectory', '');
    this.folderInput.setAttribute('directory', '');

    this.attachEvents();
    this.render();

    const initialHeight = getComputedStyle(this.mountTarget).height;
    if (initialHeight && initialHeight !== '0px') {
      this.mountTarget.style.minHeight = initialHeight;
      this.mountTarget.style.maxHeight = initialHeight;
      this.mountTarget.style.overflow = 'hidden';
    }
  }

  destroy(): void {
    for (const documentRecord of this.documents) {
      documentRecord.previewBitmap?.close();
    }

    for (const cleanupCallback of this.cleanupCallbacks) {
      cleanupCallback();
    }

    this.worker.destroy();
    this.root.remove();
  }

  getActiveDocument(): GreyDocumentRecord | null {
    const activeDocument = this.getActiveDocumentInternal();
    if (!activeDocument) {
      return null;
    }

    return {
      id: activeDocument.id,
      name: activeDocument.name,
      sourceType: activeDocument.sourceType,
      sourceWidth: activeDocument.sourceWidth,
      sourceHeight: activeDocument.sourceHeight,
      operations: [...activeDocument.operations],
      exportSettings: { ...activeDocument.exportSettings },
      dirty: activeDocument.dirty
    };
  }

  async openFiles(files: FileList | File[]): Promise<void> {
    const incomingFiles = Array.from(files);
    const acceptedFiles = incomingFiles.filter(isSupportedImageFile);
    const rejectedFiles = incomingFiles.filter((file) => !isSupportedImageFile(file));

    if (rejectedFiles.length > 0) {
      this.pushError(`Skipped unsupported files: ${rejectedFiles.map((file) => file.name).join(', ')}`);
    }

    for (const file of acceptedFiles) {
      try {
        const documentId = createDocumentId();
        const loaded = await this.worker.loadDocument(documentId, file);
        const documentRecord: InternalDocument = {
          ...createDocumentRecord({
            id: documentId,
            name: file.name,
            sourceType: file.type || 'application/octet-stream',
            sourceWidth: loaded.width,
            sourceHeight: loaded.height
          }),
          previewBitmap: null,
          previewWidth: 0,
          previewHeight: 0,
          renderedWidth: loaded.width,
          renderedHeight: loaded.height,
          previewRevision: 0
        };

        const bitmap = await createImageBitmap(file);

        this.documents.push({
          ...documentRecord,
          previewBitmap: bitmap,
          previewWidth: loaded.width,
          previewHeight: loaded.height
        });

        this.activeDocumentId = documentId;
        this.zoomLevel = 1.0;
        this.render();
      } catch (error) {
        this.pushError(error instanceof Error ? error.message : `Failed to open ${file.name}.`);
      }
    }

    this.render();
  }

  async openDirectory(handle: OpenDirectoryHandle): Promise<void> {
    const files = await collectFilesFromDirectoryHandle(handle);
    await this.openFiles(files);
  }

  private attachEvents(): void {
    this.listen(this.emptyElement, 'click', (event) => {
      const target = event.target as Element;
      if (target.closest('[data-role="open"]')) {
        this.fileInput.click();
      }
    });
    this.listen(this.fileInput, 'change', async () => {
      if (this.fileInput.files) {
        await this.openFiles(this.fileInput.files);
      }

      this.fileInput.value = '';
    });
    this.listen(this.folderInput, 'change', async () => {
      if (this.folderInput.files) {
        await this.openFiles(this.folderInput.files);
      }

      this.folderInput.value = '';
    });
    this.listen(this.rotationNumber, 'input', () => this.handleRotationChange(this.rotationNumber.value));
    this.listen(this.rotationNumber, 'change', () => this.applyRotationFromPreview());
    this.listen(this.modeRotateButton, 'click', () => {
      this.mode = 'rotate';
      this.cropDraft = null;
      this.drawOverlay();
      this.render();
    });
    this.listen(this.modeCropButton, 'click', () => {
      this.mode = 'crop';
      this.rotationDrag = null;
      this.cropReady = false;
      this.cropDraft = null;
      this.drawOverlay();
      this.render();
    });
    this.listen(this.resetAngleButton, 'click', () => {
      const activeDocument = this.getActiveDocumentInternal();
      if (!activeDocument) return;
      activeDocument.operations = setTrailingRotationOperation(activeDocument.operations, 0);
      activeDocument.dirty = true;
      this.rotationPreviewing = false;
      this.currentRotationPreview = 0;
      this.canvasElement.style.transform = '';
      this.schedulePreview(activeDocument.id);
      this.render();
    });
    this.listen(this.cropConfirmButton, 'click', () => {
      this.applyCrop();
    });
    this.listen(this.resetCropButton, 'click', () => {
      const activeDocument = this.getActiveDocumentInternal();
      if (activeDocument) {
        const hadCrops = activeDocument.operations.some((op) => op.kind === 'crop');
        activeDocument.operations = activeDocument.operations.filter((op) => op.kind !== 'crop');
        if (hadCrops) {
          activeDocument.dirty = true;
          this.schedulePreview(activeDocument.id);
        }
      }
      this.cropDraft = null;
      this.cropReady = false;
      this.drawOverlay();
      this.renderSidebar();
    });
    this.listen(this.rotationGridCheckbox, 'change', () => {
      this.rotationGrid = this.rotationGridCheckbox.checked;
      this.drawOverlay();
      this.renderSidebar();
    });
    this.listen(this.tabsElement, 'click', (event) => {
      const rawTarget = event.target;
      const targetElement =
        rawTarget instanceof Element
          ? rawTarget
          : rawTarget instanceof Node && rawTarget.parentElement
          ? rawTarget.parentElement
          : null;

      if (!targetElement) {
        return;
      }

      const tab = targetElement.closest<HTMLElement>('[data-role="tab"]');
      if (!tab) {
        return;
      }

      const documentId = tab.dataset.documentId;
      if (!documentId) {
        return;
      }

      const closeButton = targetElement.closest<HTMLElement>('[data-role="close-tab"]');
      if (closeButton) {
        event.preventDefault();
        event.stopPropagation();
        void this.closeDocument(documentId);
        return;
      }

      this.activeDocumentId = documentId;
      this.cropDraft = null;
      this.zoomLevel = 1.0;
      this.render();
    });
    this.listen(this.dropzoneElement, 'dragenter', (event) => {
      event.preventDefault();
      this.dragDepth += 1;
      this.dropzoneElement.classList.add('is-dragging');
    });
    this.listen(this.dropzoneElement, 'dragover', (event) => {
      event.preventDefault();
    });
    this.listen(this.dropzoneElement, 'dragleave', (event) => {
      event.preventDefault();
      this.dragDepth = Math.max(0, this.dragDepth - 1);

      if (this.dragDepth === 0) {
        this.dropzoneElement.classList.remove('is-dragging');
      }
    });
    this.listen(this.dropzoneElement, 'drop', async (event) => {
      const dropEvent = event as DragEvent;
      dropEvent.preventDefault();
      this.dragDepth = 0;
      this.dropzoneElement.classList.remove('is-dragging');

      const files = await collectDroppedFiles(dropEvent.dataTransfer ?? null);
      await this.openFiles(files);
    });
    this.listen(this.overlayElement, 'pointerdown', (event) => this.handlePointerDown(event as PointerEvent));
    this.listen(window, 'pointermove', (event) => this.handlePointerMove(event as PointerEvent));
    this.listen(window, 'pointerup', () => this.handlePointerUp());
    const wheelHandler = (event: Event) => this.handleWheel(event as WheelEvent);
    this.dropzoneElement.addEventListener('wheel', wheelHandler, { passive: false });
    this.cleanupCallbacks.push(() => this.dropzoneElement.removeEventListener('wheel', wheelHandler));
    this.listen(window, 'keydown', (event) => {
      const keyboardEvent = event as KeyboardEvent;

      if ((keyboardEvent.metaKey || keyboardEvent.ctrlKey) && keyboardEvent.key.toLowerCase() === 's') {
        keyboardEvent.preventDefault();
        void this.performSave();
      }

      if (keyboardEvent.key === 'Escape') {
        if (this.mode === 'crop' && this.cropDraft) {
          this.cropDraft = null;
          this.cropReady = false;
          this.statusTextElement.textContent = 'Crop selection canceled.';
          this.drawOverlay();
          this.render();
          return;
        }
      }

      if (keyboardEvent.key === 'Enter' && this.mode === 'crop' && this.cropReady) {
        this.applyCrop();
        return;
      }
    });
    this.listen(this.formatSelect, 'change', () => this.handleSaveSettingsChange());
    this.listen(this.qualityInput, 'input', () => this.handleSaveSettingsChange());
    this.listen(this.scaleInput, 'input', () => this.handleSaveSettingsChange());
    this.listen(this.longEdgeInput, 'input', () => this.handleSaveSettingsChange());
    this.listen(this.saveConfirmButton, 'click', async () => {
      await this.performSave();
    });
  }

  private async closeDocument(documentId: string): Promise<void> {
    const documentIndex = this.documents.findIndex((documentRecord) => documentRecord.id === documentId);

    if (documentIndex === -1) {
      return;
    }

    const [removed] = this.documents.splice(documentIndex, 1);

    if (!removed) {
      return;
    }

    removed.previewBitmap?.close();

    if (this.activeDocumentId === documentId) {
      this.activeDocumentId = this.documents[documentIndex]?.id ?? this.documents[documentIndex - 1]?.id ?? null;
    }

    this.cropDraft = null;
    this.render();

    this.worker.deleteDocument(documentId).catch((error) => {
      this.pushError(error instanceof Error ? error.message : `Failed to delete document ${documentId}.`);
    });
  }

  private async requestPreview(documentId: string): Promise<void> {
    const documentRecord = this.getDocumentById(documentId);

    if (!documentRecord) {
      return;
    }

    const revision = ++documentRecord.previewRevision;
    this.pendingPreview = true;
    this.statusTextElement.textContent = `Rendering ${documentRecord.name}...`;

    try {
      const preview = await this.worker.renderPreview(documentRecord.id, documentRecord.operations, this.previewMaxEdge);
      const latestDocument = this.getDocumentById(documentId);

      if (!latestDocument || latestDocument.previewRevision !== revision) {
        preview.bitmap.close();
        return;
      }

      latestDocument.previewBitmap?.close();
      latestDocument.previewBitmap = preview.bitmap;
      latestDocument.previewWidth = preview.previewWidth;
      latestDocument.previewHeight = preview.previewHeight;
      latestDocument.renderedWidth = preview.renderedWidth;
      latestDocument.renderedHeight = preview.renderedHeight;
      this.pendingPreview = false;
      this.canvasElement.style.transform = '';
      this.render();
      return;
    } catch (error) {
      this.pushError(error instanceof Error ? error.message : 'Preview rendering failed.');
    }

    this.pendingPreview = false;
  }

  private startPreview(documentId: string): void {
    if (this.previewRunning) {
      this.queuedPreview = true;
      if (this.lastPreviewRequestId && this.activeDocumentId) {
        this.worker.cancelRenderPreview(this.activeDocumentId, this.lastPreviewRequestId);
      }
      return;
    }

    this.previewRunning = true;
    this.requestPreview(documentId).finally(() => {
      this.previewRunning = false;

      if (this.queuedPreview && this.activeDocumentId) {
        this.queuedPreview = false;
        this.startPreview(this.activeDocumentId);
      }
    });
  }

  private schedulePreview(documentId: string): void {
    if (this.previewTimer !== null) {
      clearTimeout(this.previewTimer);
    }

    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null;
      this.startPreview(documentId);
    }, 120);
  }

  private handleRotationChange(value: string): void {
    const degrees = Number.parseFloat(value);

    if (Number.isNaN(degrees)) {
      return;
    }

    this.rotationNumber.value = `${degrees}`;
    this.currentRotationPreview = degrees;
    this.rotationPreviewing = true;
    this.canvasElement.style.transform = `rotate(${degrees}deg)`;
    this.renderSidebar();
  }

  private applyRotationFromPreview(): void {
    if (!this.rotationPreviewing) {
      return;
    }

    const activeDocument = this.getActiveDocumentInternal();
    if (!activeDocument) {
      return;
    }

    const degrees = Number.parseFloat(this.rotationNumber.value);
    if (Number.isNaN(degrees)) {
      return;
    }

    activeDocument.operations = setTrailingRotationOperation(activeDocument.operations, degrees);
    activeDocument.dirty = true;
    this.rotationPreviewing = false;
    this.currentRotationPreview = degrees;
    this.canvasElement.style.transform = '';
    this.schedulePreview(activeDocument.id);
    this.drawOverlay();
    this.renderSidebar();
    this.render();
  }

  private handlePointerDown(event: PointerEvent): void {
    const activeDocument = this.getActiveDocumentInternal();

    if (!activeDocument || !activeDocument.previewBitmap || this.canvasStackElement.hidden) {
      return;
    }

    if (this.mode === 'rotate') {
      this.rotationDrag = {
        startX: event.clientX,
        startAngle: getCurrentRotation(activeDocument.operations)
      };

      this.currentRotationPreview = getCurrentRotation(activeDocument.operations);
      this.canvasElement.style.transformOrigin = 'center center';
      this.overlayElement.setPointerCapture(event.pointerId);
      return;
    }

    if (this.mode === 'crop') {
      const point = this.getCanvasPoint(event);
      this.cropDraft = {
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y
      };
      this.cropReady = false;
      this.overlayElement.setPointerCapture(event.pointerId);
      this.drawOverlay();
      this.renderSidebar();
      return;
    }
  }

  private handlePointerMove(event: PointerEvent): void {
    const activeDocument = this.getActiveDocumentInternal();

    if (this.mode === 'rotate' && this.rotationDrag && activeDocument) {
      const delta = (event.clientX - this.rotationDrag.startX) * 0.7;
      const angle = Math.max(-359, Math.min(359, this.rotationDrag.startAngle + delta));
      this.rotationNumber.value = `${angle}`;
      this.currentRotationPreview = angle;

      this.canvasElement.style.transform = `rotate(${angle}deg)`;

      this.drawOverlay();
      this.renderSidebar();
      return;
    }

    if (this.mode === 'crop' && this.cropDraft && !this.cropReady) {
      const point = this.getCanvasPoint(event);
      this.cropDraft.currentX = point.x;
      this.cropDraft.currentY = point.y;
      this.drawOverlay();
    }
  }

  private handlePointerUp(): void {
    if (this.mode === 'rotate') {
      const activeDocument = this.getActiveDocumentInternal();

      if (activeDocument && this.rotationDrag && !Number.isNaN(this.currentRotationPreview)) {
        activeDocument.operations = setTrailingRotationOperation(activeDocument.operations, this.currentRotationPreview);
        activeDocument.dirty = true;
        this.schedulePreview(activeDocument.id);
      }

      this.rotationDrag = null;
      this.drawOverlay();
      this.render();
      return;
    }

    if (this.mode === 'crop') {
      if (this.cropDraft && !this.cropReady) {
        const rect = normalizeDraftRect(this.cropDraft);
        if (rect.width > 4 && rect.height > 4) {
          this.cropReady = true;
          this.statusTextElement.textContent = 'Crop area selected. Click Confirm or press Enter to apply, Escape to cancel.';
        } else {
          this.cropDraft = null;
        }
        this.drawOverlay();
        this.renderSidebar();
      }
      return;
    }
  }

  private handleWheel(event: WheelEvent): void {
    const activeDocument = this.getActiveDocumentInternal();
    if (!activeDocument?.previewBitmap || this.canvasStackElement.hidden) return;
    if (this.cropDraft || this.rotationDrag) return;

    event.preventDefault();

    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.max(this.zoomMin, Math.min(this.zoomMax, this.zoomLevel * factor));

    if (Math.abs(newZoom - this.zoomLevel) < 1e-9) return;

    const pane = this.dropzoneElement;
    const paneRect = pane.getBoundingClientRect();
    const mouseInPaneX = event.clientX - paneRect.left;
    const mouseInPaneY = event.clientY - paneRect.top;
    const oldScrollLeft = pane.scrollLeft;
    const oldScrollTop = pane.scrollTop;
    const ratio = newZoom / this.zoomLevel;

    this.zoomLevel = newZoom;

    const displayWidth = activeDocument.previewWidth * this.zoomLevel;
    const displayHeight = activeDocument.previewHeight * this.zoomLevel;
    this.canvasStackElement.style.width = `${displayWidth}px`;
    this.canvasStackElement.style.height = `${displayHeight}px`;
    this.canvasElement.style.width = `${displayWidth}px`;
    this.canvasElement.style.height = `${displayHeight}px`;
    this.overlayElement.style.width = `${displayWidth}px`;
    this.overlayElement.style.height = `${displayHeight}px`;

    pane.scrollLeft = (oldScrollLeft + mouseInPaneX) * ratio - mouseInPaneX;
    pane.scrollTop = (oldScrollTop + mouseInPaneY) * ratio - mouseInPaneY;

    this.drawOverlay();
  }

  private applyCrop(): void {    const documentRecord = this.getActiveDocumentInternal();

    if (!documentRecord || !this.cropDraft || documentRecord.previewWidth === 0 || documentRecord.previewHeight === 0) {
      return;
    }

    const previewRect = normalizeDraftRect(this.cropDraft);
    const rect: CropRect = {
      x: previewRect.x * (documentRecord.renderedWidth / documentRecord.previewWidth),
      y: previewRect.y * (documentRecord.renderedHeight / documentRecord.previewHeight),
      width: previewRect.width * (documentRecord.renderedWidth / documentRecord.previewWidth),
      height: previewRect.height * (documentRecord.renderedHeight / documentRecord.previewHeight)
    };

    documentRecord.operations = appendCropOperation(
      documentRecord.operations,
      rect,
      documentRecord.renderedWidth,
      documentRecord.renderedHeight
    );
    documentRecord.dirty = true;
    this.cropDraft = null;
    this.cropReady = false;
    this.schedulePreview(documentRecord.id);
    this.render();
  }

  private renderModal(): void {
    // Save panel now lives in sidebar; modal is legacy no-op.
  }

  private handleSaveSettingsChange(): void {
    const documentRecord = this.getActiveDocumentInternal();

    if (!documentRecord) {
      return;
    }

    const nextFormat = this.formatSelect.value as ExportFormat;
    const quality = Number.parseFloat(this.qualityInput.value);
    const scale = Number.parseFloat(this.scaleInput.value);
    const longEdge = this.longEdgeInput.value.trim() ? Number.parseInt(this.longEdgeInput.value, 10) : null;

    const updated = updateExportSettings(documentRecord, {
      format: nextFormat,
      quality,
      scale,
      longEdge
    });

    this.replaceDocument(updated);
    const nextDocument = this.getDocumentById(updated.id);

    if (!nextDocument) {
      return;
    }

    this.syncSaveForm(nextDocument);
    this.render();
  }

  private async performSave(): Promise<void> {
    const documentRecord = this.getActiveDocumentInternal();

    if (!documentRecord) {
      return;
    }

    this.saveConfirmButton.disabled = true;

    try {
      const exported = await this.worker.exportDocument(
        documentRecord.id,
        documentRecord.name,
        documentRecord.operations,
        documentRecord.exportSettings
      );
      const downloadName = getDownloadFileName(documentRecord.name, exported.format);
      triggerDownload(exported.blob, downloadName);
      documentRecord.dirty = false;
      this.statusTextElement.textContent = `Saved ${downloadName} (${exported.outputWidth} x ${exported.outputHeight}).`;
      this.render();
    } catch (error) {
      this.pushError(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      this.saveConfirmButton.disabled = false;
    }
  }

  private render(): void {
    this.renderTabs();
    this.renderCanvas();
    this.renderSidebar();
    this.renderStatus();
  }

  private renderTabs(): void {
    if (this.documents.length === 0) {
      this.tabsElement.innerHTML = '<span class="grey-editor__hint">Open scans or drop them onto the canvas area.</span>';
      return;
    }

    this.tabsElement.innerHTML = this.documents
      .map((documentRecord) => {
        const classes = ['grey-editor__tab'];
        if (documentRecord.id === this.activeDocumentId) {
          classes.push('is-active');
        }

        return `
          <div class="${classes.join(' ')}" data-role="tab" data-document-id="${escapeHtml(documentRecord.id)}">
            <span class="grey-editor__tab-name">${escapeHtml(documentRecord.name)}</span>
            <button class="grey-editor__tab-close" data-role="close-tab" data-document-id="${escapeHtml(documentRecord.id)}" type="button">×</button>
          </div>
        `;
      })
      .join('');
  }

  private renderCanvas(): void {
    const activeDocument = this.getActiveDocumentInternal();

    if (!activeDocument || !activeDocument.previewBitmap) {
      this.canvasStackElement.hidden = true;
      this.emptyElement.hidden = false;
      this.emptyElement.innerHTML = `
        <h3>Drop scans here</h3>
        <p>
          Browse for JPEG, PNG, or TIFF files, or drop a folder of scans. Grey keeps editing local,
          with live preview for rotation, crop, and export settings.
        </p>
        <button class="grey-editor__button" data-role="open" type="button">Open files</button>
      `;
      this.clearCanvas();
      return;
    }

    this.canvasStackElement.hidden = false;
    this.emptyElement.hidden = true;
    const displayWidth = activeDocument.previewWidth * this.zoomLevel;
    const displayHeight = activeDocument.previewHeight * this.zoomLevel;
    this.canvasStackElement.style.width = `${displayWidth}px`;
    this.canvasStackElement.style.height = `${displayHeight}px`;
    this.canvasElement.width = activeDocument.previewWidth;
    this.canvasElement.height = activeDocument.previewHeight;
    this.canvasElement.style.width = `${displayWidth}px`;
    this.canvasElement.style.height = `${displayHeight}px`;
    this.overlayElement.width = activeDocument.previewWidth;
    this.overlayElement.height = activeDocument.previewHeight;
    this.overlayElement.style.width = `${displayWidth}px`;
    this.overlayElement.style.height = `${displayHeight}px`;

    const context = this.canvasElement.getContext('2d');

    if (!context) {
      this.pushError('Canvas 2D context is unavailable.');
      return;
    }

    context.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    context.drawImage(activeDocument.previewBitmap, 0, 0, activeDocument.previewWidth, activeDocument.previewHeight);
    this.drawOverlay();
  }

  private renderSidebar(): void {
    const activeDocument = this.getActiveDocumentInternal();
    const hasDocument = Boolean(activeDocument);

    this.editFieldsetElement.disabled = !hasDocument;
    this.saveFieldsetElement.disabled = !hasDocument;

    this.modeRotateButton.classList.toggle('is-active', this.mode === 'rotate');
    this.modeCropButton.classList.toggle('is-active', this.mode === 'crop');

    this.rotateControlsElement.hidden = this.mode !== 'rotate';
    this.cropControlsElement.hidden = this.mode !== 'crop';

    this.rotationGridCheckbox.checked = this.rotationGrid;
    this.cropConfirmButton.disabled = !this.cropReady;

    if (!activeDocument) {
      this.rotationNumber.value = '0';
      return;
    }

    if (!this.rotationPreviewing && !this.rotationDrag) {
      const rotation = getCurrentRotation(activeDocument.operations);
      this.rotationNumber.value = `${rotation}`;
    }

    this.syncSaveForm(activeDocument);
  }

  private syncSaveForm(documentRecord: InternalDocument): void {
    this.formatSelect.value = documentRecord.exportSettings.format;

    this.qualityInput.value = `${documentRecord.exportSettings.quality}`;
    this.scaleInput.value = `${documentRecord.exportSettings.scale}`;
    this.longEdgeInput.value = documentRecord.exportSettings.longEdge ? `${documentRecord.exportSettings.longEdge}` : '';
    this.scaleInput.disabled = Boolean(documentRecord.exportSettings.longEdge);
  }

  private renderStatus(): void {
    const activeDocument = this.getActiveDocumentInternal();

    if (!activeDocument) {
      this.statusTextElement.textContent = 'Ready for local files. Nothing is uploaded anywhere.';
    } else if (!this.statusTextElement.textContent || this.statusTextElement.textContent.startsWith('Rendering ')) {
      this.statusTextElement.textContent = `${activeDocument.name}: ${activeDocument.renderedWidth} x ${activeDocument.renderedHeight}${activeDocument.dirty ? ' • unsaved changes' : ''}`;
    }

    this.errorElement.innerHTML = this.errors.map((message) => `<span class="grey-editor__error-chip">${escapeHtml(message)}</span>`).join('');
  }

  private drawOverlay(): void {
    const context = this.overlayElement.getContext('2d');

    if (!context) {
      return;
    }

    context.clearRect(0, 0, this.overlayElement.width, this.overlayElement.height);

    if (this.mode === 'rotate' && this.rotationGrid) {
      const z = this.zoomLevel;
      const spacing = 24 / z;
      const width = this.overlayElement.width;
      const height = this.overlayElement.height;

      context.save();
      context.lineWidth = 1.2 / z;
      context.setLineDash([6 / z, 5 / z]);
      context.strokeStyle = 'rgba(0, 0, 0, 0.42)';

      for (let x = 0; x <= width; x += spacing) {
        context.beginPath();
        context.moveTo(x + 0.5, 0);
        context.lineTo(x + 0.5, height);
        context.stroke();
      }

      for (let y = 0; y <= height; y += spacing) {
        context.beginPath();
        context.moveTo(0, y + 0.5);
        context.lineTo(width, y + 0.5);
        context.stroke();
      }

      context.setLineDash([]);
      context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      context.lineWidth = 2.2 / z;
      const centerX = width / 2;
      const centerY = height / 2;
      context.beginPath();
      context.moveTo(centerX, 0);
      context.lineTo(centerX, height);
      context.moveTo(0, centerY);
      context.lineTo(width, centerY);
      context.stroke();

      context.fillStyle = 'rgba(255, 255, 255, 0.95)';
      context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      context.lineWidth = 1 / z;
      context.beginPath();
      context.arc(centerX, centerY, 4 / z, 0, Math.PI * 2);
      context.fill();
      context.stroke();

      context.restore();
    }

    if (this.mode === 'crop' && this.cropDraft) {
      const rect = normalizeDraftRect(this.cropDraft);
      const w = this.overlayElement.width;
      const h = this.overlayElement.height;
      context.save();

      if (this.cropReady) {
        // Photoshop-style: fill everything dark, then cut out the selected area
        context.fillStyle = 'rgba(0, 0, 0, 0.55)';
        context.fillRect(0, 0, w, h);
        context.globalCompositeOperation = 'destination-out';
        context.fillStyle = 'rgba(0, 0, 0, 1)';
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        context.lineWidth = 1.5;
        context.setLineDash([]);
        context.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
      } else {
        // Drafting: dashed selection outline only
        context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        context.lineWidth = 1.5;
        context.setLineDash([8, 5]);
        context.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
      }

      context.restore();
    }
  }

  private clearCanvas(): void {
    this.canvasElement.width = 0;
    this.canvasElement.height = 0;
    this.overlayElement.width = 0;
    this.overlayElement.height = 0;
  }

  private getCanvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.overlayElement.getBoundingClientRect();

    return {
      x: (event.clientX - rect.left) / this.zoomLevel,
      y: (event.clientY - rect.top) / this.zoomLevel
    };
  }

  private pushError(message: string): void {
    this.errors = [message, ...this.errors].slice(0, 4);
    this.renderStatus();
  }

  private getActiveDocumentInternal(): InternalDocument | null {
    return this.activeDocumentId ? this.documents.find((documentRecord) => documentRecord.id === this.activeDocumentId) ?? null : null;
  }

  private getDocumentById(documentId: string): InternalDocument | null {
    return this.documents.find((documentRecord) => documentRecord.id === documentId) ?? null;
  }

  private replaceDocument(documentRecord: GreyDocumentRecord): void {
    const index = this.documents.findIndex((candidate) => candidate.id === documentRecord.id);

    if (index === -1) {
      return;
    }

    const current = this.documents[index];

    if (!current) {
      return;
    }

    this.documents[index] = {
      ...current,
      ...documentRecord
    };
  }

  private renderShell(): string {
    return `
      <div class="grey-editor__toolbar">
        <div class="grey-editor__brand">
          <div class="grey-editor__brand-title">Grey Editor</div>
          <div class="grey-editor__brand-subtitle">Local-first scan cleanup for skew, crop, and export.</div>
        </div>
        <input data-role="file-input" hidden type="file" />
        <input data-role="folder-input" hidden type="file" />
      </div>
      <div class="grey-editor__tabs" data-role="tabs"></div>
      <div class="grey-editor__edit-toolbar">
        <fieldset class="grey-editor__edit-fieldset" data-role="edit-fieldset">
          <div class="grey-editor__edit-group">
            <button class="grey-editor__button" data-role="mode-rotate" type="button">Rotate</button>
            <button class="grey-editor__button" data-role="mode-crop" type="button">Crop</button>
          </div>
          <div class="grey-editor__edit-group" data-role="rotate-controls">
            <label class="grey-editor__label" for="grey-rotation-number">Angle</label>
            <input class="grey-editor__input grey-editor__input--narrow" data-role="rotation-number" id="grey-rotation-number" max="359" min="-359" step="0.5" type="number" value="0" />
            <label class="grey-editor__checkbox-label">
              <input class="grey-editor__checkbox" data-role="rotation-grid-checkbox" type="checkbox" checked /> Grid
            </label>
            <button class="grey-editor__button" data-role="reset-angle" type="button">Reset angle</button>
          </div>
          <div class="grey-editor__edit-group" data-role="crop-controls" hidden>
            <button class="grey-editor__button grey-editor__button--accent" data-role="crop-confirm" type="button" disabled>Confirm crop</button>
            <button class="grey-editor__button" data-role="reset-crop" type="button">Reset crop</button>
          </div>
        </fieldset>
      </div>
      <div class="grey-editor__workspace">
        <div class="grey-editor__canvas-pane grey-editor__dropzone" data-role="dropzone">
          <div class="grey-editor__empty" data-role="empty"></div>
          <div class="grey-editor__canvas-stack" data-role="canvas-stack" hidden>
            <canvas class="grey-editor__canvas" data-role="canvas"></canvas>
            <canvas class="grey-editor__overlay" data-role="overlay"></canvas>
          </div>
        </div>
        <aside class="grey-editor__sidebar">
          <section class="grey-editor__section">
            <h3 class="grey-editor__section-title">Save</h3>
            <fieldset class="grey-editor__section-fieldset" data-role="save-fieldset">
              <div class="grey-editor__field-row">
                <label class="grey-editor__field">
                  <span>File type</span>
                  <select class="grey-editor__select" data-role="format-select">
                    <option value="jpeg">JPEG</option>
                    <option value="png" disabled>PNG</option>
                    <option value="tiff" disabled>TIFF</option>
                  </select>
                </label>
              </div>
              <div class="grey-editor__field-row">
                <label class="grey-editor__field">
                  <span>Compression / quality</span>
                  <input class="grey-editor__input" data-role="quality-input" max="1" min="0.1" step="0.01" type="number" value="0.75" />
                </label>
                <label class="grey-editor__field">
                  <span>Scale factor</span>
                  <input class="grey-editor__input" data-role="scale-input" min="0.05" step="0.05" type="number" value="1" />
                </label>
              </div>
              <label class="grey-editor__field">
                <span>Long edge in pixels</span>
                <input class="grey-editor__input" data-role="long-edge-input" min="1" step="1" type="number" value="" />
              </label>
              <p class="grey-editor__hint">If long edge is set, Grey derives the scale factor from that value.</p>
              <div class="grey-editor__field-row">
                <button class="grey-editor__button grey-editor__button--accent" data-role="save-confirm" type="button">Download</button>
              </div>
            </fieldset>
          </section>
        </aside>
      </div>
      <div class="grey-editor__status">
        <div class="grey-editor__status-text" data-role="status-text"></div>
        <div class="grey-editor__errors" data-role="errors"></div>
      </div>
    `;
  }

  private requireElement<TElement extends HTMLElement>(selector: string): TElement {
    const element = this.root.querySelector<TElement>(selector);

    if (!element) {
      throw new Error(`Missing required element: ${selector}`);
    }

    return element;
  }

  private listen<TTarget extends EventTarget>(target: TTarget, type: string, listener: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, listener);
    this.cleanupCallbacks.push(() => target.removeEventListener(type, listener));
  }
}

function resolveTarget(target: string | HTMLElement): HTMLElement {
  if (typeof target === 'string') {
    const element = document.querySelector<HTMLElement>(target);

    if (!element) {
      throw new Error(`Target element not found: ${target}`);
    }

    return element;
  }

  return target;
}

function createDocumentId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `grey-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getCurrentRotation(operations: Operation[]): number {
  for (let index = operations.length - 1; index >= 0; index -= 1) {
    const operation = operations[index];

    if (operation?.kind === 'rotate') {
      return operation.degrees;
    }
  }

  return 0;
}

function normalizeDraftRect(draft: CropDraftState): CropRect {
  return {
    x: Math.min(draft.startX, draft.currentX),
    y: Math.min(draft.startY, draft.currentY),
    width: Math.max(1, Math.abs(draft.currentX - draft.startX)),
    height: Math.max(1, Math.abs(draft.currentY - draft.startY))
  };
}

function triggerDownload(blob: Blob, fileName: string): void {
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return character;
    }
  });
}

async function collectDroppedFiles(dataTransfer: DataTransfer | null): Promise<File[]> {
  if (!dataTransfer) {
    return [];
  }

  const entries = Array.from(dataTransfer.items)
    .map((item) => (item as DataTransferItem & { webkitGetAsEntry?: () => WebkitEntry | null }).webkitGetAsEntry?.() ?? null)
    .filter(Boolean) as WebkitEntry[];

  if (entries.length === 0) {
    return Array.from(dataTransfer.files);
  }

  const nestedFiles = await Promise.all(entries.map((entry) => readWebkitEntry(entry)));
  return nestedFiles.flat();
}

async function readWebkitEntry(entry: WebkitEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise<File[]>((resolve, reject) => {
      (entry as WebkitFileEntry).file((file) => resolve([file]), reject);
    });
  }

  if (!entry.isDirectory) {
    return [];
  }

  const directoryReader = (entry as WebkitDirectoryEntry).createReader();
  const entries = await readAllWebkitEntries(directoryReader);
  const nestedFiles = await Promise.all(entries.map((childEntry) => readWebkitEntry(childEntry)));
  return nestedFiles.flat();
}

async function readAllWebkitEntries(reader: WebkitDirectoryReader): Promise<WebkitEntry[]> {
  const entries: WebkitEntry[] = [];

  while (true) {
    const batch = await new Promise<WebkitEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

    if (batch.length === 0) {
      return entries;
    }

    entries.push(...batch);
  }
}

async function collectFilesFromDirectoryHandle(handle: OpenDirectoryHandle): Promise<File[]> {
  const files: File[] = [];

  for await (const entry of iterateDirectoryEntries(handle)) {
    if (entry.kind === 'file' && entry.getFile) {
      files.push(await entry.getFile());
      continue;
    }

    if (entry.kind === 'directory' && entry.values) {
      files.push(...(await collectFilesFromDirectoryHandle(entry as OpenDirectoryHandle)));
    }
  }

  return files;
}

async function* iterateDirectoryEntries(handle: OpenDirectoryHandle): AsyncIterable<DirectoryEntryLike> {
  if ('values' in handle && typeof handle.values === 'function') {
    yield* handle.values();
    return;
  }

  if ('entries' in handle && typeof handle.entries === 'function') {
    for await (const [, entry] of handle.entries()) {
      yield entry as unknown as DirectoryEntryLike;
    }
  }
}

interface WebkitEntry {
  isFile: boolean;
  isDirectory: boolean;
}

interface WebkitFileEntry extends WebkitEntry {
  file: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
}

interface WebkitDirectoryEntry extends WebkitEntry {
  createReader: () => WebkitDirectoryReader;
}

interface WebkitDirectoryReader {
  readEntries: (
    success: (entries: WebkitEntry[]) => void,
    error?: (error: DOMException) => void
  ) => void;
}
