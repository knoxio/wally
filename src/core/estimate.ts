import type { Params } from './params.js';

/** Material figures for one printed part. */
export interface MaterialEstimate {
  /** Solid volume of the mesh, in cubic millimetres. */
  readonly volumeMm3: number;
  /** Length of filament that volume represents, in metres. */
  readonly filamentM: number;
  readonly massG: number;
}

/**
 * Converts a solid volume into filament length and mass.
 *
 * This is the volume of the model itself, not of the print: a sliced part with
 * sparse infill uses less, and one with many perimeters or a brim uses a little
 * more. Treat it as the upper bound that a 100 % infill print would hit.
 */
export function estimateMaterial(volumeMm3: number, p: Params): MaterialEstimate {
  const r = p.filamentDiameterMm / 2;
  const areaMm2 = Math.PI * r * r;
  return {
    volumeMm3,
    filamentM: areaMm2 > 0 ? volumeMm3 / areaMm2 / 1000 : 0,
    massG: (volumeMm3 / 1000) * p.filamentDensityGCm3,
  };
}

export function sumEstimates(parts: readonly MaterialEstimate[]): MaterialEstimate {
  return parts.reduce(
    (acc, e) => ({
      volumeMm3: acc.volumeMm3 + e.volumeMm3,
      filamentM: acc.filamentM + e.filamentM,
      massG: acc.massG + e.massG,
    }),
    { volumeMm3: 0, filamentM: 0, massG: 0 },
  );
}
