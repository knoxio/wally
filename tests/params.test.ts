import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, resolveGrid, tileName, validate, type Params } from '../src/core/params.js';
import { testParams } from './helpers/params.js';

const errors = (p: Params): string[] => validate(p).filter((i) => i.level === 'error').map((i) => i.message);
const warnings = (p: Params): string[] => validate(p).filter((i) => i.level === 'warning').map((i) => i.message);
const only = (p: Params, overrides: Partial<Params>): Params => ({ ...p, ...overrides });

describe('resolveGrid', () => {
  it('gives every tile a whole number of samples and a panel vertex count of tileSamples * count + 1', () => {
    const p = testParams({ panelWidthMm: 1350, panelHeightMm: 750, columns: 9, rows: 5, samplePitchMm: 0.8 });
    const g = resolveGrid(p);
    expect(Number.isInteger(g.tileSamplesX)).toBe(true);
    expect(Number.isInteger(g.tileSamplesY)).toBe(true);
    expect(g.gx).toBe(g.tileSamplesX * p.columns + 1);
    expect(g.gy).toBe(g.tileSamplesY * p.rows + 1);
  });

  it('snaps the pitch so it divides the tile exactly, even when the requested pitch does not', () => {
    const p = testParams({ panelWidthMm: 1350, panelHeightMm: 750, columns: 9, rows: 5, samplePitchMm: 0.8 });
    const g = resolveGrid(p);
    expect(g.tileWidthMm).toBe(150);
    expect(150 / 0.8).not.toBe(Math.round(150 / 0.8));
    expect(g.tileSamplesX * g.pitchX).toBeCloseTo(g.tileWidthMm, 10);
    expect(g.tileSamplesY * g.pitchY).toBeCloseTo(g.tileHeightMm, 10);
    expect(g.pitchX).not.toBe(0.8);
  });

  it('keeps the exact-division invariant across a sweep of awkward pitches', () => {
    for (const pitch of [0.3, 0.7, 0.8, 1.1, 1.7, 2.3, 4.9, 13]) {
      const p = testParams({ panelWidthMm: 1350, panelHeightMm: 750, columns: 9, rows: 5, samplePitchMm: pitch });
      const g = resolveGrid(p);
      expect(g.tileSamplesX * g.pitchX).toBeCloseTo(g.tileWidthMm, 9);
      expect(g.tileSamplesY * g.pitchY).toBeCloseTo(g.tileHeightMm, 9);
      expect(g.gx).toBe(g.tileSamplesX * p.columns + 1);
    }
  });

  it('never drops below two samples per tile however coarse the pitch', () => {
    const g = resolveGrid(testParams({ samplePitchMm: 10_000 }));
    expect(g.tileSamplesX).toBe(2);
    expect(g.tileSamplesY).toBe(2);
  });

  it('honours the pitch override without touching the params', () => {
    const p = testParams({ samplePitchMm: 3 });
    expect(resolveGrid(p, 6).tileSamplesX).toBe(5);
    expect(resolveGrid(p).tileSamplesX).toBe(10);
  });
});

describe('tileName', () => {
  it('is one-based and zero-padded to two digits', () => {
    expect(tileName(0, 0)).toBe('r01-c01');
    expect(tileName(2, 6)).toBe('r03-c07');
    expect(tileName(9, 99)).toBe('r10-c100');
  });
});

