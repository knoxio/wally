import type { RasterImage } from '../../src/core/image.js';

export type Rgba = readonly [number, number, number, number];

/** Builds an RGBA raster from a per-pixel function, so tests never need binary fixtures. */
export function rasterFrom(width: number, height: number, pixel: (x: number, y: number) => Rgba): RasterImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width, height, data };
}

const grey = (v: number): Rgba => [v, v, v, 255];

export const solid = (width: number, height: number, value: number): RasterImage =>
  rasterFrom(width, height, () => grey(value));

export const stripes = (width: number, height: number, period: number): RasterImage =>
  rasterFrom(width, height, (x) => grey(Math.floor(x / period) % 2 === 0 ? 255 : 0));

export const checkerboard = (width: number, height: number, cell: number): RasterImage =>
  rasterFrom(width, height, (x, y) => grey((Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 255 : 0));

export const disc = (width: number, height: number, radiusFrac: number): RasterImage =>
  rasterFrom(width, height, (x, y) => {
    const dx = x - (width - 1) / 2;
    const dy = y - (height - 1) / 2;
    const r = radiusFrac * Math.min(width, height) / 2;
    return grey(dx * dx + dy * dy <= r * r ? 255 : 0);
  });

/** Deterministic pseudo-random greyscale, for shapes with a lot of edge detail. */
export function noise(width: number, height: number, seed: number): RasterImage {
  let state = seed >>> 0;
  return rasterFrom(width, height, () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return grey(state >>> 24);
  });
}
