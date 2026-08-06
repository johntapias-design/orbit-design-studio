import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const indexPath = path.join(rootDir, 'index.html');

console.log('Building standalone index.html from modular source files...');

const cssPath = path.join(publicDir, 'styles', 'app.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const jsModules = [
  'types/contracts.js',
  'state.js',
  'dom.js',
  'viewport-engine.js',
  'controls.js',
  'accessibility/announcer.js',
  'accessibility/focus-manager.js',
  'accessibility/keyboard-shortcuts.js',
  'accessibility/index.js',
  'persistence/preferences-storage.js',
  'focus-view/focus-view.js',
  'measurement/measurement-overlay.js',
  'performance/runtime-performance.js',
  'projects/workspace-storage.js',
  'inspector/inspector-tabs.js',
  'theme/theme-system.js',
  'navigation/canvas-navigation.js'
];

let compiledJs = '/* Orbit bundled standalone — generated, do not edit directly. */\n\n';

for (const mod of jsModules) {
  const modPath = path.join(publicDir, 'js', mod);
  if (fs.existsSync(modPath)) {
    const code = fs.readFileSync(modPath, 'utf8');
    compiledJs += `/* public/js/${mod} */\n${code}\n\n`;
  } else {
    console.warn(`Warning: module public/js/${mod} not found.`);
  }
}

// Read index.html shell (HTML template)
let currentHtml = fs.readFileSync(indexPath, 'utf8');

// Replace CSS
currentHtml = currentHtml.replace(/<style>[\s\S]*?<\/style>/, `<style>\n${cssContent}\n</style>`);

// Replace main JS block
currentHtml = currentHtml.replace(/<script>\s*\/\* Orbit bundled standalone[\s\S]*?<\/script>/, `<script>\n${compiledJs.trim()}\n</script>`);

fs.writeFileSync(indexPath, currentHtml, 'utf8');
console.log('Successfully updated index.html from modular sources!');
