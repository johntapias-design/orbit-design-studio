import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadScript(relativePath, expose) {
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const context = vm.createContext({ Blob, URL });
  vm.runInContext(`${source}\nglobalThis.__orbitTestValue = ${expose};`, context);
  return context.__orbitTestValue;
}

test('metadata de v0.30 conserva Orbit JSON v13 como formato actual', () => {
  const metadata = loadScript('public/js/core/app-metadata.js', 'ORBIT_APP');
  assert.equal(metadata.version, '0.30.0-alpha');
  assert.equal(metadata.versionLabel, 'v0.30');
  assert.equal(metadata.documentVersion, 13);
  assert.deepEqual([...metadata.supportedDocumentVersions], [12, 13]);
});

test('AI Design Workflow construye contexto limitado a la selección', () => {
  const ai = loadScript('public/js/ai/ai-design-workflow.js', '({ createOrbitAiContext })');
  const context = ai.createOrbitAiContext({
    version: 13,
    projectName: 'Orbit AI',
    nodes: [{ id: 'hero', type: 'section', children: [{ id: 'title', type: 'heading', content: 'Diseña mejor', styles: { base: { color: '#111111' } } }] }],
    tokens: { colors: { brand: { name: 'Brand', value: '#ef5a24', cssVar: '--color-brand' } } },
  }, { scope: 'selection', selectedId: 'title' });
  assert.equal(context.scope, 'selection');
  assert.equal(context.stats.nodes, 1);
  assert.equal(context.selected.id, 'title');
  assert.deepEqual([...context.textSamples], ['Diseña mejor']);
});

test('auditor visual detecta jerarquía, legibilidad y riesgo responsive', () => {
  const ai = loadScript('public/js/ai/ai-design-workflow.js', '({ auditOrbitVisualDesign })');
  const report = ai.auditOrbitVisualDesign({ nodes: [{
    id: 'section', type: 'section', name: 'Hero', children: [
      { id: 'copy', type: 'text', name: 'Legal', content: 'Texto', styles: { base: { fontSize: '10px', width: '900px' } } },
      { id: 'image', type: 'image', name: 'Product', src: '/product.png', alt: '' },
    ],
  }] });
  assert.ok(report.score < 100);
  assert.ok(report.critical.some(issue => issue.code === 'h1-count'));
  assert.ok(report.critical.some(issue => issue.code === 'fixed-mobile-width'));
  assert.ok(report.warnings.some(issue => issue.code === 'small-text'));
  assert.ok(report.warnings.some(issue => issue.code === 'image-alt'));
});

test('generación contextual crea sección responsive y prompt Orbit JSON v13', () => {
  const ai = loadScript('public/js/ai/ai-design-workflow.js', '({ createOrbitContextualSection, createOrbitAiPrompt, extractOrbitJsonFromAiResponse })');
  const context = { scope: 'page', projectName: 'Demo', tokens: { colors: [{ name: 'Brand primary', cssVar: '--color-brand' }] } };
  const section = ai.createOrbitContextualSection({ brief: 'Presenta el nuevo producto con claridad', context, now: 123456 });
  assert.equal(section.type, 'section');
  assert.equal(section.children.length, 3);
  assert.equal(section.children[2].styles.base.background, 'var(--color-brand)');
  assert.equal(section.styles.mobile.paddingLeft, '20px');
  const prompt = ai.createOrbitAiPrompt({ context, brief: 'Mejorar el hero', task: 'improve' });
  assert.match(prompt, /version 13/);
  assert.match(prompt, /Mejorar el hero/);
  const extracted = ai.extractOrbitJsonFromAiResponse('Respuesta:\n```json\n{"version":13,"nodes":[]}\n```');
  assert.equal(extracted.ok, true);
  assert.equal(extracted.value.version, 13);
});

