import { describe, expect, it } from 'vitest';
import { calculateRotatedBounds, normalizeCropRect, scaleDimensions } from './math';
import { createDefaultExportSettings } from './document';

describe('calculateRotatedBounds', () => {
  it('keeps axis-aligned bounds at zero degrees', () => {
    expect(calculateRotatedBounds(200, 100, 0)).toEqual({ width: 200, height: 100 });
  });

  it('expands bounds at forty five degrees', () => {
    const bounds = calculateRotatedBounds(200, 100, 45);

    expect(bounds.width).toBeGreaterThan(200);
    expect(bounds.height).toBeGreaterThan(100);
  });
});

describe('scaleDimensions', () => {
  it('uses explicit scale when long edge is empty', () => {
    const settings = createDefaultExportSettings();
    settings.scale = 0.5;

    expect(scaleDimensions(1000, 500, settings)).toEqual({ width: 500, height: 250, scale: 0.5 });
  });

  it('prioritizes long edge when provided', () => {
    const settings = createDefaultExportSettings();
    settings.longEdge = 400;

    expect(scaleDimensions(1000, 500, settings)).toEqual({ width: 400, height: 200, scale: 0.4 });
  });
});

describe('normalizeCropRect', () => {
  it('keeps coordinates outside bounds for canvas expansion', () => {
    expect(normalizeCropRect({ x: -15.2, y: 10.9, width: 130.8, height: 80.4 })).toEqual({
      x: -16,
      y: 10,
      width: 130,
      height: 80
    });
  });

  it('normalizes reverse drag direction', () => {
    expect(normalizeCropRect({ x: 120, y: 80, width: -45, height: -30 })).toEqual({
      x: 75,
      y: 50,
      width: 45,
      height: 30
    });
  });
});
