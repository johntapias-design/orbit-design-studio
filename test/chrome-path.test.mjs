import test from 'node:test';
import assert from 'node:assert/strict';
import { chromePathCandidates, resolveChromePath } from '../scripts/lib/chrome-path.js';

test('prioriza CHROME_PATH y elimina duplicados', () => {
  const candidates = chromePathCandidates({
    platform: 'linux',
    env: { CHROME_PATH: '/custom/chrome', CHROME_BIN: '/custom/chrome' },
    resolveCommand: () => '',
  });
  assert.equal(candidates[0], '/custom/chrome');
  assert.equal(candidates.filter(path => path === '/custom/chrome').length, 1);
});

test('resuelve una ruta conocida disponible', () => {
  const resolved = resolveChromePath({
    platform: 'linux',
    env: {},
    resolveCommand: command => command === 'chromium' ? '/opt/chromium' : '',
    fileExists: path => path === '/opt/chromium',
  });
  assert.equal(resolved, '/opt/chromium');
});

test('explica cómo configurar Chrome cuando no está disponible', () => {
  assert.throws(() => resolveChromePath({
    platform: 'linux',
    env: {},
    resolveCommand: () => '',
    fileExists: () => false,
  }), /CHROME_PATH/);
});
