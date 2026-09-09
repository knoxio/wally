import { createMeshBuilder, type Mesh } from './mesh.js';

/**
 * A solid defined by two height fields sampled on the same rectangular grid.
 * Everything the generator produces — relief tiles and connectors alike — is
 * built this way, which is what makes watertightness structural rather than
 * something to check for afterwards.
 */
export interface FieldSolid {
  /** Vertex counts, so there are (nx - 1) by (ny - 1) cells. */
  readonly nx: number;
  readonly ny: number;
  /** X coordinate of column i, ascending. */
  readonly xs: Float64Array;
  /** Y coordinate of row j, descending, so row 0 is the top of the source image. */
  readonly ys: Float64Array;
  /** Upper surface z at each vertex, row-major. */
  readonly top: Float64Array;
  /** Lower surface z at each vertex, row-major. Null means a flat z = 0 underside. */
  readonly bottom: Float64Array | null;
}

/**
 * Triangulates a field solid into a closed, consistently oriented mesh.
 *
 * The top and bottom surfaces are meshed on the same grid, so the side walls
 * connect matching vertex rings and no T-junctions can arise. A perfectly flat
 * underside is emitted as a triangle fan from its centre instead of a full grid,
 * which removes roughly half the triangles from the common case without
 * introducing a single unshared edge.
 */
export function buildSolid(solid: FieldSolid): Mesh {
  const { nx, ny, xs, ys, top, bottom } = solid;
  if (nx < 2 || ny < 2) throw new Error('A field solid needs at least two samples on each axis.');
  const b = createMeshBuilder();
  const at = (i: number, j: number): number => j * nx + i;

  const topIndex = new Uint32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      topIndex[at(i, j)] = b.addVertex(xs[i] ?? 0, ys[j] ?? 0, top[at(i, j)] ?? 0);
    }
  }

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = topIndex[at(i, j)] ?? 0;
      const bb = topIndex[at(i + 1, j)] ?? 0;
      const c = topIndex[at(i + 1, j + 1)] ?? 0;
      const d = topIndex[at(i, j + 1)] ?? 0;
      const za = top[at(i, j)] ?? 0;
      const zb = top[at(i + 1, j)] ?? 0;
      const zc = top[at(i + 1, j + 1)] ?? 0;
      const zd = top[at(i, j + 1)] ?? 0;
      // Split along the flatter diagonal so the facets follow the surface.
      if (Math.abs(za - zc) <= Math.abs(zb - zd)) {
        b.addTriangle(a, c, bb);
        b.addTriangle(a, d, c);
      } else {
        b.addTriangle(a, d, bb);
        b.addTriangle(bb, d, c);
      }
    }
  }

  const ring = boundaryRing(nx, ny);
  orientRingCounterClockwise(ring, nx, xs, ys);

  let bottomIndex: Uint32Array | null = null;
  const bottomRing = new Uint32Array(ring.length);

  if (bottom === null) {
    let cx = 0;
    let cy = 0;
    for (const cell of ring) {
      cx += xs[cell % nx] ?? 0;
      cy += ys[Math.floor(cell / nx)] ?? 0;
    }
    const centre = b.addVertex(cx / ring.length, cy / ring.length, 0);
    for (let k = 0; k < ring.length; k++) {
      const cell = ring[k] ?? 0;
      bottomRing[k] = b.addVertex(xs[cell % nx] ?? 0, ys[Math.floor(cell / nx)] ?? 0, 0);
    }
    for (let k = 0; k < ring.length; k++) {
      b.addTriangle(centre, bottomRing[(k + 1) % ring.length] ?? 0, bottomRing[k] ?? 0);
    }
  } else {
    bottomIndex = new Uint32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        bottomIndex[at(i, j)] = b.addVertex(xs[i] ?? 0, ys[j] ?? 0, bottom[at(i, j)] ?? 0);
      }
    }
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = bottomIndex[at(i, j)] ?? 0;
        const bb = bottomIndex[at(i + 1, j)] ?? 0;
        const c = bottomIndex[at(i + 1, j + 1)] ?? 0;
        const d = bottomIndex[at(i, j + 1)] ?? 0;
        const za = bottom[at(i, j)] ?? 0;
        const zc = bottom[at(i + 1, j + 1)] ?? 0;
        const zb = bottom[at(i + 1, j)] ?? 0;
        const zd = bottom[at(i, j + 1)] ?? 0;
        if (Math.abs(za - zc) <= Math.abs(zb - zd)) {
          b.addTriangle(a, bb, c);
          b.addTriangle(a, c, d);
        } else {
          b.addTriangle(a, bb, d);
          b.addTriangle(bb, c, d);
        }
      }
    }
    for (let k = 0; k < ring.length; k++) bottomRing[k] = bottomIndex[ring[k] ?? 0] ?? 0;
  }

  for (let k = 0; k < ring.length; k++) {
    const k2 = (k + 1) % ring.length;
    const ta = topIndex[ring[k] ?? 0] ?? 0;
    const tb = topIndex[ring[k2] ?? 0] ?? 0;
    const ba = bottomRing[k] ?? 0;
    const bb2 = bottomRing[k2] ?? 0;
    b.addTriangle(ta, ba, bb2);
    b.addTriangle(ta, bb2, tb);
  }

  return b.build();
}

/** Grid cell indices around the outside of the field, in a single closed loop. */
function boundaryRing(nx: number, ny: number): Uint32Array {
  const ring = new Uint32Array(2 * (nx - 1) + 2 * (ny - 1));
  let k = 0;
  for (let i = 0; i < nx - 1; i++) ring[k++] = i;
  for (let j = 0; j < ny - 1; j++) ring[k++] = j * nx + (nx - 1);
  for (let i = nx - 1; i > 0; i--) ring[k++] = (ny - 1) * nx + i;
  for (let j = ny - 1; j > 0; j--) ring[k++] = j * nx;
  return ring;
}

/** Reverses the loop in place if it runs clockwise in the xy plane. */
function orientRingCounterClockwise(ring: Uint32Array, nx: number, xs: Float64Array, ys: Float64Array): void {
  let area2 = 0;
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k] ?? 0;
    const b = ring[(k + 1) % ring.length] ?? 0;
    const ax = xs[a % nx] ?? 0;
    const ay = ys[Math.floor(a / nx)] ?? 0;
    const bx = xs[b % nx] ?? 0;
    const by = ys[Math.floor(b / nx)] ?? 0;
    area2 += ax * by - bx * ay;
  }
  if (area2 < 0) ring.reverse();
}
