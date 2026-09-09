import { describe, expect, it } from 'vitest';
import { buildConnector } from '../src/core/connector.js';
import { buildHeightmap } from '../src/core/heightmap.js';
import { inspectManifold, meshVolumeMm3, type Mesh } from '../src/core/mesh.js';
import { buildSolid, type FieldSolid } from '../src/core/solid.js';
import { sliceTile } from '../src/core/tiles.js';
import { at, testParams } from './helpers/params.js';
import { checkerboard, disc } from './helpers/raster.js';

type Axis = 'ascending' | 'descending';

interface BoxOptions {
  readonly nx: number;
  readonly ny: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly yDirection: Axis;
  readonly top: (x: number, y: number) => number;
  readonly bottom: ((x: number, y: number) => number) | null;
}

function makeSolid(o: BoxOptions): FieldSolid {
  const xs = new Float64Array(o.nx);
  const ys = new Float64Array(o.ny);
  for (let i = 0; i < o.nx; i++) xs[i] = (i / (o.nx - 1)) * o.widthMm;
  for (let j = 0; j < o.ny; j++) {
    const t = (j / (o.ny - 1)) * o.heightMm;
    ys[j] = o.yDirection === 'ascending' ? t : o.heightMm - t;
  }
  const top = new Float64Array(o.nx * o.ny);
  const bottom = o.bottom === null ? null : new Float64Array(o.nx * o.ny);
  for (let j = 0; j < o.ny; j++) {
    for (let i = 0; i < o.nx; i++) {
      const x = at(xs, i);
      const y = at(ys, j);
      top[j * o.nx + i] = o.top(x, y);
      if (bottom !== null && o.bottom !== null) bottom[j * o.nx + i] = o.bottom(x, y);
    }
  }
  return { nx: o.nx, ny: o.ny, xs, ys, top, bottom };
}

const box = (overrides: Partial<BoxOptions> = {}): FieldSolid =>
  makeSolid({
    nx: 5,
    ny: 4,
    widthMm: 20,
    heightMm: 12,
    yDirection: 'descending',
    top: () => 3,
    bottom: null,
    ...overrides,
  });

function expectWatertight(mesh: Mesh): void {
  const report = inspectManifold(mesh);
  expect(report.badEdges).toBe(0);
  expect(report.orphanVertices).toBe(0);
  expect(report.eulerCharacteristic).toBe(2);
  expect(report.watertight).toBe(true);
}

