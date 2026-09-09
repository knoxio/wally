import { describe, expect, it } from 'vitest';
import { distanceTransform, gaussianBlur, signedDistance } from '../src/core/field.js';
import { at } from './helpers/params.js';

const GX = 24;
const GY = 18;
const PITCH_X = 0.7;
const PITCH_Y = 1.3;

const SEEDS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [5, 3],
  [17, 2],
  [11, 12],
  [23, 17],
  [2, 16],
];

function seededGrid(gx: number, gy: number, seeds: ReadonlyArray<readonly [number, number]>): Uint8Array {
  const s = new Uint8Array(gx * gy);
  for (const [x, y] of seeds) s[y * gx + x] = 1;
  return s;
}

function bruteForceDistance(
  seeds: ReadonlyArray<readonly [number, number]>,
  x: number,
  y: number,
  pitchX: number,
  pitchY: number,
): number {
  let best = Infinity;
  for (const [sx, sy] of seeds) {
    const dx = (x - sx) * pitchX;
    const dy = (y - sy) * pitchY;
    const d = Math.hypot(dx, dy);
    if (d < best) best = d;
  }
  return best;
}

describe('distanceTransform', () => {
  it('matches brute-force nearest-source distance on an anisotropic grid', () => {
    const seed = seededGrid(GX, GY, SEEDS);
    const out = distanceTransform(seed, GX, GY, PITCH_X, PITCH_Y);
    for (let y = 0; y < GY; y++) {
      for (let x = 0; x < GX; x++) {
        const expected = bruteForceDistance(SEEDS, x, y, PITCH_X, PITCH_Y);
        expect(Math.abs(at(out, y * GX + x) - expected)).toBeLessThan(1e-5);
      }
    }
  });

  it('is exact for a single source, so the anisotropy is not silently averaged away', () => {
    const single: ReadonlyArray<readonly [number, number]> = [[3, 4]];
    const out = distanceTransform(seededGrid(GX, GY, single), GX, GY, PITCH_X, PITCH_Y);
    expect(at(out, 4 * GX + 3)).toBe(0);
    expect(at(out, 4 * GX + 4)).toBeCloseTo(PITCH_X, 5);
    expect(at(out, 5 * GX + 3)).toBeCloseTo(PITCH_Y, 5);
    expect(at(out, 5 * GX + 4)).toBeCloseTo(Math.hypot(PITCH_X, PITCH_Y), 5);
  });

  it('gives a different field when the two pitches are swapped', () => {
    const seed = seededGrid(GX, GY, SEEDS);
    const a = distanceTransform(seed, GX, GY, PITCH_X, PITCH_Y);
    const b = distanceTransform(seed, GX, GY, PITCH_Y, PITCH_X);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('reports zero everywhere when every cell is a source', () => {
    const all = new Uint8Array(GX * GY).fill(1);
    const out = distanceTransform(all, GX, GY, PITCH_X, PITCH_Y);
    expect(Array.from(out).every((v) => v === 0)).toBe(true);
  });

  it('is deterministic across repeated runs', () => {
    const seed = seededGrid(GX, GY, SEEDS);
    const a = distanceTransform(seed, GX, GY, PITCH_X, PITCH_Y);
    const b = distanceTransform(seed, GX, GY, PITCH_X, PITCH_Y);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('signedDistance', () => {
  const gx = 21;
  const gy = 15;
  const mask = new Uint8Array(gx * gy);
  for (let y = 0; y < gy; y++) {
    for (let x = 0; x < gx; x++) {
      if (x >= 6 && x <= 14 && y >= 4 && y <= 10) mask[y * gx + x] = 1;
    }
  }

  it('is positive strictly inside the mask and negative strictly outside it', () => {
    const sdf = signedDistance(mask, gx, gy, PITCH_X, PITCH_Y);
    for (let i = 0; i < mask.length; i++) {
      if (at(mask, i) === 1) expect(at(sdf, i)).toBeGreaterThan(0);
      else expect(at(sdf, i)).toBeLessThan(0);
    }
  });

  it('places the zero crossing half a pitch outside the last mask sample', () => {
    const sdf = signedDistance(mask, gx, gy, PITCH_X, PITCH_X);
    const half = PITCH_X / 2;
    expect(at(sdf, 7 * gx + 6)).toBeCloseTo(half, 5);
    expect(at(sdf, 7 * gx + 5)).toBeCloseTo(-half, 5);
  });

  it('grows in magnitude with depth into each region', () => {
    const sdf = signedDistance(mask, gx, gy, PITCH_X, PITCH_X);
    expect(at(sdf, 7 * gx + 10)).toBeGreaterThan(at(sdf, 7 * gx + 7));
    expect(at(sdf, 7 * gx + 0)).toBeLessThan(at(sdf, 7 * gx + 4));
  });

  it('is antisymmetric under inverting the mask, up to the half-pitch offset', () => {
    const inverted = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) inverted[i] = at(mask, i) ? 0 : 1;
    const a = signedDistance(mask, gx, gy, PITCH_X, PITCH_Y);
    const b = signedDistance(inverted, gx, gy, PITCH_X, PITCH_Y);
    for (let i = 0; i < mask.length; i++) expect(at(a, i)).toBeCloseTo(-at(b, i), 5);
  });
});

describe('gaussianBlur', () => {
  const gx = 12;
  const gy = 9;

  it('returns an independent copy when both sigmas are zero', () => {
    const src = Float32Array.from({ length: gx * gy }, (_, i) => i);
    const out = gaussianBlur(src, gx, gy, 0, 0);
    expect(out).not.toBe(src);
    expect(Array.from(out)).toEqual(Array.from(src));
    out[0] = 999;
    expect(at(src, 0)).toBe(0);
  });

  it('leaves a constant field constant, because the clamped kernel stays normalised', () => {
    const src = new Float32Array(gx * gy).fill(0.375);
    const out = gaussianBlur(src, gx, gy, 1.7, 2.3);
    for (let i = 0; i < out.length; i++) expect(at(out, i)).toBeCloseTo(0.375, 5);
  });

  it('spreads a single impulse symmetrically and conserves nothing above its peak', () => {
    const src = new Float32Array(gx * gy);
    src[4 * gx + 6] = 1;
    const out = gaussianBlur(src, gx, gy, 1, 1);
    const peak = at(out, 4 * gx + 6);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(1);
    expect(at(out, 4 * gx + 5)).toBeCloseTo(at(out, 4 * gx + 7), 6);
    expect(at(out, 3 * gx + 6)).toBeCloseTo(at(out, 5 * gx + 6), 6);
    for (let i = 0; i < out.length; i++) expect(at(out, i)).toBeLessThanOrEqual(peak + 1e-6);
  });

  it('blurs only the requested axis', () => {
    const src = new Float32Array(gx * gy);
    src[4 * gx + 6] = 1;
    const horizontal = gaussianBlur(src, gx, gy, 1.5, 0);
    expect(at(horizontal, 4 * gx + 5)).toBeGreaterThan(0);
    expect(at(horizontal, 3 * gx + 6)).toBe(0);

    const vertical = gaussianBlur(src, gx, gy, 0, 1.5);
    expect(at(vertical, 4 * gx + 5)).toBe(0);
    expect(at(vertical, 3 * gx + 6)).toBeGreaterThan(0);
  });

  it('does not mutate the source', () => {
    const src = new Float32Array(gx * gy);
    src[4 * gx + 6] = 1;
    gaussianBlur(src, gx, gy, 2, 2);
    expect(at(src, 4 * gx + 6)).toBe(1);
    expect(at(src, 4 * gx + 5)).toBe(0);
  });
});
