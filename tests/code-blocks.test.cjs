const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const codeBlocks = fs.readFileSync(require.resolve("../public/code-blocks.js"), "utf8");
const css = fs.readFileSync(require.resolve("../public/code-blocks.css"), "utf8");

test("full MahiCloud document loads code-block assets after the chat app", () => {
  assert.ok(html.length > 10000, "index.html should be the complete page, not a placeholder");
  assert.doesNotMatch(html, /RESTORE_FROM_LOCAL_index-with-codeblocks\.html/);
  assert.match(html, /href="\.\/code-blocks\.css\?v=20261024"/);
  assert.match(html, /src="\.\/code-blocks\.js\?v=20261024c" defer/);
  assert.ok(html.indexOf('src="./app.js" defer') < html.indexOf('src="./code-blocks.js?v=20261024c" defer'),
    "code-block script must load after app.js");
});

test("code blocks provide copy, download, and safe HTML/CSS/JavaScript previews", () => {
  assert.match(codeBlocks, /mkBtn\("Copy"/);
  assert.match(codeBlocks, /mkBtn\("Download"/);
  assert.match(codeBlocks, /mkBtn\("Run"/);
  for (const ext of ["html", "css", "js", "py", "bat"]) {
    assert.match(codeBlocks, new RegExp("\\b" + ext + "\\s*:"), "missing file extension " + ext);
  }
  assert.match(codeBlocks, /iframe\.sandbox = "allow-scripts"/);
  assert.match(codeBlocks, /new MutationObserver/);
});

test("code toolbar is styled for dark/light themes and narrow mobile screens", () => {
  for (const selector of [".mahi-code-block", ".mahi-code-toolbar", ".mahi-code-btn", ".mahi-code-preview iframe"]) {
    assert.ok(css.includes(selector), "missing styling for " + selector);
  }
  assert.match(css, /html\[data-theme="light"\]/);
  assert.match(css, /max-width:\s*520px/);
  assert.match(css, /prefers-reduced-motion/);
});
