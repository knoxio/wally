import { PNG } from 'pngjs';
import type { RasterImage } from '../core/image.js';

/**
 * Decodes a PNG file's bytes into the core's {@link RasterImage} shape.
 *
 * pngjs normalises greyscale, palette and RGB(A) source images into 8-bit RGBA
 * during parsing, so the returned raster is always 4 bytes per pixel
 * regardless of the source PNG's colour type.
 */
export function decodePng(bytes: Buffer): RasterImage {
  const png = PNG.sync.read(bytes);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}
