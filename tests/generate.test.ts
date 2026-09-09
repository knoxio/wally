import { describe, expect, it } from 'vitest';
import { artifactCount, generate, type Artifact, type GenerateOptions, type GenerateReport } from '../src/core/generate.js';
import type { RasterImage } from '../src/core/image.js';
import { connectorCount } from '../src/core/connector.js';
import { mountedSizeMm } from '../src/core/placement.js';
import type { Params } from '../src/core/params.js';
import { testParams } from './helpers/params.js';
import { buildHeightmap } from '../src/core/heightmap.js';
import { checkerboard, stripes } from './helpers/raster.js';

interface Run {
  readonly paths: string[];
  readonly files: Map<string, Uint8Array>;
  readonly report: GenerateReport;
}

function run(image: RasterImage, p: Params, options: GenerateOptions = {}): Run {
  const it = generate(image, p, options);
  const paths: string[] = [];
  const files = new Map<string, Uint8Array>();
  for (;;) {
    const step = it.next();
    if (step.done === true) return { paths, files, report: step.value };
    const artifact: Artifact = step.value;
    paths.push(artifact.path);
    files.set(artifact.path, artifact.bytes);
  }
}

const IMAGE = checkerboard(64, 64, 11);
const smallPanel = (overrides: Partial<Params> = {}): Params =>
  testParams({
    panelWidthMm: 60,
    panelHeightMm: 60,
    columns: 2,
    rows: 2,
    samplePitchMm: 3,
    tileEdgeChamferMm: 6,
    rebateLengthMm: 12,
    rebateWidthMm: 6,
    ...overrides,
  });

const text = (files: Map<string, Uint8Array>, path: string): string => {
  const bytes = files.get(path);
  if (bytes === undefined) throw new Error(`no artifact at ${path}`);
  return new TextDecoder().decode(bytes);
};

