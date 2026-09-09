import { describe, expect, it } from 'vitest';
import { mountedSizeMm, placementMapMarkdown, placementMapSvg, placements } from '../src/core/placement.js';
import { testParams } from './helpers/params.js';

describe('mountedSizeMm', () => {
  it('adds one gap between each pair of tiles and none at the outside', () => {
    const p = testParams({ panelWidthMm: 1350, panelHeightMm: 750, columns: 9, rows: 5, gapMm: 5 });
    expect(mountedSizeMm(p)).toEqual({ widthMm: 1350 + 5 * 8, heightMm: 750 + 5 * 4 });
  });

  it('adds nothing at all for a single tile', () => {
    const p = testParams({ panelWidthMm: 100, panelHeightMm: 60, columns: 1, rows: 1, gapMm: 12 });
    expect(mountedSizeMm(p)).toEqual({ widthMm: 100, heightMm: 60 });
  });

  it('adds nothing when the gap is zero', () => {
    const p = testParams({ panelWidthMm: 90, panelHeightMm: 90, gapMm: 0 });
    expect(mountedSizeMm(p)).toEqual({ widthMm: 90, heightMm: 90 });
  });
});

describe('placements', () => {
  const p = testParams({ panelWidthMm: 120, panelHeightMm: 60, columns: 4, rows: 2, gapMm: 3 });
  const items = placements(p);

  it('emits one entry per tile in row-major order', () => {
    expect(items.length).toBe(8);
    expect(items.map((t) => t.name)).toEqual([
      'r01-c01', 'r01-c02', 'r01-c03', 'r01-c04',
      'r02-c01', 'r02-c02', 'r02-c03', 'r02-c04',
    ]);
    expect(items.map((t) => [t.row, t.column])).toEqual([
      [0, 0], [0, 1], [0, 2], [0, 3],
      [1, 0], [1, 1], [1, 2], [1, 3],
    ]);
  });

  it('steps by the tile size plus one gap and starts at the origin', () => {
    expect(items[0]).toEqual({ row: 0, column: 0, name: 'r01-c01', xMm: 0, yMm: 0, widthMm: 30, heightMm: 30 });
    expect(items[1]?.xMm).toBeCloseTo(33, 12);
    expect(items[3]?.xMm).toBeCloseTo(99, 12);
    expect(items[4]?.yMm).toBeCloseTo(33, 12);
    expect(items[4]?.xMm).toBe(0);
  });

  it('ends exactly at the mounted size, so the gaps are only interior', () => {
    const last = items[items.length - 1];
    if (last === undefined) throw new Error('no placements');
    const size = mountedSizeMm(p);
    expect(last.xMm + last.widthMm).toBeCloseTo(size.widthMm, 12);
    expect(last.yMm + last.heightMm).toBeCloseTo(size.heightMm, 12);
  });

  it('gives every tile the same size, which is the panel divided by the tile counts', () => {
    for (const t of items) {
      expect(t.widthMm).toBeCloseTo(120 / 4, 12);
      expect(t.heightMm).toBeCloseTo(60 / 2, 12);
    }
  });
});

describe('placementMapSvg', () => {
  const p = testParams({ panelWidthMm: 120, panelHeightMm: 60, columns: 4, rows: 2, gapMm: 3 });

  it('draws one rect and one label per tile', () => {
    const svg = placementMapSvg(p);
    expect(svg.match(/<rect /g)?.length).toBe(9);
    for (const t of placements(p)) expect(svg).toContain(`>${t.name}</text>`);
  });

  it('sizes the drawing 1:1 in millimetres including the margin', () => {
    const svg = placementMapSvg(p);
    const size = mountedSizeMm(p);
    expect(svg).toContain(`width="${size.widthMm + 80}mm"`);
    expect(svg).toContain(`height="${size.heightMm + 80}mm"`);
    expect(svg).toContain('viewBox="-40 -40 ');
  });

  it('escapes markup characters in the title', () => {
    const svg = placementMapSvg(p, 'Kitchen <wall> & hall');
    expect(svg).toContain('Kitchen &lt;wall&gt; &amp; hall');
    expect(svg).not.toContain('<wall>');
    expect(svg).not.toContain('Kitchen <');
  });

  it('escapes an ampersand before the entities it introduces, so it does not double-encode', () => {
    const svg = placementMapSvg(p, '&lt;');
    expect(svg).toContain('&amp;lt;');
  });

  it('is deterministic', () => {
    expect(placementMapSvg(p)).toBe(placementMapSvg(p));
  });

  it('rounds coordinates to three decimals rather than emitting float noise', () => {
    const awkward = testParams({ panelWidthMm: 100, panelHeightMm: 100, columns: 3, rows: 3, gapMm: 0 });
    const svg = placementMapSvg(awkward);
    expect(svg).toContain('x="33.333"');
    expect(svg).not.toMatch(/x="33\.33333/);
  });
});

describe('placementMapMarkdown', () => {
  const p = testParams({ panelWidthMm: 120, panelHeightMm: 60, columns: 4, rows: 2, gapMm: 3 });

  it('lists every tile as a one-based row in the table', () => {
    const md = placementMapMarkdown(p);
    expect(md).toContain('| r01-c01 | 1 | 1 | 0 | 0 |');
    expect(md).toContain('| r02-c04 | 2 | 4 | 99 | 33 |');
    expect(md.split('\n').filter((l) => l.startsWith('| r')).length).toBe(8);
  });

  it('states the mounted size and the tile size', () => {
    const md = placementMapMarkdown(p);
    expect(md).toContain('Mounted panel: 129 x 63 mm including 3 mm gaps.');
    expect(md).toContain('Tile: 30 x 30 mm.');
  });
});
