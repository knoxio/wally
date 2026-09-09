import type { Heightmap } from '../core/heightmap.js';
import { resolveGrid, validate, type Params, type ValidationIssue } from '../core/params.js';
import { mountedSizeMm } from '../core/placement.js';
import { estimatePanelMaterial, estimateTotalTriangles } from './panelStats.js';

function fmt(n: number, digits = 1): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export interface ReadoutResult {
  readonly issues: readonly ValidationIssue[];
  readonly blocked: boolean;
}

/**
 * Renders the size/material readout and validation issues for `params` into
 * `statsEl` and `issuesEl`. Returns the current issues so the caller can gate
 * the export button on `blocked`.
 */
export function renderReadout(
  statsEl: HTMLElement,
  issuesEl: HTMLElement,
  previewHeightmap: Heightmap | null,
  p: Params,
): ReadoutResult {
  const exportGrid = resolveGrid(p);
  const mounted = mountedSizeMm(p);
  const tileThickness = p.baseThicknessMm + p.reliefHeightMm;
  const material = previewHeightmap === null ? null : estimatePanelMaterial(previewHeightmap, p);
  const triangles = estimateTotalTriangles(p);

  const rows: Array<[string, string]> = [
    ['Tile size', `${fmt(exportGrid.tileWidthMm, 1)} x ${fmt(exportGrid.tileHeightMm, 1)} mm`],
    ['Tile thickness', `${fmt(tileThickness, 2)} mm`],
    ['Mounted panel (incl. gaps)', `${fmt(mounted.widthMm, 1)} x ${fmt(mounted.heightMm, 1)} mm`],
    ['Resolved sample pitch', `${fmt(exportGrid.pitchX, 3)} x ${fmt(exportGrid.pitchY, 3)} mm`],
    ['Estimated triangles', triangles.toLocaleString()],
    [
      'Estimated solid volume',
      material === null ? 'load an image' : `${fmt(material.volumeMm3 / 1000, 1)} cm³ (100% infill upper bound)`,
    ],
    ['Estimated filament', material === null ? 'load an image' : `${fmt(material.filamentM, 2)} m`],
    ['Estimated mass', material === null ? 'load an image' : `${fmt(material.massG, 1)} g`],
  ];

  statsEl.innerHTML = '';
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    statsEl.append(dt, dd);
  }

  const issues = validate(p);
  issuesEl.innerHTML = '';
  for (const issue of issues) {
    const li = document.createElement('li');
    li.className = issue.level === 'error' ? 'issue issue-error' : 'issue issue-warning';
    li.textContent = issue.message;
    issuesEl.appendChild(li);
  }

  const blocked = issues.some((i) => i.level === 'error');
  return { issues, blocked };
}
