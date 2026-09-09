import type { FitMode } from './params.js';

/** Decoded RGBA raster, the single shape both the browser and the CLI produce. */
export interface RasterImage {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA, 4 bytes per pixel. */
  readonly data: Uint8Array | Uint8ClampedArray;
}

/** Rec. 709 luminance in 0..1, with transparency composited over black. */
export function luminanceAt(image: RasterImage, px: number, py: number): number {
  const i = (py * image.width + px) * 4;
  const d = image.data;
  const r = d[i] ?? 0;
  const g = d[i + 1] ?? 0;
  const b = d[i + 2] ?? 0;
  const a = (d[i + 3] ?? 255) / 255;
  return ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * a;
}

export interface FitOptions {
  readonly fitMode: FitMode;
  readonly panelWidthMm: number;
  readonly panelHeightMm: number;
  /** Physical width of one pattern repeat; used by `repeat` only. */
  readonly repeatWidthMm: number;
}

/**
 * Maps a point on the panel, in millimetres measured from the top-left corner,
 * to a pixel coordinate in the source image. Returns null when the point falls
 * outside the image under `contain`, which the caller treats as black.
 */
export function panelToPixel(
  opts: FitOptions,
  image: RasterImage,
  xMm: number,
  yMm: number,
): { u: number; v: number; wrap: boolean } | null {
  const { width: iw, height: ih } = image;
  switch (opts.fitMode) {
    case 'stretch':
      return { u: (xMm / opts.panelWidthMm) * iw, v: (yMm / opts.panelHeightMm) * ih, wrap: false };
    case 'repeat': {
      const s = iw / opts.repeatWidthMm;
      return { u: xMm * s, v: yMm * s, wrap: true };
    }
    case 'cover':
    case 'contain': {
      const sx = iw / opts.panelWidthMm;
      const sy = ih / opts.panelHeightMm;
      const s = opts.fitMode === 'cover' ? Math.min(sx, sy) : Math.max(sx, sy);
      const u = (xMm - opts.panelWidthMm / 2) * s + iw / 2;
      const v = (yMm - opts.panelHeightMm / 2) * s + ih / 2;
      if (opts.fitMode === 'contain' && (u < 0 || v < 0 || u > iw || v > ih)) return null;
      return { u, v, wrap: false };
    }
  }
}

const wrapIndex = (i: number, n: number): number => ((i % n) + n) % n;
const clampIndex = (i: number, n: number): number => (i < 0 ? 0 : i > n - 1 ? n - 1 : i);

/** Bilinear luminance sample at a pixel coordinate, wrapping or clamping at the borders. */
export function sampleLuminance(image: RasterImage, u: number, v: number, wrap: boolean): number {
  const x0 = Math.floor(u - 0.5);
  const y0 = Math.floor(v - 0.5);
  const fx = u - 0.5 - x0;
  const fy = v - 0.5 - y0;
  const idx = wrap ? wrapIndex : clampIndex;
  const xa = idx(x0, image.width);
  const xb = idx(x0 + 1, image.width);
  const ya = idx(y0, image.height);
  const yb = idx(y0 + 1, image.height);
  const l00 = luminanceAt(image, xa, ya);
  const l10 = luminanceAt(image, xb, ya);
  const l01 = luminanceAt(image, xa, yb);
  const l11 = luminanceAt(image, xb, yb);
  return (l00 * (1 - fx) + l10 * fx) * (1 - fy) + (l01 * (1 - fx) + l11 * fx) * fy;
}
