import { describe, expect, it } from 'vitest';
import { estimateMaterial, sumEstimates } from '../src/core/estimate.js';
import { testParams } from './helpers/params.js';

describe('estimateMaterial', () => {
  const p = testParams({ filamentDiameterMm: 1.75, filamentDensityGCm3: 1.24 });

  it('converts volume to the length of filament that holds it', () => {
    const area = Math.PI * (1.75 / 2) ** 2;
    const e = estimateMaterial(10_000, p);
    expect(e.volumeMm3).toBe(10_000);
    expect(e.filamentM).toBeCloseTo(10_000 / area / 1000, 12);
    expect(e.filamentM * area * 1000).toBeCloseTo(10_000, 9);
  });

  it('converts cubic millimetres to grams through the density', () => {
    expect(estimateMaterial(1000, p).massG).toBeCloseTo(1.24, 12);
    expect(estimateMaterial(0, p).massG).toBe(0);
  });

  it('scales linearly with volume', () => {
    const a = estimateMaterial(500, p);
    const b = estimateMaterial(1500, p);
    expect(b.filamentM).toBeCloseTo(a.filamentM * 3, 12);
    expect(b.massG).toBeCloseTo(a.massG * 3, 12);
  });

  it('reports zero length rather than dividing by zero for a zero-diameter filament', () => {
    const e = estimateMaterial(1000, testParams({ filamentDiameterMm: 0 }));
    expect(e.filamentM).toBe(0);
    expect(Number.isFinite(e.massG)).toBe(true);
  });

  it('uses more filament for thinner stock', () => {
    const thin = estimateMaterial(1000, testParams({ filamentDiameterMm: 1.75 }));
    const thick = estimateMaterial(1000, testParams({ filamentDiameterMm: 2.85 }));
    expect(thin.filamentM).toBeGreaterThan(thick.filamentM);
  });
});

describe('sumEstimates', () => {
  const p = testParams();

  it('is zero for no parts', () => {
    expect(sumEstimates([])).toEqual({ volumeMm3: 0, filamentM: 0, massG: 0 });
  });

  it('adds every field across the parts', () => {
    const parts = [estimateMaterial(100, p), estimateMaterial(250, p), estimateMaterial(1, p)];
    const total = sumEstimates(parts);
    expect(total.volumeMm3).toBeCloseTo(351, 9);
    expect(total.filamentM).toBeCloseTo(estimateMaterial(351, p).filamentM, 9);
    expect(total.massG).toBeCloseTo(estimateMaterial(351, p).massG, 9);
  });

  it('does not mutate the parts it sums', () => {
    const one = estimateMaterial(100, p);
    sumEstimates([one, one]);
    expect(one.volumeMm3).toBe(100);
  });
});
