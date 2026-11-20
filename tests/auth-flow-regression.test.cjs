const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");

function between(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, "missing current app section: " + start);
  return html.slice(a, b);
}

test("a missing session creates a guest, but an expired saved session is never silently replaced", () => {
  const api = between("const Api = {", "/* ===== Google account linking");
  assert.match(api, /async createGuestSession\(\)/);
  assert.match(api, /if \(!s\) return this\.createGuestSession\(\)/);
  assert.match(api, /if \(!s\.refresh_token\) throw new Error/);
  assert.match(api, /if \(!response\.ok\) throw new Error\("Your saved MahiCloud session could not be refreshed/);
  assert.doesNotMatch(api, /if \(!r \|\| !r\.ok\)[\s\S]{0,180}auth\/v1\/signup/);
  assert.match(api, /session\?\.access_token \|\| !session\?\.user\?\.id/);
});

test("both Google PKCE actions record an in-tab pending flow before navigation", () => {
  const link = between("async function startGoogleIdentityLink()", "async function startGoogleExistingAccountSignIn()");
  const signIn = between("async function startGoogleExistingAccountSignIn()", "async function signOutGoogleAccount()");
  assert.match(link, /client\.auth\.linkIdentity/);
  assert.match(link, /markGoogleAuthPending\("link"\)/);
  assert.ok(link.indexOf('markGoogleAuthPending("link")') < link.indexOf("window.location.assign(data.url)"));
  assert.match(signIn, /client\.auth\.signInWithOAuth/);
  assert.match(signIn, /markGoogleAuthPending\("signin"\)/);
  assert.ok(signIn.indexOf('markGoogleAuthPending("signin")') < signIn.indexOf("window.location.assign(data.url)"));
});

test("an incomplete Google callback is stopped before guest boot and shown as an honest recovery state", () => {
  const boot = between("(async function boot()", "</script>");
  assert.match(boot, /const pendingGoogleFlow = readGoogleAuthPending\(\)/);
  assert.match(boot, /!isGoogleIdentity\(session\.user\)/);
  assert.match(boot, /showGoogleAuthRecovery\(\);\s*return;/);
  assert.ok(boot.indexOf("showGoogleAuthRecovery();") < boot.indexOf("await Api.ensure()"));
  assert.match(boot, /if \(pendingGoogleFlow \|\| savedSessionPresent\)/);
  assert.match(boot, /Could not start a guest session\. Enable anonymous sign-ins/);
  assert.match(html, /Google sign-in did not complete\. No account was created or linked\./);
  assert.match(html, /id="continueAsGuest" hidden/);
});

test("continuing as guest is explicit and warns before creating a new user ID after session loss", () => {
  assert.match(html, /\$\("#continueAsGuest"\)\.onclick = async/);
  assert.match(html, /Start a new guest workspace\?/);
  assert.match(html, /previous guest conversations and attachments remain tied to the old session/);
  assert.match(html, /danger: true/);
  assert.match(html, /Api\.createGuestSession\(\)/);
});

test("normal chat startup does not wait for the optional Supabase JS OAuth bundle", () => {
  const boot = between("(async function boot()", "</script>");
  assert.equal((boot.match(/getSupabaseAuthClient\\(\\)/g) || []).length, 1);
  assert.match(boot, /if \\(pendingGoogleFlow\\) \\{[\\s\\S]*await getSupabaseAuthClient\\(\\)/);
  assert.ok(boot.indexOf("await Api.ensure()") > boot.indexOf("if (pendingGoogleFlow)"));
  assert.doesNotMatch(boot, /syncSupabaseAuthSession/);
});

test("startup Auth and conversation requests have finite network timeouts", () => {
  const api = between("const Api = {", "/* ===== Google account linking");
  assert.match(api, /boundedFetch\\(CFG\\.supabaseUrl \\+ "\\/auth\\/v1\\/signup"/);
  assert.match(api, /boundedFetch\\(CFG\\.supabaseUrl \\+ "\\/auth\\/v1\\/token\\?grant_type=refresh_token"/);
  assert.match(api, /boundedFetch\\(CFG\\.supabaseUrl \\+ "\\/rest\\/v1\\/"/);
  assert.match(html, /function boundedFetch\\(/);
  assert.match(html, /function withTimeout\\(/);
});
