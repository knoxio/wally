import { DEFAULT_PARAMS, type Params } from '../core/params.js';
import { assignSelectField, buildFieldList } from './fields.js';

const STORAGE_KEY = 'wally.params.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Merges a JSON value of unknown shape onto `DEFAULT_PARAMS`, keeping only the
 * fields that are present and of the right primitive type (and, for the
 * string-union fields, one of the allowed options). Used to restore params
 * from localStorage without ever trusting the stored JSON's shape.
 */
export function sanitizeParams(parsed: unknown): Params {
  const result: Params = { ...DEFAULT_PARAMS };
  if (!isRecord(parsed)) return result;

  for (const field of buildFieldList()) {
    const raw = parsed[field.key];
    if (field.kind === 'boolean') {
      if (typeof raw === 'boolean') result[field.key] = raw;
    } else if (field.kind === 'number') {
      if (typeof raw === 'number' && Number.isFinite(raw)) result[field.key] = raw;
    } else if (typeof raw === 'string') {
      assignSelectField(result, field.key, raw);
    }
  }
  return result;
}

/** Restores the last-saved params from localStorage, falling back to defaults on any problem. */
export function loadParams(): Params {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_PARAMS };
    return sanitizeParams(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PARAMS };
  }
}

/** Persists the current params to localStorage. Failures (e.g. private browsing) are swallowed. */
export function saveParams(params: Params): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    // Storage can legitimately be unavailable; the app still works without persistence.
  }
}
