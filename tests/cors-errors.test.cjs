const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const appJs = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const appStart = appJs.indexOf("function plainError(error) {");
const appEnd = appJs.indexOf("\n  function setBusy(", appStart);
assert.ok(appStart >= 0 && appEnd > appStart, "plainError must exist");
const plainErrorSource = appJs.slice(appStart, appEnd).trim();

function makePlainError(onLine, origin) {
  return vm.runInNewContext("(" + plainErrorSource + ")", {
    navigator: { onLine },
    location: { origin }
  });
}

test("network failures name the page origin and explain likely causes", () => {
  const message = makePlainError(true, "https://mahi-ai-kdm2.onrender.com")(
    new TypeError("Failed to fetch")
  );
  assert.match(message, /Could not reach MahiCloud/);
  assert.match(message, /https:\/\/mahi-ai-kdm2\.onrender\.com/);
  assert.match(message, /CORS\/origin allowlist/i);
  assert.doesNotMatch(message, /^Connection failed\. Check your internet/);
});

test("offline status is distinct from CORS/reachability failures", () => {
  const message = makePlainError(false, "http://localhost:5173")(
    new TypeError("Failed to fetch")
  );
  assert.match(message, /appear to be offline/i);
});

test("origin rejection gives a direct allowlist instruction", () => {
  const message = makePlainError(true, "https://preview.example.test")(
    new Error("Mahi AI: Origin not allowed.")
  );
  assert.match(message, /preview\.example\.test/);
  assert.match(message, /MAHI_AI_ALLOWED_ORIGINS/);
});

const edge = fs.readFileSync(
  require.resolve("../supabase/functions/mahi-ai-chat/index.ts"),
  "utf8"
);
const defaultsStart = edge.indexOf("const DEFAULT_ALLOWED_ORIGINS = [");
const allowedStart = edge.indexOf("function isAllowedOrigin(origin: string): boolean");
const allowedEnd = edge.indexOf("\nfunction corsHeadersFor(", allowedStart);
assert.ok(defaultsStart >= 0 && allowedStart > defaultsStart && allowedEnd > allowedStart,
  "CORS defaults and isAllowedOrigin must exist");

const defaultsSource = edge.slice(defaultsStart, allowedStart);
const allowedSource = edge.slice(allowedStart, allowedEnd)
  .replace("function isAllowedOrigin(origin: string): boolean", "function isAllowedOrigin(origin)");
const corsContext = vm.runInNewContext(
  defaultsSource +
  "\nlet customOrigins = \"\";" +
  "\nfunction envFirst(names) { return names.includes(\"MAHI_AI_ALLOWED_ORIGINS\") ? customOrigins : \"\"; }" +
  "\n" + allowedSource +
  "\n({ isAllowedOrigin, setCustomOrigins(value) { customOrigins = value; } })",
  { URL }
);

test("allows only Mahi-AI Render hosts and rejects unrelated Render sites", () => {
  const allow = corsContext.isAllowedOrigin;
  assert.equal(allow("https://mahi-ai.onrender.com"), true);
  assert.equal(allow("https://mahi-ai-kdm2.onrender.com"), true);
  assert.equal(allow("https://mahi-ai-pr-123.onrender.com"), true);
  assert.equal(allow("https://unrelated-app.onrender.com"), false);
  assert.equal(allow("https://mahi-ai.example.com"), false);
});

test("allows localhost development on arbitrary ports", () => {
  const allow = corsContext.isAllowedOrigin;
  assert.equal(allow("http://localhost:5173"), true);
  assert.equal(allow("http://127.0.0.1:9000"), true);
  assert.equal(allow("https://localhost:8443"), true);
  assert.equal(allow("http://localhost:5173/path"), false);
});

test("custom origins add to, rather than replace, safe defaults", () => {
  corsContext.setCustomOrigins("https://custom.example, https://preview.example.test");
  const allow = corsContext.isAllowedOrigin;
  assert.equal(allow("https://custom.example"), true);
  assert.equal(allow("https://preview.example.test"), true);
  assert.equal(allow("https://mahi-ai-kdm2.onrender.com"), true);
  assert.equal(allow("https://custom.example/"), false);
});
