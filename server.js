// Mahi AI server: zero dependencies, Node 18+. Keeps your API key on the server.
const http = require('http'), fs = require('fs'), path = require('path');
try { fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach(l => { const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(l); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }); } catch (e) {}
const KEY = process.env.ANTHROPIC_API_KEY, MODEL = process.env.MODEL || 'claude-sonnet-5-5';
const PORT = +process.env.PORT || 3000, SEARCH = process.env.WEB_SEARCH === '1', LIMIT = +process.env.RATE_LIMIT_PER_MIN || 20;
const PUB = path.join(__dirname, 'public');
const SYSTEM = 'You are Mahi AI, a helpful, accurate assistant. Always reply in the language the user writes in. Use Markdown. Be concise unless asked for depth. If an attachment cannot be read, say so plainly instead of guessing.';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const hits = new Map();
const limited = ip => { const n = Date.now(), a = (hits.get(ip) || []).filter(t => n - t < 6e4); a.push(n); hits.set(ip, a); return a.length > LIMIT; };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

async function chat(req, res) {
  if (!KEY) return send(res, 500, { error: { message: 'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.' } });
  if (limited(req.socket.remoteAddress)) return send(res, 429, { error: { message: 'Too many requests. Wait a minute and try again.' } });
  let body = '', size = 0;
  for await (const c of req) { size += c.length; if (size > 40e6) return send(res, 413, { error: { message: 'Request too large (40 MB max).' } }); body += c; }
  let messages; try { messages = JSON.parse(body).messages; if (!Array.isArray(messages) || !messages.length) throw 0; } catch (e) { return send(res, 400, { error: { message: 'Bad request.' } }); }
  const ac = new AbortController(); res.on('close', () => ac.abort());
  const payload = { model: MODEL, max_tokens: 4096, stream: true, system: SYSTEM, messages };
  if (SEARCH) payload.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
  try {
    const up = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ac.signal,
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (!up.ok) { res.writeHead(up.status, { 'Content-Type': 'application/json' }); return res.end(await up.text()); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
    for await (const chunk of up.body) res.write(chunk);
    res.end();
  } catch (e) { if (!res.headersSent) send(res, 502, { error: { message: 'Could not reach the AI service.' } }); else res.end(); }
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') return chat(req, res);
  if (req.method !== 'GET') return send(res, 405, { error: { message: 'Method not allowed' } });
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
  const f = path.join(PUB, path.normalize(u));
  if (!f.startsWith(PUB)) return send(res, 403, { error: { message: 'Forbidden' } });
  fs.readFile(f, (e, d) => { if (e) return send(res, 404, { error: { message: 'Not found' } }); res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(d); });
}).listen(PORT, () => console.log('Mahi AI running at http://localhost:' + PORT + (KEY ? '' : '  (no API key set yet)')));
