const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const css = fs.readFileSync(require.resolve("../public/theme.css"), "utf8");
const themes = fs.readFileSync(require.resolve("../public/themes.js"), "utf8");

test("theme engine is loaded early and the new stylesheet is cache-busted", () => {
  assert.match(html, /href="\.\/theme\.css\?v=20261024v5"/);
  assert.match(html, /<script src="\.\/themes\.js\?v=20261024v2"><\/script>/);
  assert.ok(html.indexOf("./config.js") < html.indexOf("./themes.js?v=20261024v2"));
  assert.ok(html.includes('id="settingsPanel"'));
});

test("theme chooser includes the 12 presets and three custom colour inputs", () => {
  for (const id of ["midnight", "graphite", "ocean", "forest", "sunset", "rose", "violet", "paper", "snow", "mint", "lavender", "peach"]) {
    assert.ok(themes.includes('"' + id + '"'), "missing theme " + id);
  }
  assert.match(themes, /id: "custom"/);
  assert.match(themes, /inputs\.bg\.value/);
  assert.match(themes, /inputs\.text\.value/);
  assert.match(themes, /inputs\.accent\.value/);
  assert.match(themes, /localStorage\.setItem\(KEY/);
});

test("responsive theme styles preserve message tools and mobile export access", () => {
  assert.match(css, /:root\[data-mytheme\]/);
  assert.match(css, /\.theme-picker/);
  assert.match(css, /prefers-reduced-motion|@media \(max-width:760px\)/);
  assert.match(css, /\.header-tool-button,.temporary-chat-button,.account-button\{width:36px;height:36px;[^}]*display:inline-grid/);
  assert.match(css, /\.message-action:hover/);
});