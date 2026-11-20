const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");

test("user and assistant messages use the current compact message DOM", () => {
  assert.match(html, /function addMsg\(m, i, typing\)/);
  assert.match(html, /el\("article", "msg " \+ \(m\.role === "user" \? "user" : "ai"\)\)/);
  assert.match(html, /el\("div", "bub"\)/);
  assert.match(html, /el\("div", "prose"\)/);
  assert.match(html, /msg\.user \.bub/);
  assert.match(html, /\.msg\.ai \.who/);
});

test("message text is escaped before rendering and rich markdown is rendered in a bounded prose area", () => {
  assert.match(html, /const esc = s => String\(s\)\.replace/);
  assert.match(html, /function md\(src\)/);
  assert.match(html, /\.prose\{overflow-wrap:anywhere\}/);
  assert.match(html, /\.code pre\{padding:14px;overflow:auto/);
});

test("long messages, lists, links, tables and code do not force horizontal page overflow", () => {
  assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, /#scroll\{flex:1;overflow:auto/);
  assert.match(html, /\.code pre\{[^}]*overflow:auto/);
  assert.match(html, /min-width:0/);
});
