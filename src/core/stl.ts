import type { Mesh } from './mesh.js';

/**
 * Encodes a mesh as binary STL.
 *
 * Facet normals are computed from the triangle winding rather than left at
 * zero, because some slicers fall back to the stored normal when repairing a
 * model. Degenerate triangles get a zero normal, which is what the format
 * expects.
 */
export function encodeBinaryStl(mesh: Mesh, header = 'wally relief tile'): Uint8Array {
  const triangles = mesh.indices.length / 3;
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const title = new TextEncoder().encode(header);
  bytes.set(title.subarray(0, 80), 0);
  view.setUint32(80, triangles, true);

  const { positions: p, indices } = mesh;
  let offset = 84;
  for (let t = 0; t < indices.length; t += 3) {
    const a = (indices[t] ?? 0) * 3;
    const b = (indices[t + 1] ?? 0) * 3;
    const c = (indices[t + 2] ?? 0) * 3;
    const ax = p[a] ?? 0, ay = p[a + 1] ?? 0, az = p[a + 2] ?? 0;
    const bx = p[b] ?? 0, by = p[b + 1] ?? 0, bz = p[b + 2] ?? 0;
    const cx = p[c] ?? 0, cy = p[c + 1] ?? 0, cz = p[c + 2] ?? 0;

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = ny = nz = 0;
    }

    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);
    view.setFloat32(offset + 12, ax, true);
    view.setFloat32(offset + 16, ay, true);
    view.setFloat32(offset + 20, az, true);
    view.setFloat32(offset + 24, bx, true);
    view.setFloat32(offset + 28, by, true);
    view.setFloat32(offset + 32, bz, true);
    view.setFloat32(offset + 36, cx, true);
    view.setFloat32(offset + 40, cy, true);
    view.setFloat32(offset + 44, cz, true);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  return bytes;
}
