import type { RasterImage } from '../core/image.js';
import type { Params } from '../core/params.js';
import type { GenerateReport } from '../core/generate.js';

export interface ExportStartMessage {
  readonly type: 'start';
  readonly image: RasterImage;
  readonly params: Params;
}

export interface ExportCancelMessage {
  readonly type: 'cancel';
}

export type ExportInboundMessage = ExportStartMessage | ExportCancelMessage;

export interface ExportProgressMessage {
  readonly type: 'progress';
  readonly index: number;
  readonly total: number;
  readonly name: string;
}

export interface ExportDoneMessage {
  readonly type: 'done';
  readonly zip: Uint8Array;
  readonly report: GenerateReport;
}

export interface ExportErrorMessage {
  readonly type: 'error';
  readonly message: string;
}

export interface ExportCancelledMessage {
  readonly type: 'cancelled';
}

export type ExportOutboundMessage =
  | ExportProgressMessage
  | ExportDoneMessage
  | ExportErrorMessage
  | ExportCancelledMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Narrows a message received from `postMessage`, whose payload TS otherwise sees as `any`. */
export function isExportOutboundMessage(value: unknown): value is ExportOutboundMessage {
  if (!isRecord(value)) return false;
  return (
    value['type'] === 'progress' || value['type'] === 'done' || value['type'] === 'error' || value['type'] === 'cancelled'
  );
}
