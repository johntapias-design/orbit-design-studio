import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadScript(relativePath, expose) {
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(`${source}\nglobalThis.__orbitTestValue = ${expose};`, context);
  return context.__orbitTestValue;
}

test('metadata de v0.25 define Orbit JSON v13 como formato actual', () => {
  const metadata = loadScript('public/js/core/app-metadata.js', 'ORBIT_APP');
  assert.equal(metadata.version, '0.25.0-alpha');
  assert.equal(metadata.versionLabel, 'v0.25');
  assert.equal(metadata.documentVersion, 13);
  assert.deepEqual([...metadata.supportedDocumentVersions], [12, 13]);
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
