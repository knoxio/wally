import { DEFAULT_PARAMS, FIT_MODES, HEIGHT_MODES, PROFILE_KINDS, type Params } from '../core/params.js';

export type FieldGroup =
  | 'Panel & tiling'
  | 'Relief geometry'
  | 'Edge & corner smoothing'
  | 'Underside & interlock'
  | 'Image mapping'
  | 'Material';

export const FIELD_GROUPS: readonly FieldGroup[] = [
  'Panel & tiling',
  'Relief geometry',
  'Edge & corner smoothing',
  'Underside & interlock',
  'Image mapping',
  'Material',
];

type NumberKey = { [K in keyof Params]: Params[K] extends number ? K : never }[keyof Params];
type BooleanKey = { [K in keyof Params]: Params[K] extends boolean ? K : never }[keyof Params];
type StringKey = { [K in keyof Params]: Params[K] extends string ? K : never }[keyof Params];

function isOneOf<T extends string>(value: string, options: readonly T[]): value is T {
  return (options as readonly string[]).includes(value);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled select field key: ${String(value)}`);
}

/**
 * Writes `value` onto the one string-union field named by `key`, after
 * checking it against that field's own allowed options.
 *
 * `Params`'s string-typed fields (`fitMode`, `heightMode`, `profile`) each
 * have a different literal union type, so a single generic `target[key] =
 * value` cannot be typed soundly — TypeScript would have to accept a value
 * assignable to the intersection of all three, which is empty. Branching on
 * the literal key first, with an exhaustiveness check in the default case,
 * keeps every branch soundly typed and forces this switch to be extended if
 * `Params` ever grows another string-union field.
 */
export function assignSelectField(target: Params, key: StringKey, value: string): void {
  switch (key) {
    case 'fitMode':
      if (isOneOf(value, FIT_MODES)) target.fitMode = value;
      return;
    case 'heightMode':
      if (isOneOf(value, HEIGHT_MODES)) target.heightMode = value;
      return;
    case 'profile':
      if (isOneOf(value, PROFILE_KINDS)) target.profile = value;
      return;
    default:
      assertNever(key);
  }
}

interface FieldMetaBase {
  readonly label: string;
  readonly hint: string;
  readonly group: FieldGroup;
}

export interface NumberField extends FieldMetaBase {
  readonly kind: 'number';
  readonly key: NumberKey;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface BooleanField extends FieldMetaBase {
  readonly kind: 'boolean';
  readonly key: BooleanKey;
}

export interface SelectField extends FieldMetaBase {
  readonly kind: 'select';
  readonly key: StringKey;
  readonly options: readonly string[];
}

export type Field = NumberField | BooleanField | SelectField;

function numberField<K extends NumberKey>(key: K, meta: Omit<NumberField, 'kind' | 'key'>): NumberField {
  return { kind: 'number', key, ...meta };
}

function booleanField<K extends BooleanKey>(key: K, meta: Omit<BooleanField, 'kind' | 'key'>): BooleanField {
  return { kind: 'boolean', key, ...meta };
}

function selectField<K extends StringKey>(
  key: K,
  options: readonly string[],
  meta: Omit<SelectField, 'kind' | 'key' | 'options'>,
): SelectField {
  return { kind: 'select', key, options, ...meta };
}

/**
 * Every known parameter, with the human-facing label, hint and (for numbers)
 * slider range that the panel doc comments describe. This list is the single
 * source of truth `buildFieldList` renders from; a field left out here still
 * appears in the UI with a generated label, via the fallback in
 * `buildFieldList`, so a new `Params` field never silently disappears.
 */
const KNOWN_FIELDS: readonly Field[] = [
  numberField('panelWidthMm', {
    label: 'Panel width',
    hint: 'Overall modelled width of the panel, in millimetres.',
    group: 'Panel & tiling',
    min: 200,
    max: 3000,
    step: 10,
  }),
  numberField('panelHeightMm', {
    label: 'Panel height',
    hint: 'Overall modelled height of the panel, in millimetres.',
    group: 'Panel & tiling',
    min: 200,
    max: 2000,
    step: 10,
  }),
  numberField('columns', {
    label: 'Columns',
    hint: 'Number of tiles across the panel.',
    group: 'Panel & tiling',
    min: 1,
    max: 20,
    step: 1,
  }),
  numberField('rows', {
    label: 'Rows',
    hint: 'Number of tiles down the panel.',
    group: 'Panel & tiling',
    min: 1,
    max: 20,
    step: 1,
  }),
  numberField('gapMm', {
    label: 'Gap',
    hint: 'Visible gap between mounted tiles. Not part of tile geometry; drives the connector width and the placement map.',
    group: 'Panel & tiling',
    min: 0,
    max: 20,
    step: 0.5,
  }),
  booleanField('centreTiles', {
    label: 'Centre tiles',
    hint: "Origin each tile's coordinates on its own centre rather than its top-left corner.",
    group: 'Panel & tiling',
  }),

  numberField('baseThicknessMm', {
    label: 'Base thickness',
    hint: 'Thickness of the flat base slab beneath the relief, in millimetres.',
    group: 'Relief geometry',
    min: 0.4,
    max: 10,
    step: 0.1,
  }),
  numberField('reliefHeightMm', {
    label: 'Relief height',
    hint: 'Height of the raised relief above the base plane, in millimetres.',
    group: 'Relief geometry',
    min: 0.2,
    max: 15,
    step: 0.05,
  }),
  numberField('samplePitchMm', {
    label: 'Sample pitch (export)',
    hint: 'Target spacing between heightmap samples. Snapped so each tile holds a whole number of samples.',
    group: 'Relief geometry',
    min: 0.1,
    max: 5,
    step: 0.05,
  }),
  numberField('previewPitchMm', {
    label: 'Sample pitch (preview)',
    hint: 'Coarser pitch used for the on-screen preview only.',
    group: 'Relief geometry',
    min: 0.5,
    max: 10,
    step: 0.1,
  }),
  selectField('heightMode', HEIGHT_MODES, {
    label: 'Height mode',
    hint: 'Binary thresholds the image into a raised mask; continuous drives height directly from grey level.',
    group: 'Relief geometry',
  }),
  selectField('profile', PROFILE_KINDS, {
    label: 'Bevel profile',
    hint: 'Shape of the transition from base plane to raised plateau across the bevel band.',
    group: 'Relief geometry',
  }),
  numberField('bevelWidthMm', {
    label: 'Bevel width',
    hint: 'Physical width of the slope between the base plane and the raised plateau.',
    group: 'Relief geometry',
    min: 0.1,
    max: 20,
    step: 0.1,
  }),
  numberField('bevelBias', {
    label: 'Bevel bias',
    hint: '-1 puts the bevel entirely in the black region, 0 centres it on the edge, +1 puts it entirely in the white region.',
    group: 'Relief geometry',
    min: -1,
    max: 1,
    step: 0.01,
  }),

  numberField('cornerRadiusMm', {
    label: 'Corner radius',
    hint: 'Approximate plan-view corner radius applied to the mask before the relief is built.',
    group: 'Edge & corner smoothing',
    min: 0,
    max: 20,
    step: 0.1,
  }),
  numberField('baseFilletFrac', {
    label: 'Base fillet fraction',
    hint: 'Fraction of the bevel band spent on the concave fillet where the slope meets the base.',
    group: 'Edge & corner smoothing',
    min: 0,
    max: 0.5,
    step: 0.01,
  }),
  numberField('topRoundFrac', {
    label: 'Top round fraction',
    hint: 'Fraction of the bevel band spent on the convex round-over where the slope meets the raised plateau.',
    group: 'Edge & corner smoothing',
    min: 0,
    max: 0.5,
    step: 0.01,
  }),
  numberField('tileEdgeChamferMm', {
    label: 'Tile edge chamfer',
    hint: 'Width of the band in which the relief eases back down to the base plane at the tile border.',
    group: 'Edge & corner smoothing',
    min: 0,
    max: 10,
    step: 0.1,
  }),

  booleanField('interlockEnabled', {
    label: 'Interlock enabled',
    hint: 'Cut rebates into the back of every tile edge that meets another tile, and export a connector plate for each shared edge.',
    group: 'Underside & interlock',
  }),
  numberField('rebateDepthMm', {
    label: 'Rebate depth',
    hint: 'Depth of the interlock rebate cut into the back face, in millimetres.',
    group: 'Underside & interlock',
    min: 0.1,
    max: 5,
    step: 0.05,
  }),
  numberField('rebateLengthMm', {
    label: 'Rebate length',
    hint: 'Length of the interlock rebate along the shared tile edge, in millimetres.',
    group: 'Underside & interlock',
    min: 5,
    max: 300,
    step: 1,
  }),
  numberField('rebateWidthMm', {
    label: 'Rebate width',
    hint: 'Width of the interlock rebate measured into the tile from its edge, in millimetres.',
    group: 'Underside & interlock',
    min: 1,
    max: 100,
    step: 0.5,
  }),
  numberField('connectorClearanceMm', {
    label: 'Connector clearance',
    hint: 'Clearance shaved off the connector plate so it drops freely into the paired rebates.',
    group: 'Underside & interlock',
    min: 0,
    max: 2,
    step: 0.02,
  }),
  booleanField('magnetsEnabled', {
    label: 'Magnets enabled',
    hint: 'Cut a magnet pocket into each corner of the back face.',
    group: 'Underside & interlock',
  }),
  numberField('magnetDiameterMm', {
    label: 'Magnet diameter',
    hint: 'Diameter of the magnet pocket cut into the back face, in millimetres.',
    group: 'Underside & interlock',
    min: 1,
    max: 30,
    step: 0.1,
  }),
  numberField('magnetDepthMm', {
    label: 'Magnet depth',
    hint: 'Depth of the magnet pocket, in millimetres.',
    group: 'Underside & interlock',
    min: 0.1,
    max: 5,
    step: 0.05,
  }),
  numberField('magnetInsetMm', {
    label: 'Magnet inset',
    hint: 'Distance of each magnet pocket centre from the nearest two tile edges, in millimetres.',
    group: 'Underside & interlock',
    min: 1,
    max: 100,
    step: 0.5,
  }),

  booleanField('invert', {
    label: 'Invert',
    hint: 'Swap which side of the threshold is raised.',
    group: 'Image mapping',
  }),
  numberField('threshold', {
    label: 'Threshold',
    hint: 'Grey level, in binary height mode, above which a pixel is raised.',
    group: 'Image mapping',
    min: 0.01,
    max: 0.99,
    step: 0.01,
  }),
  selectField('fitMode', FIT_MODES, {
    label: 'Fit mode',
    hint: 'How the source image maps onto the panel: cover, contain, stretch, or a tiled repeat.',
    group: 'Image mapping',
  }),
  numberField('repeatWidthMm', {
    label: 'Repeat width',
    hint: 'Physical width of one pattern repeat; used by the repeat fit mode only.',
    group: 'Image mapping',
    min: 10,
    max: 2000,
    step: 5,
  }),

  numberField('filamentDiameterMm', {
    label: 'Filament diameter',
    hint: 'Diameter of the filament used to convert solid volume into a length estimate.',
    group: 'Material',
    min: 1,
    max: 5,
    step: 0.05,
  }),
  numberField('filamentDensityGCm3', {
    label: 'Filament density',
    hint: 'Density of the filament material, in grams per cubic centimetre, used for the mass estimate.',
    group: 'Material',
    min: 0.5,
    max: 3,
    step: 0.01,
  }),
];

function humanize(key: string): string {
  return key
    .replace(/Mm$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function fallbackField(key: keyof Params): Field | null {
  const value = DEFAULT_PARAMS[key];
  if (typeof value === 'boolean') {
    return { kind: 'boolean', key: key as BooleanKey, label: humanize(key), hint: '', group: 'Material' };
  }
  if (typeof value === 'number') {
    const magnitude = Math.max(1, Math.abs(value));
    return {
      kind: 'number',
      key: key as NumberKey,
      label: humanize(key),
      hint: '',
      group: 'Material',
      min: 0,
      max: magnitude * 4,
      step: magnitude / 100 || 0.01,
    };
  }
  if (typeof value === 'string') {
    return { kind: 'select', key: key as StringKey, label: humanize(key), hint: '', group: 'Material', options: [value] };
  }
  return null;
}

/**
 * The full list of editable fields, one per key of `Params`. Fields described
 * in `KNOWN_FIELDS` use their hand-authored label, hint and range; any key of
 * `Params` not covered there still gets an entry, via `fallbackField`, so the
 * control panel never silently drops a newly added parameter.
 */
export function buildFieldList(): Field[] {
  const covered = new Set(KNOWN_FIELDS.map((f) => f.key as string));
  const extra = (Object.keys(DEFAULT_PARAMS) as (keyof Params)[])
    .filter((key) => !covered.has(key))
    .map(fallbackField)
    .filter((f): f is Field => f !== null);
  return [...KNOWN_FIELDS, ...extra];
}
