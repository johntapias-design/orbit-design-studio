import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;

function rebuild() {
  try {
    execSync('node scripts/build-standalone.js', { cwd: rootDir, stdio: 'ignore' });
    console.log(`[${new Date().toLocaleTimeString()}] ⚡ Reconstruido index.html desde fuentes modulares.`);
  } catch (err) {
    console.error('Error durante el build:', err.message);
  }
}

// Perform initial build
rebuild();

const sseClients = new Set();

// Watch public directory for changes
let watchTimeout = null;
fs.watch(path.join(rootDir, 'public'), { recursive: true }, (eventType, filename) => {
  if (filename && !filename.startsWith('.')) {
    clearTimeout(watchTimeout);
    watchTimeout = setTimeout(() => {
      rebuild();
      for (const res of sseClients) {
        res.write('data: reload\n\n');
      }
    }, 100);
  }
});

const server = http.createServer((req, res) => {
  if (req.url === '/__livereload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  let filePath = path.join(rootDir, req.url === '/' ? 'index.html' : req.url);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(rootDir, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  try {
    let content = fs.readFileSync(filePath);
    if (ext === '.html') {
      const liveReloadScript = `
        <script>
          (function() {
            const evtSource = new EventSource('/__livereload');
            evtSource.onmessage = function(e) { if (e.data === 'reload') location.reload(); };
          })();
        </script>
      `;
      content = content.toString('utf8').replace('</body>', `${liveReloadScript}</body>`);
    }
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(content);
  } catch (err) {
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Dev Server listo en http://localhost:${PORT}`);
  console.log(`Watching public/js y public/styles para recarga en tiempo real...\n`);
});
