const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public", "nexora.css"), "utf8");
const ui = fs.readFileSync(path.join(root, "public", "nexora-ui.js"), "utf8");

test("NEXORA workspace is the active MahiCloud interface", () => {
  assert.match(html, /class="app-shell nexora-shell"/);
  assert.match(html, /Your ideas deserve/);
  assert.match(html, /AI Workspace/);
  assert.match(html, /\.\/nexora\.css/);
  assert.doesNotMatch(html, /\.\/ai-intro\.js|id="aiIntro"/);
});

test("real MahiCloud chat and account modules remain wired", () => {
  for (const script of ["./app.js", "./live-voice.js", "./admin-control.js", "./code-blocks.js", "./black-theme.js"]) {
    assert.ok(html.includes(script), "missing existing script: " + script);
  }
  for (const id of ["newChat", "chatList", "chatForm", "sendButton", "promptInput", "modelPicker", "thinkModeButton", "accountModal", "voiceOverlay", "apiExplorer", "openAdminControl", "openApiExplorer", "adminControlOverlay"]) {
    assert.ok(html.includes('id="' + id + '"'), "missing existing feature element: " + id);
  }
  assert.match(html, /supabase-js@2/);
  assert.match(html, /marked@/);
  assert.match(html, /dompurify@/);
});

test("new presentation does not replace the Supabase response pipeline with demo replies", () => {
  assert.match(html, /\.\/config\.js/);
  assert.match(html, /\.\/app\.js/);
  assert.match(html, /\.\/ui-adapter\.js/);
  assert.doesNotMatch(html, /generateReply\(|AIProvider\.respond/);
  assert.match(ui, /does not own chat, auth, or provider state/i);
});

test("NEXORA layout is responsive, accessible and reduced-motion aware", () => {
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /@media\s*\(max-width:\s*420px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /width:var\(--sidebar-width,264px\)/);
  assert.ok(html.includes('id="sidebarResizeHandle"'));
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(ui, /prefers-reduced-motion/);
  assert.match(ui, /aria-expanded/);
});
