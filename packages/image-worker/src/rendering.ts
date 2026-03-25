import { clamp, getFormatMimeType, isTiffFile, normalizeExportSettings, scaleDimensions, calculateRotatedBounds, normalizeCropRect } from '@grey/editor-core';
import type { ExportSettings, LevelsInput, Operation } from '@grey/shared-types';
import { encode as encodeJpeg } from '@jsquash/jpeg';
import { init as initJpegEncoder } from '@jsquash/jpeg/encode';
import mozjpegEncoderWasmUrl from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url';
import * as UTIF from 'utif';

const MOZJPEG_GRAYSCALE_COLOR_SPACE = 1;
let jpegEncoderInitPromise: Promise<void> | null = null;

export interface LoadedSource {
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

export interface PreviewRenderResult {
  bitmap: ImageBitmap;
  renderedWidth: number;
  renderedHeight: number;
  previewWidth: number;
  previewHeight: number;
}

export interface ExportRenderResult {
  blob: Blob;
  width: number;
  height: number;
}

export async function decodeImageBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType: string
): Promise<LoadedSource> {
  if (isTiffFile(fileName, mimeType)) {
    return decodeTiffBuffer(buffer);
  }

  const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
  const bitmap = await createImageBitmap(blob);
  return {
    bitmap,
    width: bitmap.width,
    height: bitmap.height
  };
}

export async function renderPreview(
  source: LoadedSource,
  operations: Operation[],
  previewMaxEdge: number
): Promise<PreviewRenderResult> {
  const renderedCanvas = renderOperations(source, operations);
  const previewCanvas = scaleCanvasToEdge(renderedCanvas, previewMaxEdge);
  const bitmap = await createImageBitmap(previewCanvas);

  return {
    bitmap,
    renderedWidth: renderedCanvas.width,
    renderedHeight: renderedCanvas.height,
    previewWidth: previewCanvas.width,
    previewHeight: previewCanvas.height
  };
}

export async function exportDocument(
  source: LoadedSource,
  operations: Operation[],
  settings: ExportSettings
): Promise<ExportRenderResult> {
  const normalizedSettings = normalizeExportSettings(settings);
  let canvas = renderOperations(source, operations);
  const scaled = scaleDimensions(canvas.width, canvas.height, normalizedSettings);

  if (scaled.width !== canvas.width || scaled.height !== canvas.height) {
    canvas = scaleCanvas(canvas, scaled.width, scaled.height);
  }

  canvas = applyColorSpace(canvas, normalizedSettings);

  return {
    blob: await encodeCanvas(canvas, normalizedSettings),
    width: canvas.width,
    height: canvas.height
  };
}

function decodeTiffBuffer(buffer: ArrayBuffer): LoadedSource {
  const ifds = UTIF.decode(buffer);
  UTIF.decodeImages(buffer, ifds);
  const first = ifds[0];

  if (!first) {
    throw new Error('Unable to decode TIFF image.');
  }

  const width = Number(first.width ?? first.t256?.[0] ?? 0);
  const height = Number(first.height ?? first.t257?.[0] ?? 0);
  const rgba = UTIF.toRGBA8(first);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context is unavailable in worker.');
  }

  const tiffPixels = new Uint8ClampedArray(rgba.length);
  tiffPixels.set(rgba);
  context.putImageData(new ImageData(tiffPixels, width, height), 0, 0);

  return {
    bitmap: canvas.transferToImageBitmap(),
    width,
    height
  };
}

function renderOperations(source: LoadedSource, operations: Operation[]): OffscreenCanvas {
  let canvas = drawBitmapToCanvas(source.bitmap, source.width, source.height);

  for (const operation of operations) {
    if (operation.kind === 'rotate') {
      canvas = rotateCanvas(canvas, operation.degrees);
      continue;
    }

    if (operation.kind === 'crop') {
      canvas = cropCanvas(canvas, operation.rect);
      continue;
    }

    if (operation.kind === 'level') {
      canvas = applyLevels(canvas, operation.input);
    }
  }

  return canvas;
}

function drawBitmapToCanvas(bitmap: ImageBitmap, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const context = get2DContext(canvas);
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function rotateCanvas(sourceCanvas: OffscreenCanvas, degrees: number): OffscreenCanvas {
  const normalizedDegrees = ((degrees % 360) + 360) % 360;

  if (normalizedDegrees === 0) {
    return cloneCanvas(sourceCanvas);
  }

  const bounds = calculateRotatedBounds(sourceCanvas.width, sourceCanvas.height, degrees);
  const canvas = new OffscreenCanvas(bounds.width, bounds.height);
  const context = get2DContext(canvas);

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, bounds.width, bounds.height);

  context.translate(bounds.width / 2, bounds.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);

  return canvas;
}

function cropCanvas(sourceCanvas: OffscreenCanvas, rect: { x: number; y: number; width: number; height: number }): OffscreenCanvas {
  const normalized = normalizeCropRect(rect);
  const canvas = new OffscreenCanvas(normalized.width, normalized.height);
  const context = get2DContext(canvas);

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, normalized.width, normalized.height);

  const sourceX = Math.max(0, normalized.x);
  const sourceY = Math.max(0, normalized.y);
  const sourceRight = Math.min(sourceCanvas.width, normalized.x + normalized.width);
  const sourceBottom = Math.min(sourceCanvas.height, normalized.y + normalized.height);
  const sourceWidth = Math.max(0, sourceRight - sourceX);
  const sourceHeight = Math.max(0, sourceBottom - sourceY);

  if (sourceWidth === 0 || sourceHeight === 0) {
    return canvas;
  }

  const destinationX = sourceX - normalized.x;
  const destinationY = sourceY - normalized.y;

  context.drawImage(
    sourceCanvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    destinationX,
    destinationY,
    sourceWidth,
    sourceHeight
  );

  return canvas;
}

