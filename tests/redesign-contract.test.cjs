const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const lagoon = fs.readFileSync(path.join(root, "public", "mahi.css"), "utf8");
const polish = fs.readFileSync(path.join(root, "public", "ui-polish.css"), "utf8");

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


test("the refined visual layer loads last and preserves chat readability and device fit", () => {
  const blackTheme = html.indexOf("./black-theme.css?v=black-20261029");
  const polishLink = html.indexOf("./ui-polish.css?v=20261029polish1");
  assert.ok(blackTheme >= 0, "permanent black theme remains linked");
  assert.ok(polishLink > blackTheme, "visual polish loads after the black theme");
  assert.match(polish, /\.suggestion-card:hover/);
  assert.match(polish, /\.composer:focus-within/);
  assert.match(polish, /\.message-content/);
  assert.match(polish, /\.account-modal-panel/);
  assert.match(polish, /@media\s*\(max-width:\s*760px\)/);
  assert.match(polish, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(polish, /body \.message\.user \.message-content\s*\{[^}]*background/s,
    "the polish layer must not turn user messages back into boxed bubbles");
});
