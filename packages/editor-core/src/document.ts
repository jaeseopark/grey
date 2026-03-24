import type { CropRect, ExportFormat, ExportSettings, GreyDocumentRecord, LevelsInput, Operation } from '@grey/shared-types';
import { clamp, normalizeCropRect } from './math';

export function createDefaultExportSettings(format: ExportFormat = 'jpeg'): ExportSettings {
  return {
    format,
    quality: 0.75,
    scale: 1,
    longEdge: null
  };
}

export function createDocumentRecord(input: {
  id: string;
  name: string;
  sourceType: string;
  sourceWidth: number;
  sourceHeight: number;
}): GreyDocumentRecord {
  return {
    id: input.id,
    name: input.name,
    sourceType: input.sourceType,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    operations: [],
    exportSettings: createDefaultExportSettings(),
    dirty: false
  };
}

export function setTrailingRotationOperation(operations: Operation[], degrees: number): Operation[] {
  const normalizedDegrees = Math.max(-359, Math.min(359, degrees));
  const next = [...operations];
  const trailing = next.at(-1);

  if (trailing?.kind === 'rotate') {
    next[next.length - 1] = { kind: 'rotate', degrees: normalizedDegrees };
    return next;
  }

  return [...next, { kind: 'rotate', degrees: normalizedDegrees }];
}

export function normalizeLevelsInput(input: LevelsInput): LevelsInput {
  const blackPoint = Math.round(clamp(input.blackPoint, 0, 254));
  const whitePoint = Math.round(clamp(input.whitePoint, blackPoint + 1, 255));
  const gamma = Math.round(clamp(input.gamma, 0.1, 9.99) * 100) / 100;

  return {
    blackPoint,
    whitePoint,
    gamma
  };
}

export function setTrailingLevelOperation(operations: Operation[], input: LevelsInput): Operation[] {
  const normalizedInput = normalizeLevelsInput(input);
  const next = [...operations];
  const trailing = next.at(-1);

  if (trailing?.kind === 'level') {
    next[next.length - 1] = { kind: 'level', input: normalizedInput };
    return next;
  }

  return [...next, { kind: 'level', input: normalizedInput }];
}

export function appendCropOperation(
  operations: Operation[],
  rect: CropRect,
  _currentWidth: number,
  _currentHeight: number
): Operation[] {
  return [...operations, { kind: 'crop', rect: normalizeCropRect(rect) }];
}

export function updateExportSettings(document: GreyDocumentRecord, settings: Partial<ExportSettings>): GreyDocumentRecord {
  return {
    ...document,
    exportSettings: normalizeExportSettings({ ...document.exportSettings, ...settings })
  };
}

export function normalizeExportSettings(settings: ExportSettings): ExportSettings {
  const format = settings.format;

  return {
    format,
    quality: Math.min(Math.max(settings.quality || 0.92, 0.1), 1),
    scale: Math.min(Math.max(settings.scale || 1, 0.05), 8),
    longEdge: settings.longEdge && settings.longEdge > 0 ? Math.round(settings.longEdge) : null
  };
}

export function getFormatMimeType(format: ExportFormat): string {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'tiff':
      return 'image/tiff';
    default:
      return 'application/octet-stream';
  }
}

export function getExtensionForFormat(format: ExportFormat): string {
  switch (format) {
    case 'jpeg':
      return 'jpg';
    case 'png':
      return 'png';
    case 'tiff':
      return 'tiff';
    default:
      return 'bin';
  }
}

export function getDownloadFileName(inputName: string, format: ExportFormat): string {
  const baseName = inputName.replace(/\.[^.]+$/, '');
  return `${baseName || 'scan'}.${getExtensionForFormat(format)}`;
}
