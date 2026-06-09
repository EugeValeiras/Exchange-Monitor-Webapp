// Static server liviano para la SPA Angular (sin dependencias).
// Sirve dist/exchange-monitor-webapp/browser con fallback a index.html.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4200;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = process.env.WEB_ROOT || path.join(__dirname, 'dist/exchange-monitor-webapp/browser');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const INDEX = path.join(ROOT, 'index.html');

function send(res, status, filePath, headers = {}) {
  const stream = fs.createReadStream(filePath);
  stream.on('open', () => {
    res.writeHead(status, headers);
    stream.pipe(res);
  });
  stream.on('error', () => {
    res.writeHead(500);
    res.end('Internal error');
  });
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let rel = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(ROOT, rel);
    // Evitar path traversal fuera de ROOT.
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    fs.stat(filePath, (err, stat) => {
      if (!err && stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      fs.stat(filePath, (err2, stat2) => {
        if (err2 || !stat2.isFile()) {
          // Fallback SPA: rutas de Angular -> index.html
          return send(res, 200, INDEX, { 'Content-Type': MIME['.html'] });
        }
        const ext = path.extname(filePath).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        const cache = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
        send(res, 200, filePath, { 'Content-Type': type, 'Cache-Control': cache });
      });
    });
  } catch (e) {
    res.writeHead(500);
    res.end('Internal error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`exchange-monitor-webapp sirviendo ${ROOT} en http://${HOST}:${PORT}`);
});
