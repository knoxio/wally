import { zipSync } from 'fflate';
import { artifactCount, generate } from '../core/generate.js';
import type { RasterImage } from '../core/image.js';
import type { Params } from '../core/params.js';
import type { ExportInboundMessage, ExportOutboundMessage } from './exportProtocol.js';

let cancelled = false;

function post(message: ExportOutboundMessage): void {
  postMessage(message);
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function run(image: RasterImage, params: Params): Promise<void> {
  cancelled = false;
  try {
    const files: Record<string, Uint8Array> = {};
    const gen = generate(image, params);
    const total = artifactCount(params);
    let index = 0;
    let step = gen.next();
    while (!step.done) {
      if (cancelled) {
        post({ type: 'cancelled' });
        return;
      }
      files[step.value.path] = step.value.bytes;
      index++;
      post({ type: 'progress', index, total, name: step.value.path });
      await nextTick();
      step = gen.next();
    }
    const zip = zipSync(files);
    post({ type: 'done', zip, report: step.value });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}

addEventListener('message', (event: MessageEvent<ExportInboundMessage>) => {
  const message = event.data;
  if (message.type === 'cancel') {
    cancelled = true;
    return;
  }
  void run(message.image, message.params);
});
