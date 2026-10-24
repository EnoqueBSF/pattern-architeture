import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toPng } from './export/png.js';
import { renderDiagramSource } from './index.js';
import { DiagramValidationError } from './schema/load.js';

interface CliArgs {
  input: string;
  out?: string;
  formats: string[];
  scale: number;
  validateOnly: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { input: '', formats: ['svg', 'png'], scale: 2, validateOnly: false };
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift()!;
    if (a === '-o' || a === '--out') args.out = rest.shift();
    else if (a === '-f' || a === '--format') args.formats = (rest.shift() ?? 'svg').split(',').map((s) => s.trim());
    else if (a === '--scale') args.scale = Number(rest.shift());
    else if (a === '--validate') args.validateOnly = true;
    else if (!args.input) args.input = a;
  }
  if (!args.input) {
    console.error('uso: diagram <arquivo.yaml> [-o base] [-f svg,png] [--scale n] [--validate]');
    process.exit(1);
  }
  return args;
}

function resolveInput(input: string): string {
  const base = process.env.INIT_CWD ?? process.cwd();
  return resolve(base, input);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolveInput(args.input);

  let source: string;
  try {
    source = readFileSync(inputPath, 'utf-8');
  } catch (err) {
    console.error(`ERRO: nao foi possivel ler "${inputPath}": ${(err as Error).message}`);
    process.exit(1);
    return;
  }

  let result: ReturnType<typeof renderDiagramSource>;
  try {
    result = renderDiagramSource(source);
  } catch (err) {
    if (err instanceof DiagramValidationError) {
      console.error(err.message);
      process.exit(1);
      return;
    }
    throw err;
  }

  const { report } = result;
  console.log(`OK valido: ${report.nodeCount} nodes, ${report.edgeCount} edges, ${report.groupCount} grupos`);
  if (report.violations.length > 0) {
    console.error(`FALHA layout: ${report.layoutWidth}x${report.layoutHeight}px, ${report.violations.length} violacoes geometricas`);
    for (const v of report.violations) console.error(`  - ${v}`);
  } else {
    console.log(`OK layout: ${report.layoutWidth}x${report.layoutHeight}px, 0 sobreposicoes`);
  }
  console.log(`OK rotas ${report.routedCount}/${report.edgeCount}; ${report.noteCount} notas`);
  for (const w of report.warnings) console.warn(`AVISO: ${w}`);

  if (args.validateOnly) {
    process.exit(report.violations.length > 0 ? 2 : 0);
    return;
  }

  const outBase = args.out ? resolveInput(args.out) : inputPath.replace(/\.(ya?ml|json)$/i, '');
  if (args.formats.includes('svg')) {
    const svgPath = `${outBase}.svg`;
    writeFileSync(svgPath, result.svg, 'utf-8');
    console.log(`gerado: ${svgPath}`);
  }
  if (args.formats.includes('png')) {
    const pngPath = `${outBase}.png`;
    const png = toPng(result.svg, args.scale);
    writeFileSync(pngPath, png);
    console.log(`gerado: ${pngPath}`);
  }

  process.exit(report.violations.length > 0 ? 2 : 0);
}

main();
