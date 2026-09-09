import { tileName, type Params } from './params.js';

/** Where one tile sits on the wall, measured from the top-left corner of the mounted panel. */
export interface Placement {
  readonly row: number;
  readonly column: number;
  readonly name: string;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

/** Overall size of the mounted panel once the visible gaps are added between tiles. */
export function mountedSizeMm(p: Params): { widthMm: number; heightMm: number } {
  return {
    widthMm: p.panelWidthMm + p.gapMm * (p.columns - 1),
    heightMm: p.panelHeightMm + p.gapMm * (p.rows - 1),
  };
}

/**
 * Positions every tile on the backing board. Gaps sit between tiles only, so the
 * mounted panel is wider than the modelled panel by the gaps it contains.
 */
export function placements(p: Params): Placement[] {
  const tileW = p.panelWidthMm / p.columns;
  const tileH = p.panelHeightMm / p.rows;
  const out: Placement[] = [];
  for (let row = 0; row < p.rows; row++) {
    for (let column = 0; column < p.columns; column++) {
      out.push({
        row,
        column,
        name: tileName(row, column),
        xMm: column * (tileW + p.gapMm),
        yMm: row * (tileH + p.gapMm),
        widthMm: tileW,
        heightMm: tileH,
      });
    }
  }
  return out;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v: number): string => (Math.round(v * 1000) / 1000).toString();

/**
 * Draws the tile-placement map: every tile in its mounted position, labelled
 * with the file that belongs there. Dimensions are in millimetres at 1:1, so
 * printing the SVG to scale gives a usable setting-out drawing.
 */
export function placementMapSvg(p: Params, title = 'Tile placement'): string {
  const size = mountedSizeMm(p);
  const pad = 40;
  const items = placements(p);
  const label = Math.min(items[0]?.widthMm ?? 100, items[0]?.heightMm ?? 100) * 0.16;

  const tiles = items
    .map(
      (t) =>
        `    <rect x="${n(t.xMm)}" y="${n(t.yMm)}" width="${n(t.widthMm)}" height="${n(t.heightMm)}" fill="#f4f1ea" stroke="#333" stroke-width="0.5"/>\n` +
        `    <text x="${n(t.xMm + t.widthMm / 2)}" y="${n(t.yMm + t.heightMm / 2)}" font-size="${n(label)}" text-anchor="middle" dominant-baseline="central" font-family="monospace" fill="#222">${esc(t.name)}</text>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(size.widthMm + pad * 2)}mm" height="${n(size.heightMm + pad * 2)}mm" viewBox="${-pad} ${-pad} ${n(size.widthMm + pad * 2)} ${n(size.heightMm + pad * 2)}">
  <title>${esc(title)}</title>
  <rect x="${-pad}" y="${-pad}" width="${n(size.widthMm + pad * 2)}" height="${n(size.heightMm + pad * 2)}" fill="#111"/>
  <g>
${tiles}
  </g>
  <text x="0" y="${n(-pad / 2)}" font-size="${n(pad / 3)}" font-family="monospace" fill="#eee">${esc(title)} — ${n(size.widthMm)} x ${n(size.heightMm)} mm mounted, ${p.rows} rows x ${p.columns} columns, ${n(p.gapMm)} mm gaps</text>
</svg>
`;
}

/** The same information as a table, for pasting into notes or a build sheet. */
export function placementMapMarkdown(p: Params): string {
  const size = mountedSizeMm(p);
  const rows = placements(p).map(
    (t) => `| ${t.name} | ${t.row + 1} | ${t.column + 1} | ${n(t.xMm)} | ${n(t.yMm)} |`,
  );
  return [
    `# Tile placement`,
    ``,
    `Mounted panel: ${n(size.widthMm)} x ${n(size.heightMm)} mm including ${n(p.gapMm)} mm gaps.`,
    `Tile: ${n(p.panelWidthMm / p.columns)} x ${n(p.panelHeightMm / p.rows)} mm.`,
    `Positions are the top-left corner of each tile, measured from the top-left of the panel.`,
    ``,
    `| Tile | Row | Column | X (mm) | Y (mm) |`,
    `| --- | --- | --- | --- | --- |`,
    ...rows,
    ``,
  ].join('\n');
}