function scaleCanvasToEdge(sourceCanvas: OffscreenCanvas, maxEdge: number): OffscreenCanvas {
  if (Math.max(sourceCanvas.width, sourceCanvas.height) <= maxEdge) {
    return cloneCanvas(sourceCanvas);
  }

  const scale = maxEdge / Math.max(sourceCanvas.width, sourceCanvas.height);
  return scaleCanvas(sourceCanvas, Math.max(1, Math.round(sourceCanvas.width * scale)), Math.max(1, Math.round(sourceCanvas.height * scale)));
}

function scaleCanvas(sourceCanvas: OffscreenCanvas, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const context = get2DContext(canvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(sourceCanvas, 0, 0, width, height);
  return canvas;
}

function cloneCanvas(sourceCanvas: OffscreenCanvas): OffscreenCanvas {
  const canvas = new OffscreenCanvas(sourceCanvas.width, sourceCanvas.height);
  const context = get2DContext(canvas);
  context.drawImage(sourceCanvas, 0, 0);
  return canvas;
}

function applyLevels(sourceCanvas: OffscreenCanvas, input: LevelsInput): OffscreenCanvas {
  const canvas = cloneCanvas(sourceCanvas);
  const context = get2DContext(canvas);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const normalized = normalizeLevelsInput(input);
  const span = Math.max(1, normalized.whitePoint - normalized.blackPoint);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = remapLevelValue(data[index] ?? 0, normalized.blackPoint, span, normalized.gamma);
    data[index + 1] = remapLevelValue(data[index + 1] ?? 0, normalized.blackPoint, span, normalized.gamma);
    data[index + 2] = remapLevelValue(data[index + 2] ?? 0, normalized.blackPoint, span, normalized.gamma);
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function remapLevelValue(value: number, blackPoint: number, span: number, gamma: number): number {
  const normalized = clamp((value - blackPoint) / span, 0, 1);
  const gammaAdjusted = Math.pow(normalized, gamma);
  return Math.round(gammaAdjusted * 255);
}

function normalizeLevelsInput(input: LevelsInput): LevelsInput {
  const blackPoint = Math.round(clamp(input.blackPoint, 0, 254));
  const whitePoint = Math.round(clamp(input.whitePoint, blackPoint + 1, 255));
  const gamma = Math.round(clamp(input.gamma, 0.1, 9.99) * 100) / 100;

  return {
    blackPoint,
    whitePoint,
    gamma
  };
}

function applyColorSpace(sourceCanvas: OffscreenCanvas, settings: ExportSettings): OffscreenCanvas {
  const canvas = cloneCanvas(sourceCanvas);
  const context = get2DContext(canvas);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const grayscale = Math.round((red * 0.2126) + (green * 0.7152) + (blue * 0.0722));
    data[index] = grayscale;
    data[index + 1] = grayscale;
    data[index + 2] = grayscale;
    data[index + 3] = 255; // force opaque for simpler grayscale output
  }

  context.putImageData(imageData, 0, 0);

  if (settings.format === 'jpeg') {
    const flattened = new OffscreenCanvas(canvas.width, canvas.height);
    const flattenedContext = get2DContext(flattened);
    flattenedContext.fillStyle = '#ffffff';
    flattenedContext.fillRect(0, 0, flattened.width, flattened.height);
    flattenedContext.drawImage(canvas, 0, 0);
    return flattened;
  }

  return canvas;
}

async function encodeCanvas(canvas: OffscreenCanvas, settings: ExportSettings): Promise<Blob> {
  if (settings.format === 'tiff') {
    const context = get2DContext(canvas);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const encoded = UTIF.encodeImage(rgba, canvas.width, canvas.height, {});
    const bytes = encoded instanceof Uint8Array ? new Uint8Array(encoded) : new Uint8Array(encoded);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new Blob([arrayBuffer], { type: 'image/tiff' });
  }

  if (settings.format === 'jpeg') {
    await ensureJpegEncoderInitialized();

    const context = get2DContext(canvas);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const arrayBuffer = await encodeJpeg(imageData, {
      quality: Math.max(1, Math.round(settings.quality * 100)),
      color_space: MOZJPEG_GRAYSCALE_COLOR_SPACE
    });

    return new Blob([arrayBuffer], { type: getFormatMimeType(settings.format) });
  }

  if (settings.format === 'png') {
    return canvas.convertToBlob({
      type: getFormatMimeType(settings.format)
    });
  }

  throw new Error(`Unsupported export format: ${settings.format}`);
}

function get2DContext(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  return context;
}

async function ensureJpegEncoderInitialized(): Promise<void> {
  if (!jpegEncoderInitPromise) {
    jpegEncoderInitPromise = initJpegEncoder({
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? mozjpegEncoderWasmUrl : `${prefix}${path}`)
    });
  }

  await jpegEncoderInitPromise;
}
