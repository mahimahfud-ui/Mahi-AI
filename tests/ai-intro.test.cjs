const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const css = fs.readFileSync(require.resolve("../public/nexora.css"), "utf8");
const js = fs.readFileSync(require.resolve("../public/nexora-ui.js"), "utf8");

test("NEXORA replaces the previous intro and legacy workspace shell", () => {
  assert.match(html, /class="app-shell nexora-shell"/);
  assert.match(html, /Your ideas deserve/);
  assert.doesNotMatch(html, /id="aiIntro"|\.\/ai-intro\.js|\.\/ai-intro\.css/);
  assert.match(html, /\.\/nexora\.css/);
  assert.match(html, /\.\/nexora-ui\.js/);
});

test("new workspace entrance uses reduced-motion-aware animation", () => {
  assert.match(css, /@keyframes nxMessageIn/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(js, /prefers-reduced-motion/);
  assert.match(js, /window\.gsap/);
  assert.doesNotMatch(js, /generateReply\(|AIProvider\.respond/);
});
