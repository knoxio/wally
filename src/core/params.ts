/**
 * The complete parameter set for a relief panel. Every geometric decision the
 * generator makes is derived from this object, so a given `Params` value always
 * produces byte-identical output for a given source image.
 */
export interface Params {
  panelWidthMm: number;
  panelHeightMm: number;
  columns: number;
  rows: number;
  /** Visible gap between mounted tiles. Not part of tile geometry; drives the connector width and the placement map. */
  gapMm: number;

  baseThicknessMm: number;
  reliefHeightMm: number;
  /** Target spacing between heightmap samples. Snapped so each tile holds a whole number of samples. */
  samplePitchMm: number;
  /** Coarser pitch used for the on-screen preview only. */
  previewPitchMm: number;

  invert: boolean;
  threshold: number;
  fitMode: FitMode;
  repeatWidthMm: number;
  heightMode: HeightMode;

  /** Approximate plan-view corner radius applied to the mask before the relief is built. */
  cornerRadiusMm: number;
  bevelWidthMm: number;
  /** -1 puts the bevel entirely in the black region, 0 centres it on the edge, +1 puts it entirely in the white region. */
  bevelBias: number;
  profile: ProfileKind;
  /** Fraction of the bevel band spent on the concave fillet where the slope meets the base. */
  baseFilletFrac: number;
  /** Fraction of the bevel band spent on the convex round-over where the slope meets the raised plateau. */
  topRoundFrac: number;
  /** Width of the band in which the relief eases back down to the base plane at the tile border. */
  tileEdgeChamferMm: number;

  interlockEnabled: boolean;
  rebateDepthMm: number;
  rebateLengthMm: number;
  rebateWidthMm: number;
  connectorClearanceMm: number;

  magnetsEnabled: boolean;
  magnetDiameterMm: number;
  magnetDepthMm: number;
  magnetInsetMm: number;

  centreTiles: boolean;
  filamentDiameterMm: number;
  filamentDensityGCm3: number;
}

export const FIT_MODES = ['cover', 'contain', 'stretch', 'repeat'] as const;
export type FitMode = (typeof FIT_MODES)[number];

export const HEIGHT_MODES = ['binary', 'continuous'] as const;
export type HeightMode = (typeof HEIGHT_MODES)[number];

export const PROFILE_KINDS = ['filleted', 'smoothstep', 'smootherstep', 'cosine', 'linear'] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];

export const DEFAULT_PARAMS: Params = {
  panelWidthMm: 1350,
  panelHeightMm: 750,
  columns: 9,
  rows: 5,
  gapMm: 5,

  baseThicknessMm: 2,
  reliefHeightMm: 3.75,
  samplePitchMm: 0.8,
  previewPitchMm: 2.5,

  invert: false,
  threshold: 0.5,
  fitMode: 'cover',
  repeatWidthMm: 450,
  heightMode: 'binary',

  cornerRadiusMm: 1.2,
  bevelWidthMm: 2.4,
  bevelBias: 0.2,
  profile: 'filleted',
  baseFilletFrac: 0.35,
  topRoundFrac: 0.25,
  tileEdgeChamferMm: 2,

  interlockEnabled: true,
  rebateDepthMm: 1,
  rebateLengthMm: 60,
  rebateWidthMm: 12,
  connectorClearanceMm: 0.2,

  magnetsEnabled: false,
  magnetDiameterMm: 8,
  magnetDepthMm: 1.2,
  magnetInsetMm: 20,

  centreTiles: true,
  filamentDiameterMm: 1.75,
  filamentDensityGCm3: 1.24,
};

/** A problem that makes the parameter set unusable. */
export interface ValidationIssue {
  readonly level: 'error' | 'warning';
  readonly message: string;
}

const isPositiveInt = (n: number): boolean => Number.isInteger(n) && n > 0;

/**
 * Checks a parameter set for combinations that would produce broken or
 * unprintable geometry. Errors block export; warnings do not.
 */
