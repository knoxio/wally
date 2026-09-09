import { describe, expect, it } from 'vitest';
import { buildHeightmap } from '../src/core/heightmap.js';
import { resolveGrid, type Params } from '../src/core/params.js';
import { neighboursOf, sliceTile, type Tile } from '../src/core/tiles.js';
import { at, testParams } from './helpers/params.js';
import { checkerboard, disc, noise } from './helpers/raster.js';

const IMAGE = disc(96, 96, 0.62);

function panel(p: Params): Tile[][] {
  const heightmap = buildHeightmap(IMAGE, p);
  return Array.from({ length: p.rows }, (_, row) =>
    Array.from({ length: p.columns }, (_, column) => sliceTile(heightmap, p, row, column)),
  );
}

const tileAt = (grid: Tile[][], row: number, column: number): Tile => {
  const r = grid[row];
  const t = r === undefined ? undefined : r[column];
  if (t === undefined) throw new Error(`no tile at ${row},${column}`);
  return t;
};

const rightEdge = (t: Tile): number[] => {
  const { nx, ny, top } = t.solid;
  return Array.from({ length: ny }, (_, j) => at(top, j * nx + (nx - 1)));
};
const leftEdge = (t: Tile): number[] => {
  const { nx, ny, top } = t.solid;
  return Array.from({ length: ny }, (_, j) => at(top, j * nx));
};
const bottomEdge = (t: Tile): number[] => {
  const { nx, ny, top } = t.solid;
  return Array.from({ length: nx }, (_, i) => at(top, (ny - 1) * nx + i));
};
const topEdge = (t: Tile): number[] => {
  const { nx, top } = t.solid;
  return Array.from({ length: nx }, (_, i) => at(top, i));
};

describe('neighboursOf', () => {
  it('marks only the edges that face another tile', () => {
    const p = testParams({ rows: 3, columns: 3 });
    expect(neighboursOf(p, 0, 0)).toEqual({ north: false, south: true, west: false, east: true });
    expect(neighboursOf(p, 1, 1)).toEqual({ north: true, south: true, west: true, east: true });
    expect(neighboursOf(p, 2, 2)).toEqual({ north: true, south: false, west: true, east: false });
  });

  it('gives a lone tile no neighbours at all', () => {
    const p = testParams({ rows: 1, columns: 1, panelWidthMm: 30, panelHeightMm: 30 });
    expect(neighboursOf(p, 0, 0)).toEqual({ north: false, south: false, west: false, east: false });
  });
});

