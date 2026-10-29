const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const lagoon = fs.readFileSync(path.join(root, "public", "mahi.css"), "utf8");

test("Lagoon is loaded after existing component styles", () => {
  const legacy = html.indexOf('./admin-control.css');
  const overlay = html.indexOf('./mahi.css?v=claude-ui-20261029');
  assert.ok(legacy >= 0, "existing admin stylesheet remains linked");
  assert.ok(overlay > legacy, "Lagoon override loads after existing styles");
  assert.match(html, /\.\/styles\.css/);
  assert.match(html, /\.\/theme\.css/);
  assert.match(html, /\.\/code-blocks\.css/);
});

test("existing feature scripts and key interface elements remain present", () => {
  for (const script of ["./app.js", "./live-voice.js", "./admin-control.js", "./code-blocks.js", "./themes.js"]) {
    assert.ok(html.includes(script), `missing existing script: ${script}`);
  }
  for (const id of ["newChat", "chatList", "chatForm", "sendButton", "accountModal", "voiceOverlay", "apiExplorer", "openAdminControl"]) {
    assert.ok(html.includes(`id="${id}"`), `missing existing UI element: ${id}`);
  }
});

test("Lagoon provides responsive layout and reduced-motion support", () => {
  assert.match(lagoon, /@media\s*\(max-width:\s*600px\)/);
  assert.match(lagoon, /@media\s*\(max-width:\s*360px\)/);
  assert.match(lagoon, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(lagoon, /\.composer:focus-within/);
  assert.match(lagoon, /:focus-visible/);
});

test("the redesign is presentation-only and does not remove legacy styles", () => {
  assert.match(lagoon, /Existing stylesheets remain in place/);
  for (const legacy of ["./styles.css", "./theme.css", "./motion.css", "./craft.css", "./motion-b.css", "./ui-overrides.css"]) {
    assert.ok(html.includes(legacy), `legacy stylesheet unexpectedly removed: ${legacy}`);
  }
});