export function validate(p: Params): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (message: string): number => issues.push({ level: 'error', message });
  const warn = (message: string): number => issues.push({ level: 'warning', message });

  if (!(p.panelWidthMm > 0) || !(p.panelHeightMm > 0)) err('Panel dimensions must be positive.');
  if (!isPositiveInt(p.columns) || !isPositiveInt(p.rows)) err('Rows and columns must be whole numbers above zero.');
  if (!(p.samplePitchMm > 0)) err('Sample pitch must be positive.');
  if (!(p.baseThicknessMm > 0)) err('Base thickness must be positive.');
  if (!(p.reliefHeightMm > 0)) err('Relief height must be positive.');
  if (p.threshold <= 0 || p.threshold >= 1) err('Threshold must sit strictly between 0 and 1.');
  if (p.bevelBias < -1 || p.bevelBias > 1) err('Bevel bias must be between -1 and 1.');
  if (p.baseFilletFrac < 0 || p.baseFilletFrac > 0.5) err('Base fillet fraction must be between 0 and 0.5.');
  if (p.topRoundFrac < 0 || p.topRoundFrac > 0.5) err('Top round fraction must be between 0 and 0.5.');
  if (p.fitMode === 'repeat' && !(p.repeatWidthMm > 0)) err('Repeat width must be positive.');
  if (p.tileEdgeChamferMm < 0) err('Tile edge chamfer cannot be negative.');

  const tileW = p.panelWidthMm / p.columns;
  const tileH = p.panelHeightMm / p.rows;

  if (p.interlockEnabled) {
    if (p.rebateDepthMm >= p.baseThicknessMm) {
      err(`Rebate depth (${p.rebateDepthMm} mm) must be less than base thickness (${p.baseThicknessMm} mm).`);
    }
    if (p.rebateLengthMm >= Math.min(tileW, tileH)) err('Rebate length must be shorter than the tile edge.');
    if (p.rebateWidthMm * 2 >= Math.min(tileW, tileH)) err('Opposing rebates would meet in the middle of the tile.');
    if (p.baseThicknessMm - p.rebateDepthMm < 0.6) {
      warn(`Only ${(p.baseThicknessMm - p.rebateDepthMm).toFixed(2)} mm of material remains over each rebate.`);
    }
  }
  if (p.tileEdgeChamferMm * 2 >= Math.min(tileW, tileH)) err('Tile edge chamfer would consume the whole tile.');
  if (p.magnetsEnabled) {
    if (p.magnetDepthMm >= p.baseThicknessMm) err('Magnet pocket depth must be less than base thickness.');
    if (p.magnetInsetMm * 2 >= Math.min(tileW, tileH)) err('Magnet inset places pockets outside the tile.');
  }

  const grid = resolveGrid(p);
  if (grid.pitchX > p.bevelWidthMm || grid.pitchY > p.bevelWidthMm) {
    warn(`Sample pitch (${grid.pitchX.toFixed(2)} mm) is coarser than the bevel band; the slope will look stepped.`);
  }
  if (p.interlockEnabled && p.rebateWidthMm < grid.pitchX * 3) {
    warn('Rebate width spans fewer than three samples and will be badly quantised.');
  }
  if (p.tileEdgeChamferMm > 0 && p.tileEdgeChamferMm < grid.pitchX * 2) {
    warn('Tile edge chamfer is narrower than two samples and will print as a hard lip rather than an eased edge.');
  }
  if (p.magnetsEnabled && p.magnetDiameterMm < grid.pitchX * 8) {
    warn('Magnet pockets are quantised to the sample grid and will be too rough to hold a magnet at this pitch.');
  }
  if (p.reliefHeightMm < 0.6) warn('Relief height is below three 0.2 mm layers.');
  return issues;
}

/** The sampling grid the whole panel is evaluated on. Tiles are exact integer slices of it. */
export interface GridSpec {
  /** Samples along one tile edge, horizontally and vertically. */
  readonly tileSamplesX: number;
  readonly tileSamplesY: number;
  /** Vertex counts for the whole panel. */
  readonly gx: number;
  readonly gy: number;
  readonly pitchX: number;
  readonly pitchY: number;
  readonly tileWidthMm: number;
  readonly tileHeightMm: number;
}

/**
 * Derives the global sampling grid. The sample pitch is rounded so that a tile
 * holds a whole number of samples, which is what guarantees that neighbouring
 * tiles are cut on shared grid lines and therefore share exact edge geometry.
 */
export function resolveGrid(p: Params, pitchOverrideMm?: number): GridSpec {
  const pitch = pitchOverrideMm ?? p.samplePitchMm;
  const tileWidthMm = p.panelWidthMm / p.columns;
  const tileHeightMm = p.panelHeightMm / p.rows;
  const tileSamplesX = Math.max(2, Math.round(tileWidthMm / pitch));
  const tileSamplesY = Math.max(2, Math.round(tileHeightMm / pitch));
  return {
    tileSamplesX,
    tileSamplesY,
    gx: tileSamplesX * p.columns + 1,
    gy: tileSamplesY * p.rows + 1,
    pitchX: tileWidthMm / tileSamplesX,
    pitchY: tileHeightMm / tileSamplesY,
    tileWidthMm,
    tileHeightMm,
  };
}

/** `r03-c07` style identifier for a zero-based tile position. */
export function tileName(row: number, column: number): string {
  const pad = (n: number): string => String(n + 1).padStart(2, '0');
  return `r${pad(row)}-c${pad(column)}`;
}
