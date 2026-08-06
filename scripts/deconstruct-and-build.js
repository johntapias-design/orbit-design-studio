import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const indexPath = path.join(rootDir, 'index.html');
const publicDir = path.join(rootDir, 'public');

const indexHtml = fs.readFileSync(indexPath, 'utf8');

// Extract CSS
const styleMatch = indexHtml.match(/<style>([\s\S]*?)<\/style>/);
if (styleMatch) {
  const cssContent = styleMatch[1].trim();
  fs.mkdirSync(path.join(publicDir, 'styles'), { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'styles', 'app.css'), cssContent, 'utf8');
  console.log('Extracted public/styles/app.css');
}

// Extract JS Modules
const scriptMatch = indexHtml.match(/<script>([\s\S]*?)<\/script>/g);
if (scriptMatch && scriptMatch.length >= 2) {
  // The main script tag is the second <script> tag (lines 6009..13340)
  const jsContent = scriptMatch[1].replace(/<\/?script>/g, '').trim();
  
  // Split modules by pattern /* public/js/... */
  const moduleRegex = /\/\*\s*(public\/js\/[^\s*]+)\s*\*\//g;
  let matches = [...jsContent.matchAll(moduleRegex)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const relPath = match[1];
    const startIndex = match.index + match[0].length;
    const endIndex = (i + 1 < matches.length) ? matches[i + 1].index : jsContent.length;
    const code = jsContent.slice(startIndex, endIndex).trim();

    const fullPath = path.join(rootDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, code, 'utf8');
    console.log(`Extracted ${relPath} (${code.length} bytes)`);
  }
}

console.log('Deconstruction complete!');