describe('generate', () => {
  it('yields exactly one stl per tile, the connector, both maps and the manifest, in that order', () => {
    const { paths } = run(IMAGE, smallPanel());
    expect(paths).toEqual([
      'r01-c01.stl',
      'r01-c02.stl',
      'r02-c01.stl',
      'r02-c02.stl',
      'connector.stl',
      'placement-map.svg',
      'placement-map.md',
      'manifest.json',
    ]);
  });

  it('omits the connector when the interlock is off', () => {
    const { paths, report } = run(IMAGE, smallPanel({ interlockEnabled: false }));
    expect(paths).not.toContain('connector.stl');
    expect(report.connector).toBeNull();
    expect(report.connectorCount).toBe(0);
  });

  it('scales to the tile count', () => {
    const { paths } = run(IMAGE, smallPanel({ columns: 3, rows: 1, panelWidthMm: 90, panelHeightMm: 30 }));
    expect(paths.filter((f) => f.endsWith('.stl') && f !== 'connector.stl')).toEqual([
      'r01-c01.stl', 'r01-c02.stl', 'r01-c03.stl',
    ]);
  });

  it('reports no tile as unwatertight', () => {
    const { report } = run(IMAGE, smallPanel({ magnetsEnabled: true }));
    expect(report.notWatertight).toEqual([]);
    expect(report.tiles.length).toBe(4);
    for (const t of report.tiles) {
      expect(t.manifold?.watertight).toBe(true);
      expect(t.triangles).toBeGreaterThan(0);
      expect(t.material.volumeMm3).toBeGreaterThan(0);
    }
    expect(report.connector?.manifold?.watertight).toBe(true);
  });

  it('skips verification when asked, which is the only way manifold is null', () => {
    const { report } = run(IMAGE, smallPanel(), { verify: false });
    expect(report.notWatertight).toEqual([]);
    for (const t of report.tiles) expect(t.manifold).toBeNull();
    expect(report.connector?.manifold).toBeNull();
  });

  it('totals the material over every tile and every connector needed', () => {
    const p = smallPanel();
    const { report } = run(IMAGE, p);
    const tileTotal = report.tiles.reduce((a, t) => a + t.material.volumeMm3, 0);
    const connectorVolume = report.connector?.material.volumeMm3 ?? 0;
    expect(report.connectorCount).toBe(connectorCount(p));
    expect(report.connectorCount).toBe(4);
    expect(report.totalMaterial.volumeMm3).toBeCloseTo(tileTotal + connectorVolume * report.connectorCount, 6);
  });

  it('reports the panel geometry it actually built', () => {
    const p = smallPanel();
    const { report } = run(IMAGE, p);
    expect(report.tileWidthMm).toBeCloseTo(30, 12);
    expect(report.tileHeightMm).toBeCloseTo(30, 12);
    expect(report.tileThicknessMm).toBeCloseTo(p.baseThicknessMm + p.reliefHeightMm, 12);
    expect(report.mountedWidthMm).toBe(mountedSizeMm(p).widthMm);
    expect(report.mountedHeightMm).toBe(mountedSizeMm(p).heightMm);
  });

  it('writes a placement map and a manifest that describe the same panel', () => {
    const p = smallPanel();
    const { files, report } = run(IMAGE, p);
    const svg = text(files, 'placement-map.svg');
    const md = text(files, 'placement-map.md');
    for (const name of ['r01-c01', 'r01-c02', 'r02-c01', 'r02-c02']) {
      expect(svg).toContain(name);
      expect(md).toContain(name);
    }
    const manifest = JSON.parse(text(files, 'manifest.json')) as { params: Params; report: GenerateReport };
    expect(manifest.params.columns).toBe(2);
    expect(manifest.params.rows).toBe(2);
    expect(manifest.report.tiles.map((t) => t.name)).toEqual(report.tiles.map((t) => t.name));
    expect(manifest.report.notWatertight).toEqual([]);
  });

  it('gives each tile stl its own header naming the tile', () => {
    const { files } = run(IMAGE, smallPanel());
    const header = (path: string): string =>
      new TextDecoder().decode((files.get(path) ?? new Uint8Array()).subarray(0, 80)).replace(/\0+$/, '');
    expect(header('r01-c01.stl')).toBe('wally r01-c01');
    expect(header('r02-c02.stl')).toBe('wally r02-c02');
    expect(header('connector.stl')).toBe('wally connector');
  });

  it('produces byte-identical stl output when run twice over the same input', () => {
    const p = smallPanel({ magnetsEnabled: true });
    const first = run(IMAGE, p);
    const second = run(checkerboard(64, 64, 11), p);
    expect(second.paths).toEqual(first.paths);
    for (const path of first.paths) {
      expect(Array.from(second.files.get(path) ?? [])).toEqual(Array.from(first.files.get(path) ?? []));
    }
  });

  it('produces different tiles for different positions, so determinism is not uniformity', () => {
    const { files } = run(IMAGE, smallPanel({ tileEdgeChamferMm: 0 }));
    expect(Array.from(files.get('r01-c01.stl') ?? [])).not.toEqual(Array.from(files.get('r02-c02.stl') ?? []));
  });

  it('throws on the first step rather than exporting broken geometry', () => {
    const broken = smallPanel({ rebateDepthMm: 5, baseThicknessMm: 2 });
    expect(() => run(IMAGE, broken)).toThrow(/Cannot export with these parameters/);
    expect(() => generate(IMAGE, broken).next()).toThrow(/Rebate depth/);
  });

  it('lists every blocking error in the message it throws', () => {
    const broken = smallPanel({ threshold: 2, reliefHeightMm: -1 });
    let message = '';
    try {
      run(IMAGE, broken);
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain('Threshold');
    expect(message).toContain('Relief height');
  });

  it('does not throw for parameters that only raise warnings', () => {
    expect(() => run(IMAGE, smallPanel({ reliefHeightMm: 0.5 }))).not.toThrow();
  });

  it('uses a supplied heightmap in place of the image it was given', () => {
    const p = smallPanel();
    const fromImage = run(IMAGE, p);
    const other = checkerboard(64, 64, 3);
    const reused = run(other, p, { heightmap: buildHeightmap(IMAGE, p) });
    const rebuilt = run(other, p);
    for (const path of fromImage.paths) {
      expect(Array.from(reused.files.get(path) ?? [])).toEqual(Array.from(fromImage.files.get(path) ?? []));
    }
    expect(Array.from(rebuilt.files.get('r01-c01.stl') ?? [])).not.toEqual(
      Array.from(fromImage.files.get('r01-c01.stl') ?? []),
    );
  });
});

describe('artifactCount', () => {
  it('matches the number of artifacts generate actually yields', () => {
    const image = stripes(64, 64, 8);
    for (const interlockEnabled of [true, false]) {
      const p = testParams({ interlockEnabled });
      const produced = [...generate(image, p, { verify: false })];
      expect(produced.length).toBe(artifactCount(p));
    }
  });

  it('counts one stl per tile plus the maps and manifest', () => {
    expect(artifactCount(testParams({ rows: 3, columns: 4, interlockEnabled: false }))).toBe(12 + 3);
  });
});
