import type { Connector } from '../core/connector.js';
import type { Artifact, GenerateReport, PartReport } from '../core/generate.js';
import type { ValidationIssue } from '../core/params.js';

const fmt = (n: number, digits = 2): string => n.toFixed(digits);

/** Prints every warning from `validate()`. Errors are left to `generate()`, which refuses to run at all. */
export function printValidationWarnings(issues: readonly ValidationIssue[]): void {
  for (const issue of issues.filter((i) => i.level === 'warning')) {
    console.warn(`warning: ${issue.message}`);
  }
}

const triangleCountFromStl = (bytes: Uint8Array): number => (bytes.length - 84) / 50;

/** Prints one line of progress as an artifact streams off the generator. */
export function printArtifactProgress(artifact: Artifact): void {
  if (artifact.path.endsWith('.stl')) {
    console.log(`  ${artifact.path}  (${triangleCountFromStl(artifact.bytes)} triangles)`);
  } else {
    console.log(`  ${artifact.path}`);
  }
}

const printPart = (part: PartReport): void => {
  console.log(
    `  ${part.name}: ${fmt(part.material.volumeMm3)} mm3, ${fmt(part.material.filamentM)} m filament, ${fmt(part.material.massG)} g`,
  );
};

/** Prints the full end-of-run summary: geometry, per-part material use, connectors and total bytes written. */
export function printSummary(report: GenerateReport, connector: Connector | null, totalBytes: number): void {
  console.log('');
  console.log('Summary');
  console.log(`  tile size: ${fmt(report.tileWidthMm)} x ${fmt(report.tileHeightMm)} mm`);
  console.log(`  tile thickness: ${fmt(report.tileThicknessMm)} mm`);
  console.log(`  mounted panel size: ${fmt(report.mountedWidthMm)} x ${fmt(report.mountedHeightMm)} mm`);
  console.log('');
  console.log('Per-tile material:');
  for (const tile of report.tiles) printPart(tile);
  if (connector !== null && report.connector !== null) {
    console.log('');
    console.log(
      `  connector: ${report.connectorCount}x, ${fmt(connector.spanMm)} x ${fmt(connector.lengthMm)} x ${fmt(connector.thicknessMm)} mm each`,
    );
    printPart(report.connector);
  }
  console.log('');
  console.log(
    `Total: ${fmt(report.totalMaterial.volumeMm3)} mm3, ${fmt(report.totalMaterial.filamentM)} m filament, ${fmt(report.totalMaterial.massG)} g`,
  );
  console.log(`Total file size written: ${totalBytes} bytes`);
}

/** Prints the not-watertight tile names loudly, for when a mesh fails manifold verification. */
export function printNotWatertight(names: readonly string[]): void {
  console.error('');
  console.error('!!! NOT WATERTIGHT !!!');
  console.error('The following parts are not manifold and will not print cleanly:');
  for (const name of names) console.error(`  - ${name}`);
}
