import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JS_MODULES } from './build-manifest.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const failures = [];
const checks = [];

function check(label, condition) {
  checks.push(label);
  if (!condition) failures.push(label);
}

const packageJson = JSON.parse(read('package.json'));
const indexHtml = read('index.html');
const metadataSource = read('public/js/core/app-metadata.js');
const navigationSource = read('public/js/navigation/canvas-navigation.js');
const qaSource = read('qa-contextual-toolbar.mjs');
const workflowSource = read('.github/workflows/ci.yml');
const packageVersion = packageJson.version;
const versionMatch = metadataSource.match(/version:\s*'([^']+)'/);
const labelMatch = metadataSource.match(/versionLabel:\s*'([^']+)'/);
const documentVersionMatch = metadataSource.match(/documentVersion:\s*(\d+)/);

check('package y runtime comparten versión', versionMatch?.[1] === packageVersion);
check('release v0.25 visible', labelMatch?.[1] === 'v0.25' && indexHtml.includes('<title>Orbit Design Studio — v0.25</title>') && indexHtml.includes('<span class="version-badge">v0.25</span>'));
check('Orbit JSON v13 es el formato actual', Number(documentVersionMatch?.[1]) === 13 && navigationSource.includes('currentOrbitDocumentVersion()'));
check('Node está fijado para CI y desarrollo', read('.nvmrc').trim() === '26' && packageJson.engines?.node === '>=26 <27');
check('QA usa resolución multiplataforma de Chrome', qaSource.includes('resolveChromePath()') && !qaSource.includes("const chromePath = '/Applications/Google Chrome"));
check('CI publica artefacto v0.25', workflowSource.includes('Orbit-Netlify-v0.25') && workflowSource.includes("node-version-file: '.nvmrc'"));
check('Scroll Entrance FX está fuera del monolito', !navigationSource.includes('function scrollFxControl(') && navigationSource.includes('renderScrollFxControl(node,field)'));

let previousIndex = -1;
for (const modulePath of JS_MODULES) {
  const sourcePath = path.join(root, 'public', 'js', modulePath);
  const marker = `/* public/js/${modulePath} */`;
  const markerIndex = indexHtml.indexOf(marker);
  check(`módulo presente: ${modulePath}`, fs.existsSync(sourcePath));
  check(`módulo compilado: ${modulePath}`, markerIndex > previousIndex);
  previousIndex = markerIndex;
}

for (const schemaPath of ['schemas/orbit-json-v12.schema.json', 'schemas/orbit-json-v13.schema.json']) {
  try {
    JSON.parse(read(schemaPath));
    check(`schema válido: ${schemaPath}`, true);
  } catch {
    check(`schema válido: ${schemaPath}`, false);
  }
}

const zipPath = path.join(root, 'Orbit-Netlify.zip');
const zipHeader = fs.existsSync(zipPath) ? fs.readFileSync(zipPath).subarray(0, 2).toString('ascii') : '';
check('paquete Netlify generado', zipHeader === 'PK');

if (failures.length) {
  process.stderr.write(`Engineering Baseline: ${failures.length} comprobaciones fallaron:\n- ${failures.join('\n- ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Engineering Baseline: ${checks.length} comprobaciones aprobadas.\n`);
}
