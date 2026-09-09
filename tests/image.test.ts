import { describe, expect, it } from 'vitest';
import { luminanceAt, panelToPixel, sampleLuminance, type FitOptions, type RasterImage } from '../src/core/image.js';
import { rasterFrom, stripes } from './helpers/raster.js';

const fit = (overrides: Partial<FitOptions> = {}): FitOptions => ({
  fitMode: 'stretch',
  panelWidthMm: 100,
  panelHeightMm: 50,
  repeatWidthMm: 25,
  ...overrides,
});

const hit = (r: ReturnType<typeof panelToPixel>): { u: number; v: number; wrap: boolean } => {
  if (r === null) throw new Error('expected the point to land inside the image');
  return r;
};

describe('luminanceAt', () => {
  it('uses Rec. 709 weights', () => {
    const img = rasterFrom(3, 1, (x) =>
      x === 0 ? [255, 0, 0, 255] : x === 1 ? [0, 255, 0, 255] : [0, 0, 255, 255],
    );
    expect(luminanceAt(img, 0, 0)).toBeCloseTo(0.2126, 12);
    expect(luminanceAt(img, 1, 0)).toBeCloseTo(0.7152, 12);
    expect(luminanceAt(img, 2, 0)).toBeCloseTo(0.0722, 12);
  });

  it('composites transparency over black', () => {
    const img = rasterFrom(2, 1, (x) => [255, 255, 255, x === 0 ? 255 : 0]);
    expect(luminanceAt(img, 0, 0)).toBeCloseTo(1, 12);
    expect(luminanceAt(img, 1, 0)).toBe(0);
  });

  it('reads row-major, so x and y are not interchangeable', () => {
    const img = rasterFrom(2, 2, (x, y) => [x === 1 && y === 0 ? 255 : 0, 0, 0, 255]);
    expect(luminanceAt(img, 1, 0)).toBeGreaterThan(0);
    expect(luminanceAt(img, 0, 1)).toBe(0);
  });
});

