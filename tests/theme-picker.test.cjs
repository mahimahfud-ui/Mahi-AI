const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const css = fs.readFileSync(require.resolve("../public/nexora.css"), "utf8");

test("NEXORA uses its fixed dark workspace palette instead of loading the legacy theme picker", () => {
  assert.match(html, /<html lang="en" data-theme="dark">/);
  assert.match(html, /black-theme\.js/);
  assert.doesNotMatch(html, /\.\/theme\.css|\.\/themes\.js/);
  assert.match(css, /--nx-bg:\s*#09090b/);
  assert.match(css, /--nx-accent:\s*#b7a5ff/);
  assert.match(css, /background:\s*var\(--nx-bg\)/);
});

test("non-colour chat preferences and settings remain available", () => {
  for (const id of ["settingsPanel","enterToSendToggle","chatDensitySelect","chatFontSizeSelect","autoScrollToggle","responseStyleSelect","customInstructionsInput","autoReadAloudToggle","settingsExportMarkdown","settingsExportJson","resetChatPreferences"]) {
    assert.ok(html.includes('id="' + id + '"'), "missing setting " + id);
  }
});