test('Production Export detecta bloqueos SEO y rutas duplicadas', () => {
  const production = loadScript('public/js/export/production-export.js', '({ auditOrbitProductionExport })');
  const report = production.auditOrbitProductionExport({ projectName: 'Demo', pages: [
    { name: 'Home', slug: '/', meta: { title: '', description: '' }, nodes: [] },
    { name: 'Copy', slug: '/', meta: { title: 'Copy', description: 'Description' }, nodes: [] },
  ] }, { siteUrl: 'https://example.com' });
  assert.equal(report.ready, false);
  assert.ok(report.errors.some(issue => issue.code === 'seo.title.missing'));
  assert.ok(report.errors.some(issue => issue.code === 'route.duplicate'));
});

test('Production Export genera Astro, robots y Lighthouse reproducibles', () => {
  const production = loadScript('public/js/export/production-export.js', '({ createOrbitAstroConfig, createOrbitRobotsTxt, createOrbitLighthouseConfig, createOrbitProductionPackage })');
  const settings = { siteUrl: 'https://orbit.example/', sitemap: true, lighthouse: true };
  const config = production.createOrbitAstroConfig(settings, 'Orbit');
  assert.match(config, /@astrojs\/sitemap/);
  assert.match(config, /https:\/\/orbit\.example/);
  assert.match(production.createOrbitRobotsTxt(settings, 'Orbit'), /sitemap-index\.xml/);
  const lighthouse = JSON.parse(production.createOrbitLighthouseConfig(['/', '/work']));
  assert.equal(lighthouse.ci.assert.assertions['categories:performance'][1].minScore, 0.9);
  assert.equal(lighthouse.ci.upload.target, 'filesystem');
  const packageJson = production.createOrbitProductionPackage({ name: 'orbit', settings });
  assert.equal(packageJson.dependencies.astro, '^7.2.6');
  assert.equal(packageJson.dependencies['@astrojs/sitemap'], '^3.7.3');
  assert.match(packageJson.scripts.lighthouse, /@lhci\/cli@0\.15\.1/);
});

test('Orbit JSON Studio migra v12 a v13 con defaults explícitos', () => {
  const studio = loadScript('public/js/json/orbit-json-studio.js', '({ migrateOrbitJsonToV13, validateOrbitJsonV13 })');
  const migrated = studio.migrateOrbitJsonToV13({ version: 12, projectName: 'Legacy', nodes: [{ id: 'hero', type: 'section' }] });
  assert.equal(migrated.fromVersion, 12);
  assert.equal(migrated.document.version, 13);
  assert.equal(migrated.document.pageMeta.title, 'Legacy');
  assert.deepEqual(Object.keys(migrated.document.tokens), ['colors','typography','spacing','radius','shadows']);
  assert.equal(studio.validateOrbitJsonV13(migrated.document).valid, true);
});

test('Orbit JSON Studio informa ubicación de sintaxis y rutas inválidas', () => {
  const studio = loadScript('public/js/json/orbit-json-studio.js', '({ parseOrbitJsonSource, validateOrbitJsonV13 })');
  const parsed = studio.parseOrbitJsonSource('{\n  "nodes": [}\n');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.line, 2);
  const validation = studio.validateOrbitJsonV13({ version: 13, projectName: '', pageMeta: {}, tokens: {}, assets: [], components: [], globalClasses: [], nodes: [{ id: 'same', type: 'section' }, { id: 'same', type: 'unknown' }] });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(issue => issue.path === '$.nodes[1].id'));
  assert.ok(validation.errors.some(issue => issue.code === 'node.type.unsupported'));
});

test('Orbit JSON Studio repara IDs y genera preview que escapa contenido', () => {
  const studio = loadScript('public/js/json/orbit-json-studio.js', '({ repairOrbitJsonV13, validateOrbitJsonV13, createOrbitJsonPreviewHtml })');
  const repaired = studio.repairOrbitJsonV13({ nodes: [{ id: 'same', type: 'heading', content: '<script>alert(1)</script>' }, { id: 'same', type: 'mystery' }] });
  assert.equal(studio.validateOrbitJsonV13(repaired.document).valid, true);
  assert.notEqual(repaired.document.nodes[0].id, repaired.document.nodes[1].id);
  assert.equal(repaired.document.nodes[1].type, 'container');
  const preview = studio.createOrbitJsonPreviewHtml(repaired.document);
  assert.doesNotMatch(preview, /<script>alert/);
  assert.match(preview, /&lt;script&gt;alert/);
});

