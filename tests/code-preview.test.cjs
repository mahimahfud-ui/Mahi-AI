const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");

test("every fenced code block has Copy and Run actions", () => {
  assert.match(html, /data-run aria-label="Run code in preview"/);
  assert.match(html, /data-copy>Copy/);
  assert.match(html, /function openCodePreview\(box\)/);
  assert.match(html, /function previewDocument\(language, source\)/);
});

test("HTML, CSS and JavaScript receive native live preview handling", () => {
  assert.match(html, /\["html","htm","xhtml"\]/);
  assert.match(html, /if \(lang === "css"\)/);
  assert.match(html, /\["js","javascript","mjs"\]/);
  assert.match(html, /Native live preview currently supports HTML, CSS and JavaScript/);
});

test("preview runs in an isolated iframe with restrictive content policy", () => {
  assert.match(html, /sandbox="allow-scripts"/);
  assert.doesNotMatch(html, /sandbox="[^"]*allow-same-origin/);
  assert.match(html, /default-src \\'none\\'/);
  assert.match(html, /connect-src \\'none\\'/);
  assert.match(html, /referrerpolicy="no-referrer"/);
});

test("preview provides responsive split view and mobile tabs", () => {
  assert.match(html, /grid-template-columns:minmax\(260px, \.85fr\) minmax\(0,1\.15fr\)/);
  assert.match(html, /data-pv-tab="code"/);
  assert.match(html, /data-pv-tab="preview"/);
  assert.match(html, /@media\(max-width:760px\)/);
  assert.match(html, /function closeCodePreview\(\)/);
});
