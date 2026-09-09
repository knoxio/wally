import { describe, expect, it } from 'vitest';
import { buildHeightmap } from '../src/core/heightmap.js';
import { resolveGrid } from '../src/core/params.js';
import { at, testParams } from './helpers/params.js';
import { checkerboard, disc, solid, stripes } from './helpers/raster.js';

describe('buildHeightmap', () => {
  const image = disc(96, 96, 0.6);

  it('samples on the shared grid, one vertex past each tile', () => {
    const p = testParams();
    const h = buildHeightmap(image, p);
    const g = resolveGrid(p);
    expect(h.grid).toEqual(g);
    expect(h.top.length).toBe(g.gx * g.gy);
    expect(h.relief.length).toBe(g.gx * g.gy);
  });

  it('honours the pitch override without changing the result shape rules', () => {
    const p = testParams();
    const coarse = buildHeightmap(image, p, p.previewPitchMm);
    expect(coarse.grid.gx).toBeLessThan(resolveGrid(p).gx);
    expect(coarse.top.length).toBe(coarse.grid.gx * coarse.grid.gy);
  });

  it('keeps the top surface exactly base plus relief, and the relief inside its band', () => {
    const p = testParams();
    const h = buildHeightmap(image, p);
    for (let i = 0; i < h.top.length; i++) {
      expect(at(h.top, i)).toBe(Math.fround(p.baseThicknessMm + at(h.relief, i)));
      expect(at(h.relief, i)).toBeGreaterThanOrEqual(0);
      expect(at(h.relief, i)).toBeLessThanOrEqual(p.reliefHeightMm + 1e-6);
    }
  });

  it('reports the true extremes of the top surface', () => {
    const p = testParams();
    const h = buildHeightmap(image, p);
    expect(h.minZ).toBe(Math.min(...h.top));
    expect(h.maxZ).toBe(Math.max(...h.top));
    expect(h.minZ).toBeGreaterThanOrEqual(p.baseThicknessMm);
    expect(h.maxZ).toBeLessThanOrEqual(p.baseThicknessMm + p.reliefHeightMm + 1e-6);
  });

  it('lands on the base plane for an all-black source and on the plateau for an all-white one', () => {
    const p = testParams({ cornerRadiusMm: 0 });
    const black = buildHeightmap(solid(16, 16, 0), p);
    const white = buildHeightmap(solid(16, 16, 255), p);
    expect(black.maxZ).toBeCloseTo(p.baseThicknessMm, 5);
    expect(white.minZ).toBeCloseTo(p.baseThicknessMm + p.reliefHeightMm, 5);
  });

  it('swaps those two extremes when inverted', () => {
    const p = testParams({ cornerRadiusMm: 0, invert: true });
    const black = buildHeightmap(solid(16, 16, 0), p);
    const white = buildHeightmap(solid(16, 16, 255), p);
    expect(black.minZ).toBeCloseTo(p.baseThicknessMm + p.reliefHeightMm, 5);
    expect(white.maxZ).toBeCloseTo(p.baseThicknessMm, 5);
  });

  it('treats the region outside a contained image as black', () => {
    const p = testParams({ fitMode: 'contain', cornerRadiusMm: 0, panelWidthMm: 90, panelHeightMm: 90 });
    const h = buildHeightmap(solid(40, 10, 255), p);
    expect(h.minZ).toBeCloseTo(p.baseThicknessMm, 5);
    expect(h.maxZ).toBeCloseTo(p.baseThicknessMm + p.reliefHeightMm, 5);
  });

  it('moves the threshold: a higher threshold raises less of a grey source', () => {
    const image16 = stripes(32, 32, 4);
    const low = buildHeightmap(image16, testParams({ threshold: 0.2, cornerRadiusMm: 0 }));
    const high = buildHeightmap(image16, testParams({ threshold: 0.8, cornerRadiusMm: 0 }));
    const sum = (a: Float32Array): number => a.reduce((acc, v) => acc + v, 0);
    expect(sum(low.relief)).toBeGreaterThan(sum(high.relief));
  });

  it('follows the grey level directly in continuous mode', () => {
    const p = testParams({ heightMode: 'continuous', profile: 'linear', cornerRadiusMm: 0, fitMode: 'stretch' });
    const grey = solid(8, 8, 128);
    const h = buildHeightmap(grey, p);
    const expected = p.baseThicknessMm + p.reliefHeightMm * (128 / 255);
    expect(h.minZ).toBeCloseTo(expected, 4);
    expect(h.maxZ).toBeCloseTo(expected, 4);
  });

  it('produces a bevel band rather than a one-sample cliff in binary mode', () => {
    const p = testParams({ cornerRadiusMm: 0, bevelWidthMm: 4, samplePitchMm: 1, fitMode: 'stretch' });
    const h = buildHeightmap(stripes(6, 6, 3), p);
    const intermediate = Array.from(h.relief).filter(
      (v) => v > 1e-4 && v < p.reliefHeightMm - 1e-4,
    );
    expect(intermediate.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same image and params', () => {
    const p = testParams();
    const a = buildHeightmap(checkerboard(64, 64, 7), p);
    const b = buildHeightmap(checkerboard(64, 64, 7), p);
    expect(Array.from(a.top)).toEqual(Array.from(b.top));
  });

  it('rounds plan-view corners: a larger corner radius softens the mask', () => {
    const p = testParams({ fitMode: 'stretch', samplePitchMm: 1 });
    const sharp = buildHeightmap(checkerboard(32, 32, 8), { ...p, cornerRadiusMm: 0 });
    const rounded = buildHeightmap(checkerboard(32, 32, 8), { ...p, cornerRadiusMm: 4 });
    expect(Array.from(sharp.top)).not.toEqual(Array.from(rounded.top));
  });
});
