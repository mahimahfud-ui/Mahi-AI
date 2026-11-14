const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("public/index.html");
const css = read("public/nexora.css");
const script = read("public/black-theme.js");
const app = read("public/app.js");

test("NEXORA keeps the production workspace dark without the old theme UI", () => {
  assert.match(html, /<html lang="en" data-theme="dark">/);
  assert.match(html, /black-theme\.js/);
  assert.doesNotMatch(html, /\.\/theme\.css|\.\/themes\.js|theme-picker/);
  assert.match(script, /root\.setAttribute\("data-theme", "dark"\)/);
  assert.match(script, /MutationObserver/);
  assert.match(css, /--nx-bg:\s*#09090b/);
  assert.match(css, /color-scheme:\s*dark/);
  assert.doesNotThrow(() => new vm.Script(script));
});

test("the NEXORA shell replaces the former UI while retaining key workspace controls", () => {
  for (const id of ["sidebar","chatList","openSidebar","newChat","chatForm","promptInput","sendButton","modelPicker","thinkModeButton","profileAvatar","profileDisplayName","accountButton","openApiExplorer","openAdminControl"]) {
    assert.ok(html.includes('id="' + id + '"'), "missing new workspace control " + id);
  }
  assert.doesNotMatch(html, /id="aiIntro"|class="small-mark/);
  assert.match(css, /\.nexora-shell \.sidebar/);
  assert.match(css, /\.nexora-shell \.main-panel/);
  assert.match(css, /\.nexora-shell \.composer/);
});

test("real backend and production feature modules remain loaded", () => {
  for (const file of ["./app.js","./live-voice.js","./admin-control.js","./code-blocks.js","./ui-adapter.js","./black-theme.js"]) {
    assert.ok(html.includes(file), "missing production module " + file);
  }
  for (const id of ["chatForm","promptInput","sendButton","stopButton","modelPicker","thinkModeButton","fileInput","attachmentList","accountModal","voiceOverlay","apiExplorer","adminControlOverlay","openAdminControl","exportMarkdownButton"]) {
    assert.ok(html.includes('id="' + id + '"'), "missing production hook " + id);
  }
  assert.match(app, /functions\/v1\/mahi-ai-chat/);
  assert.match(app, /getReader\(\)/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, "production IDs must remain unique");
});

test("NEXORA design is responsive and touch-safe", () => {
  for (const breakpoint of ["@media (max-width:760px)","@media (max-width:420px)","@media (prefers-reduced-motion:reduce)"]) {
    assert.ok(css.replace(/\s+/g,"").includes(breakpoint.replace(/\s+/g,"")), "missing responsive rule " + breakpoint);
  }
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /overflow-x:\s*hidden/);
});
