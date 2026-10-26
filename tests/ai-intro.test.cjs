const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (path) => fs.readFileSync(require.resolve(path), "utf8");
const html = read("../public/index.html");
const css = read("../public/ai-intro.css");
const js = read("../public/ai-intro.js");

test("MahiCloud AI intro loads before the chat shell and uses the official AI logo", () => {
  const introStart = html.indexOf('class="ai-intro" id="aiIntro"');
  const appStart = html.indexOf('class="app-shell"');
  assert.ok(introStart >= 0, "intro overlay must exist");
  assert.ok(appStart > introStart, "intro overlay should precede the chat shell");
  assert.match(html, /href="\.\/ai-intro\.css\?v=20261027"/);
  assert.match(html, /src="\.\/ai-intro\.js\?v=20261027" defer/);
  const officialLogo = "https://raw.githubusercontent.com/mahimahfud-ui/Mahi-AI/main/Cybernetic%20Half-Face%20Portrait.png";
  assert.match(html, new RegExp('<img class="ai-intro-logo" src="' + officialLogo.replace(/[.*+?^${}()|[\]\\]/g, "\\assert.match(html, /class="ai-intro-logo" src="\.\/mahi-ai-logo\.svg"/);") + '" alt="MahiCloud official logo">'));
  assert.match(html, new RegExp('class="brand-logo" src="' + officialLogo.replace(/[.*+?^${}()|[\]\\]/g, "\\assert.match(html, /class="ai-intro-logo" src="\.\/mahi-ai-logo\.svg"/);") + '"'));
  assert.match(css, /\.ai-intro-logo-shell\s*\{[^}]*position:\s*absolute;[^}]*left:\s*50%;[^}]*top:\s*50%;[^}]*transform:\s*translate\(-50%,\s*-50%\)/s);
  assert.match(css, /@keyframes ai-intro-logo-breathe\s*\{[^}]*translate\(-50%,\s*-50%\) scale\(1\)/s);
  assert.match(css, /\.ai-intro-logo\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(html, /<h1>MahiCloud <strong>AI<\/strong><\/h1>/);
});

test("intro orbit contains AI-themed elements only, not file or photo icons", () => {
  const markup = html.match(/<div class="ai-intro" id="aiIntro"[\s\S]*?<div class="app-shell">/);
  assert.ok(markup, "intro markup should be isolated before the app shell");
  assert.match(markup[0], /ai-intro-token--ai/);
  assert.match(markup[0], /ai-intro-token--code/);
  assert.match(markup[0], /ai-intro-token--nodes/);
  assert.match(markup[0], /ai-intro-token--signal/);
  assert.doesNotMatch(markup[0], /files|photos|photo|image gallery/i);
});

test("intro automatically exits, can be skipped, and respects reduced-motion preference", () => {
  assert.match(js, /setTimeout\(finishIntro, reduceMotion \? 420 : 2820\)/);
  assert.match(js, /data-ai-intro-skip/);
  assert.match(js, /intro\.addEventListener\("click", finishIntro\)/);
  assert.match(js, /event\.key === "Escape"/);
  assert.match(js, /ai-intro-active/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /safe-area-inset-bottom/);
});
