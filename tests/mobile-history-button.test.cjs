const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const css = fs.readFileSync(require.resolve("../public/ui-overrides.css"), "utf8");

test("mobile chat-history toggle remains visible and has a clearly rendered hamburger icon", () => {
  assert.match(html, /id="openSidebar"[^>]*aria-label="Toggle sidebar"/);
  assert.match(html, /ui-overrides\.css\?v=[^"]+/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /:root:root body \.topbar #openSidebar\s*\{[^}]*display:\s*grid/);
  assert.match(css, /:root:root body \.topbar #openSidebar\s*\{[^}]*background:\s*var\(--m-comp\)/);
  assert.match(css, /:root:root body \.topbar #openSidebar svg\s*\{[^}]*stroke:\s*currentColor/);
  assert.match(css, /:root:root body \.topbar #openSidebar svg\s*\{[^}]*stroke-width:\s*2/);
});
