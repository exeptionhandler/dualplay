import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '10000');
const DIST = path.join(__dirname, 'dist');

// ── MIME types ──
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
};

// ── HTTP Server ──
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // Health check endpoint for UptimeRobot
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', service: 'DuoPlay', ts: new Date().toISOString() }));
  }

  // Real token endpoint (Discord Activity OAuth2 exchange)
  if (url.pathname === '/api/token' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { code } = JSON.parse(body);
        const response = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID || '',
            client_secret: process.env.DISCORD_CLIENT_SECRET || '',
            grant_type: 'authorization_code',
            code: code,
          }),
        });
        const data = await response.json();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (err) {
        console.error('[DuoPlay] Token exchange failed:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Token exchange failed' }));
      }
    });
    return;
  }

  // Static file serving from dist/
  let filePath = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  // If file doesn't exist, serve index.html (SPA fallback)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[DuoPlay Server] Listening on http://0.0.0.0:${PORT}`);
});

// ── Start Robo.js bot in background ──
const robo = spawn('npx', ['robo', 'start'], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname,
});

robo.on('error', (err) => {
  console.error('[DuoPlay] Failed to start Robo:', err.message);
});

// If the bot crashes, log it but keep the server running
robo.on('exit', (code) => {
  if (code !== 0) {
    console.error(`[DuoPlay] Robo exited with code ${code}`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[DuoPlay] Shutting down...');
  robo.kill('SIGTERM');
  server.close();
  process.exit(0);
});
