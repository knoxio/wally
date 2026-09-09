import { connectorCount } from '../core/connector.js';
import type { Heightmap } from '../core/heightmap.js';
import { estimateMaterial, type MaterialEstimate } from '../core/estimate.js';
import { neighboursOf } from '../core/tiles.js';
import { resolveGrid, type Params } from '../core/params.js';

/**
 * Exact triangle count for the panel's topology (independent of pixel data):
 * every tile's top and bottom grid plus its side wall, summed over the whole
 * panel, plus one box per connector. Mirrors the triangulation in
 * `solid.ts`/`tiles.ts` without building any mesh.
 */
export function estimateTotalTriangles(p: Params): number {
  const grid = resolveGrid(p);
  const nx = grid.tileSamplesX + 1;
  const ny = grid.tileSamplesY + 1;
  const topTriangles = (nx - 1) * (ny - 1) * 2;
  const ringLength = 2 * (nx - 1) + 2 * (ny - 1);
  const sideTriangles = ringLength * 2;

  let total = 0;
  for (let row = 0; row < p.rows; row++) {
    for (let column = 0; column < p.columns; column++) {
      const n = neighboursOf(p, row, column);
      const hasRebateField = p.interlockEnabled && (n.north || n.south || n.east || n.west);
      const hasBottomField = hasRebateField || p.magnetsEnabled;
      const bottomTriangles = hasBottomField ? (nx - 1) * (ny - 1) * 2 : ringLength;
      total += topTriangles + bottomTriangles + sideTriangles;
    }
  }

  if (p.interlockEnabled) {
    const connectorTop = 2;
    const connectorRing = 4;
    const connectorBottom = connectorRing;
    const connectorSide = connectorRing * 2;
    total += (connectorTop + connectorBottom + connectorSide) * connectorCount(p);
  }
  return total;
}

/**
 * Size of the exported zip's contents, in bytes, before compression.
 *
 * Counts one connector file rather than the whole print run of them, because
 * this answers "how big is the download", not "how much do I print".
 */
export function estimateExportBytes(p: Params): number {
  const grid = resolveGrid(p);
  const nx = grid.tileSamplesX + 1;
  const ny = grid.tileSamplesY + 1;
  const topTriangles = (nx - 1) * (ny - 1) * 2;
  const ringLength = 2 * (nx - 1) + 2 * (ny - 1);
  const sideTriangles = ringLength * 2;

  let bytes = 0;
  for (let row = 0; row < p.rows; row++) {
    for (let column = 0; column < p.columns; column++) {
      const n = neighboursOf(p, row, column);
      const hasRebateField = p.interlockEnabled && (n.north || n.south || n.east || n.west);
      const bottomTriangles = hasRebateField || p.magnetsEnabled ? topTriangles : ringLength;
      bytes += 84 + 50 * (topTriangles + bottomTriangles + sideTriangles);
    }
  }
  if (p.interlockEnabled) bytes += 84 + 50 * 14;
  return bytes;
}

/**
 * Rough solid-volume estimate for the whole panel, read from a heightmap that
 * may be sampled at a coarser (preview) pitch. Each grid cell is treated as a
 * slab from z = 0 up to the average of its four corner heights, so the figure
 * ignores the small amount of material removed by rebates, magnet pockets and
 * the tile-edge chamfer — an upper bound, consistent with `estimateMaterial`'s
 * own "100% infill" framing.
 */
export function estimatePanelVolumeMm3(heightmap: Heightmap): number {
  const { gx, gy, pitchX, pitchY } = heightmap.grid;
  const { top } = heightmap;
  let volume = 0;
  const cellArea = pitchX * pitchY;
  for (let j = 0; j < gy - 1; j++) {
    for (let i = 0; i < gx - 1; i++) {
      const z00 = top[j * gx + i] ?? 0;
      const z10 = top[j * gx + i + 1] ?? 0;
      const z01 = top[(j + 1) * gx + i] ?? 0;
      const z11 = top[(j + 1) * gx + i + 1] ?? 0;
      volume += ((z00 + z10 + z01 + z11) / 4) * cellArea;
    }
  }
  return volume;
}

function connectorVolumeMm3(p: Params): number {
  const c = p.connectorClearanceMm;
  const spanMm = 2 * p.rebateWidthMm + p.gapMm - 2 * c;
  const lengthMm = p.rebateLengthMm - 2 * c;
  const thicknessMm = p.rebateDepthMm - c;
  if (!(spanMm > 0 && lengthMm > 0 && thicknessMm > 0)) return 0;
  return spanMm * lengthMm * thicknessMm * connectorCount(p);
}

/** Estimated material for the whole panel: every tile plus every connector, from a (possibly coarse) heightmap. */
export function estimatePanelMaterial(heightmap: Heightmap, p: Params): MaterialEstimate {
  const tilesVolume = estimatePanelVolumeMm3(heightmap);
  const connectorsVolume = p.interlockEnabled ? connectorVolumeMm3(p) : 0;
  return estimateMaterial(tilesVolume + connectorsVolume, p);
}