describe('shared edge identity', () => {
  const variants: ReadonlyArray<readonly [string, Partial<Params>]> = [
    ['with the tile edge chamfer on', { tileEdgeChamferMm: 3 }],
    ['with the tile edge chamfer off', { tileEdgeChamferMm: 0 }],
    ['with the interlock on', { tileEdgeChamferMm: 0, interlockEnabled: true }],
    ['with the interlock and the chamfer on', { tileEdgeChamferMm: 3, interlockEnabled: true }],
    ['in continuous height mode', { tileEdgeChamferMm: 0, heightMode: 'continuous' }],
    ['with a non-square panel and an awkward pitch', {
      panelWidthMm: 140, panelHeightMm: 90, columns: 4, rows: 3, samplePitchMm: 1.3,
      tileEdgeChamferMm: 0, rebateLengthMm: 12, rebateWidthMm: 6,
    }],
  ];

  for (const [label, patch] of variants) {
    it(`makes the vertical seam exactly equal, value for value, ${label}`, () => {
      const p = testParams(patch);
      const grid = panel(p);
      for (let row = 0; row < p.rows; row++) {
        for (let column = 0; column < p.columns - 1; column++) {
          const left = rightEdge(tileAt(grid, row, column));
          const right = leftEdge(tileAt(grid, row, column + 1));
          expect(left).toEqual(right);
        }
      }
    });

    it(`makes the horizontal seam exactly equal, value for value, ${label}`, () => {
      const p = testParams(patch);
      const grid = panel(p);
      for (let row = 0; row < p.rows - 1; row++) {
        for (let column = 0; column < p.columns; column++) {
          const above = bottomEdge(tileAt(grid, row, column));
          const below = topEdge(tileAt(grid, row + 1, column));
          expect(above).toEqual(below);
        }
      }
    });
  }

  it('is not a vacuous match: the seam actually varies along its length when the chamfer is off', () => {
    const p = testParams({ tileEdgeChamferMm: 0 });
    const heightmap = buildHeightmap(checkerboard(96, 96, 11), p);
    const seam = rightEdge(sliceTile(heightmap, p, 1, 0));
    expect(new Set(seam).size).toBeGreaterThan(1);
    expect(Math.max(...seam) - Math.min(...seam)).toBeGreaterThan(1);
    expect(seam).toEqual(leftEdge(sliceTile(heightmap, p, 1, 1)));
  });

  it('holds for a source with a different value at nearly every sample', () => {
    const p = testParams({ tileEdgeChamferMm: 0, cornerRadiusMm: 0, heightMode: 'continuous' });
    const heightmap = buildHeightmap(noise(96, 96, 7), p);
    const a = sliceTile(heightmap, p, 1, 0);
    const b = sliceTile(heightmap, p, 1, 1);
    expect(new Set(rightEdge(a)).size).toBeGreaterThan(5);
    expect(rightEdge(a)).toEqual(leftEdge(b));
  });

  it('places the seam at the same physical x for both tiles', () => {
    const p = testParams();
    const grid = panel(p);
    const a = tileAt(grid, 0, 0);
    const b = tileAt(grid, 0, 1);
    expect(at(a.solid.xs, a.solid.nx - 1) - at(a.solid.xs, 0)).toBeCloseTo(p.panelWidthMm / p.columns, 12);
    expect(Array.from(a.solid.xs)).toEqual(Array.from(b.solid.xs));
    expect(Array.from(a.solid.ys)).toEqual(Array.from(b.solid.ys));
  });
});

describe('sliceTile', () => {
  it('cuts a tile of exactly one grid slice, with a shared vertex row on each seam', () => {
    const p = testParams();
    const g = resolveGrid(p);
    const tile = sliceTile(buildHeightmap(IMAGE, p), p, 1, 2);
    expect(tile.solid.nx).toBe(g.tileSamplesX + 1);
    expect(tile.solid.ny).toBe(g.tileSamplesY + 1);
    expect(tile.widthMm).toBe(g.tileWidthMm);
    expect(tile.heightMm).toBe(g.tileHeightMm);
    expect(tile.name).toBe('r02-c03');
  });

  it('runs y downwards so image row 0 ends up at the top of the tile', () => {
    const p = testParams();
    const tile = sliceTile(buildHeightmap(IMAGE, p), p, 0, 0);
    const { ys } = tile.solid;
    expect(at(ys, 0)).toBeGreaterThan(at(ys, 1));
    expect(at(ys, 0) - at(ys, ys.length - 1)).toBeCloseTo(tile.heightMm, 12);
  });

  it('centres the tile on the origin when asked, and corners it otherwise', () => {
    const p = testParams();
    const heightmap = buildHeightmap(IMAGE, p);
    const centred = sliceTile(heightmap, { ...p, centreTiles: true }, 0, 0);
    expect(at(centred.solid.xs, 0)).toBeCloseTo(-centred.widthMm / 2, 12);
    expect(at(centred.solid.ys, 0)).toBeCloseTo(centred.heightMm / 2, 12);

    const cornered = sliceTile(heightmap, { ...p, centreTiles: false }, 0, 0);
    expect(at(cornered.solid.xs, 0)).toBe(0);
    expect(at(cornered.solid.ys, 0)).toBeCloseTo(cornered.heightMm, 12);
  });

  it('takes different content from different tile positions', () => {
    const p = testParams({ tileEdgeChamferMm: 0 });
    const heightmap = buildHeightmap(checkerboard(90, 90, 7), p);
    const a = sliceTile(heightmap, p, 0, 0);
    const b = sliceTile(heightmap, p, 1, 1);
    expect(Array.from(a.solid.top)).not.toEqual(Array.from(b.solid.top));
  });

  it('gives a flat underside only when there is nothing to cut into it', () => {
    const p = testParams();
    const heightmap = buildHeightmap(IMAGE, p);
    expect(sliceTile(heightmap, { ...p, interlockEnabled: false, magnetsEnabled: false }, 1, 1).solid.bottom).toBeNull();
    expect(sliceTile(heightmap, { ...p, interlockEnabled: true, magnetsEnabled: false }, 1, 1).solid.bottom).not.toBeNull();
    expect(sliceTile(heightmap, { ...p, interlockEnabled: false, magnetsEnabled: true }, 1, 1).solid.bottom).not.toBeNull();
  });
});

