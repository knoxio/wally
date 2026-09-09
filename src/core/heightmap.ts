import { gaussianBlur, signedDistance } from './field.js';
import { panelToPixel, sampleLuminanceArea, type RasterImage } from './image.js';
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
 * Moves the zero crossing of a distance field off the sample lattice.
 *
 * The mask is a per-sample yes/no, so the distance field it produces can only
 * put the boundary on a sample centre. That quantises every curved edge to the
 * grid and prints as a comb of teeth along the side of each ridge, however clean
 * the source image is.
 *
 * The distance is the sample's own offset from the threshold divided by the
 * local slope of the greyscale. The slope is taken from the larger one-sided
 * difference on each axis rather than a central difference: a central
 * difference smears a one-cell step across two cells, underestimates the slope,
 * and pushes the boundary out further than it really is, which made hard-edged
 * sources worse rather than better. One-sided differences handle a step and a
 * wide ramp alike.
 *
 * Samples further from the edge keep the transform's own answer, blended in so
 * the two meet without a step.
 */
function refineNearBoundary(
  sdf: Float32Array,
  field: Float32Array,
  gx: number,
  gy: number,
  pitchX: number,
  pitchY: number,
  threshold: number,
): Float32Array {
  const inner = Math.min(pitchX, pitchY);
  const outer = Math.max(pitchX, pitchY) * 2;

  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      const k = j * gx + i;
      const coarse = sdf[k] ?? 0;
      if (Math.abs(coarse) > outer) continue;

      const here = (field[k] ?? 0) - threshold;
      const dx = steepest(here, i > 0 ? (field[k - 1] ?? 0) - threshold : null, i < gx - 1 ? (field[k + 1] ?? 0) - threshold : null, pitchX);
      const dy = steepest(here, j > 0 ? (field[k - gx] ?? 0) - threshold : null, j < gy - 1 ? (field[k + gx] ?? 0) - threshold : null, pitchY);
      const slope = Math.hypot(dx, dy);
      if (!(slope > 1e-9)) continue;

      const refined = here / slope;
      const magnitude = Math.abs(refined);
      if (!Number.isFinite(refined) || magnitude > outer) continue;

      const t = Math.min(1, Math.max(0, (magnitude - inner) / (outer - inner)));
      const w = t * t * (3 - 2 * t);
      sdf[k] = refined * (1 - w) + coarse * w;
    }
  }
  return sdf;
}

/** Steepest one-sided slope towards either neighbour along one axis. */
function steepest(here: number, before: number | null, after: number | null, spacing: number): number {
  const back = before === null ? 0 : (here - before) / spacing;
  const forward = after === null ? 0 : (after - here) / spacing;
  return Math.abs(back) > Math.abs(forward) ? back : forward;
}

/**
 * How many source pixels one grid step covers, per axis. Measured from the
 * mapping itself rather than assumed, so it stays right for every fit mode.
 */
function pixelFootprint(
  fit: Parameters<typeof panelToPixel>[0],
  image: RasterImage,
  pitchX: number,
  pitchY: number,
): { x: number; y: number } {
  const origin = panelToPixel(fit, image, 0, 0);
  const stepX = panelToPixel(fit, image, pitchX, 0);
  const stepY = panelToPixel(fit, image, 0, pitchY);
  if (origin === null || stepX === null || stepY === null) return { x: 1, y: 1 };
  return { x: Math.abs(stepX.u - origin.u), y: Math.abs(stepY.v - origin.v) };
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

  const footprint = pixelFootprint(fit, image, pitchX, pitchY);
  for (let j = 0; j < gy; j++) {
    const yMm = j * pitchY;
    for (let i = 0; i < gx; i++) {
      const hit = panelToPixel(fit, image, i * pitchX, yMm);
      const raw =
        hit === null ? 0 : sampleLuminanceArea(image, hit.u, hit.v, hit.wrap, footprint.x, footprint.y);
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
    const sdf = refineNearBoundary(
      signedDistance(mask, gx, gy, pitchX, pitchY),
      smooth,
      gx,
      gy,
      pitchX,
      pitchY,
      p.threshold,
    );
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
