const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

let child;
let baseUrl;

test("static server responds safely and sets cache/security headers", async (t) => {
  const port = 20000 + Math.floor(Math.random() * 30000);
  baseUrl = "http://127.0.0.1:" + port;
  child = spawn(process.execPath, [path.resolve(__dirname, "../server.js")], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let childOutput = "";
  child.stdout.on("data", (chunk) => { childOutput += chunk.toString(); });
  child.stderr.on("data", (chunk) => { childOutput += chunk.toString(); });
  t.after(() => {
    if (child && child.exitCode === null) child.kill("SIGTERM");
  });

  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(baseUrl + "/healthz");
      if (response.status === 200) { ready = true; break; }
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, "server did not become ready: " + childOutput);

  const health = await fetch(baseUrl + "/healthz");
  assert.equal(health.status, 200);
  assert.equal(await health.text(), "ok");
  assert.equal(health.headers.get("cache-control"), "no-store");

  const headHealth = await fetch(baseUrl + "/healthz", { method: "HEAD" });
  assert.equal(headHealth.status, 200);
  assert.equal(await headHealth.text(), "");

  const home = await fetch(baseUrl + "/");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type") || "", /text\/html/i);
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  assert.equal(home.headers.get("x-frame-options"), "DENY");
  assert.equal(home.headers.get("cache-control"), "no-cache");

  const js = await fetch(baseUrl + "/app.js");
  assert.equal(js.status, 200);
  assert.equal(js.headers.get("cache-control"), "no-cache");

  const malformed = await fetch(baseUrl + "/%E0%A4%A");
  assert.equal(malformed.status, 400);

  const traversal = await fetch(baseUrl + "/..%2Fserver.js");
  assert.equal(traversal.status, 403);

  const unsupported = await fetch(baseUrl + "/healthz", { method: "POST" });
  assert.equal(unsupported.status, 405);
});