describe('panelToPixel', () => {
  const image: RasterImage = rasterFrom(40, 10, () => [0, 0, 0, 255]);

  it('stretch maps the panel corners onto the image corners, ignoring aspect ratio', () => {
    const o = fit({ fitMode: 'stretch' });
    expect(hit(panelToPixel(o, image, 0, 0))).toEqual({ u: 0, v: 0, wrap: false });
    expect(hit(panelToPixel(o, image, 100, 50))).toEqual({ u: 40, v: 10, wrap: false });
    expect(hit(panelToPixel(o, image, 50, 25))).toEqual({ u: 20, v: 5, wrap: false });
  });

  const extent = (o: FitOptions, img: RasterImage): { u: [number, number]; v: [number, number] } => {
    const a = hit(panelToPixel(o, img, 0, 0));
    const b = hit(panelToPixel(o, img, o.panelWidthMm, o.panelHeightMm));
    return { u: [a.u, b.u], v: [a.v, b.v] };
  };

  it('cover shrinks the image until the panel is fully covered, cropping the overflow', () => {
    const wide = rasterFrom(40, 10, () => [0, 0, 0, 255]);
    const e = extent(fit({ fitMode: 'cover' }), wide);
    expect(e.v[0]).toBeCloseTo(0, 12);
    expect(e.v[1]).toBeCloseTo(10, 12);
    expect(e.u[0]).toBeCloseTo(10, 12);
    expect(e.u[1]).toBeCloseTo(30, 12);
  });

  it('cover crops the other axis for a tall image on a wide panel', () => {
    const tall = rasterFrom(10, 40, () => [0, 0, 0, 255]);
    const e = extent(fit({ fitMode: 'cover' }), tall);
    expect(e.u[0]).toBeCloseTo(0, 12);
    expect(e.u[1]).toBeCloseTo(10, 12);
    expect(e.v[0]).toBeCloseTo(17.5, 12);
    expect(e.v[1]).toBeCloseTo(22.5, 12);
  });

  it('contain grows the image until it fits inside the panel, letterboxing the rest', () => {
    const o = fit({ fitMode: 'contain' });
    const wide = rasterFrom(40, 10, () => [0, 0, 0, 255]);
    const a = hit(panelToPixel(o, wide, 0, 25));
    const b = hit(panelToPixel(o, wide, 100, 25));
    expect(a.u).toBeCloseTo(0, 12);
    expect(b.u).toBeCloseTo(40, 12);
    expect(hit(panelToPixel(o, wide, 50, 25))).toEqual({ u: 20, v: 5, wrap: false });
  });

  it('contain returns null for panel points beyond the image', () => {
    const o = fit({ fitMode: 'contain' });
    expect(panelToPixel(o, image, 50, 0)).toBeNull();
    expect(panelToPixel(o, image, 50, 12)).toBeNull();
    expect(panelToPixel(o, image, 50, 38)).toBeNull();
    expect(panelToPixel(o, image, 50, 50)).toBeNull();
    expect(panelToPixel(o, image, 50, 25)).not.toBeNull();
    expect(panelToPixel(o, image, 0, 25)).not.toBeNull();
    expect(panelToPixel(o, image, 100, 25)).not.toBeNull();
  });

  it('contain accepts the image border itself and rejects anything past it', () => {
    const o = fit({ fitMode: 'contain' });
    const yTop = 25 - 5 / 0.4;
    const yBottom = 25 + 5 / 0.4;
    expect(hit(panelToPixel(o, image, 50, yTop)).v).toBeCloseTo(0, 12);
    expect(hit(panelToPixel(o, image, 50, yBottom)).v).toBeCloseTo(10, 12);
    expect(panelToPixel(o, image, 50, yTop - 1e-6)).toBeNull();
    expect(panelToPixel(o, image, 50, yBottom + 1e-6)).toBeNull();
  });

  it('contain admits the whole image and nothing beyond it, on both axes', () => {
    const o = fit({ fitMode: 'contain' });
    expect(hit(panelToPixel(o, image, 0, 25)).u).toBeCloseTo(0, 12);
    expect(hit(panelToPixel(o, image, 100, 25)).u).toBeCloseTo(40, 12);
    expect(panelToPixel(o, image, -1e-6, 25)).toBeNull();
    expect(panelToPixel(o, image, 100 + 1e-6, 25)).toBeNull();
  });

  it('contain pillarboxes instead of letterboxing for a tall image on a wide panel', () => {
    const tall = rasterFrom(10, 40, () => [0, 0, 0, 255]);
    const o = fit({ fitMode: 'contain' });
    expect(panelToPixel(o, tall, 0, 25)).toBeNull();
    expect(panelToPixel(o, tall, 100, 25)).toBeNull();
    expect(panelToPixel(o, tall, 50, 0)).not.toBeNull();
    expect(panelToPixel(o, tall, 50, 50)).not.toBeNull();
  });

  it('cover and contain agree only when the image and panel share an aspect ratio', () => {
    const square = rasterFrom(20, 20, () => [0, 0, 0, 255]);
    const squarePanel = fit({ panelWidthMm: 60, panelHeightMm: 60 });
    const c = hit(panelToPixel({ ...squarePanel, fitMode: 'cover' }, square, 10, 40));
    const n = hit(panelToPixel({ ...squarePanel, fitMode: 'contain' }, square, 10, 40));
    expect(c).toEqual(n);
    const wide = hit(panelToPixel(fit({ fitMode: 'cover' }), image, 10, 40));
    const narrow = panelToPixel(fit({ fitMode: 'contain' }), image, 10, 40);
    expect(narrow === null || narrow.u !== wide.u).toBe(true);
  });

  it('repeat scales by the repeat width alone and asks for wrapping', () => {
    const o = fit({ fitMode: 'repeat', repeatWidthMm: 25 });
    const s = 40 / 25;
    expect(hit(panelToPixel(o, image, 0, 0))).toEqual({ u: 0, v: 0, wrap: true });
    expect(hit(panelToPixel(o, image, 25, 0)).u).toBeCloseTo(40, 12);
    expect(hit(panelToPixel(o, image, 100, 0)).u).toBeCloseTo(160, 12);
    expect(hit(panelToPixel(o, image, 10, 10)).v).toBeCloseTo(10 * s, 12);
  });

  it('repeat keeps the pattern square, so x and y share one scale', () => {
    const o = fit({ fitMode: 'repeat', repeatWidthMm: 25 });
    const a = hit(panelToPixel(o, image, 7, 7));
    expect(a.u).toBeCloseTo(a.v, 12);
  });

  it('never returns null for the modes that have no outside', () => {
    for (const mode of ['stretch', 'cover', 'repeat'] as const) {
      expect(panelToPixel(fit({ fitMode: mode }), image, -500, -500)).not.toBeNull();
      expect(panelToPixel(fit({ fitMode: mode }), image, 5000, 5000)).not.toBeNull();
    }
  });
});