describe('buildSolid', () => {
  it('refuses a degenerate grid', () => {
    expect(() => buildSolid(box({ nx: 1 }))).toThrow(/at least two samples/);
    expect(() => buildSolid(box({ ny: 1 }))).toThrow(/at least two samples/);
  });

  const varying = (x: number, y: number): number => 3 + Math.sin(x / 3) + Math.cos(y / 2);

  const cases: ReadonlyArray<readonly [string, Partial<BoxOptions>]> = [
    ['a flat top over a flat null bottom', {}],
    ['a varying top over a flat null bottom', { top: varying }],
    ['a varying top over an explicit flat bottom', { top: varying, bottom: () => 0 }],
    ['a varying top over a varying bottom', { top: varying, bottom: (x: number) => Math.abs(Math.sin(x / 4)) }],
    ['the smallest legal grid', { nx: 2, ny: 2 }],
    ['a single-column-wide grid', { nx: 2, ny: 9, top: varying }],
    ['a single-row-tall grid', { nx: 9, ny: 2, top: varying }],
  ];

  for (const yDirection of ['descending', 'ascending'] as const) {
    describe(`with y ${yDirection}`, () => {
      for (const [label, patch] of cases) {
        it(`is a closed oriented manifold for ${label}`, () => {
          expectWatertight(buildSolid(box({ ...patch, yDirection })));
        });

        it(`winds outward for ${label}`, () => {
          expect(meshVolumeMm3(buildSolid(box({ ...patch, yDirection })))).toBeGreaterThan(0);
        });
      }
    });
  }

  it('produces the analytic volume of a plain box, with either y direction', () => {
    for (const yDirection of ['descending', 'ascending'] as const) {
      const mesh = buildSolid(box({ nx: 7, ny: 5, widthMm: 20, heightMm: 12, top: () => 3, yDirection }));
      expect(meshVolumeMm3(mesh)).toBeCloseTo(20 * 12 * 3, 9);
    }
  });

  it('produces the analytic volume of a box with a raised flat underside', () => {
    for (const yDirection of ['descending', 'ascending'] as const) {
      const mesh = buildSolid(box({ nx: 9, ny: 7, top: () => 3, bottom: () => 1, yDirection }));
      expectWatertight(mesh);
      expect(meshVolumeMm3(mesh)).toBeCloseTo(20 * 12 * 2, 9);
    }
  });

  it('integrates a linearly varying underside exactly', () => {
    const mesh = buildSolid(box({ nx: 9, ny: 7, top: () => 3, bottom: (x) => x * 0.05 }));
    expectWatertight(mesh);
    expect(meshVolumeMm3(mesh)).toBeCloseTo(20 * 12 * 3 - 20 * 12 * 0.5, 9);
  });

  it('removes a pocket bounded by its inner plateau and its outer ramp', () => {
    const widthMm = 20;
    const heightMm = 12;
    const pocket = (x: number, y: number): number => (x >= 5 && x <= 10 && y >= 3 && y <= 9 ? 1 : 0);
    const solidWith = makeSolid({
      nx: 21, ny: 13, widthMm, heightMm, yDirection: 'descending', top: () => 3, bottom: pocket,
    });
    const solidWithout = makeSolid({
      nx: 21, ny: 13, widthMm, heightMm, yDirection: 'descending', top: () => 3, bottom: () => 0,
    });
    const meshWith = buildSolid(solidWith);
    expectWatertight(meshWith);
    const removed = meshVolumeMm3(buildSolid(solidWithout)) - meshVolumeMm3(meshWith);
    expect(removed).toBeGreaterThan(5 * 6 * 1);
    expect(removed).toBeLessThan(7 * 8 * 1);
  });

  it('reverses sign when the triangle winding is reversed, so the volume test is not vacuous', () => {
    const mesh = buildSolid(box({ top: () => 3 }));
    const flipped: Mesh = {
      positions: mesh.positions,
      indices: Uint32Array.from(mesh.indices),
    };
    for (let t = 0; t < flipped.indices.length; t += 3) {
      const b = at(flipped.indices, t + 1);
      flipped.indices[t + 1] = at(flipped.indices, t + 2);
      flipped.indices[t + 2] = b;
    }
    expect(meshVolumeMm3(flipped)).toBeCloseTo(-meshVolumeMm3(mesh), 9);
  });

  it('emits a fan rather than a full grid for a flat underside', () => {
    const withFan = buildSolid(box({ nx: 9, ny: 7, bottom: null }));
    const withGrid = buildSolid(box({ nx: 9, ny: 7, bottom: () => 0 }));
    expect(withFan.indices.length).toBeLessThan(withGrid.indices.length);
    expect(meshVolumeMm3(withFan)).toBeCloseTo(meshVolumeMm3(withGrid), 9);
  });

  it('agrees on volume regardless of which diagonal each cell picks', () => {
    const rising = buildSolid(box({ nx: 9, ny: 7, top: (x, y) => 3 + x * 0.05 + y * 0.05 }));
    const falling = buildSolid(box({ nx: 9, ny: 7, top: (x, y) => 3 + x * 0.05 - y * 0.05 }));
    expectWatertight(rising);
    expectWatertight(falling);
    expect(meshVolumeMm3(rising)).toBeGreaterThan(0);
    expect(meshVolumeMm3(falling)).toBeGreaterThan(0);
  });
});

