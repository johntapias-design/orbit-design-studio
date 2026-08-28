import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/js/json/orbit-json-studio.js', import.meta.url), 'utf8');
const context = vm.createContext({ TextEncoder });
vm.runInContext(`${source}\nglobalThis.__studio={parseOrbitJsonSource,migrateOrbitJsonToV13,validateOrbitJsonV13,repairOrbitJsonV13,auditOrbitJsonResources};`, context);
const studio = context.__studio;
const ITERATIONS = 30;

const tokens = () => ({
  colors: { brand: { name: 'Brand', value: '#ef5a24' }, ink: { name: 'Ink', value: '#15171b' } },
  typography: { body: { name: 'Body', value: 'Inter, sans-serif' } },
  spacing: { md: { name: 'Medium', value: '24px' } }, radius: {}, shadows: {},
});
const node = (id, type, extra = {}) => ({ id, type, name: id, styles: { base: {} }, ...extra });
const section = (id, children) => node(id, 'section', { children });
const baseProject = (name, children) => ({
  version: 13, projectName: name,
  pageMeta: { language: 'es', title: name, description: `Sitio de prueba ${name}` },
  tokens: tokens(), assets: [], components: [], globalClasses: [], nodes: [section('main', children)],
});
const cards = (prefix, count, withImages = false) => Array.from({ length: count }, (_, index) => node(`${prefix}-${index}`, 'card', { children: [
  ...(withImages ? [node(`${prefix}-image-${index}`, 'image', { src: index % 9 === 0 ? '' : `https://cdn.example.com/${prefix}-${index}.webp`, alt: index % 7 === 0 ? '' : `Imagen ${index}` })] : []),
  node(`${prefix}-title-${index}`, 'heading', { level: 2, content: `Elemento ${index + 1}` }),
  node(`${prefix}-copy-${index}`, 'text', { content: 'Contenido representativo para medir importación y reparación.' }),
] }));

const fixtures = [
  { id: 'agency-landing', type: 'Landing de agencia', document: baseProject('Agencia Norte', [node('hero-title', 'heading', { level: 1, content: 'Diseño que mueve negocios' }), node('hero-copy', 'text', { content: 'Estrategia, diseño y desarrollo.' }), ...cards('service', 12)]) },
  { id: 'restaurant', type: 'Restaurante', document: (() => { const value = baseProject('Casa Brasa', [node('title', 'heading', { level: 1, content: 'Cocina local' }), ...cards('dish', 24, true)]); value.tokens.typography.body.value = 'Fuente Restaurante, serif'; return value; })() },
  { id: 'commerce-catalog', type: 'Catálogo comercial', document: (() => { const value = baseProject('Mercado Uno', [node('catalog-title', 'heading', { level: 1, content: 'Catálogo' }), ...cards('product', 180, true)]); value.nodes[0].children[8].id = 'product-1'; value.nodes[0].children[14].styles.base.filter = 'blur(2px)'; return value; })() },
  { id: 'visual-portfolio', type: 'Portafolio visual', document: baseProject('Estudio Prisma', [node('portfolio-title', 'heading', { level: 1, content: 'Trabajo seleccionado' }), ...cards('project', 70, true)]) },
  { id: 'professional-services', type: 'Servicios profesionales', document: (() => { const value = baseProject('Consultora Áurea', [node('', 'heading', { level: 1, content: '' }), ...cards('case', 32)]); value.version = 12; value.legacySetting = true; value.nodes[0].children[3].type = 'legacyWidget'; value.nodes[0].children[4].styles = 'broken'; return value; })() },
];

function percentile(values, ratio) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))]; }
function rounded(value) { return Math.round(value * 1000) / 1000; }
function countNodes(nodes = []) { return nodes.reduce((sum, item) => sum + 1 + countNodes(item?.children || []), 0); }

function executeFixture(fixture) {
  const raw = JSON.stringify(fixture.document); const importTimes = []; const correctionTimes = [];
  let initial; let repaired; let resources; let finalValidation;
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const importStart = performance.now(); const parsed = studio.parseOrbitJsonSource(raw);
    assert.equal(parsed.ok, true, `${fixture.id}: JSON parse`);
    const migrated = studio.migrateOrbitJsonToV13(parsed.value); initial = studio.validateOrbitJsonV13(migrated.document);
    importTimes.push(performance.now() - importStart);
    const correctionStart = performance.now(); repaired = studio.repairOrbitJsonV13(migrated.document);
    resources = studio.auditOrbitJsonResources(repaired.document); finalValidation = studio.validateOrbitJsonV13(repaired.document);
    correctionTimes.push(performance.now() - correctionStart);
  }
  assert.equal(finalValidation.valid, true, `${fixture.id}: repaired document must be valid`);
  assert.ok(percentile(importTimes, .95) < 750, `${fixture.id}: import p95 exceeded 750 ms`);
  assert.ok(percentile(correctionTimes, .95) < 750, `${fixture.id}: correction p95 exceeded 750 ms`);
  return {
    id: fixture.id, type: fixture.type, sourceBytes: Buffer.byteLength(raw), nodes: countNodes(fixture.document.nodes),
    timingMs: { importMedian: rounded(percentile(importTimes, .5)), importP95: rounded(percentile(importTimes, .95)), correctionMedian: rounded(percentile(correctionTimes, .5)), correctionP95: rounded(percentile(correctionTimes, .95)) },
    initial: { errors: initial.errors.length, warnings: initial.warnings.length, issueCodes: initial.issues.map(issue => issue.code) },
    correction: { repairs: repaired.summary.total, repairCodes: repaired.repairs.map(item => item.code), missingResources: resources.stats.missing },
    final: { valid: finalValidation.valid, errors: finalValidation.errors.length },
  };
}

const projects = fixtures.map(executeFixture); const issueFrequency = new Map();
projects.forEach(project => [...project.initial.issueCodes, ...project.correction.repairCodes].forEach(code => issueFrequency.set(code, (issueFrequency.get(code) || 0) + 1)));
const commonIssues = [...issueFrequency].map(([code, occurrences]) => ({ code, occurrences })).sort((a, b) => b.occurrences - a.occurrences || a.code.localeCompare(b.code));
const report = {
  format: 'orbit-real-project-benchmark', version: 1,
  methodology: { dataset: 'Escenarios representativos sin datos de clientes', iterationsPerProject: ITERATIONS, thresholdsMs: { importP95: 750, correctionP95: 750 } },
  environment: { node: process.version, platform: process.platform, architecture: process.arch },
  summary: { projects: projects.length, nodes: projects.reduce((sum, item) => sum + item.nodes, 0), allRepairedValid: projects.every(item => item.final.valid), totalInitialErrors: projects.reduce((sum, item) => sum + item.initial.errors, 0), totalRepairs: projects.reduce((sum, item) => sum + item.correction.repairs, 0) },
  commonIssues, projects,
};
if (process.argv.includes('--report')) {
  const target = new URL('../reports/real-project-benchmark.json', import.meta.url);
  mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
  writeFileSync(target, `${JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2)}\n`);
}
console.log(`✓ ${report.summary.projects} proyectos · ${report.summary.nodes} nodos · importación y reparación dentro del límite · 0 documentos inválidos`);

