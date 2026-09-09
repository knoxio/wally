import type { Params } from './params.js';
import { buildSolid, type FieldSolid } from './solid.js';
import type { Mesh } from './mesh.js';

/** The printed key that joins two tiles, and the numbers needed to describe it. */
export interface Connector {
  readonly mesh: Mesh;
  /** Measured across the joint, spanning both rebates and the mounting gap. */
  readonly spanMm: number;
  /** Measured along the shared edge. */
  readonly lengthMm: number;
  readonly thicknessMm: number;
  /** How many are needed for the whole panel. */
  readonly count: number;
}

/** Number of shared edges in the panel, which is one connector each. */
export function connectorCount(p: Params): number {
  return p.rows * (p.columns - 1) + p.columns * (p.rows - 1);
}

/**
 * Builds the connector plate.
 *
 * It is a plain rectangle because it does not need to be anything cleverer: the
 * closed inner end of each rebate stops it sliding along the joint, and the
 * rebate sides stop it sliding across, so once both tiles are on the wall the
 * plate is captured in every direction by geometry alone. It sits a clearance
 * below the back face so the panel still lies flat against the backing board.
 */
export function buildConnector(p: Params): Connector {
  const c = p.connectorClearanceMm;
  const spanMm = 2 * p.rebateWidthMm + p.gapMm - 2 * c;
  const lengthMm = p.rebateLengthMm - 2 * c;
  const thicknessMm = p.rebateDepthMm - c;
  if (!(spanMm > 0 && lengthMm > 0 && thicknessMm > 0)) {
    throw new Error('Connector clearance is larger than the rebate it has to fit inside.');
  }

  const solid: FieldSolid = {
    nx: 2,
    ny: 2,
    xs: Float64Array.from([-spanMm / 2, spanMm / 2]),
    ys: Float64Array.from([lengthMm / 2, -lengthMm / 2]),
    top: Float64Array.from([thicknessMm, thicknessMm, thicknessMm, thicknessMm]),
    bottom: null,
  };
  return { mesh: buildSolid(solid), spanMm, lengthMm, thicknessMm, count: connectorCount(p) };
}
