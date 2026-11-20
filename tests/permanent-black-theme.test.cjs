const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");

test("MahiCloud opens in the existing dark visual identity", () => {
  assert.match(html, /<html lang="en" data-theme="dark">/);
  assert.match(html, /--bg:#0a0a0c/);
  assert.match(html, /--s1:#101013/);
  assert.match(html, /color-scheme:dark/);
  assert.match(html, /MahiCloud/);
});

test("appearance settings are persisted and reapplied rather than being a decorative toggle", () => {
  assert.match(html, /localStorage\.getItem\(SKEY\)/);
  assert.match(html, /localStorage\.setItem\(SKEY, JSON\.stringify\(persisted\)\)/);
  assert.match(html, /function applySettings\(\)/);
  assert.match(html, /r\.dataset\.theme = th/);
  assert.match(html, /\{ k: "theme", l: "Theme"/);
  assert.match(html, /\["dark", "Dark"\]/);
});

test("responsive layout and reduced-motion preferences are built into the current stylesheet", () => {
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(html, /@media\(max-width:700px\)/);
  assert.match(html, /@media \(max-width:380px\)/);
  assert.match(html, /env\(safe-area-inset-bottom\)/);
  assert.match(html, /overflow-x:hidden|overflow-x: hidden/);
});
