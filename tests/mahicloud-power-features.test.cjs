const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const organizationMigration = fs.readFileSync(
  require.resolve("../supabase/migrations/20261120134212_mahicloud_organization_prompt_sync.sql"),
  "utf8"
);
const promptSecurityMigration = fs.readFileSync(
  require.resolve("../supabase/migrations/20261120134247_restrict_prompt_sync_to_permanent_users.sql"),
  "utf8"
);

function section(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, "missing app section: " + start);
  return html.slice(a, b);
}

test("chat folders and tags are stored on the user's existing conversation rows", () => {
  assert.match(organizationMigration, /ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT ''/);
  assert.match(organizationMigration, /ADD COLUMN IF NOT EXISTS tags text\[\] NOT NULL DEFAULT '\{\}'/);
  assert.match(organizationMigration, /mahi_ai_conversations_user_folder_updated_idx/);
  assert.match(html, /select=id,title,updated_at,folder,tags/);
  assert.match(html, /function drawFolderFilters\(\)/);
  assert.match(html, /activeFolderFilter/);
  assert.match(html, /function moveConversationToFolder\(/);
  assert.match(html, /function editConversationTags\(/);
  assert.match(html, /organizeConversation: \(id, patch\)/);
  assert.match(html, /Edit tags \(" \+ \(c\.tags \|\| \[\]\)\.length \+ "\)/);
});

test("folder and tag inputs are bounded before they are written", () => {
  const organization = section("async function updateConversationOrganization(", "let closeActiveMenu = null;");
  assert.match(organization, /slice\(0, 40\)/);
  assert.match(organization, /slice\(0, 24\)/);
  assert.match(organization, /\.slice\(0, 8\)/);
  assert.match(organizationMigration, /CHECK \(char_length\(folder\) <= 40\)/);
  assert.match(organizationMigration, /CHECK \(cardinality\(tags\) <= 8\)/);
});

test("cross-device prompt sync is per-user and only available to permanent sign-in identities", () => {
  assert.match(organizationMigration, /CREATE TABLE IF NOT EXISTS public\.mahi_ai_prompts/);
  assert.match(organizationMigration, /PRIMARY KEY \(user_id, id\)/);
  assert.match(organizationMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(organizationMigration, /REVOKE ALL ON TABLE public\.mahi_ai_prompts FROM anon, public/);
  assert.match(organizationMigration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.mahi_ai_prompts TO authenticated/);
  assert.match(promptSecurityMigration, /auth\.jwt\(\).*is_anonymous/);
  assert.match(promptSecurityMigration, /COALESCE\([\s\S]*true\) = false/);
  const sync = section("function promptSyncEligible()", "function openPromptEditor(");
  assert.match(sync, /isGoogleIdentity\(user\)/);
  assert.match(sync, /mahi_ai_prompts\?select=/);
  assert.match(sync, /on_conflict=user_id,id/);
  assert.match(sync, /order=updated_at\.desc&limit=400/);
  assert.match(sync, /resolution=merge-duplicates/);
  assert.match(sync, /deleted_at:/);
  assert.match(sync, /updatedAt/);
  assert.match(sync, /promptSyncDirty/);
  assert.match(html, /id="promptSyncNow"/);
});

test("prompt deletions are synced as tombstones instead of being resurrected on another device", () => {
  const prompts = section("function normalizeSavedPrompt(", "function openPromptEditor(");
  assert.match(prompts, /deletedAt:/);
  assert.match(html, /deletedAt: now, updatedAt: now/);
  assert.match(html, /customPrompts\.filter\(item => !item\.deletedAt\)/);
});

test("Voice Conversation Mode uses browser speech APIs and can stop listening and speaking", () => {
  assert.match(html, /id="voiceMode"/);
  const voice = section("let voiceModeActive = false;", "/* leaving a draft");
  assert.match(voice, /new SR\(\)/);
  assert.match(voice, /new SpeechSynthesisUtterance/);
  assert.match(voice, /window\.speechSynthesis\.speak/);
  assert.match(voice, /recognition\.abort\(\)/);
  assert.match(voice, /window\.speechSynthesis\.cancel\(\)/);
  assert.match(voice, /function toggleVoiceMode\(\)/);
  assert.match(voice, /if \(voiceModeActive\) return toast\("Voice Mode is already handling the microphone/);
  assert.match(voice, /manualRecognition\.abort\(\)/);
  assert.match(voice, /function scheduleVoiceModeListen\(/);
  const send = section("async function send(text, edit)", "const friendly =");
  assert.match(send, /if \(voiceModeRecognition\) \{[\\s\\S]*activeRecognition\.abort\(\)/);
  assert.match(html, /if \(voiceModeActive\) speakVoiceResponse\(full\)/);
  assert.match(html, /if \(voiceModeActive\) return stopVoiceMode\(\)/);
});

test("voice mode does not auto-start when browser speech support is missing", () => {
  const voice = section("function toggleVoiceMode()", "/* leaving a draft");
  assert.match(voice, /if \(!SR \|\| !\("speechSynthesis" in window\)\)/);
  assert.match(voice, /Hands-free Voice Mode needs browser speech recognition and speech synthesis support/);
});
