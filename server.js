// MahiCloud static server for Node 18+ hosting (including Render).
// AI requests go directly to the authenticated Supabase Edge Function.
// Never put AI-provider credentials in this server or in public/ files.
//
// Speed upgrades vs. the previous version:
//   - Brotli/gzip compression, computed once per file and kept in memory (~70-80% smaller JS/CSS/HTML)
//   - ETag + 304 responses: unchanged files cost almost nothing on repeat visits
//   - keep-alive tuned for Render's proxy (the old 5s value caused dropped connections / retries)
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.resolve(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8"
};
const COMPRESSIBLE = /\.(?:html?|js|css|json|svg)$/i;
const REVALIDATE = /\.(?:html?|js|css|json)$/i;
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()"
};

function send(res, status, body, type) {
  res.writeHead(status, { ...SECURITY, "Content-Type": type || "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

// filePath -> { mtimeMs, size, etag, raw, br, gzip }
const cache = new Map();
const MAX_CACHED_BYTES = 2 * 1024 * 1024;

function loadEntry(filePath, stat, done) {
  const hit = cache.get(filePath);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return done(null, hit);
  fs.readFile(filePath, (error, raw) => {
    if (error) return done(error);
    const entry = { mtimeMs: stat.mtimeMs, size: stat.size, raw, etag: '"' + crypto.createHash("sha1").update(raw).digest("hex").slice(0, 20) + '"' };
    if (COMPRESSIBLE.test(filePath) && raw.length > 512) {
      try {
        entry.br = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
        entry.gzip = zlib.gzipSync(raw, { level: 6 });
      } catch (_) { /* fall back to uncompressed */ }
    }
    if (raw.length <= MAX_CACHED_BYTES) cache.set(filePath, entry);
    done(null, entry);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (_) {
    return send(res, 400, "Bad request");
  }
  // Reject path bytes that can make filesystem APIs throw synchronously or that
  // proxies and Node may interpret differently.
  if (pathname.includes("\0") || pathname.includes("\\")) return send(res, 400, "Bad request");
  if (pathname === "/healthz") {
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      return res.end();
    }
    return send(res, 200, "ok");
  }
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(PUBLIC_DIR, "." + pathname);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, "index.html")) return send(res, 403, "Forbidden");

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) return send(res, 404, "Not found");
    loadEntry(filePath, stat, (error, entry) => {
      if (error) return send(res, 404, "Not found");
      const ext = path.extname(filePath).toLowerCase();
      const headers = {
        ...SECURITY,
        "Content-Type": MIME[ext] || "application/octet-stream",
        "ETag": entry.etag,
        "Vary": "Accept-Encoding",
        // Code is revalidated (cheap 304 thanks to the ETag); images/fonts are cached for a day.
        "Cache-Control": REVALIDATE.test(pathname) ? "no-cache" : "public, max-age=86400"
      };
      if (req.headers["if-none-match"] === entry.etag) {
        res.writeHead(304, headers);
        return res.end();
      }
      const accept = String(req.headers["accept-encoding"] || "");
      let body = entry.raw;
      if (entry.br && /\bbr\b/.test(accept)) { body = entry.br; headers["Content-Encoding"] = "br"; }
      else if (entry.gzip && /\bgzip\b/.test(accept)) { body = entry.gzip; headers["Content-Encoding"] = "gzip"; }
      headers["Content-Length"] = body.length;
      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? undefined : body);
    });
  });
});

server.requestTimeout = 15000;
// Must be longer than the proxy's idle timeout, otherwise Render's proxy reuses sockets Node already closed.
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.maxHeadersCount = 100;

server.listen(PORT, "0.0.0.0", () => console.log("MahiCloud web server listening on port " + PORT));
