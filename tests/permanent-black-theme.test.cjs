const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("public/index.html");
const css = read("public/black-theme.css");
const script = read("public/black-theme.js");
const adapter = read("public/ui-adapter.js");

test("black theme is pinned before paint and after all theme scripts", () => {
  assert.match(html, /<html lang="en" data-theme="dark">/);
  assert.ok(html.indexOf("./black-theme.css?v=black-20261029") > html.indexOf("./mahi.css"));
  assert.ok(html.indexOf("./black-theme.js?v=black-20261029") > html.indexOf("./themes.js"));
  assert.ok(html.indexOf("./black-theme.js?v=black-20261029") > html.indexOf("./motion-b.js"));
  assert.match(script, /localStorage\.setItem\(THEME_PREF, "dark"\)/);
  assert.match(script, /localStorage\.setItem\(THEME_ENGINE_PREF, JSON\.stringify\(safe\)\)/);
  assert.match(script, /root\.setAttribute\("data-theme", "dark"\)/);
  assert.match(script, /MutationObserver/);
});

test("light/custom theme actions are blocked but non-colour preferences are preserved", () => {
  assert.match(script, /#themeToggle, #quickThemeToggle/);
  assert.match(script, /\.theme-picker \.tp-group:nth-of-type\(-n\+4\)/);
  assert.match(css, /#settingsPanel \.theme-picker \.tp-group:nth-of-type\(-n\+4\)/);
  assert.match(css, /#settingsPanel \.theme-picker \.tp-actions/);
  assert.match(script, /radius: \["sharp", "soft", "round"\]/);
  assert.match(script, /fx: current\.fx !== false/);
  assert.match(adapter, /Dark theme is permanently enabled/);
  assert.doesNotThrow(() => new vm.Script(script), "permanent theme script must parse");
  assert.doesNotThrow(() => new vm.Script(adapter), "theme/title adapter must parse");
});

test("the official logo is restored to sidebar, top bar and welcome screen", () => {
  const logo = "Cybernetic%20Half-Face%20Portrait.png";
  assert.ok(html.includes('class="brand-logo" src="https://raw.githubusercontent.com/mahimahfud-ui/Mahi-AI/main/' + logo));
  assert.ok(html.includes('class="small-mark" src="https://raw.githubusercontent.com/mahimahfud-ui/Mahi-AI/main/' + logo));
  assert.ok(html.includes('class="welcome-logo" src="https://raw.githubusercontent.com/mahimahfud-ui/Mahi-AI/main/' + logo));
  assert.doesNotMatch(html, /welcomeBrandGradient/);
});

test("the app has distinct frames for phone, tablet, laptop and desktop widths", () => {
  for (const breakpoint of [
    "@media (min-width: 1200px)",
    "@media (min-width: 761px) and (max-width: 1199px)",
    "@media (max-width: 760px)",
    "@media (max-width: 380px)",
    "@media (min-width: 381px) and (max-width: 600px)",
    "@media (min-width: 601px) and (max-width: 760px)",
    "@media (max-width: 760px) and (max-height: 520px)",
    "@media (min-width: 1600px)"
  ]) assert.ok(css.includes(breakpoint), "missing device frame: " + breakpoint);
  assert.match(css, /height: auto !important;[\s\S]{0,100}max-height: none !important/);
  assert.match(css, /min-width: 0/);
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test("production backend hooks and integrations remain intact", () => {
  for (const file of [
    "./app.js?v=20261029realtimevoice1",
    "./live-voice.js?v=20261029realtimevoice1",
    "./admin-control.js?v=20261025admin1",
    "./code-blocks.js?v=20261025",
    "./ui-adapter.js?v=20261029"
  ]) assert.ok(html.includes(file), "missing production script " + file);
  for (const id of [
    "chatForm", "promptInput", "sendButton", "stopButton", "modelPicker",
    "thinkModeButton", "fileInput", "attachmentList", "accountModal",
    "voiceOverlay", "adminControlOverlay", "openAdminControl", "exportMarkdownButton"
  ]) assert.ok(html.includes('id="' + id + '"'), "missing production hook " + id);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, "production IDs must remain unique");
});
