const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const css = fs.readFileSync(require.resolve("../public/nexora.css"), "utf8");
const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");

test("mobile history drawer retains the visible hamburger and close controls", () => {
  assert.match(html, /id="openSidebar"[^>]*aria-label="Toggle sidebar"/);
  assert.match(html, /id="closeSidebar"/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /\.nexora-shell \.mobile-menu\s*\{\s*display:\s*grid/);
  assert.match(css, /\.nexora-shell \.sidebar\.open\s*\{\s*transform:\s*translateX\(0\)/);
  assert.match(app, /function toggleSidebar\(\)/);
  assert.match(app, /openMobileSidebar\(\)/);
});
