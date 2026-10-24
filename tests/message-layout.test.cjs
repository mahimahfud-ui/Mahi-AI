const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (path) => fs.readFileSync(require.resolve(path), "utf8");
const html = read("../public/index.html");
const app = read("../public/app.js");
const styles = read("../public/styles.css");
const theme = read("../public/theme.css");
const overrides = read("../public/ui-overrides.css");

test("user and AI message wrappers render as plain text, not cards or bubbles", () => {
  const wrapperRule = overrides.match(
    /:root:root body \.messages \.message,\s*:root:root body \.messages \.message \.message-body,\s*:root:root body \.messages \.message \.message-content\s*\{([^}]*)\}/s
  );
  assert.ok(wrapperRule, "transparent message wrapper rule should exist");
  assert.match(wrapperRule[1], /background:\s*transparent\s*!important/i);
  assert.match(wrapperRule[1], /border:\s*0\s*!important/i);
  assert.match(wrapperRule[1], /box-shadow:\s*none\s*!important/i);

  const bodyRule = overrides.match(
    /:root:root body \.messages \.message \.message-body\s*\{([^}]*)\}/s
  );
  assert.ok(bodyRule, "message body padding reset should exist");
  assert.match(bodyRule[1], /padding:\s*0\s*!important/i);
  assert.match(bodyRule[1], /border-radius:\s*0\s*!important/i);
  assert.match(theme, /\.messages\{width:min\(768px,100%\);gap:26px\}/);
  assert.match(theme, /\.messages\{gap:22px\}/);
});

test("message DOM remains a single body/content structure", () => {
  assert.match(app, /body\.append\(heading,\s*article\)/);
  assert.match(app, /node\.append\(avatar,\s*body\)/);
  assert.match(html, /href="\.\/theme\.css\?v=20261024v5"/);
  assert.match(html, /href="\.\/ui-overrides\.css\?v=20261024settings3"/);
});

test("message flex items and rich content remain bounded and wrap safely", () => {
  assert.match(overrides, /\.messages,\s*\.message,\s*\.message-body,\s*\.message-content\s*\{[^}]*min-width:\s*0/s);
  assert.match(overrides, /\.message-body,\s*\.message-content\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(overrides, /\.message-content :is\(pre, table\)\s*\{[^}]*max-width:\s*100%/s);
  // The reset targets wrapper elements only, so code block styling remains available.
  assert.match(theme, /\.message-content pre\{background:var\(--m-code\);border:1px solid var\(--m-line\)/);
});
