/** Indexed triangle mesh. Positions are flat xyz triples; indices are triangle corner references. */
export interface Mesh {
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
}

export interface MeshBuilder {
  addVertex(x: number, y: number, z: number): number;
  addTriangle(a: number, b: number, c: number): void;
  build(): Mesh;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export function createMeshBuilder(): MeshBuilder {
  const positions: number[] = [];
  const indices: number[] = [];
  return {
    addVertex(x, y, z) {
      positions.push(x, y, z);
      return positions.length / 3 - 1;
    },
    addTriangle(a, b, c) {
      indices.push(a, b, c);
    },
    build() {
      return { positions: Float64Array.from(positions), indices: Uint32Array.from(indices) };
    },
    get vertexCount() {
      return positions.length / 3;
    },
    get triangleCount() {
      return indices.length / 3;
    },
  };
}

/** Signed volume in cubic millimetres. Positive when triangles wind counter-clockwise seen from outside. */
export function meshVolumeMm3(mesh: Mesh): number {
  const { positions: p, indices } = mesh;
  let total = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = (indices[t] ?? 0) * 3;
    const b = (indices[t + 1] ?? 0) * 3;
    const c = (indices[t + 2] ?? 0) * 3;
    const ax = p[a] ?? 0, ay = p[a + 1] ?? 0, az = p[a + 2] ?? 0;
    const bx = p[b] ?? 0, by = p[b + 1] ?? 0, bz = p[b + 2] ?? 0;
    const cx = p[c] ?? 0, cy = p[c + 1] ?? 0, cz = p[c + 2] ?? 0;
    total += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return total / 6;
}

export interface ManifoldReport {
  readonly watertight: boolean;
  readonly vertices: number;
  readonly edges: number;
  readonly triangles: number;
  readonly eulerCharacteristic: number;
  /** Edges used by anything other than exactly two oppositely-wound triangles. */
  readonly badEdges: number;
  /** Vertices no triangle references. */
  readonly orphanVertices: number;
}

/**
 * Checks that a mesh is a closed, consistently oriented surface: every
 * undirected edge is used by exactly two triangles, once in each direction.
 */
export function inspectManifold(mesh: Mesh): ManifoldReport {
  const vertexCount = mesh.positions.length / 3;
  const directed = new Map<number, number>();
  const used = new Uint8Array(vertexCount);
  const { indices } = mesh;
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [indices[t] ?? 0, indices[t + 1] ?? 0, indices[t + 2] ?? 0];
    for (let e = 0; e < 3; e++) {
      const a = tri[e] ?? 0;
      const b = tri[(e + 1) % 3] ?? 0;
      used[a] = 1;
      const key = a * vertexCount + b;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  }
  let badEdges = 0;
  for (const [key, count] of directed) {
    const a = Math.floor(key / vertexCount);
    const b = key - a * vertexCount;
    if (count !== 1 || (directed.get(b * vertexCount + a) ?? 0) !== 1) badEdges++;
  }
  let orphanVertices = 0;
  for (let i = 0; i < used.length; i++) if (!used[i]) orphanVertices++;

  const vertices = vertexCount - orphanVertices;
  const edges = directed.size / 2;
  const triangles = indices.length / 3;
  return {
    watertight: badEdges === 0 && orphanVertices === 0 && vertices - edges + triangles === 2,
    vertices,
    edges,
    triangles,
    eulerCharacteristic: vertices - edges + triangles,
    badEdges,
    orphanVertices,
  };
}
