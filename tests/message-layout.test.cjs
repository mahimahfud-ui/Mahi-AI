const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (path) => fs.readFileSync(require.resolve(path), "utf8");
const html = read("../public/index.html");
const app = read("../public/app.js");
const css = read("../public/nexora.css");

test("messages use the new NEXORA editorial layout, not legacy cards", () => {
  assert.match(css, /\.nexora-shell \.message-body\s*\{[^}]*border-left:\s*1px solid var\(--nx-border\)/s);
  assert.match(css, /\.nexora-shell \.message\.user \.message-body\s*\{[^}]*border-radius:/s);
  assert.match(css, /\.nexora-shell \.message-content pre\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /\.nexora-shell \.message-content table/);
});

test("message DOM and safe markdown rendering retain the app-owned single body/content structure", () => {
  assert.match(app, /body\.append\(heading,\s*article\)/);
  assert.match(app, /node\.append\(avatar,\s*body\)/);
  assert.match(app, /DOMPurify\.sanitize/);
  assert.match(html, /id="messages"/);
});

test("message and code content stay bounded on narrow screens", () => {
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /max-width:\s*100%/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
});