describe('the tile edge chamfer', () => {
  const p = testParams({ tileEdgeChamferMm: 3, interlockEnabled: false, magnetsEnabled: false });
  const heightmap = buildHeightmap(IMAGE, p);
  const chamfered = sliceTile(heightmap, p, 1, 1);
  const plain = sliceTile(heightmap, { ...p, tileEdgeChamferMm: 0 }, 1, 1);
  const { nx, ny } = chamfered.solid;
  const { pitchX, pitchY } = resolveGrid(p);

  const border = (i: number, j: number): number =>
    Math.min(i * pitchX, (nx - 1 - i) * pitchX, j * pitchY, (ny - 1 - j) * pitchY);

  it('never raises the surface', () => {
    for (let i = 0; i < nx * ny; i++) {
      expect(at(chamfered.solid.top, i)).toBeLessThanOrEqual(at(plain.solid.top, i));
    }
  });

  it('pulls the whole border ring exactly to the base thickness', () => {
    for (let i = 0; i < nx; i++) {
      expect(at(chamfered.solid.top, i)).toBe(p.baseThicknessMm);
      expect(at(chamfered.solid.top, (ny - 1) * nx + i)).toBe(p.baseThicknessMm);
    }
    for (let j = 0; j < ny; j++) {
      expect(at(chamfered.solid.top, j * nx)).toBe(p.baseThicknessMm);
      expect(at(chamfered.solid.top, j * nx + (nx - 1))).toBe(p.baseThicknessMm);
    }
  });

  it('leaves every sample at or beyond the chamfer width completely untouched', () => {
    let untouched = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (border(i, j) < p.tileEdgeChamferMm - 1e-9) continue;
        untouched++;
        expect(at(chamfered.solid.top, j * nx + i)).toBe(at(plain.solid.top, j * nx + i));
      }
    }
    expect(untouched).toBeGreaterThan(0);
  });

  it('actually lowers something inside the band, so the test above is not vacuous', () => {
    let lowered = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (at(chamfered.solid.top, j * nx + i) < at(plain.solid.top, j * nx + i)) lowered++;
      }
    }
    expect(lowered).toBeGreaterThan(0);
  });

  it('rises monotonically away from the border along a ray into the tile', () => {
    const flat = sliceTile(buildHeightmap(IMAGE, { ...p, heightMode: 'continuous', reliefHeightMm: 3 }), p, 1, 1);
    const j = Math.floor(ny / 2);
    const limit = Math.ceil(p.tileEdgeChamferMm / pitchX);
    for (let i = 1; i <= limit; i++) {
      const ratio = at(flat.solid.top, j * nx + i) - p.baseThicknessMm;
      const prev = at(flat.solid.top, j * nx + (i - 1)) - p.baseThicknessMm;
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(prev).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves the field alone entirely when the chamfer is zero', () => {
    const zero = sliceTile(heightmap, { ...p, tileEdgeChamferMm: 0 }, 1, 1);
    expect(Array.from(zero.solid.top)).toEqual(Array.from(plain.solid.top));
  });
});
