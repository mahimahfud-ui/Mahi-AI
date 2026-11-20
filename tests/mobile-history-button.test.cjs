const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");

test("mobile chat-history navigation is wired to the visible sidebar toggle", () => {
  assert.match(html, /id="toggle" aria-label="Toggle sidebar"/);
  assert.match(html, /aria-controls="side"/);
  assert.match(html, /function toggleSide\(force\)/);
  assert.match(html, /\$\("#toggle"\)\.onclick = \(\) => toggleSide\(\)/);
  assert.match(html, /#scrim/);
});

test("phone layout fits the viewport and respects safe areas", () => {
  assert.match(html, /\[data-device=mobile\] #app\{height:var\(--app-h,100dvh\)/);
  assert.match(html, /\[data-device=mobile\] #top/);
  assert.match(html, /env\(safe-area-inset-top\)/);
  assert.match(html, /env\(safe-area-inset-bottom\)/);
  assert.match(html, /@media\s*\(max-width:\s*380px\)/);
  assert.match(html, /@media\s*\(max-width:\s*700px\)/);
});

test("the sidebar toggle updates the expanded state accessibly", () => {
  assert.match(html, /setAttribute\("aria-expanded", String\(opened\)\)/);
});
