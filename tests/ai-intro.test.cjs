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
  assert.match(html, /href="\.\/ai-intro\.css\?v=20261027tapmaruf1"/);
  assert.match(html, /src="\.\/ai-intro\.js\?v=20261027tapmaruf1" defer/);
  const officialLogo = "https://raw.githubusercontent.com/mahimahfud-ui/Mahi-AI/main/Cybernetic%20Half-Face%20Portrait.png";
  assert.ok(html.includes(`<img class="ai-intro-logo" src="${officialLogo}" alt="MahiCloud official logo">`));
  assert.ok(html.includes(`<img class="brand-logo" src="${officialLogo}"`));
  assert.match(css, /\.ai-intro-logo-shell\s*\{[^}]*position:\s*absolute;[^}]*left:\s*50%;[^}]*top:\s*50%;[^}]*transform:\s*translate\(-50%,\s*-50%\)/s);
  assert.match(css, /@keyframes ai-intro-logo-breathe\s*\{[^}]*translate\(-50%,\s*-50%\) scale\(1\)/s);
  assert.match(css, /\.ai-intro-logo-shell\s*\{[^}]*border-radius:\s*50%/s);
  assert.match(css, /\.ai-intro-logo\s*\{[^}]*border-radius:\s*50%;[^}]*object-fit:\s*cover/s);
  assert.match(html, /<h1>MahiCloud <strong>AI<\/strong><\/h1>/);
});

test("intro orbit uses chatbot-related chat, typing, composer and reply animations", () => {
  const introStart = html.indexOf('<div class="ai-intro" id="aiIntro"');
  const appStart = html.indexOf('<div class="app-shell">');
  const introMarkup = html.slice(introStart, appStart);
  assert.ok(introStart >= 0 && appStart > introStart, "intro markup should be isolated before the app shell");
  assert.match(introMarkup, /ai-intro-token--chat/);
  assert.match(introMarkup, /ai-intro-token--typing/);
  assert.match(introMarkup, /ai-intro-token--prompt/);
  assert.match(introMarkup, /ai-intro-token--reply/);
  assert.doesNotMatch(introMarkup, /files|photos|photo|image gallery/i);
});

test("intro automatically exits, skips on any screen tap, and respects reduced-motion preference", () => {
  assert.match(js, /setTimeout\(finishIntro, reduceMotion \? 420 : 2820\)/);
  assert.doesNotMatch(html, /ai-intro-skip|data-ai-intro-skip/);
  assert.doesNotMatch(css, /ai-intro-skip/);
  assert.doesNotMatch(js, /skipButton|data-ai-intro-skip/);
  assert.match(js, /intro\.addEventListener\("click", finishIntro\)/);
  assert.match(js, /event\.key === "Escape"/);
  assert.match(js, /ai-intro-active/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /safe-area-inset-bottom/);
});
