const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const appJs = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const start = appJs.indexOf("function buildLivePreviewDocument(");
const end = appJs.indexOf("\n  function extractLivePreviewDocument(", start);
assert.ok(start >= 0 && end > start, "live preview builder must exist");

const builderSource = appJs.slice(start, end);
const buildLivePreviewDocument = vm.runInNewContext(
  "(" + builderSource + ")",
  Object.create(null)
);

test("adds a valid head when the generated document has none", () => {
  const html = "<html><body><main>Preview</main></body></html>";
  const output = buildLivePreviewDocument(html, [], []);
  assert.match(output, /<head><meta charset="utf-8"><meta name="viewport"/i);
  assert.match(output, /<body><main>Preview<\/main><\/body>/i);
  assert.doesNotMatch(output, /function addMessage\(/);
});

test("adds metadata to an existing head without corrupting its markup", () => {
  const html = "<!doctype html><html><head class=\"preview\"></head><body>OK</body></html>";
  const output = buildLivePreviewDocument(html, [], []);
  assert.match(output, /<head class="preview">[^<]*(?:<meta[^>]+>){2}/i);
  assert.match(output, /<meta charset="utf-8"/i);
  assert.match(output, /<meta name="viewport"/i);
  assert.match(output, /<\/head><body>OK<\/body>/i);
  assert.doesNotMatch(output, /function addMessage\(/);
});

test("injects CSS in the document head and JavaScript before body close", () => {
  const html = "<!doctype html><html><head></head><body><h1>Preview</h1></body></html>";
  const output = buildLivePreviewDocument(html, ["h1 { color: red; }"], ["window.previewReady = true;"]);
  assert.match(output, /<head>[\s\S]*<style>[\s\S]*h1 \{ color: red; \}[\s\S]*<\/style><\/head>/i);
  assert.match(output, /<script>[\s\S]*window\.previewReady = true;[\s\S]*<\/script><\/body>/i);
});

test("wraps an HTML fragment into a complete responsive document", () => {
  const output = buildLivePreviewDocument("<p>fragment</p>", [], []);
  assert.match(output, /^<!doctype html><html><head>/i);
  assert.match(output, /<body><p>fragment<\/p><\/body><\/html>$/i);
});
