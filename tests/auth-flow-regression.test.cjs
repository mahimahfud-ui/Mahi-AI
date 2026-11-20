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

test("code preview controls bind only after their markup has been parsed", () => {
  const previewMarkup = html.indexOf('<div id="codePreview"');
  const scriptEnd = html.indexOf("</script>");
  assert.ok(previewMarkup > scriptEnd, "the preview markup currently follows the application script");

  const wiring = between("function wireCodePreviewEvents()", "/* ===== 9. Wiring");
  assert.match(wiring, /document\.addEventListener\("DOMContentLoaded", wireCodePreviewEvents, \{ once: true \}\)/);
  assert.match(wiring, /else \{\s*wireCodePreviewEvents\(\);\s*\}/);
  assert.match(wiring, /closeButton\?\.addEventListener\("click", closeCodePreview\)/);
  assert.match(wiring, /modal\?\.addEventListener\("click"/);
  assert.match(wiring, /refreshButton\?\.addEventListener\("click"/);
  assert.match(wiring, /tabs\?\.addEventListener\("click"/);
  assert.doesNotMatch(wiring, /\$\("#(?:pvClose|codePreview|pvRefresh|pvTabs)"\)\.addEventListener/);
});

test("Prompt Library ships searchable starters and supports bounded browser-local custom prompts", () => {
  const prompts = between("const PROMPTS_KEY", "/* ===== 8. Settings center");
  assert.match(html, /id="openPrompts"/);
  assert.match(html, /id="ovPrompts"/);
  assert.match(html, /id="promptSearch"/);
  assert.match(html, /id="promptCategoryFilter"/);
  assert.match(html, /id="promptEditor"/);
  assert.match(html, /id="savePrompt"/);
  assert.match(prompts, /const PROMPTS_KEY = "mahicloud\.prompts\.v1"/);
  assert.match(prompts, /const BUILTIN_PROMPTS = \[/);
  assert.match(prompts, /function normalizeSavedPrompt\(/);
  assert.match(prompts, /customPrompts\.length >= 100/);
  assert.match(prompts, /localStorage\.setItem\(PROMPTS_KEY/);
  assert.match(prompts, /function renderPromptLibrary\(/);
  assert.match(prompts, /function useLibraryPrompt\(/);
  assert.match(prompts, /function deleteLibraryPrompt\(/);
  assert.match(prompts, /item\.favorite/);
  assert.match(prompts, /promptBody.*8000/);
  assert.doesNotMatch(prompts, /innerHTML\s*=/, "prompt content must be rendered as text, not HTML");
  assert.match(html, /mod && e\.shiftKey && k === "p"/);
});

test("unsent drafts are restored per conversation for 24 hours without saving temporary chats or attachments", () => {
  const drafts = between("const DRAFT_PREFIX", "const canSend =");
  assert.match(drafts, /mahicloud\.draft\.v1:/);
  assert.match(drafts, /24 \* 60 \* 60 \* 1000/);
  assert.match(drafts, /sessionStorage\.setItem/);
  assert.match(drafts, /sessionStorage\.getItem/);
  assert.match(drafts, /if \(S\.temp\) return/);
  assert.match(drafts, /saved\.text\.slice\(0, 12000\)/);
  assert.doesNotMatch(drafts, /pendingFiles|FileReader|dataURL/i);
  const navigation = between("async function openConv(id)", "async function exportCapsule");
  assert.match(navigation, /persistDraft\(\)/);
  assert.match(navigation, /restoreDraft\(\)/);
  assert.match(navigation, /function newChat\(\)[\s\S]*restoreDraft\(\)/);
  const send = between("async function send(text, edit)", "const friendly =");
  assert.match(send, /clearDraft\(\); \$\("#in"\)\.value = ""/);
  assert.match(send, /\$\("#in"\)\.value = text;[\s\S]*grow\(\)/);
  assert.match(html, /await openConv\(convs\[0\]\.id\)/);
  assert.match(html, /restoreDraft\(\{ notify: true \}\)/);
});

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
  assert.match(boot, /showGoogleAuthRecovery\(\);\s*finishMahiBoot\(\);\s*return;/);
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
  assert.equal((boot.match(/getSupabaseAuthClient\(\)/g) || []).length, 1);
  assert.match(boot, /if \(pendingGoogleFlow\) \{[\s\S]*await getSupabaseAuthClient\(\)/);
  assert.ok(boot.indexOf("await Api.ensure()") > boot.indexOf("if (pendingGoogleFlow)"));
  assert.doesNotMatch(boot, /syncSupabaseAuthSession/);
});

test("startup Auth and conversation requests have finite network timeouts", () => {
  const api = between("const Api = {", "/* ===== Google account linking");
  assert.match(api, /boundedFetchJson\(CFG\.supabaseUrl \+ "\/auth\/v1\/signup"/);
  assert.match(api, /boundedFetchJson\(CFG\.supabaseUrl \+ "\/auth\/v1\/token\?grant_type=refresh_token"/);
  assert.match(api, /boundedFetchJson\(CFG\.supabaseUrl \+ "\/rest\/v1\/"/);
  assert.match(html, /function boundedFetch\(/);
  assert.match(html, /function withTimeout\(/);
});

test("Auth and REST request deadlines include response-body consumption", () => {
  const helper = between("async function boundedFetchJson(", "async function withTimeout(");
  assert.match(helper, /const timer = window\.setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/);
  assert.match(helper, /const body = await response\.text\(\)/);
  assert.ok(helper.indexOf("await response.text()") < helper.indexOf("window.clearTimeout(timer)"));
  assert.match(helper, /return \{ response, data \}/);
});

test("malformed saved preferences cannot abort MahiCloud startup", () => {
  const settings = between("let S = { ...DEF };", "const FONTS =");
  assert.ok(settings.includes('saved && typeof saved === "object" && !Array.isArray(saved)'));
  assert.match(settings, /value !== null && typeof value === typeof fallback/);
  assert.ok(settings.includes("if (!/^#[0-9a-f]{6}$/i.test(S.accent)) S.accent = DEF.accent;"));
  assert.ok(settings.includes("Number.isFinite(S.fontSize)"));
});

test("startup initialization errors are visible instead of leaving Connecting forever", () => {
  assert.ok(html.indexOf("window.__MAHI_BOOT_COMPLETE = false") < html.indexOf("const CFG ="));
  assert.ok(html.includes('window.addEventListener("error"'));
  assert.ok(html.includes('window.addEventListener("unhandledrejection"'));
  assert.match(html, /startup exceeded 30 seconds/);
  const boot = between("(async function boot()", "</script>");
  assert.match(boot, /try \{\s*setMahiBootStage\("initializing interface"/);
  assert.ok(boot.includes("catch (error) {"));
  assert.ok(boot.includes("markMahiStartupFailure(error)"));
  assert.ok(boot.includes('setMahiBootStage("connecting to Supabase Auth"'));
  assert.ok(boot.includes('setMahiBootStage("loading conversations"'));
});

test("static HTML requests browser revalidation after a new production deployment", () => {
  assert.match(html, /http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"/);
});
