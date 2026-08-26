import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JS_MODULES } from './build-manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const indexPath = path.join(rootDir, 'index.html');
const packagePath = path.join(rootDir, 'package.json');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const versionParts = String(packageJson.version).match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
if (!versionParts) throw new Error(`Invalid package version: ${packageJson.version}`);
const versionLabel = `v${versionParts[1]}.${versionParts[2]}`;
const metadataSource = fs.readFileSync(path.join(publicDir, 'js', 'core', 'app-metadata.js'), 'utf8');
const releaseName = metadataSource.match(/releaseName:\s*'([^']+)'/)?.[1] || 'Visual Editor';

console.log(`Building Orbit Design Studio ${packageJson.version} from modular source files...`);

const cssPath = path.join(publicDir, 'styles', 'app.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

let compiledJs = `/* Orbit ${packageJson.version} bundled standalone — generated, do not edit directly. */\n\n`;

for (const mod of JS_MODULES) {
  const modPath = path.join(publicDir, 'js', mod);
  if (!fs.existsSync(modPath)) throw new Error(`Required module public/js/${mod} was not found.`);
  const code = fs.readFileSync(modPath, 'utf8');
  compiledJs += `/* public/js/${mod} */\n${code}\n\n`;
}

// Read index.html shell (HTML template)
const originalHtml = fs.readFileSync(indexPath, 'utf8');
let currentHtml = originalHtml;

// Synchronize product metadata in the standalone shell.
currentHtml = currentHtml
  .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="Orbit Design Studio ${versionLabel} — ${releaseName}, editor visual profesional para Astro con arquitectura modular, QA automatizada y exportación standalone." />`)
  .replace(/<title>Orbit Design Studio[^<]*<\/title>/, `<title>Orbit Design Studio — ${versionLabel}</title>`)
  .replace(/<span class="version-badge">[^<]*<\/span>/, `<span class="version-badge">${versionLabel}</span>`);

// Replace CSS
currentHtml = currentHtml.replace(/<style>[\s\S]*?<\/style>/, () => `<style>\n${cssContent}\n</style>`);

// Replace main JS block safely between marker comments
const scriptMarkerRegex = /<!-- Orbit bundled standalone script -->[\s\S]*?<!-- \/Orbit bundled standalone script -->/;
if (scriptMarkerRegex.test(currentHtml)) {
  currentHtml = currentHtml.replace(
    scriptMarkerRegex,
    () => `<!-- Orbit bundled standalone script -->\n    <script>\n${compiledJs.trim()}\n</script>\n    <!-- /Orbit bundled standalone script -->`
  );
} else {
  currentHtml = currentHtml.replace(/<script>\s*\/\* Orbit bundled standalone[\s\S]*?<\/script>/, () => `<script>\n${compiledJs.trim()}\n</script>`);
}

if (currentHtml !== originalHtml) {
  fs.writeFileSync(indexPath, currentHtml, 'utf8');
  console.log('Updated index.html from modular sources.');
} else {
  console.log('index.html is already synchronized.');
}
