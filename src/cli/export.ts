import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { CliError, helpText, parseArgs } from './args.js';
import { decodePng } from './png.js';
import { printArtifactProgress, printNotWatertight, printSummary, printValidationWarnings } from './report.js';
import { buildConnector, type Connector } from '../core/connector.js';
import { generate, type GenerateReport } from '../core/generate.js';
import { validate } from '../core/params.js';

async function writeArtifact(outDir: string, path: string, bytes: Uint8Array): Promise<void> {
  const fullPath = join(outDir, path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);
}

async function run(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed === 'help') {
    console.log(helpText());
    return 0;
  }
  const { input, out, verify, params } = parsed;

  printValidationWarnings(validate(params));

  const source = await readFile(input);
  const image = decodePng(source);

  await mkdir(out, { recursive: true });

  console.log(`Generating panel from ${input} into ${out}...`);

  const generator = generate(image, params, { verify });
  let totalBytes = 0;
  let step = generator.next();
  while (!step.done) {
    const artifact = step.value;
    await writeArtifact(out, artifact.path, artifact.bytes);
    totalBytes += artifact.bytes.length;
    printArtifactProgress(artifact);
    step = generator.next();
  }
  const report: GenerateReport = step.value;

  const connector: Connector | null = params.interlockEnabled ? buildConnector(params) : null;
  printSummary(report, connector, totalBytes);

  if (report.notWatertight.length > 0) {
    printNotWatertight(report.notWatertight);
    return 1;
  }
  return 0;
}

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof CliError || error instanceof Error) {
      console.error(`error: ${error.message}`);
    } else {
      console.error(`error: ${String(error)}`);
    }
    process.exitCode = 1;
  });