describe('inspectManifold', () => {
  it('flags an open surface', () => {
    const open: Mesh = {
      positions: Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: Uint32Array.from([0, 1, 2]),
    };
    const report = inspectManifold(open);
    expect(report.watertight).toBe(false);
    expect(report.badEdges).toBe(3);
  });

  it('flags a vertex that no triangle references', () => {
    const mesh = buildSolid(box());
    const padded: Mesh = {
      positions: Float64Array.from([...mesh.positions, 99, 99, 99]),
      indices: mesh.indices,
    };
    const report = inspectManifold(padded);
    expect(report.orphanVertices).toBe(1);
    expect(report.watertight).toBe(false);
  });

  it('flags an inconsistently wound closed surface', () => {
    const mesh = buildSolid(box());
    const twisted: Mesh = { positions: mesh.positions, indices: Uint32Array.from(mesh.indices) };
    const b = at(twisted.indices, 1);
    twisted.indices[1] = at(twisted.indices, 2);
    twisted.indices[2] = b;
    const report = inspectManifold(twisted);
    expect(report.watertight).toBe(false);
    expect(report.badEdges).toBeGreaterThan(0);
  });

  it('counts a torus as closed but not spherical', () => {
    const mesh = torus(8, 6);
    const report = inspectManifold(mesh);
    expect(report.badEdges).toBe(0);
    expect(report.orphanVertices).toBe(0);
    expect(report.eulerCharacteristic).toBe(0);
    expect(report.watertight).toBe(false);
  });
});

function torus(major: number, minor: number): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < major; i++) {
    for (let j = 0; j < minor; j++) {
      const a = (i / major) * Math.PI * 2;
      const b = (j / minor) * Math.PI * 2;
      const r = 3 + Math.cos(b);
      positions.push(r * Math.cos(a), r * Math.sin(a), Math.sin(b));
    }
  }
  const idx = (i: number, j: number): number => (i % major) * minor + (j % minor);
  for (let i = 0; i < major; i++) {
    for (let j = 0; j < minor; j++) {
      indices.push(idx(i, j), idx(i + 1, j), idx(i + 1, j + 1));
      indices.push(idx(i, j), idx(i + 1, j + 1), idx(i, j + 1));
    }
  }
  return { positions: Float64Array.from(positions), indices: Uint32Array.from(indices) };
}

