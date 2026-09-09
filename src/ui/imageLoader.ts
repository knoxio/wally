import type { RasterImage } from '../core/image.js';

/** Decodes an image file into the plain RGBA raster the core generator consumes. */
export async function decodeImageFile(file: File): Promise<RasterImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, data: imageData.data };
  } finally {
    bitmap.close();
  }
}

/** Wires a drop target so a PNG dragged onto `element` is handed to `onFile`. */
export function wireDropZone(element: HTMLElement, onFile: (file: File) => void): void {
  element.addEventListener('dragover', (event) => {
    event.preventDefault();
    element.classList.add('drag-active');
  });
  element.addEventListener('dragleave', () => {
    element.classList.remove('drag-active');
  });
  element.addEventListener('drop', (event) => {
    event.preventDefault();
    element.classList.remove('drag-active');
    const file = event.dataTransfer?.files[0];
    if (file) onFile(file);
  });
}
