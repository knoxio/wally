import { buildConnector, type Connector } from './connector.js';
import { estimateMaterial, sumEstimates, type MaterialEstimate } from './estimate.js';
import { buildHeightmap, type Heightmap } from './heightmap.js';
import type { RasterImage } from './image.js';
import { inspectManifold, meshVolumeMm3, type ManifoldReport } from './mesh.js';
import { validate, type Params } from './params.js';
import { mountedSizeMm, placementMapMarkdown, placementMapSvg } from './placement.js';
import { encodeBinaryStl } from './stl.js';
import { buildSolid } from './solid.js';
import { sliceTile } from './tiles.js';

/** One output file, ready to be written to disk or added to a zip. */
export interface Artifact {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface PartReport {
  readonly name: string;
  readonly triangles: number;
  readonly material: MaterialEstimate;
  /** Absent when verification was switched off. */
  readonly manifold: ManifoldReport | null;
}

export interface GenerateReport {
  readonly tiles: readonly PartReport[];
  readonly connector: PartReport | null;
  readonly connectorCount: number;
  /** Every tile plus every connector. */
  readonly totalMaterial: MaterialEstimate;
  readonly tileWidthMm: number;
  readonly tileHeightMm: number;
  readonly tileThicknessMm: number;
  readonly mountedWidthMm: number;
  readonly mountedHeightMm: number;
  readonly notWatertight: readonly string[];
}

export interface GenerateOptions {
  /** Check every mesh is closed and consistently wound. Costs time on large panels. */
  readonly verify?: boolean;
  /** Reuse a height field that has already been computed, instead of rebuilding it. */
  readonly heightmap?: Heightmap;
}

/**
 * How many artefacts `generate` will yield for these parameters: one STL per
 * tile, the connector when the tiles interlock, both placement maps and the
 * manifest. Progress reporting needs this up front, and deriving it here keeps
 * it from drifting away from what `generate` actually emits.
 */
export function artifactCount(p: Params): number {
  return p.rows * p.columns + (p.interlockEnabled ? 1 : 0) + 3;
}

/**
 * Produces every file for a panel, one at a time.
 *
 * This is a generator so that a 45-tile panel never has to hold 45 meshes in
 * memory at once: each tile is built, encoded, handed over and dropped. The
 * summary is the generator's return value, so a caller that runs it to
 * completion gets both the files and the report.
 *
 * @throws if the parameters have validation errors, since exporting broken
 * geometry silently is worse than refusing.
 */
export function* generate(
  image: RasterImage,
  p: Params,
  options: GenerateOptions = {},
): Generator<Artifact, GenerateReport, void> {
  const errors = validate(p).filter((i) => i.level === 'error');
  if (errors.length > 0) {
    throw new Error(`Cannot export with these parameters:\n- ${errors.map((e) => e.message).join('\n- ')}`);
  }

  const verify = options.verify ?? true;
  const heightmap = options.heightmap ?? buildHeightmap(image, p);
  const text = new TextEncoder();

  const tiles: PartReport[] = [];
  const notWatertight: string[] = [];

  for (let row = 0; row < p.rows; row++) {
    for (let column = 0; column < p.columns; column++) {
      const tile = sliceTile(heightmap, p, row, column);
      const mesh = buildSolid(tile.solid);
      const manifold = verify ? inspectManifold(mesh) : null;
      if (manifold !== null && !manifold.watertight) notWatertight.push(tile.name);
      const report: PartReport = {
        name: tile.name,
        triangles: mesh.indices.length / 3,
        material: estimateMaterial(Math.abs(meshVolumeMm3(mesh)), p),
        manifold,
      };
      tiles.push(report);
      yield { path: `${tile.name}.stl`, bytes: encodeBinaryStl(mesh, `wally ${tile.name}`) };
    }
  }

  let connector: PartReport | null = null;
  let built: Connector | null = null;
  if (p.interlockEnabled) {
    built = buildConnector(p);
    const manifold = verify ? inspectManifold(built.mesh) : null;
    if (manifold !== null && !manifold.watertight) notWatertight.push('connector');
    connector = {
      name: 'connector',
      triangles: built.mesh.indices.length / 3,
      material: estimateMaterial(Math.abs(meshVolumeMm3(built.mesh)), p),
      manifold,
    };
    yield { path: 'connector.stl', bytes: encodeBinaryStl(built.mesh, 'wally connector') };
  }

  yield { path: 'placement-map.svg', bytes: text.encode(placementMapSvg(p)) };
  yield { path: 'placement-map.md', bytes: text.encode(placementMapMarkdown(p)) };

  const connectorMaterial = connector?.material;
  const connectorTotal: MaterialEstimate[] =
    connectorMaterial === undefined || built === null
      ? []
      : Array.from({ length: built.count }, () => connectorMaterial);
  const totalMaterial = sumEstimates([...tiles.map((t) => t.material), ...connectorTotal]);
  const mounted = mountedSizeMm(p);

  const report: GenerateReport = {
    tiles,
    connector,
    connectorCount: built?.count ?? 0,
    totalMaterial,
    tileWidthMm: heightmap.grid.tileWidthMm,
    tileHeightMm: heightmap.grid.tileHeightMm,
    tileThicknessMm: p.baseThicknessMm + p.reliefHeightMm,
    mountedWidthMm: mounted.widthMm,
    mountedHeightMm: mounted.heightMm,
    notWatertight,
  };

  yield {
    path: 'manifest.json',
    bytes: text.encode(JSON.stringify({ params: p, report }, null, 2)),
  };

  return report;
}
