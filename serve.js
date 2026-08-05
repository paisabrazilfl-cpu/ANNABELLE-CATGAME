// Tiny static server for index.html — required because Render standing rule
// says all services are web services (not static sites). Serves the whole
// project root with /index.html as the default and a no-cache header for
// the HTML so updates go live instantly.
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 10000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.wav':  'audio/wav',
  '.mp3':  'audio/mpeg',
};

// Lightweight security headers — kid game, no real attack surface, but the
// nosniff header prevents MIME-confusion attacks if a malicious file ever
// ends up in the repo.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options':        'SAMEORIGIN',
  'Referrer-Policy':        'no-referrer',
};

http.createServer((req, res) => {
  // Don't crash on broken connections.
  req.on('error', () => { try { res.destroy(); } catch (_) {} });
  res.on('error', () => { try { res.destroy(); } catch (_) {} });

  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  // Decode percent-encoding so /%2e%2e/foo doesn't sneak through
  let decoded;
  try { decoded = decodeURIComponent(url); } catch (_) { decoded = url; }
  const filePath = path.normalize(path.join(ROOT, decoded));
  // Robust path-traversal guard (relative() handles absolute paths and ..)
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403, SECURITY_HEADERS);
    return res.end('forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: always serve index.html for missing files (so refresh on /play works)
      return fs.readFile(path.join(ROOT, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404, SECURITY_HEADERS); return res.end('not found'); }
        res.writeHead(200, Object.assign({ 'Content-Type': MIME['.html'], 'Content-Length': idx.length, 'Cache-Control': 'no-cache' }, SECURITY_HEADERS));
        res.end(idx);
      });
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, Object.assign({
      'Content-Type':   MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control':  ext === '.html' ? 'no-cache' : 'public, max-age=300',
    }, SECURITY_HEADERS));
    res.end(data);
  });
}).listen(PORT, () => console.log(`Annabelle's Cat Runner serving on :${PORT}`));
