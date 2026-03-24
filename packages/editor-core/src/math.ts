import type { CropRect, ExportSettings } from '@grey/shared-types';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function calculateRotatedBounds(width: number, height: number, degrees: number): {
  width: number;
  height: number;
} {
  const radians = degreesToRadians(degrees);
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));

  return {
    width: Math.max(1, Math.ceil((width * cosine) + (height * sine))),
    height: Math.max(1, Math.ceil((width * sine) + (height * cosine)))
  };
}

export function normalizeCropRect(rect: CropRect, boundsWidth: number, boundsHeight: number): CropRect {
  const x1 = clamp(Math.min(rect.x, rect.x + rect.width), 0, boundsWidth);
  const y1 = clamp(Math.min(rect.y, rect.y + rect.height), 0, boundsHeight);
  const x2 = clamp(Math.max(rect.x, rect.x + rect.width), 0, boundsWidth);
  const y2 = clamp(Math.max(rect.y, rect.y + rect.height), 0, boundsHeight);

  return {
    x: Math.floor(x1),
    y: Math.floor(y1),
    width: Math.max(1, Math.floor(x2 - x1)),
    height: Math.max(1, Math.floor(y2 - y1))
  };
}

export function resolveScale(width: number, height: number, settings: ExportSettings): number {
  if (settings.longEdge && settings.longEdge > 0) {
    return clamp(settings.longEdge / Math.max(width, height), 0.05, 8);
  }

  return clamp(settings.scale || 1, 0.05, 8);
}

export function scaleDimensions(width: number, height: number, settings: ExportSettings): {
  width: number;
  height: number;
  scale: number;
} {
  const scale = resolveScale(width, height, settings);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale
  };
}
