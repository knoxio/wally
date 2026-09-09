import { DEFAULT_PARAMS, type Params } from '../../src/core/params.js';

/**
 * A small, fast panel that passes `validate` cleanly. Every geometric limit is
 * scaled down to the 30 mm tile so the defaults stay meaningful.
 */
export function testParams(overrides: Partial<Params> = {}): Params {
  return {
    ...DEFAULT_PARAMS,
    panelWidthMm: 90,
    panelHeightMm: 90,
    columns: 3,
    rows: 3,
    samplePitchMm: 1,
    previewPitchMm: 3,
    tileEdgeChamferMm: 3,
    bevelWidthMm: 3,
    rebateLengthMm: 12,
    rebateWidthMm: 6,
    magnetDiameterMm: 8,
    magnetDepthMm: 1,
    magnetInsetMm: 8,
    ...overrides,
  };
}

/** Indexed read that fails loudly instead of returning undefined. */
export function at(a: Float64Array | Float32Array | Uint32Array | Uint8Array, i: number): number {
  const v = a[i];
  if (v === undefined) throw new Error(`index ${i} is out of range (length ${a.length})`);
  return v;
}