describe('validate', () => {
  it('raises no issues at all for the test panel, with or without magnets', () => {
    expect(validate(testParams())).toEqual([]);
    expect(validate(testParams({ magnetsEnabled: true }))).toEqual([]);
  });

  it('raises no errors for the shipped defaults', () => {
    expect(errors(DEFAULT_PARAMS)).toEqual([]);
  });

  const base = testParams();

  const errorCases: ReadonlyArray<readonly [string, Partial<Params>, string]> = [
    ['non-positive panel width', { panelWidthMm: 0 }, 'Panel dimensions'],
    ['non-positive panel height', { panelHeightMm: -1 }, 'Panel dimensions'],
    ['fractional columns', { columns: 2.5 }, 'whole numbers'],
    ['zero rows', { rows: 0 }, 'whole numbers'],
    ['non-positive sample pitch', { samplePitchMm: 0 }, 'Sample pitch must be positive'],
    ['non-positive base thickness', { baseThicknessMm: 0, rebateDepthMm: 0 }, 'Base thickness'],
    ['threshold at 0', { threshold: 0 }, 'Threshold'],
    ['threshold at 1', { threshold: 1 }, 'Threshold'],
    ['bevel bias below -1', { bevelBias: -1.01 }, 'Bevel bias'],
    ['bevel bias above 1', { bevelBias: 1.01 }, 'Bevel bias'],
    ['base fillet above 0.5', { baseFilletFrac: 0.51 }, 'Base fillet'],
    ['negative base fillet', { baseFilletFrac: -0.01 }, 'Base fillet'],
    ['top round above 0.5', { topRoundFrac: 0.51 }, 'Top round'],
    ['negative top round', { topRoundFrac: -0.01 }, 'Top round'],
    ['repeat mode with no repeat width', { fitMode: 'repeat', repeatWidthMm: 0 }, 'Repeat width'],
    ['negative tile edge chamfer', { tileEdgeChamferMm: -0.1 }, 'chamfer cannot be negative'],
    ['rebate as deep as the base', { rebateDepthMm: 2, baseThicknessMm: 2 }, 'Rebate depth'],
    ['rebate longer than the tile edge', { rebateLengthMm: 30 }, 'Rebate length'],
    ['opposing rebates that meet', { rebateWidthMm: 15 }, 'Opposing rebates'],
    ['chamfer wider than half the tile', { tileEdgeChamferMm: 15 }, 'chamfer would consume'],
    ['magnet deeper than the base', { magnetsEnabled: true, magnetDepthMm: 2 }, 'Magnet pocket depth'],
    ['magnet inset past the tile centre', { magnetsEnabled: true, magnetInsetMm: 15 }, 'Magnet inset'],
  ];

  for (const [label, patch, fragment] of errorCases) {
    it(`reports an error for ${label}`, () => {
      const found = errors(only(base, patch));
      expect(found.some((m) => m.includes(fragment))).toBe(true);
    });
  }

  it('reports non-positive relief height as an error alongside the thin-relief warning', () => {
    const issues = validate(only(base, { reliefHeightMm: 0 }));
    expect(issues.some((i) => i.level === 'error' && i.message.includes('Relief height'))).toBe(true);
    expect(issues.some((i) => i.level === 'warning' && i.message.includes('three 0.2 mm layers'))).toBe(true);
  });

  it('does not check interlock geometry when the interlock is off', () => {
    const broken = { rebateDepthMm: 5, rebateLengthMm: 500, rebateWidthMm: 500 };
    expect(errors(only(base, { ...broken, interlockEnabled: true })).length).toBeGreaterThan(0);
    expect(errors(only(base, { ...broken, interlockEnabled: false }))).toEqual([]);
  });

  it('does not check magnet geometry when magnets are off', () => {
    const broken = { magnetDepthMm: 5, magnetInsetMm: 500 };
    expect(errors(only(base, { ...broken, magnetsEnabled: true })).length).toBeGreaterThan(0);
    expect(errors(only(base, { ...broken, magnetsEnabled: false }))).toEqual([]);
  });

  it('only requires a repeat width in repeat fit mode', () => {
    expect(errors(only(base, { fitMode: 'cover', repeatWidthMm: 0 }))).toEqual([]);
  });

  const warningCases: ReadonlyArray<readonly [string, Partial<Params>, string]> = [
    ['a rebate that leaves under 0.6 mm of material', { baseThicknessMm: 2, rebateDepthMm: 1.5 }, 'remains over each rebate'],
    ['a sample pitch coarser than the bevel band', { bevelWidthMm: 0.5 }, 'coarser than the bevel band'],
    ['a rebate narrower than three samples', { samplePitchMm: 3, rebateWidthMm: 5, tileEdgeChamferMm: 6 }, 'fewer than three samples'],
    ['a chamfer narrower than two samples', { samplePitchMm: 3, tileEdgeChamferMm: 3 }, 'print as a hard lip'],
    ['magnets smaller than eight samples', { magnetsEnabled: true, magnetDiameterMm: 6 }, 'too rough to hold a magnet'],
    ['relief below three layers', { reliefHeightMm: 0.5 }, 'three 0.2 mm layers'],
  ];

  for (const [label, patch, fragment] of warningCases) {
    it(`warns about ${label}`, () => {
      const found = warnings(only(base, patch));
      expect(found.some((m) => m.includes(fragment))).toBe(true);
    });
  }

  it('separates warnings from errors so a warning alone never blocks export', () => {
    const issues = validate(only(base, { reliefHeightMm: 0.5 }));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.level === 'warning')).toBe(true);
  });
});
