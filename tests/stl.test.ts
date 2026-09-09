import { describe, expect, it } from 'vitest';
import { createMeshBuilder, meshVolumeMm3, type Mesh } from '../src/core/mesh.js';
import { buildSolid, type FieldSolid } from '../src/core/solid.js';
import { encodeBinaryStl } from '../src/core/stl.js';
import { at } from './helpers/params.js';

interface Facet {
  readonly normal: [number, number, number];
  readonly vertices: [number, number, number][];
  readonly attribute: number;
}

function decodeBinaryStl(bytes: Uint8Array): { header: string; count: number; facets: Facet[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const facets: Facet[] = [];
  for (let t = 0; t < count; t++) {
    const o = 84 + t * 50;
    const read = (k: number): [number, number, number] => [
      view.getFloat32(o + k, true),
      view.getFloat32(o + k + 4, true),
      view.getFloat32(o + k + 8, true),
    ];
    facets.push({
      normal: read(0),
      vertices: [read(12), read(24), read(36)],
      attribute: view.getUint16(o + 48, true),
    });
  }
  return {
    header: new TextDecoder().decode(bytes.subarray(0, 80)).replace(/\0+$/, ''),
    count,
    facets,
  };
}

const flatBox = (thicknessMm: number): FieldSolid => ({
  nx: 3,
  ny: 3,
  xs: Float64Array.from([0, 5, 10]),
  ys: Float64Array.from([6, 3, 0]),
  top: Float64Array.from(new Array<number>(9).fill(thicknessMm)),
  bottom: null,
});

describe('encodeBinaryStl', () => {
  const mesh = buildSolid(flatBox(2));
  const bytes = encodeBinaryStl(mesh);

  it('is exactly 84 + 50 bytes per triangle', () => {
    expect(bytes.byteLength).toBe(84 + 50 * (mesh.indices.length / 3));
  });

  it('stores the triangle count at offset 80', () => {
    expect(decodeBinaryStl(bytes).count).toBe(mesh.indices.length / 3);
  });

  it('writes the header into the first 80 bytes and truncates an overlong one', () => {
    expect(decodeBinaryStl(bytes).header).toBe('wally relief tile');
    const long = 'x'.repeat(200);
    const encoded = encodeBinaryStl(mesh, long);
    expect(encoded.byteLength).toBe(bytes.byteLength);
    expect(decodeBinaryStl(encoded).header).toBe('x'.repeat(80));
  });

  it('round-trips every vertex position through the float32 fields', () => {
    const decoded = decodeBinaryStl(bytes);
    expect(decoded.facets.length).toBe(mesh.indices.length / 3);
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const facet = decoded.facets[t / 3];
      if (facet === undefined) throw new Error('missing facet');
      for (let corner = 0; corner < 3; corner++) {
        const v = at(mesh.indices, t + corner) * 3;
        const got = facet.vertices[corner];
        if (got === undefined) throw new Error('missing corner');
        expect(got[0]).toBe(Math.fround(at(mesh.positions, v)));
        expect(got[1]).toBe(Math.fround(at(mesh.positions, v + 1)));
        expect(got[2]).toBe(Math.fround(at(mesh.positions, v + 2)));
      }
    }
  });

  it('zeroes the attribute byte count of every facet', () => {
    for (const f of decodeBinaryStl(bytes).facets) expect(f.attribute).toBe(0);
  });

  it('stores a unit normal derived from the winding of the stored vertices', () => {
    for (const f of decodeBinaryStl(bytes).facets) {
      const [a, b, c] = f.vertices;
      if (a === undefined || b === undefined || c === undefined) throw new Error('missing corner');
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
      const cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ] as const;
      const len = Math.hypot(...cross);
      expect(len).toBeGreaterThan(0);
      expect(Math.hypot(...f.normal)).toBeCloseTo(1, 5);
      for (let k = 0; k < 3; k++) {
        expect(f.normal[k] ?? 0).toBeCloseTo((cross[k] ?? 0) / len, 5);
      }
    }
  });

  it('points the top facets of a flat box straight up and the bottom facets straight down', () => {
    const decoded = decodeBinaryStl(bytes);
    const top = decoded.facets.filter((f) => f.vertices.every((v) => v[2] === 2));
    const bottom = decoded.facets.filter((f) => f.vertices.every((v) => v[2] === 0));
    expect(top.length).toBeGreaterThan(0);
    expect(bottom.length).toBeGreaterThan(0);
    for (const f of top) {
      expect(f.normal[2]).toBeCloseTo(1, 5);
      expect(f.normal[0]).toBeCloseTo(0, 5);
      expect(f.normal[1]).toBeCloseTo(0, 5);
    }
    for (const f of bottom) expect(f.normal[2]).toBeCloseTo(-1, 5);
  });

  it('writes a zero normal for a degenerate triangle rather than NaN', () => {
    const b = createMeshBuilder();
    b.addVertex(0, 0, 0);
    b.addVertex(1, 0, 0);
    b.addVertex(2, 0, 0);
    b.addTriangle(0, 1, 2);
    const decoded = decodeBinaryStl(encodeBinaryStl(b.build()));
    expect(decoded.facets[0]?.normal).toEqual([0, 0, 0]);
  });

  it('emits a valid empty file for an empty mesh', () => {
    const empty: Mesh = { positions: new Float64Array(0), indices: new Uint32Array(0) };
    const encoded = encodeBinaryStl(empty);
    expect(encoded.byteLength).toBe(84);
    expect(decodeBinaryStl(encoded).count).toBe(0);
  });

  it('is byte-identical across repeated encodes of the same mesh', () => {
    expect(Array.from(encodeBinaryStl(mesh))).toEqual(Array.from(encodeBinaryStl(mesh)));
  });

  it('describes the same closed solid as the mesh it came from', () => {
    const decoded = decodeBinaryStl(bytes);
    let volume = 0;
    for (const f of decoded.facets) {
      const [a, b, c] = f.vertices;
      if (a === undefined || b === undefined || c === undefined) throw new Error('missing corner');
      volume +=
        a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
    expect(volume / 6).toBeCloseTo(meshVolumeMm3(mesh), 4);
    expect(volume / 6).toBeCloseTo(10 * 6 * 2, 4);
  });
});

describe('createMeshBuilder', () => {
  it('returns sequential indices and reports its own size', () => {
    const b = createMeshBuilder();
    expect(b.addVertex(1, 2, 3)).toBe(0);
    expect(b.addVertex(4, 5, 6)).toBe(1);
    expect(b.addVertex(7, 8, 9)).toBe(2);
    expect(b.vertexCount).toBe(3);
    expect(b.triangleCount).toBe(0);
    b.addTriangle(0, 1, 2);
    expect(b.triangleCount).toBe(1);
    const mesh = b.build();
    expect(Array.from(mesh.positions)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Array.from(mesh.indices)).toEqual([0, 1, 2]);
  });
});
