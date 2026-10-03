// Minimal fake of Box 1's Go image relay for sandbox smoke runs.
// /health -> ready JSON; any /api/* POST -> tiny valid PNG bytes.
// Sandbox-only helper — never ships.
const http = require('http');

// 1x1 white PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ engine: 'synchronous', status: 'ready' }));
  }
  if (req.method === 'POST') {
    let body = [];
    req.on('data', c => body.push(c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(PNG);
    });
    return;
  }
  res.writeHead(404); res.end();
});

server.listen(7860, '127.0.0.1', () => console.log('[fake-go] listening on 7860'));
