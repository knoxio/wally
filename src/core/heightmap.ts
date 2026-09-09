import { gaussianBlur, signedDistance } from './field.js';
import { panelToPixel, sampleLuminance, type RasterImage } from './image.js';
import { clamp01, evaluateProfile, type ProfileSpec } from './profile.js';
import { resolveGrid, type GridSpec, type Params } from './params.js';

/**
 * The top surface of the whole panel, sampled once on a grid whose lines fall
 * exactly on the tile boundaries. Tiles are cut out of this, never recomputed,
 * so adjacent tiles necessarily agree along their shared edge.
 */
export interface Heightmap {
  readonly grid: GridSpec;
  /** Absolute z of the top surface at each grid vertex, in millimetres. */
  readonly top: Float32Array;
  /** Height above the base plane, in millimetres. Kept for previewing and statistics. */
  readonly relief: Float32Array;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Builds the panel height field from a source image.
 *
 * In `binary` mode the image is thresholded, optionally corner-rounded with a
 * Gaussian pre-blur, and converted to a signed distance field. The height then
 * follows the chosen profile across a bevel band centred on the signed-distance
 * zero crossing, which produces a slope of a controlled physical width rather
 * than a one-sample cliff.
 *
 * In `continuous` mode the grey level itself drives the profile, so anti-aliased
 * or shaded sources come through as varying height.
 *
 * @param pitchOverrideMm coarser pitch for previews; omit for export quality.
 */
export function buildHeightmap(image: RasterImage, p: Params, pitchOverrideMm?: number): Heightmap {
  const grid = resolveGrid(p, pitchOverrideMm);
  const { gx, gy, pitchX, pitchY } = grid;
  const lum = new Float32Array(gx * gy);
  const fit = {
    fitMode: p.fitMode,
    panelWidthMm: p.panelWidthMm,
    panelHeightMm: p.panelHeightMm,
    repeatWidthMm: p.repeatWidthMm,
  };

  for (let j = 0; j < gy; j++) {
    const yMm = j * pitchY;
    for (let i = 0; i < gx; i++) {
      const hit = panelToPixel(fit, image, i * pitchX, yMm);
      const raw = hit === null ? 0 : sampleLuminance(image, hit.u, hit.v, hit.wrap);
      lum[j * gx + i] = p.invert ? 1 - raw : raw;
    }
  }

  const spec: ProfileSpec = {
    kind: p.profile,
    baseFilletFrac: p.baseFilletFrac,
    topRoundFrac: p.topRoundFrac,
  };
  const relief = new Float32Array(gx * gy);
  const smooth =
    p.cornerRadiusMm > 0
      ? gaussianBlur(lum, gx, gy, p.cornerRadiusMm / 1.5 / pitchX, p.cornerRadiusMm / 1.5 / pitchY)
      : lum;

  if (p.heightMode === 'continuous') {
    for (let i = 0; i < relief.length; i++) {
      relief[i] = p.reliefHeightMm * evaluateProfile(spec, smooth[i] ?? 0);
    }
  } else {
    const mask = new Uint8Array(gx * gy);
    for (let i = 0; i < mask.length; i++) mask[i] = (smooth[i] ?? 0) >= p.threshold ? 1 : 0;
    const sdf = signedDistance(mask, gx, gy, pitchX, pitchY);
    const band = Math.max(1e-6, p.bevelWidthMm);
    const centre = (p.bevelBias * band) / 2;
    for (let i = 0; i < relief.length; i++) {
      const t = clamp01(((sdf[i] ?? 0) - centre) / band + 0.5);
      relief[i] = p.reliefHeightMm * evaluateProfile(spec, t);
    }
  }

  const top = new Float32Array(gx * gy);
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < top.length; i++) {
    const z = p.baseThicknessMm + (relief[i] ?? 0);
    top[i] = z;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { grid, top, relief, minZ, maxZ };
}
