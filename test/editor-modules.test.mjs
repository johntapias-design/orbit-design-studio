import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadScript(relativePath, expose) {
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const context = vm.createContext({ Blob });
  vm.runInContext(`${source}\nglobalThis.__orbitTestValue = ${expose};`, context);
  return context.__orbitTestValue;
}

test('metadata de v0.26 define Orbit JSON v13 como formato actual', () => {
  const metadata = loadScript('public/js/core/app-metadata.js', 'ORBIT_APP');
  assert.equal(metadata.version, '0.26.0-alpha');
  assert.equal(metadata.versionLabel, 'v0.26');
  assert.equal(metadata.documentVersion, 13);
  assert.deepEqual([...metadata.supportedDocumentVersions], [12, 13]);
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
