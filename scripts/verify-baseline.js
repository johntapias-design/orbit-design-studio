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
const jsonStudioSource = read('public/js/json/orbit-json-studio.js');
const qaSource = read('qa-contextual-toolbar.mjs');
const buildSource = read('scripts/build-standalone.js');
const workflowSource = read('.github/workflows/ci.yml');
const packageVersion = packageJson.version;
const versionMatch = metadataSource.match(/version:\s*'([^']+)'/);
const labelMatch = metadataSource.match(/versionLabel:\s*'([^']+)'/);
const documentVersionMatch = metadataSource.match(/documentVersion:\s*(\d+)/);

check('package y runtime comparten versión', versionMatch?.[1] === packageVersion);
check('release v0.31 visible', labelMatch?.[1] === 'v0.31' && indexHtml.includes('<title>Orbit Design Studio — v0.31</title>') && indexHtml.includes('<span class="version-badge">v0.31</span>'));
check('Orbit JSON v13 es el formato actual', Number(documentVersionMatch?.[1]) === 13 && navigationSource.includes('currentOrbitDocumentVersion()'));
check('Node está fijado para CI y desarrollo', read('.nvmrc').trim() === '26' && packageJson.engines?.node === '>=26 <27');
check('QA usa resolución multiplataforma de Chrome', qaSource.includes('resolveChromePath()') && !qaSource.includes("const chromePath = '/Applications/Google Chrome"));
check('CI publica artefacto v0.31', workflowSource.includes('Orbit-Netlify-v0.31') && workflowSource.includes("node-version-file: '.nvmrc'"));
check('Scroll Entrance FX está fuera del monolito', !navigationSource.includes('function scrollFxControl(') && navigationSource.includes('renderScrollFxControl(node,field)'));
check('Performance y recuperación están modularizadas', JS_MODULES.includes('reliability/project-reliability.js') && navigationSource.includes('createOrbitAutosaveScheduler'));
check('Orbit JSON Studio está modularizado', JS_MODULES.includes('json/orbit-json-studio.js') && navigationSource.includes('validateOrbitJsonV13') && navigationSource.includes('createOrbitJsonPreviewHtml'));
check('Core Design System Bridge importa .core sin alterar el canvas', JS_MODULES.includes('import/core-design-system-bridge.js') && navigationSource.includes('parseCoreDesignSystemSource') && navigationSource.includes("accept=\".core,.json,.css"));
check('AI Import Reliability usa contrato estricto', navigationSource.includes('createOrbitJsonAiAuthoringPrompt') && navigationSource.includes('auditOrbitJsonImportReadiness') && navigationSource.includes('ORBIT_JSON_LIMITS.sourceBytes'));
check('Reparación JSON explica cada corrección antes de importar', jsonStudioSource.includes('repairs.push({ category, code, path, message') && navigationSource.includes('orbitJsonRepairReport') && navigationSource.includes('Tu proyecto todavía no ha cambiado'));
check('biblioteca de secciones retirada de la navegación', !indexHtml.includes('data-tab="sections"') && navigationSource.includes("if(state.tab==='sections')state.tab='elements'"));
check('AI Design Workflow está modularizado', JS_MODULES.includes('ai/ai-design-workflow.js') && navigationSource.includes('createOrbitAiContext') && navigationSource.includes('auditOrbitVisualDesign') && navigationSource.includes('showAiDesignWorkflow'));
check('Production Export está modularizado', JS_MODULES.includes('export/production-export.js') && navigationSource.includes('auditOrbitProductionExport') && navigationSource.includes('createOrbitLighthouseConfig'));
check('Astro exporta imágenes modernas y Lighthouse', navigationSource.includes("import { Picture } from 'astro:assets'") && navigationSource.includes('lighthouserc.json') && navigationSource.includes('public/robots.txt'));
check('Build conserva rutas JSON con signo dólar', buildSource.includes('() => `<!-- Orbit bundled standalone script -->') && indexHtml.includes("'$.nodes'"));

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
