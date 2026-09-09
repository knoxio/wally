import { DEFAULT_PARAMS, FIT_MODES, HEIGHT_MODES, PROFILE_KINDS } from '../core/params.js';
import type { Params } from '../core/params.js';

/** A problem with the command line itself, as opposed to an unexpected failure. Its message is shown as-is, without a stack trace. */
export class CliError extends Error {}

/** Fully resolved command line: what to read, where to write, and the panel to build. */
export interface CliOptions {
  readonly input: string;
  readonly out: string;
  readonly verify: boolean;
  readonly params: Params;
}

const ENUM_FIELDS = {
  fitMode: FIT_MODES,
  heightMode: HEIGHT_MODES,
  profile: PROFILE_KINDS,
} as const;

type EnumFieldKey = keyof typeof ENUM_FIELDS;

function isEnumField(key: keyof Params): key is EnumFieldKey {
  return key in ENUM_FIELDS;
}

function isMember<T extends string>(value: string, allowed: readonly T[]): value is T {
  const widened: readonly string[] = allowed;
  return widened.includes(value);
}

function setField<K extends keyof Params>(target: Params, key: K, value: Params[K]): void {
  target[key] = value;
}

export function camelToKebab(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function buildFlagAliases(): Map<string, keyof Params> {
  const map = new Map<string, keyof Params>();
  for (const key of Object.keys(DEFAULT_PARAMS) as (keyof Params)[]) {
    map.set(key, key);
    map.set(camelToKebab(key), key);
  }
  return map;
}

function parseBooleanValue(raw: string | null, flagLabel: string): boolean {
  if (raw === null) return true;
  const lower = raw.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  throw new CliError(`Invalid value "${raw}" for --${flagLabel}. Expected true or false.`);
}

interface FlagContext {
  readonly negated: boolean;
  readonly inlineValue: string | null;
  readonly takeValue: () => string;
}

function applyField(params: Params, key: keyof Params, label: string, ctx: FlagContext): void {
  if (isEnumField(key)) {
    if (ctx.negated) throw new CliError(`--no-${label} is not valid; --${label} takes a value.`);
    const raw = ctx.inlineValue ?? ctx.takeValue();
    const allowed = ENUM_FIELDS[key];
    if (!isMember(raw, allowed)) {
      throw new CliError(`Invalid value "${raw}" for --${label}. Allowed values: ${allowed.join(', ')}.`);
    }
    setField(params, key, raw);
    return;
  }

  const defaultValue = DEFAULT_PARAMS[key];
  if (typeof defaultValue === 'boolean') {
    const value = ctx.negated ? false : parseBooleanValue(ctx.inlineValue, label);
    setField(params, key, value);
    return;
  }

  if (ctx.negated) throw new CliError(`--no-${label} is not valid; --${label} takes a numeric value.`);
  const raw = ctx.inlineValue ?? ctx.takeValue();
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new CliError(`Invalid number "${raw}" for --${label}.`);
  }
  setField(params, key, value);
}

/**
 * Parses `process.argv`-style tokens into a fully resolved CLI invocation.
 *
 * Every field of {@link Params} is accepted as `--kebab-case` or `--camelCase`,
 * derived from {@link DEFAULT_PARAMS} rather than hand-listed. Booleans accept
 * `--flag`, `--flag=true|false` and `--no-flag`; numbers and the string-union
 * fields accept `--flag value` or `--flag=value`. Unknown flags, missing
 * required flags, out-of-range enum values and unparsable numbers all throw a
 * {@link CliError} with a message naming the offending flag.
 *
 * Returns the literal string `'help'` if `--help`/`-h` was requested anywhere
 * in the arguments, since help output does not require the rest of the
 * command line to be valid.
 */
export function parseArgs(argv: readonly string[]): CliOptions | 'help' {
  if (argv.includes('--help') || argv.includes('-h')) return 'help';

  const aliases = buildFlagAliases();
  const params: Params = { ...DEFAULT_PARAMS };
  let input: string | undefined;
  let out: string | undefined;
  let verify = true;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) continue;
    if (!token.startsWith('--')) {
      throw new CliError(`Unexpected argument: ${token}`);
    }

    let body = token.slice(2);
    let negated = false;
    if (body.startsWith('no-')) {
      negated = true;
      body = body.slice(3);
    }

    let inlineValue: string | null = null;
    const eq = body.indexOf('=');
    if (eq !== -1) {
      inlineValue = body.slice(eq + 1);
      body = body.slice(0, eq);
    }

    const label = body;
    const takeValue = (): string => {
      if (inlineValue !== null) return inlineValue;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new CliError(`Flag --${label} requires a value.`);
      }
      i++;
      return next;
    };

    if (body === 'input') {
      input = takeValue();
      continue;
    }
    if (body === 'out') {
      out = takeValue();
      continue;
    }
    if (body === 'verify') {
      verify = negated ? false : parseBooleanValue(inlineValue, 'verify');
      continue;
    }

    const key = aliases.get(body);
    if (key === undefined) {
      throw new CliError(`Unknown flag: --${negated ? 'no-' : ''}${body}`);
    }
    applyField(params, key, label, { negated, inlineValue, takeValue });
  }

  if (input === undefined) throw new CliError('Missing required flag: --input <file.png>');
  if (out === undefined) throw new CliError('Missing required flag: --out <dir>');

  return { input, out, verify, params };
}

function describeField(key: keyof Params): string {
  const label = `--${camelToKebab(key)}`;
  if (isEnumField(key)) {
    const allowed = ENUM_FIELDS[key];
    return `  ${label} <${allowed.join('|')}>  (default: ${DEFAULT_PARAMS[key]})`;
  }
  const defaultValue = DEFAULT_PARAMS[key];
  if (typeof defaultValue === 'boolean') {
    return `  ${label} | --no-${camelToKebab(key)}  (default: ${defaultValue})`;
  }
  return `  ${label} <number>  (default: ${defaultValue})`;
}

/** Renders the full `--help` text, listing every {@link Params} field alongside its default. */
export function helpText(): string {
  const lines: string[] = [
    'Usage: export --input <file.png> --out <dir> [options]',
    '',
    'Required:',
    '  --input <file.png>   Source heightmap image (PNG).',
    '  --out <dir>           Directory to write the panel into.',
    '',
    'Other flags:',
    '  --no-verify            Skip manifold checking of generated meshes.',
    '  --help, -h             Show this help text.',
    '',
    'Panel parameters (from Params):',
  ];
  for (const key of Object.keys(DEFAULT_PARAMS) as (keyof Params)[]) {
    lines.push(describeField(key));
  }
  return lines.join('\n');
}
