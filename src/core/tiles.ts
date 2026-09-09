import type { Heightmap } from './heightmap.js';
import { tileName, type Params } from './params.js';
import type { FieldSolid } from './solid.js';

/** Which of a tile's four edges face another tile rather than the outside of the panel. */
export interface Neighbours {
  readonly north: boolean;
  readonly south: boolean;
  readonly east: boolean;
  readonly west: boolean;
}

/** One tile, ready to be triangulated. */
export interface Tile {
  readonly row: number;
  readonly column: number;
  readonly name: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly neighbours: Neighbours;
  readonly solid: FieldSolid;
}

export function neighboursOf(p: Params, row: number, column: number): Neighbours {
  return {
    north: row > 0,
    south: row < p.rows - 1,
    west: column > 0,
    east: column < p.columns - 1,
  };
}

/**
 * Cuts one tile out of the panel height field.
 *
 * The tile is a straight integer slice of the shared grid, so the samples along
 * a shared edge are the very same numbers in both neighbouring tiles. Nothing
 * here re-evaluates the pattern; the only per-tile modifications are functions
 * of distance to the tile border, which are by definition equal on both sides of
 * that border.
 *
 * Y descends down the returned arrays so that row 0 of the source image ends up
 * at the top of the tile when it is viewed from above.
 */
export function sliceTile(heightmap: Heightmap, p: Params, row: number, column: number): Tile {
  const { grid, top } = heightmap;
  const { tileSamplesX: sx, tileSamplesY: sy, pitchX, pitchY, gx } = grid;
  const nx = sx + 1;
  const ny = sy + 1;
  const widthMm = grid.tileWidthMm;
  const heightMm = grid.tileHeightMm;

  const x0 = p.centreTiles ? -widthMm / 2 : 0;
  const y0 = p.centreTiles ? heightMm / 2 : heightMm;
  const xs = new Float64Array(nx);
  const ys = new Float64Array(ny);
  for (let i = 0; i < nx; i++) xs[i] = x0 + i * pitchX;
  for (let j = 0; j < ny; j++) ys[j] = y0 - j * pitchY;

  const originI = column * sx;
  const originJ = row * sy;
  const topField = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      topField[j * nx + i] = top[(originJ + j) * gx + (originI + i)] ?? 0;
    }
  }
  applyEdgeChamfer(topField, nx, ny, pitchX, pitchY, p);

  return {
    row,
    column,
    name: tileName(row, column),
    widthMm,
    heightMm,
    neighbours: neighboursOf(p, row, column),
    solid: {
      nx,
      ny,
      xs,
      ys,
      top: topField,
      bottom: buildUnderside(p, nx, ny, pitchX, pitchY, neighboursOf(p, row, column)),
    },
  };
}

/**
 * Eases the relief down to the base plane in a narrow band around the tile
 * border, so each tile reads as a discrete plaque with a softened lip instead of
 * ending in a knife edge at the cut line.
 *
 * The taper depends only on the distance to the border, so two tiles sharing an
 * edge still agree exactly along it.
 */
function applyEdgeChamfer(
  field: Float64Array,
  nx: number,
  ny: number,
  pitchX: number,
  pitchY: number,
  p: Params,
): void {
  const w = p.tileEdgeChamferMm;
  if (w <= 0) return;
  const base = p.baseThicknessMm;
  for (let j = 0; j < ny; j++) {
    const dy = Math.min(j * pitchY, (ny - 1 - j) * pitchY);
    for (let i = 0; i < nx; i++) {
      const dx = Math.min(i * pitchX, (nx - 1 - i) * pitchX);
      const d = Math.min(dx, dy);
      if (d >= w) continue;
      const t = d / w;
      const k = t * t * (3 - 2 * t);
      const idx = j * nx + i;
      field[idx] = base + ((field[idx] ?? base) - base) * k;
    }
  }
}

/**
 * The underside height field, or null when the back of the tile is flat.
 *
 * Rebates are cut as open-ended recesses in the back face along every edge that
 * meets another tile. Two facing rebates and the mounting gap between them form
 * a single flat slot that a printed connector plate drops into, keying the tiles
 * to each other in plane and holding them coplanar without anything showing from
 * the front. Because the recess breaks out at the tile edge, the slicer bridges
 * it across its short axis and it needs no support.
 */
function buildUnderside(
  p: Params,
  nx: number,
  ny: number,
  pitchX: number,
  pitchY: number,
  n: Neighbours,
): Float64Array | null {
  const wantRebates = p.interlockEnabled && (n.north || n.south || n.east || n.west);
  if (!wantRebates && !p.magnetsEnabled) return null;

  const field = new Float64Array(nx * ny);
  const widthMm = (nx - 1) * pitchX;
  const heightMm = (ny - 1) * pitchY;

  const cut = (z: number, inside: (x: number, y: number) => boolean): void => {
    for (let j = 0; j < ny; j++) {
      const y = j * pitchY;
      for (let i = 0; i < nx; i++) {
        if (!inside(i * pitchX, y)) continue;
        const idx = j * nx + i;
        if (z > (field[idx] ?? 0)) field[idx] = z;
      }
    }
  };

  if (wantRebates) {
    const d = p.rebateDepthMm;
    const half = p.rebateLengthMm / 2;
    const reach = p.rebateWidthMm;
    const midX = widthMm / 2;
    const midY = heightMm / 2;
    if (n.north) cut(d, (x, y) => y <= reach && Math.abs(x - midX) <= half);
    if (n.south) cut(d, (x, y) => y >= heightMm - reach && Math.abs(x - midX) <= half);
    if (n.west) cut(d, (x, y) => x <= reach && Math.abs(y - midY) <= half);
    if (n.east) cut(d, (x, y) => x >= widthMm - reach && Math.abs(y - midY) <= half);
  }

  if (p.magnetsEnabled) {
    const r = p.magnetDiameterMm / 2;
    const inset = p.magnetInsetMm;
    const centres: Array<[number, number]> = [
      [inset, inset],
      [widthMm - inset, inset],
      [inset, heightMm - inset],
      [widthMm - inset, heightMm - inset],
    ];
    for (const [cx, cy] of centres) {
      cut(p.magnetDepthMm, (x, y) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r);
    }
  }

  return field;
}
