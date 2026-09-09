import type { RasterImage } from '../core/image.js';
import type { Params } from '../core/params.js';
import { isExportOutboundMessage, type ExportOutboundMessage } from './exportProtocol.js';

export interface ExportHandle {
  cancel(): void;
}

export interface ExportCallbacks {
  onProgress(index: number, total: number, name: string): void;
  onDone(zip: Uint8Array): void;
  onError(message: string): void;
  onCancelled(): void;
}

/**
 * Runs a full panel export in a Web Worker so the main thread stays responsive,
 * and streams tile-by-tile progress back to `callbacks`. Returns a handle whose
 * `cancel()` asks the worker to stop after the tile currently in flight.
 */
export function startExport(image: RasterImage, params: Params, callbacks: ExportCallbacks): ExportHandle {
  const worker = new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' });

  worker.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message: unknown = event.data;
    if (!isExportOutboundMessage(message)) return;
    handle(message);
  });

  worker.addEventListener('error', (event: ErrorEvent) => {
    callbacks.onError(event.message);
    worker.terminate();
  });

  function handle(message: ExportOutboundMessage): void {
    switch (message.type) {
      case 'progress':
        callbacks.onProgress(message.index, message.total, message.name);
        return;
      case 'done':
        callbacks.onDone(message.zip);
        worker.terminate();
        return;
      case 'error':
        callbacks.onError(message.message);
        worker.terminate();
        return;
      case 'cancelled':
        callbacks.onCancelled();
        worker.terminate();
        return;
    }
  }

  worker.postMessage({ type: 'start', image, params });

  return {
    cancel(): void {
      worker.postMessage({ type: 'cancel' });
    },
  };
}
