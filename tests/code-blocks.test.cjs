const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const codeBlocks = fs.readFileSync(require.resolve("../public/code-blocks.js"), "utf8");
const css = fs.readFileSync(require.resolve("../public/code-blocks.css"), "utf8");

test("full page loads the current code playground assets after the chat app", () => {
  assert.ok(html.length > 10000, "index.html must remain the complete page");
  assert.doesNotMatch(html, /RESTORE_FROM_LOCAL_index-with-codeblocks\.html/);
  assert.match(html, /href="\.\/code-blocks\.css\?v=20261025"/);
  assert.match(html, /src="\.\/code-blocks\.js\?v=20261025" defer/);
  assert.ok(html.indexOf('src="./app.js" defer') < html.indexOf('src="./code-blocks.js?v=20261025" defer'),
    "code-block script must load after app.js");
});

test("copy/download and isolated browser execution support HTML, CSS, JavaScript, SVG and Python", () => {
  assert.match(codeBlocks, /makeButton\("Copy"/);
  assert.match(codeBlocks, /makeButton\("Download"/);
  assert.match(codeBlocks, /const RUNNABLE = new Set/);
  for (const lang of ["html", "css", "js", "svg", "py", "python"]) {
    assert.ok(codeBlocks.includes('"' + lang + '"'), "missing runnable language " + lang);
  }
  assert.match(codeBlocks, /setAttribute\("sandbox", "allow-scripts"\)/);
  assert.match(codeBlocks, /Content-Security-Policy/);
  assert.match(codeBlocks, /Allow web resources/);
  assert.match(codeBlocks, /loadPyodide/);
  assert.match(codeBlocks, /new MutationObserver/);
  assert.match(codeBlocks, /findProjectFiles/);
  assert.match(codeBlocks, /buildProjectDocument/);
  assert.ok(codeBlocks.includes("Run project"), "missing multi-file project runner");
});

test("playground includes viewport presets, editable source, runtime console, and expand mode", () => {
  for (const token of ["Desktop", "Tablet", "Mobile", "Apply & Run", "Console output", "Expand preview", "Unhandled promise rejection"]) {
    assert.ok(codeBlocks.includes(token), "missing playground feature " + token);
  }
  for (const selector of [".mahi-code-playground", ".mahi-code-browserbar", ".mahi-code-viewport-group", ".mahi-code-console-row", ".mahi-code-editor-input", ".mahi-code-expand-overlay"]) {
    assert.ok(css.includes(selector), "missing styling for " + selector);
  }
  assert.match(css, /html\[data-theme="light"\]/);
  assert.match(css, /max-width:\s*560px/);
  assert.match(css, /prefers-reduced-motion/);
});
