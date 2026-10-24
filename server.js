// Mahi AI static server for Node 18+ hosting (including Render).
// AI requests go directly to the authenticated Supabase Edge Function.
// Never put AI-provider credentials in this server or in public/ files.
const http = require("http");
const fs = require("fs");
const path = require("path");

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

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method not allowed");
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (_) {
    return send(res, 400, "Bad request");
  }
  // Reject path bytes that can make filesystem APIs throw synchronously or that
  // proxies and Node may interpret differently.
  if (pathname.includes("\0") || pathname.includes("\\")) {
    return send(res, 400, "Bad request");
  }
  if (pathname === "/healthz") {
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      return res.end();
    }
    return send(res, 200, "ok");
  }
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(PUBLIC_DIR, "." + pathname);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, "index.html")) {
    return send(res, 403, "Forbidden");
  }
  try {
    fs.readFile(filePath, (error, file) => {
    if (error) return send(res, 404, "Not found");
    const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      // Files have stable names rather than content hashes, so revalidate code on
      // every navigation and avoid serving stale frontend/backend configuration.
      "Cache-Control": /\.(?:html?|js|css|json)$/i.test(pathname) ? "no-cache" : "public, max-age=3600"
    });
    res.end(req.method === "HEAD" ? undefined : file);
    });
  } catch (error) {
    // Guard against malformed paths that can throw before fs.readFile's callback.
    return send(res, 400, "Bad request");
  }
});

server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 100;

server.listen(PORT, "0.0.0.0", () => console.log("Mahi AI web server listening on port " + PORT));