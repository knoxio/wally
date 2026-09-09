import { describe, expect, it } from 'vitest';
import { PROFILE_KINDS, type ProfileKind } from '../src/core/params.js';
import { clamp01, evaluateProfile, filletRadiiMm, resolveFillets, type ProfileSpec } from '../src/core/profile.js';

const spec = (kind: ProfileKind, baseFilletFrac = 0.35, topRoundFrac = 0.25): ProfileSpec => ({
  kind,
  baseFilletFrac,
  topRoundFrac,
});

const SWEEP = 2001;
const sweep = (s: ProfileSpec): number[] =>
  Array.from({ length: SWEEP }, (_, i) => evaluateProfile(s, i / (SWEEP - 1)));

describe('clamp01', () => {
  it('pins values outside the unit interval to its ends', () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(9)).toBe(1);
  });
});

describe('evaluateProfile', () => {
  for (const kind of PROFILE_KINDS) {
    describe(kind, () => {
      it('is exactly 0 at and below t = 0 and exactly 1 at and above t = 1', () => {
        const s = spec(kind);
        expect(evaluateProfile(s, 0)).toBe(0);
        expect(evaluateProfile(s, -0.5)).toBe(0);
        expect(evaluateProfile(s, -1e9)).toBe(0);
        expect(evaluateProfile(s, 1)).toBe(1);
        expect(evaluateProfile(s, 1.5)).toBe(1);
        expect(evaluateProfile(s, 1e9)).toBe(1);
      });

      it('never decreases across the band', () => {
        const values = sweep(spec(kind));
        for (let i = 1; i < values.length; i++) {
          expect(values[i] ?? 0).toBeGreaterThanOrEqual(values[i - 1] ?? 0);
        }
      });

      it('stays inside the band with no jump larger than a few times the step', () => {
        const values = sweep(spec(kind));
        const step = 1 / (SWEEP - 1);
        for (let i = 1; i < values.length; i++) {
          const v = values[i] ?? 0;
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
          expect(v - (values[i - 1] ?? 0)).toBeLessThan(step * 4);
        }
      });

      it('agrees with the clamped value for t just outside the band', () => {
        const s = spec(kind);
        expect(evaluateProfile(s, 1e-9)).toBeCloseTo(0, 8);
        expect(evaluateProfile(s, 1 - 1e-9)).toBeCloseTo(1, 8);
      });
    });
  }

  it('reproduces the closed forms of the analytic profiles', () => {
    expect(evaluateProfile(spec('linear'), 0.25)).toBeCloseTo(0.25, 12);
    expect(evaluateProfile(spec('smoothstep'), 0.5)).toBeCloseTo(0.5, 12);
    expect(evaluateProfile(spec('smoothstep'), 0.25)).toBeCloseTo(0.15625, 12);
    expect(evaluateProfile(spec('smootherstep'), 0.5)).toBeCloseTo(0.5, 12);
    expect(evaluateProfile(spec('cosine'), 0.5)).toBeCloseTo(0.5, 12);
    expect(evaluateProfile(spec('cosine'), 1 / 3)).toBeCloseTo(0.25, 12);
  });

  it('leaves the base plane and reaches the plateau with zero slope when filleted', () => {
    const s = spec('filleted', 0.35, 0.25);
    const h = 1e-6;
    const slopeAtStart = evaluateProfile(s, h) / h;
    const slopeAtEnd = (1 - evaluateProfile(s, 1 - h)) / h;
    expect(slopeAtStart).toBeLessThan(1e-4);
    expect(slopeAtEnd).toBeLessThan(1e-4);
  });

  it('keeps a finite slope at both ends when linear, which is the crease the fillet exists to avoid', () => {
    const s = spec('linear');
    const h = 1e-6;
    expect(evaluateProfile(s, h) / h).toBeCloseTo(1, 9);
    expect((1 - evaluateProfile(s, 1 - h)) / h).toBeCloseTo(1, 9);
  });

  it('is continuous where the filleted parabolas meet the straight section', () => {
    const fb = 0.35;
    const ft = 0.25;
    const s = spec('filleted', fb, ft);
    const eps = 1e-9;
    expect(evaluateProfile(s, fb - eps)).toBeCloseTo(evaluateProfile(s, fb + eps), 8);
    expect(evaluateProfile(s, 1 - ft - eps)).toBeCloseTo(evaluateProfile(s, 1 - ft + eps), 8);
  });

  it('degenerates to a straight ramp when both fillet fractions are zero', () => {
    const s = spec('filleted', 0, 0);
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(evaluateProfile(s, t)).toBeCloseTo(t, 12);
    }
  });

  it('stays monotone and bounded when the fillets consume the entire band', () => {
    const s = spec('filleted', 0.5, 0.5);
    const values = sweep(s);
    expect(evaluateProfile(s, 0.5)).toBeCloseTo(0.5, 12);
    for (let i = 1; i < values.length; i++) {
      expect(values[i] ?? 0).toBeGreaterThanOrEqual(values[i - 1] ?? 0);
      expect(values[i] ?? 0).toBeLessThanOrEqual(1);
    }
  });
});

