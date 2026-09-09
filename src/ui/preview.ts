import type { Heightmap } from '../core/heightmap.js';
import { tileName, type Params } from '../core/params.js';

const MATERIAL_COLOR: readonly [number, number, number] = [214, 208, 196];
const LIGHT_DIR = normalize([-0.55, -0.55, 1]);
const AMBIENT = 0.4;
const DIFFUSE = 0.75;

function normalize(v: readonly [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function shadeHeightmap(heightmap: Heightmap): HTMLCanvasElement {
  const { gx, gy, pitchX, pitchY } = heightmap.grid;
  const { top } = heightmap;
  const canvas = document.createElement('canvas');
  canvas.width = gx;
  canvas.height = gy;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  const image = ctx.createImageData(gx, gy);
  const data = image.data;
  const [mr, mg, mb] = MATERIAL_COLOR;

  for (let j = 0; j < gy; j++) {
    const jUp = Math.max(0, j - 1);
    const jDown = Math.min(gy - 1, j + 1);
    for (let i = 0; i < gx; i++) {
      const iLeft = Math.max(0, i - 1);
      const iRight = Math.min(gx - 1, i + 1);
      const zL = top[j * gx + iLeft] ?? 0;
      const zR = top[j * gx + iRight] ?? 0;
      const zU = top[jUp * gx + i] ?? 0;
      const zD = top[jDown * gx + i] ?? 0;
      const dzdx = (zR - zL) / ((iRight - iLeft || 1) * pitchX);
      const dzdy = (zD - zU) / ((jDown - jUp || 1) * pitchY);
      const nx = -dzdx;
      const ny = -dzdy;
      const nz = 1;
      const nlen = Math.hypot(nx, ny, nz) || 1;
      const diffuse = Math.max(0, (nx * LIGHT_DIR[0] + ny * LIGHT_DIR[1] + nz * LIGHT_DIR[2]) / nlen);
      const shade = AMBIENT + DIFFUSE * diffuse;
      const o = (j * gx + i) * 4;
      data[o] = clampByte(mr * shade);
      data[o + 1] = clampByte(mg * shade);
      data[o + 2] = clampByte(mb * shade);
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function drawOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, p: Params): void {
  const cellW = width / p.columns;
  const cellH = height / p.rows;
  const fontSize = Math.max(9, Math.min(cellW, cellH) * 0.16);

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 200, 90, 0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < p.columns; c++) {
    const x = Math.round(c * cellW) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let r = 1; r < p.rows; r++) {
    const y = Math.round(r * cellH) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let row = 0; row < p.rows; row++) {
    for (let column = 0; column < p.columns; column++) {
      const cx = (column + 0.5) * cellW;
      const cy = (row + 0.5) * cellH;
      const label = tileName(row, column);
      const padX = 4;
      const w = ctx.measureText(label).width + padX * 2;
      ctx.fillStyle = 'rgba(10, 10, 12, 0.55)';
      ctx.fillRect(cx - w / 2, cy - fontSize * 0.7, w, fontSize * 1.4);
      ctx.fillStyle = 'rgba(255, 235, 205, 0.95)';
      ctx.fillText(label, cx, cy);
    }
  }
  ctx.restore();
}

/**
 * Renders the full-panel heightmap onto `canvas` as a hillshaded relief, with
 * the row/column cut lines and tile names overlaid. `canvas`'s CSS size drives
 * the output resolution; call this again whenever the container is resized.
 */
export function renderPreview(canvas: HTMLCanvasElement, heightmap: Heightmap, p: Params): void {
  const cssWidth = canvas.clientWidth || heightmap.grid.gx;
  const cssHeight = canvas.clientHeight || heightmap.grid.gy;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssHeight * dpr));

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  const shaded = shadeHeightmap(heightmap);
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(shaded, 0, 0, shaded.width, shaded.height, 0, 0, canvas.width, canvas.height);
  drawOverlay(ctx, canvas.width, canvas.height, p);
}