describe('sampleLuminance', () => {
  const img = rasterFrom(4, 3, (x, y) => [(x + y * 4) * 16, 0, 0, 255]);

  it('reproduces the exact pixel value at every pixel centre', () => {
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        expect(sampleLuminance(img, x + 0.5, y + 0.5, false)).toBeCloseTo(luminanceAt(img, x, y), 12);
      }
    }
  });

  it('averages the two neighbours exactly halfway between pixel centres', () => {
    const expected = (luminanceAt(img, 1, 0) + luminanceAt(img, 2, 0)) / 2;
    expect(sampleLuminance(img, 2, 0.5, false)).toBeCloseTo(expected, 12);
  });

  it('averages all four neighbours at a cell corner', () => {
    const expected =
      (luminanceAt(img, 1, 0) + luminanceAt(img, 2, 0) + luminanceAt(img, 1, 1) + luminanceAt(img, 2, 1)) / 4;
    expect(sampleLuminance(img, 2, 1, false)).toBeCloseTo(expected, 12);
  });

  it('clamps to the border pixel when wrapping is off', () => {
    expect(sampleLuminance(img, -50, 0.5, false)).toBeCloseTo(luminanceAt(img, 0, 0), 12);
    expect(sampleLuminance(img, 500, 0.5, false)).toBeCloseTo(luminanceAt(img, 3, 0), 12);
    expect(sampleLuminance(img, 0.5, -50, false)).toBeCloseTo(luminanceAt(img, 0, 0), 12);
  });

  it('wraps back to the far side of the image when wrapping is on', () => {
    expect(sampleLuminance(img, 4.5, 0.5, true)).toBeCloseTo(luminanceAt(img, 0, 0), 12);
    expect(sampleLuminance(img, -3.5, 0.5, true)).toBeCloseTo(luminanceAt(img, 0, 0), 12);
    expect(sampleLuminance(img, 5.5, 0.5, true)).toBeCloseTo(luminanceAt(img, 1, 0), 12);
    expect(sampleLuminance(img, 0.5, 3.5, true)).toBeCloseTo(luminanceAt(img, 0, 0), 12);
  });

  it('blends across the seam rather than clamping when wrapping is on', () => {
    const bars = stripes(4, 1, 1);
    const clamped = sampleLuminance(bars, 4, 0.5, false);
    const wrapped = sampleLuminance(bars, 4, 0.5, true);
    expect(clamped).toBeCloseTo(luminanceAt(bars, 3, 0), 12);
    expect(wrapped).toBeCloseTo((luminanceAt(bars, 3, 0) + luminanceAt(bars, 0, 0)) / 2, 12);
    expect(wrapped).not.toBeCloseTo(clamped, 6);
  });

  it('is periodic with the image width when wrapping', () => {
    for (const u of [0.3, 1.9, 3.4]) {
      expect(sampleLuminance(img, u, 1.5, true)).toBeCloseTo(sampleLuminance(img, u + 4, 1.5, true), 12);
    }
  });
});