test('perfil de proyectos grandes adapta autosave e historial', () => {
  const reliability = loadScript('public/js/reliability/project-reliability.js', '({ countOrbitNodes, orbitProjectProfile })');
  const nodes = Array.from({ length: 350 }, (_, index) => ({ id: `node-${index}` }));
  assert.equal(reliability.countOrbitNodes([{ id: 'root', children: nodes }]), 351);
  const profile = reliability.orbitProjectProfile({ nodes });
  assert.equal(profile.tier, 'large');
  assert.equal(profile.autosaveDelay, 1500);
  assert.equal(profile.historyLimit, 40);
});

test('borradores de recuperación detectan datos alterados', () => {
  const reliability = loadScript('public/js/reliability/project-reliability.js', '({ createOrbitRecoveryEnvelope, parseOrbitRecoveryEnvelope })');
  const draft = reliability.createOrbitRecoveryEnvelope({ projectId: 'project-1', name: 'Orbit', revision: 7, createdAt: 123, snapshot: { nodes: [{ id: 'hero' }] } });
  const restored = reliability.parseOrbitRecoveryEnvelope(draft.serialized);
  assert.equal(restored.projectId, 'project-1');
  assert.equal(restored.revision, 7);
  const corrupted = JSON.parse(draft.serialized);
  corrupted.snapshot.nodes[0].id = 'changed';
  assert.equal(reliability.parseOrbitRecoveryEnvelope(corrupted), null);
});

test('autosave coalesce cambios rápidos y guarda la revisión más reciente', async () => {
  const { createOrbitAutosaveScheduler } = loadScript('public/js/reliability/project-reliability.js', '({ createOrbitAutosaveScheduler })');
  let timerId = 0;
  const timers = new Map();
  const fakeWindow = {
    setTimeout(callback, delay) { timerId += 1; timers.set(timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  const saved = [];
  const scheduler = createOrbitAutosaveScheduler({
    window: fakeWindow,
    getProfile: () => ({ autosaveDelay: 700, recoveryDelay: 450 }),
    save: async ({ revision }) => { saved.push(revision); },
    persistRecovery: () => true,
  });
  scheduler.markDirty();
  scheduler.markDirty();
  const saveTimer = [...timers.values()].find(timer => timer.delay === 700);
  assert.ok(saveTimer);
  saveTimer.callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved, [2]);
  assert.equal(scheduler.snapshot().savedRevision, 2);
});

test('Scroll Entrance FX valida presets y actualiza el árbol sin mutarlo', () => {
  const feature = loadScript('public/js/interactions/scroll-entrance-fx.js', '({ isOrbitScrollFxPreset, updateScrollFxNodes, renderScrollFxControl })');
  assert.equal(feature.isOrbitScrollFxPreset('fade-up'), true);
  assert.equal(feature.isOrbitScrollFxPreset('unknown'), false);

  const nodes = [{ id: 'hero', scrollAnim: 'none' }];
  const updateTree = (items, id, update) => items.map(item => item.id === id ? update(item) : item);
  const updated = feature.updateScrollFxNodes(nodes, 'hero', 'blur-in', updateTree);
  assert.equal(updated[0].scrollAnim, 'blur-in');
  assert.equal(nodes[0].scrollAnim, 'none');

  const html = feature.renderScrollFxControl(updated[0], (label, content) => `<section aria-label="${label}">${content}</section>`);
  assert.match(html, /data-scroll-anim-preset="blur-in"/);
  assert.match(html, /is-selected/);
});
