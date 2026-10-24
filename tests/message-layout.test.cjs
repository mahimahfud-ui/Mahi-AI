const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (path) => fs.readFileSync(require.resolve(path), "utf8");
const html = read("../public/index.html");
const app = read("../public/app.js");
const styles = read("../public/styles.css");
const theme = read("../public/theme.css");
const overrides = read("../public/ui-overrides.css");

test("outgoing messages use the outer body as their only bubble surface", () => {
  const bodyRule = styles.match(/\.message\.user \.message-body\s*\{([^}]*)\}/);
  assert.ok(bodyRule, "outgoing message body rule should exist");
  assert.match(bodyRule[1], /background\s*:/);
  assert.match(bodyRule[1], /border-radius\s*:/);
  assert.match(bodyRule[1], /padding\s*:/);

  const contentRules = [...theme.matchAll(/\.message\.user \.message-content\s*\{([^}]*)\}/g)]
    .map((match) => match[1]);
  assert.ok(contentRules.length, "outgoing message content rule should exist");
  for (const declarations of contentRules) {
    assert.doesNotMatch(
      declarations,
      /\b(?:background(?:-color)?|border(?:-[\w-]+)?|padding(?:-[\w-]+)?|box-shadow)\s*:/i,
      "inner message content must not paint a second bubble",
    );
  }
  assert.match(theme, /\.message\.user \.message-body\{background:linear-gradient/);
});

test("message DOM keeps one body wrapper and one content node", () => {
  assert.match(app, /body\.append\(heading,\s*article\)/);
  assert.match(app, /node\.append\(avatar,\s*body\)/);
  assert.match(html, /href="\.\/theme\.css\?v=20261024v5"/);
});

test("message flex items and rich content remain bounded and wrap safely", () => {
  assert.match(overrides, /\.messages,\s*\.message,\s*\.message-body,\s*\.message-content\s*\{[^}]*min-width:\s*0/s);
  assert.match(overrides, /\.message-body,\s*\.message-content\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(overrides, /\.message-content :is\(pre, table\)\s*\{[^}]*max-width:\s*100%/s);
});
