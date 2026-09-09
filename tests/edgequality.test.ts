import { describe, expect, it } from 'vitest';
import { buildHeightmap } from '../src/core/heightmap.js';
import { sampleLuminance, sampleLuminanceArea, type RasterImage } from '../src/core/image.js';
import { rasterFrom } from './helpers/raster.js';
import { at, testParams } from './helpers/params.js';

const disc = (size: number, radiusPx: number): RasterImage =>
  rasterFrom(size, size, (x, y) => {
    const dx = x + 0.5 - size / 2;
    const dy = y + 0.5 - size / 2;
    const v = Math.hypot(dx, dy) <= radiusPx ? 255 : 0;
    return [v, v, v, 255];
  });

/**
 * How much the mid-height contour wiggles from row to row, in millimetres,
 * with any straight or constantly-curving component removed by taking a third
 * difference. What is left is lattice noise: a boundary pinned to sample centres
 * jitters, one placed between them does not.
 */
function contourWobbleMm(cornerRadiusMm: number): number {
  const size = 600;
  const p = testParams({
    panelWidthMm: 60,
    panelHeightMm: 60,
    columns: 1,
    rows: 1,
    samplePitchMm: 0.5,
    fitMode: 'stretch',
    tileEdgeChamferMm: 0,
    interlockEnabled: false,
    bevelWidthMm: 3,
    cornerRadiusMm,
  });
  const hm = buildHeightmap(disc(size, size * 0.35), p);
  const g = hm.grid;
  const mid = p.baseThicknessMm + p.reliefHeightMm / 2;

  const xs: number[] = [];
  for (let j = Math.round(g.gy * 0.5); j < Math.round(g.gy * 0.85); j++) {
    for (let i = Math.round(g.gx * 0.5); i < g.gx - 1; i++) {
      const a = at(hm.top, j * g.gx + i);
      const b = at(hm.top, j * g.gx + i + 1);
      if ((a - mid) * (b - mid) < 0) {
        xs.push((i + (mid - a) / (b - a)) * g.pitchX);
        break;
      }
    }
  }
  expect(xs.length).toBeGreaterThan(20);
  const x = (k: number): number => xs[k] ?? 0;

  let sum2 = 0;
  let n = 0;
  for (let k = 2; k < xs.length - 1; k++) {
    const d = x(k + 1) - 3 * x(k) + 3 * x(k - 1) - x(k - 2);
    sum2 += d * d;
    n++;
  }
  return Math.sqrt(sum2 / n);
}

describe('curved edges', () => {
  it('places the boundary between samples rather than on the lattice', () => {
    expect(contourWobbleMm(1.2)).toBeLessThan(0.25);
  });

  it('still beats the lattice with the corner pre-blur switched off', () => {
    expect(contourWobbleMm(0)).toBeLessThan(0.45);
  });

  it('does not disturb the plateau or the valley floor', () => {
    const p = testParams({
      panelWidthMm: 60,
      panelHeightMm: 60,
      columns: 1,
      rows: 1,
      samplePitchMm: 0.5,
      fitMode: 'stretch',
      tileEdgeChamferMm: 0,
      interlockEnabled: false,
    });
    const hm = buildHeightmap(disc(600, 210), p);
    const g = hm.grid;
    expect(at(hm.top, Math.floor(g.gy / 2) * g.gx + Math.floor(g.gx / 2))).toBeCloseTo(
      p.baseThicknessMm + p.reliefHeightMm,
      10,
    );
    expect(at(hm.top, 0)).toBeCloseTo(p.baseThicknessMm, 10);
  });

  it('survives a completely uniform image, where the boundary slope is zero', () => {
    const white = rasterFrom(32, 32, () => [255, 255, 255, 255]);
    const black = rasterFrom(32, 32, () => [0, 0, 0, 255]);
    const p = testParams({ fitMode: 'stretch' });
    for (const image of [white, black]) {
      const hm = buildHeightmap(image, p);
      for (const z of hm.top) expect(Number.isFinite(z)).toBe(true);
    }
  });
});

describe('sampleLuminanceArea', () => {
  const checks = rasterFrom(16, 16, (x, y) => {
    const v = (x + y) % 2 === 0 ? 255 : 0;
    return [v, v, v, 255];
  });

  it('is exactly bilinear when a sample covers one pixel or less', () => {
    for (const [u, v] of [[4.5, 4.5], [7.25, 2.75], [0.5, 15.5]] as const) {
      expect(sampleLuminanceArea(checks, u, v, false, 1, 1)).toBe(sampleLuminance(checks, u, v, false));
      expect(sampleLuminanceArea(checks, u, v, false, 0.4, 0.4)).toBe(sampleLuminance(checks, u, v, false));
    }
  });

  it('averages a fine checkerboard towards mid grey instead of picking a side', () => {
    const point = sampleLuminance(checks, 8.5, 8.5, false);
    const area = sampleLuminanceArea(checks, 8.5, 8.5, false, 4, 4);
    expect(Math.abs(area - 0.5)).toBeLessThan(Math.abs(point - 0.5));
  });

  it('stays within the range of the image it samples', () => {
    for (let u = 0; u <= 16; u += 1.5) {
      const value = sampleLuminanceArea(checks, u, 8, true, 3, 3);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
