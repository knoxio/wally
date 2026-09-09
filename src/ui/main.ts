import { buildHeightmap, type Heightmap } from '../core/heightmap.js';
import type { RasterImage } from '../core/image.js';
import { DEFAULT_PARAMS, type Params } from '../core/params.js';
import { buildControls } from './controls.js';
import { startExport, type ExportHandle } from './exportClient.js';
import { decodeImageFile, wireDropZone } from './imageLoader.js';
import { renderPreview } from './preview.js';
import { renderReadout } from './readout.js';
import { loadParams, saveParams } from './state.js';

function requireElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id} in index.html`);
  return el as T;
}

const controlsEl = requireElement<HTMLDivElement>('controls');
const resetBtn = requireElement<HTMLButtonElement>('reset-btn');
const dropzone = requireElement<HTMLDivElement>('dropzone');
const fileInput = requireElement<HTMLInputElement>('file-input');
const fileNameEl = requireElement<HTMLParagraphElement>('file-name');
const canvasWrap = requireElement<HTMLDivElement>('canvas-wrap');
const canvas = requireElement<HTMLCanvasElement>('preview-canvas');
const placeholder = requireElement<HTMLParagraphElement>('preview-placeholder');
const statsEl = requireElement<HTMLDListElement>('stats');
const issuesEl = requireElement<HTMLUListElement>('issues');
const exportBtn = requireElement<HTMLButtonElement>('export-btn');
const progressEl = requireElement<HTMLDivElement>('progress');
const progressFill = requireElement<HTMLDivElement>('progress-fill');
const progressLabel = requireElement<HTMLSpanElement>('progress-label');
const cancelBtn = requireElement<HTMLButtonElement>('cancel-btn');

let params: Params = loadParams();
let image: RasterImage | null = null;
let previewHeightmap: Heightmap | null = null;
let renderTimer: ReturnType<typeof setTimeout> | null = null;
let exportHandle: ExportHandle | null = null;

const controls = buildControls(controlsEl, params, (next) => {
  params = next;
  saveParams(params);
  schedulePreview();
});

function schedulePreview(delayMs = 120): void {
  if (renderTimer !== null) clearTimeout(renderTimer);
  renderTimer = setTimeout(renderAll, delayMs);
}

function renderAll(): void {
  if (image !== null) {
    previewHeightmap = buildHeightmap(image, params, params.previewPitchMm);
    placeholder.hidden = true;
    renderPreview(canvas, previewHeightmap, params);
  } else {
    previewHeightmap = null;
    placeholder.hidden = false;
  }

  const { blocked } = renderReadout(statsEl, issuesEl, previewHeightmap, params);
  exportBtn.disabled = blocked || image === null || exportHandle !== null;
}

async function loadFile(file: File): Promise<void> {
  fileNameEl.textContent = file.name;
  image = await decodeImageFile(file);
  renderAll();
}

resetBtn.addEventListener('click', () => {
  params = { ...DEFAULT_PARAMS };
  saveParams(params);
  controls.syncValues(params);
  renderAll();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void loadFile(file);
});

wireDropZone(dropzone, (file) => void loadFile(file));

const resizeObserver = new ResizeObserver(() => {
  if (previewHeightmap !== null) renderPreview(canvas, previewHeightmap, params);
});
resizeObserver.observe(canvasWrap);

function setProgress(index: number, total: number, name: string): void {
  progressEl.hidden = false;
  const pct = total > 0 ? Math.round((index / total) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  progressLabel.textContent = `${name} (${index}/${total})`;
}

function resetExportUi(): void {
  exportHandle = null;
  progressEl.hidden = true;
  progressFill.style.width = '0%';
  exportBtn.disabled = image === null;
  renderAll();
}

function downloadZip(bytes: Uint8Array): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wally-panel.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

exportBtn.addEventListener('click', () => {
  if (image === null || exportHandle !== null) return;
  exportBtn.disabled = true;
  progressLabel.textContent = 'Starting…';
  progressEl.hidden = false;
  exportHandle = startExport(image, params, {
    onProgress(index, total, name) {
      setProgress(index, total, name);
    },
    onDone(zip) {
      downloadZip(zip);
      resetExportUi();
    },
    onError(message) {
      window.alert(`Export failed: ${message}`);
      resetExportUi();
    },
    onCancelled() {
      resetExportUi();
    },
  });
});

cancelBtn.addEventListener('click', () => {
  exportHandle?.cancel();
});

renderAll();
