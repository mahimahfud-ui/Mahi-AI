const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");

function actualDomMarkup() {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

test("the production page is branded MahiCloud and points at the intended production URL", () => {
  assert.match(html, /<title>MahiCloud<\/title>/);
  assert.match(html, /content="MahiCloud"/);
  assert.match(html, /https:\/\/mahi-ai-kdm2\.onrender\.com\//);
  assert.match(html, /Cybernetic%20Half-Face%20Portrait\.png/);
  assert.doesNotMatch(html, /mahi-ai-kesr\.onrender\.com/);
});

test("actual DOM IDs are unique and the live product shell is present", () => {
  const markup = actualDomMarkup();
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, "rendered DOM markup must not contain duplicate IDs");
  for (const id of ["app", "side", "toggle", "newChat", "search", "list", "top", "welcome", "scroll", "msgs", "composer", "in", "send", "ovAccount", "codePreview", "pvFrame"]) {
    assert.ok(ids.includes(id), "missing current product element: " + id);
  }
});

test("the current single-page application script parses as JavaScript", () => {
  const match = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/);
  assert.ok(match, "main inline application script must exist");
  assert.doesNotThrow(() => new vm.Script('"use strict";' + match[1]), "main app JavaScript must parse");
});

test("the frontend uses the current public Supabase configuration and authenticated AI endpoint", () => {
  assert.match(html, /supabaseUrl: "https:\/\/husydmiujigyonlxbuuj\.supabase\.co"/);
  assert.match(html, /supabasePublishableKey:/);
  assert.match(html, /\/functions\/v1\/mahi-ai-chat/);
  assert.match(html, /Authorization: "Bearer " \+ s\.access_token/);
  assert.doesNotMatch(html, /SERVICE_ROLE_KEY|service_role|GEMINI_API_KEY|OPENROUTER_API_KEY/);
});

test("the current UI retains account, history, attachment, voice, task-mode and code-preview controls", () => {
  for (const id of ["openAccount", "googleLink", "googleExisting", "newChat", "search", "attach", "file", "mic", "tMode", "taskModeMenu", "codePreview", "pvTabs"]) {
    assert.ok(html.includes('id="' + id + '"'), "missing production hook " + id);
  }
});