describe('resolveFillets', () => {
  it('passes through fractions that fit inside the band', () => {
    const { fb, ft, m } = resolveFillets(spec('filleted', 0.35, 0.25));
    expect(fb).toBe(0.35);
    expect(ft).toBe(0.25);
    expect(m).toBeCloseTo(1 / (1 - 0.3), 12);
  });

  it('clamps each fraction to half the band, which is what keeps the pair from exceeding it', () => {
    const { fb, ft, m } = resolveFillets(spec('filleted', 0.9, 4));
    expect(fb).toBe(0.5);
    expect(ft).toBe(0.5);
    expect(fb + ft).toBeLessThanOrEqual(1);
    expect(m).toBeCloseTo(2, 12);
  });

  it('clamps negative fractions to zero and reports unit slope', () => {
    const { fb, ft, m } = resolveFillets(spec('filleted', -1, -0.2));
    expect(fb).toBe(0);
    expect(ft).toBe(0);
    expect(m).toBe(1);
  });

  it('scales the straight-section slope so the profile still spans exactly 0 to 1', () => {
    for (const [b, t] of [[0, 0], [0.1, 0.4], [0.5, 0.5], [0.35, 0.25]] as const) {
      const s = spec('filleted', b, t);
      const { fb, ft, m } = resolveFillets(s);
      expect(m * (1 - ft - fb / 2)).toBeCloseTo(1 - (m * ft) / 2, 12);
      expect(evaluateProfile(s, 1)).toBe(1);
    }
  });
});

describe('filletRadiiMm', () => {
  it('returns zero radii for a degenerate band or zero height', () => {
    expect(filletRadiiMm(spec('filleted'), 0, 3)).toEqual({ base: 0, top: 0 });
    expect(filletRadiiMm(spec('filleted'), 2, 0)).toEqual({ base: 0, top: 0 });
  });

  it('reports no radius at all for the creased linear profile', () => {
    expect(filletRadiiMm(spec('linear'), 2.4, 3.75)).toEqual({ base: 0, top: 0 });
  });

  it('grows the filleted radii with the fillet fraction', () => {
    const small = filletRadiiMm(spec('filleted', 0.1, 0.1), 2.4, 3.75);
    const large = filletRadiiMm(spec('filleted', 0.4, 0.4), 2.4, 3.75);
    expect(large.base).toBeGreaterThan(small.base);
    expect(large.top).toBeGreaterThan(small.top);
  });

  it('scales with band width squared over height', () => {
    const a = filletRadiiMm(spec('smoothstep'), 2, 4);
    const b = filletRadiiMm(spec('smoothstep'), 4, 4);
    expect(b.base / a.base).toBeCloseTo(4, 12);
  });
});
