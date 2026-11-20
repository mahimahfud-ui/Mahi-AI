const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");

test("the current production page contains its inline code block renderer", () => {
  assert.ok(html.length > 100000, "index.html must remain the complete MahiCloud application");
  assert.match(html, /function md\(src\)/);
  assert.match(html, /data-code-lang=/);
  assert.match(html, /data-run aria-label="Run code in preview"/);
  assert.match(html, /data-copy>Copy/);
  assert.doesNotMatch(html, /RESTORE_FROM_LOCAL_index-with-codeblocks\.html/);
});

test("the current page delegates Copy and Run and opens the in-app browser preview", () => {
  assert.match(html, /MAIN\.addEventListener\("click", e => \{/);
  assert.match(html, /closest\("\[data-run\]"\)/);
  assert.match(html, /closest\("\[data-copy\]"\)/);
  assert.match(html, /function openCodePreview\(box\)/);
  assert.match(html, /function previewDocument\(language, source\)/);
});

test("unsupported runtimes are stated honestly rather than pretending Python or SVG is executed", () => {
  assert.match(html, /Native live preview currently supports HTML, CSS and JavaScript/);
  assert.match(html, /Preview not supported/);
  assert.match(html, /needs its own runtime or build tool/);
});