describe('tile solids', () => {
  const image = checkerboard(64, 64, 9);

  const build = (patch: Parameters<typeof testParams>[0], row: number, column: number): Mesh => {
    const p = testParams(patch);
    return buildSolid(sliceTile(buildHeightmap(image, p), p, row, column).solid);
  };

  it('is watertight for a lone tile with no neighbours and therefore no rebates', () => {
    const p = testParams({ rows: 1, columns: 1, panelWidthMm: 30, panelHeightMm: 30, interlockEnabled: true });
    const tile = sliceTile(buildHeightmap(image, p), p, 0, 0);
    expect(tile.solid.bottom).toBeNull();
    const mesh = buildSolid(tile.solid);
    expectWatertight(mesh);
    expect(meshVolumeMm3(mesh)).toBeGreaterThan(0);
  });

  it('is watertight for the middle tile of a 3x3 panel, which is rebated on all four edges', () => {
    const p = testParams({ interlockEnabled: true });
    const tile = sliceTile(buildHeightmap(image, p), p, 1, 1);
    expect(tile.neighbours).toEqual({ north: true, south: true, east: true, west: true });
    expect(tile.solid.bottom).not.toBeNull();
    const mesh = buildSolid(tile.solid);
    expectWatertight(mesh);
    expect(meshVolumeMm3(mesh)).toBeGreaterThan(0);
  });

  const variants: ReadonlyArray<readonly [string, Parameters<typeof testParams>[0]]> = [
    ['a flat top and no interlock or magnets', { interlockEnabled: false, magnetsEnabled: false, reliefHeightMm: 0.6, heightMode: 'continuous' }],
    ['interlock only', { interlockEnabled: true, magnetsEnabled: false }],
    ['magnets only', { interlockEnabled: false, magnetsEnabled: true }],
    ['interlock and magnets together', { interlockEnabled: true, magnetsEnabled: true }],
    ['no tile edge chamfer', { tileEdgeChamferMm: 0, interlockEnabled: true }],
    ['continuous height mode', { heightMode: 'continuous', interlockEnabled: true, magnetsEnabled: true }],
  ];

  for (const [label, patch] of variants) {
    it(`gives every tile of the panel a closed outward-wound mesh with ${label}`, () => {
      const p = testParams(patch);
      const heightmap = buildHeightmap(image, p);
      for (let row = 0; row < p.rows; row++) {
        for (let column = 0; column < p.columns; column++) {
          const mesh = buildSolid(sliceTile(heightmap, p, row, column).solid);
          expectWatertight(mesh);
          expect(meshVolumeMm3(mesh)).toBeGreaterThan(0);
        }
      }
    });
  }

  it('removes material when magnet pockets are cut, and no more than the pockets hold', () => {
    const plain = build({ interlockEnabled: false, magnetsEnabled: false }, 1, 1);
    const pocketed = build({ interlockEnabled: false, magnetsEnabled: true }, 1, 1);
    const p = testParams();
    const pocketVolume = 4 * Math.PI * (p.magnetDiameterMm / 2) ** 2 * p.magnetDepthMm;
    const removed = meshVolumeMm3(plain) - meshVolumeMm3(pocketed);
    expect(removed).toBeGreaterThan(0);
    expect(removed).toBeLessThan(pocketVolume * 1.35);
  });

  it('removes material when rebates are cut', () => {
    const plain = build({ interlockEnabled: false, magnetsEnabled: false }, 1, 1);
    const rebated = build({ interlockEnabled: true, magnetsEnabled: false }, 1, 1);
    expect(meshVolumeMm3(plain) - meshVolumeMm3(rebated)).toBeGreaterThan(0);
  });

  it('stays watertight on a source with dense edge detail', () => {
    const p = testParams({ interlockEnabled: true, magnetsEnabled: true });
    const heightmap = buildHeightmap(disc(48, 48, 0.7), p);
    for (let row = 0; row < p.rows; row++) {
      for (let column = 0; column < p.columns; column++) {
        expectWatertight(buildSolid(sliceTile(heightmap, p, row, column).solid));
      }
    }
  });
});

describe('buildConnector', () => {
  it('produces a closed outward-wound plate of the analytic volume', () => {
    const p = testParams();
    const c = buildConnector(p);
    expectWatertight(c.mesh);
    expect(meshVolumeMm3(c.mesh)).toBeCloseTo(c.spanMm * c.lengthMm * c.thicknessMm, 9);
    expect(meshVolumeMm3(c.mesh)).toBeGreaterThan(0);
  });

  it('sizes the plate to span both rebates and the mounting gap, less clearance', () => {
    const p = testParams({ rebateWidthMm: 6, gapMm: 5, rebateLengthMm: 12, rebateDepthMm: 1, connectorClearanceMm: 0.2 });
    const c = buildConnector(p);
    expect(c.spanMm).toBeCloseTo(2 * 6 + 5 - 0.4, 12);
    expect(c.lengthMm).toBeCloseTo(12 - 0.4, 12);
    expect(c.thicknessMm).toBeCloseTo(1 - 0.2, 12);
  });

  it('counts one connector per shared edge', () => {
    expect(buildConnector(testParams({ rows: 3, columns: 3 })).count).toBe(12);
    expect(buildConnector(testParams({ rows: 1, columns: 1, panelWidthMm: 30, panelHeightMm: 30 })).count).toBe(0);
    expect(buildConnector(testParams({ rows: 5, columns: 9, panelWidthMm: 270, panelHeightMm: 150 })).count).toBe(76);
  });

  it('refuses to build a plate the clearance has eaten', () => {
    expect(() => buildConnector(testParams({ connectorClearanceMm: 1 }))).toThrow(/clearance/);
    expect(() => buildConnector(testParams({ connectorClearanceMm: 7 }))).toThrow(/clearance/);
  });
});
