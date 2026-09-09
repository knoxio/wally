/**
 * Scalar field helpers used to turn a black-and-white mask into a smooth,
 * printable height field. Everything here is exact and deterministic: no
 * randomness, no iteration counts that depend on timing.
 */

/** Separable Gaussian blur over a row-major float grid. Edges are clamped. */
export function gaussianBlur(src: Float32Array, gx: number, gy: number, sigmaX: number, sigmaY: number): Float32Array {
  let out = src;
  if (sigmaX > 0) out = blurAxis(out, gx, gy, sigmaX, true);
  if (sigmaY > 0) out = blurAxis(out, gx, gy, sigmaY, false);
  return out === src ? Float32Array.from(src) : out;
}

function kernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] = (k[i] ?? 0) / sum;
  return k;
}

function blurAxis(src: Float32Array, gx: number, gy: number, sigma: number, horizontal: boolean): Float32Array {
  const k = kernel(sigma);
  const radius = (k.length - 1) / 2;
  const dst = new Float32Array(src.length);
  const outer = horizontal ? gy : gx;
  const inner = horizontal ? gx : gy;
  const stride = horizontal ? 1 : gx;
  const jump = horizontal ? gx : 1;
  for (let o = 0; o < outer; o++) {
    const base = o * jump;
    for (let i = 0; i < inner; i++) {
      let acc = 0;
      for (let t = -radius; t <= radius; t++) {
        const s = Math.min(inner - 1, Math.max(0, i + t));
        acc += (src[base + s * stride] ?? 0) * (k[t + radius] ?? 0);
      }
      dst[base + i * stride] = acc;
    }
  }
  return dst;
}

/**
 * Exact Euclidean distance transform (Felzenszwalb & Huttenlocher) over an
 * anisotropic grid. `seed[i]` true marks a source cell; the result is the
 * distance in millimetres from every cell to the nearest source.
 */
export function distanceTransform(seed: Uint8Array, gx: number, gy: number, pitchX: number, pitchY: number): Float32Array {
  const INF = 1e20;
  const d2 = new Float32Array(gx * gy);
  for (let i = 0; i < d2.length; i++) d2[i] = seed[i] ? 0 : INF;

  const maxDim = Math.max(gx, gy);
  const f = new Float32Array(maxDim);
  const dOut = new Float32Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float32Array(maxDim + 1);

  for (let y = 0; y < gy; y++) {
    const row = y * gx;
    for (let x = 0; x < gx; x++) f[x] = d2[row + x] ?? INF;
    transform1d(f, dOut, v, z, gx, pitchX);
    for (let x = 0; x < gx; x++) d2[row + x] = dOut[x] ?? INF;
  }
  for (let x = 0; x < gx; x++) {
    for (let y = 0; y < gy; y++) f[y] = d2[y * gx + x] ?? INF;
    transform1d(f, dOut, v, z, gy, pitchY);
    for (let y = 0; y < gy; y++) d2[y * gx + x] = dOut[y] ?? INF;
  }

  const out = new Float32Array(gx * gy);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(d2[i] ?? 0);
  return out;
}

/** Lower envelope of parabolas `f[p] + ((q - p) * scale)^2`. */
function transform1d(f: Float32Array, d: Float32Array, v: Int32Array, z: Float32Array, n: number, scale: number): void {
  const s2 = scale * scale;
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    const fq = f[q] ?? 0;
    let s = 0;
    for (;;) {
      const p = v[k] ?? 0;
      s = (fq + s2 * q * q - ((f[p] ?? 0) + s2 * p * p)) / (2 * s2 * (q - p));
      if (k === 0 || s > (z[k] ?? -Infinity)) break;
      k--;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? Infinity) < q) k++;
    const p = v[k] ?? 0;
    const dx = (q - p) * scale;
    d[q] = dx * dx + (f[p] ?? 0);
  }
}

/**
 * Signed distance to the mask boundary in millimetres: positive inside the
 * raised (white) region, negative outside. The half-pitch correction places the
 * zero crossing halfway between opposing samples rather than on a sample.
 */
export function signedDistance(mask: Uint8Array, gx: number, gy: number, pitchX: number, pitchY: number): Float32Array {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inv[i] = mask[i] ? 0 : 1;
  const toWhite = distanceTransform(mask, gx, gy, pitchX, pitchY);
  const toBlack = distanceTransform(inv, gx, gy, pitchX, pitchY);
  const half = Math.min(pitchX, pitchY) / 2;
  const out = new Float32Array(mask.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = mask[i] ? (toBlack[i] ?? 0) - half : half - (toWhite[i] ?? 0);
  }
  return out;
}
