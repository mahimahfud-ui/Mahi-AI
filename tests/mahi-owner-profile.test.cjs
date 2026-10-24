const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const edge = fs.readFileSync(
  require.resolve("../supabase/functions/mahi-ai-chat/index.ts"),
  "utf8"
);
const ui = fs.readFileSync(
  require.resolve("../public/ui-overrides.css"),
  "utf8"
);

test("owner-profile context identifies Mahi aliases and profile intent", () => {
  assert.match(edge, /function isMahiOwnerProfileRequest\(prompt: string\)/);
  assert.match(edge, /mahimahfud\|mahi/);
  assert.match(edge, /somporke\|porichoy\|bistarito/);
  assert.match(edge, /const ownerProfileContext = getMahiOwnerProfileContext\(displayPrompt\)/);
  assert.match(edge, /MAHI OWNER PROFILE CONTEXT/);
});

test("profile context includes the owner's projects and public links", () => {
  for (const value of [
    "Mahi Mahfud",
    "MahiCloud",
    "MahiFlix",
    "StreamCloud",
    "https://github.com/mahimahfud-ui",
    "https://mahi-ai-kdm2.onrender.com",
    "https://www.instagram.com/mahimahfud",
    "https://wa.me/8801819856148"
  ]) assert.ok(edge.includes(value), "missing owner profile detail: " + value);
  assert.match(edge, /Do not invent employers, awards/);
});

test("sidebar logo has a contrasting frame in both themes", () => {
  assert.match(ui, /\.brand-row \.brand-logo[\s\S]*?object-fit: cover/);
  assert.match(ui, /box-shadow:[\s\S]*?0 0 0 2px #171b29/);
  assert.match(ui, /html\[data-theme="light"\] \.brand-row \.brand-logo/);
  assert.match(ui, /0 0 0 2px #20283a/);
});
