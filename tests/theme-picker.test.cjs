const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");

test("the current Settings panel exposes working appearance controls", () => {
  assert.match(html, /id="openSet"/);
  assert.match(html, /function renderSettings\(\)/);
  assert.match(html, /id: "appearance", t: "Appearance"/);
  assert.match(html, /\{ k: "theme", l: "Theme", c: "sel"/);
  assert.match(html, /\{ k: "accent", l: "Accent color", c: "col"/);
});

test("theme changes update the document and save preferences to local storage", () => {
  assert.match(html, /const SKEY =/);
  assert.match(html, /localStorage\.setItem\(SKEY, JSON\.stringify\(persisted\)\)/);
  assert.match(html, /function applySettings\(\)/);
  assert.match(html, /r\.dataset\.theme = th/);
  assert.match(html, /st\.setProperty\("--ac", c\)/);
});

test("theme, typography and layout controls offer bounded settings", () => {
  for (const option of ['["dark", "Dark"]', '["light", "Light"]', '["system", "System"]']) {
    assert.ok(html.includes(option), "missing theme option " + option);
  }
  assert.match(html, /fontSize: 16/);
  assert.match(html, /msgWidth: 760/);
  assert.match(html, /radius: 14/);
});
