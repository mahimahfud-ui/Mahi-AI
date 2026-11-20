const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");

test("MahiCloud keeps its own dark brand, logo and chat identity", () => {
  assert.match(html, /<title>MahiCloud<\/title>/);
  assert.match(html, /meta name="application-name" content="MahiCloud"/);
  assert.match(html, /Cybernetic%20Half-Face%20Portrait\.png/);
  assert.match(html, /--bg:#0a0a0c/);
  assert.doesNotMatch(html, /Lagoon|Omnix|Claude UI/i);
});

test("the current chat shell and account panel remain present", () => {
  for (const id of ["app", "side", "newChat", "search", "list", "toggle", "welcome", "msgs", "composer", "openAccount", "ovAccount"]) {
    assert.ok(html.includes('id="' + id + '"'), "missing current app section: " + id);
  }
  assert.match(html, /function addMsg\(m, i, typing\)/);
  assert.match(html, /function renderSettings\(\)/);
  assert.match(html, /function renderAccountUI\(\)/);
});

test("the existing page has responsive, accessible layout and motion controls", () => {
  assert.match(html, /@media\(max-width:700px\)/);
  assert.match(html, /@media\s*\(max-width:\s*380px\)/);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /safe-area-inset-bottom/);
  assert.match(html, /aria-label="Toggle sidebar"/);
});

test("the application keeps live backend and safe code preview integration", () => {
  assert.match(html, /\/functions\/v1\/mahi-ai-chat/);
  assert.match(html, /data-run aria-label="Run code in preview"/);
  assert.match(html, /data-copy/);
  assert.match(html, /sandbox="allow-scripts"/);
  assert.match(html, /connect-src.{0,12}none/);
});
