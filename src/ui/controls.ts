import type { Params } from '../core/params.js';
import {
  assignSelectField,
  buildFieldList,
  FIELD_GROUPS,
  type BooleanField,
  type Field,
  type NumberField,
  type SelectField,
} from './fields.js';

interface Row {
  readonly element: HTMLElement;
  readonly sync: (p: Params) => void;
}

function buildNumberRow(field: NumberField, initial: Params, emit: (value: number) => void): Row {
  const row = document.createElement('div');
  row.className = 'field';

  const label = document.createElement('label');
  label.textContent = field.label;
  label.htmlFor = `field-${field.key}`;

  const controls = document.createElement('div');
  controls.className = 'field-controls';

  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(field.min);
  range.max = String(field.max);
  range.step = String(field.step);
  range.id = `field-${field.key}`;

  const number = document.createElement('input');
  number.type = 'number';
  number.min = String(field.min);
  number.max = String(field.max);
  number.step = String(field.step);

  const setDisplay = (value: number): void => {
    range.value = String(value);
    number.value = String(value);
  };
  setDisplay(initial[field.key]);

  range.addEventListener('input', () => {
    const value = Number(range.value);
    number.value = String(value);
    emit(value);
  });
  number.addEventListener('input', () => {
    const value = Number(number.value);
    if (Number.isNaN(value)) return;
    range.value = String(value);
    emit(value);
  });

  controls.append(range, number);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = field.hint;

  row.append(label, controls, hint);
  return { element: row, sync: (p) => setDisplay(p[field.key]) };
}

function buildBooleanRow(field: BooleanField, initial: Params, emit: (value: boolean) => void): Row {
  const row = document.createElement('div');
  row.className = 'field field-boolean';

  const wrapper = document.createElement('label');
  wrapper.className = 'checkbox-label';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `field-${field.key}`;
  checkbox.checked = initial[field.key];
  checkbox.addEventListener('change', () => emit(checkbox.checked));

  const text = document.createElement('span');
  text.textContent = field.label;

  wrapper.append(checkbox, text);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = field.hint;

  row.append(wrapper, hint);
  return { element: row, sync: (p) => (checkbox.checked = p[field.key]) };
}

function buildSelectRow(field: SelectField, initial: Params, emit: (value: string) => void): Row {
  const row = document.createElement('div');
  row.className = 'field';

  const label = document.createElement('label');
  label.textContent = field.label;
  label.htmlFor = `field-${field.key}`;

  const select = document.createElement('select');
  select.id = `field-${field.key}`;
  for (const option of field.options) {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = option;
    select.appendChild(opt);
  }
  select.value = initial[field.key];
  select.addEventListener('change', () => emit(select.value));

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = field.hint;

  row.append(label, select, hint);
  return { element: row, sync: (p) => (select.value = p[field.key]) };
}

export interface ControlsHandle {
  /** Updates every control's displayed value to match `params`, without rebuilding the DOM. */
  syncValues(params: Params): void;
}

/**
 * Builds one control per field of `Params`, grouped under the headings in
 * `FIELD_GROUPS`. Each control mutates a working copy of `params` and reports
 * the new value via `onChange`; the caller owns the authoritative state.
 */
export function buildControls(container: HTMLElement, params: Params, onChange: (next: Params) => void): ControlsHandle {
  container.innerHTML = '';
  let current = params;

  const fields = buildFieldList();
  const byGroup = new Map<string, Field[]>();
  for (const field of fields) {
    const list = byGroup.get(field.group) ?? [];
    list.push(field);
    byGroup.set(field.group, list);
  }

  const rows: Row[] = [];

  for (const group of FIELD_GROUPS) {
    const items = byGroup.get(group);
    if (items === undefined || items.length === 0) continue;

    const section = document.createElement('section');
    section.className = 'control-group';
    const heading = document.createElement('h2');
    heading.textContent = group;
    section.appendChild(heading);

    for (const field of items) {
      let row: Row;
      if (field.kind === 'number') {
        row = buildNumberRow(field, current, (value) => {
          const next: Params = { ...current };
          next[field.key] = value;
          current = next;
          onChange(current);
        });
      } else if (field.kind === 'boolean') {
        row = buildBooleanRow(field, current, (value) => {
          const next: Params = { ...current };
          next[field.key] = value;
          current = next;
          onChange(current);
        });
      } else {
        row = buildSelectRow(field, current, (value) => {
          const next: Params = { ...current };
          assignSelectField(next, field.key, value);
          current = next;
          onChange(current);
        });
      }
      rows.push(row);
      section.appendChild(row.element);
    }

    container.appendChild(section);
  }

  return {
    syncValues(next: Params): void {
      current = next;
      for (const row of rows) row.sync(next);
    },
  };
}
