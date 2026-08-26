import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PLATFORM_CANDIDATES = Object.freeze({
  darwin: Object.freeze([
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]),
  linux: Object.freeze([
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]),
  win32: Object.freeze([
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]),
});

const COMMAND_CANDIDATES = Object.freeze({
  darwin: Object.freeze(['google-chrome', 'chromium']),
  linux: Object.freeze(['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']),
  win32: Object.freeze(['chrome', 'msedge']),
});

function commandPath(command) {
  try {
    const resolver = process.platform === 'win32' ? 'where' : 'which';
    return execFileSync(resolver, [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/)
      .map(value => value.trim())
      .find(Boolean) || '';
  } catch {
    return '';
  }
}

export function chromePathCandidates({ platform = process.platform, env = process.env, resolveCommand = commandPath } = {}) {
  const configured = [env.CHROME_PATH, env.CHROME_BIN].filter(Boolean);
  const known = PLATFORM_CANDIDATES[platform] || [];
  const discovered = (COMMAND_CANDIDATES[platform] || [])
    .map(resolveCommand)
    .filter(Boolean);
  return [...new Set([...configured, ...known, ...discovered])];
}

export function resolveChromePath(options = {}) {
  const fileExists = options.fileExists || existsSync;
  const candidates = chromePathCandidates(options);
  const match = candidates.find(candidate => fileExists(candidate));
  if (match) return match;
  throw new Error(
    `No se encontró Chrome o Chromium. Define CHROME_PATH con un ejecutable válido. Rutas revisadas: ${candidates.join(', ') || 'ninguna'}`,
  );
}
