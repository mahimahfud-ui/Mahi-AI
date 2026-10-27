const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const backend = fs.readFileSync(require.resolve("../supabase/functions/mahi-ai-chat/index.ts"), "utf8");
const adminControl = fs.readFileSync(require.resolve("../public/admin-control.js"), "utf8");
const migration = fs.readFileSync(
  require.resolve("../supabase/migrations/20261027030000_disable_per_user_request_caps.sql"),
  "utf8"
);

test("per-user minute/day request caps are disabled while usage tracking remains", () => {
  assert.match(backend, /const UNLIMITED_PER_USER_REQUEST_LIMIT = 2_147_483_647/);
  assert.match(backend, /p_minute_limit: UNLIMITED_PER_USER_REQUEST_LIMIT/);
  assert.match(backend, /p_day_limit: UNLIMITED_PER_USER_REQUEST_LIMIT/);
  assert.match(backend, /reserveUsageRequest\(user\.id, requestId\)/);
  assert.doesNotMatch(backend, /adminConfig\?\.rateLimitPerMinute\s*\|\|\s*boundedIntegerSetting/);
  assert.match(migration, /INSERT INTO public\.mahi_ai_usage_events[^;]*request_id/s);
  assert.match(migration, /RETURN QUERY SELECT true, v_usage_id, 0, NULL::text/);
  assert.doesNotMatch(migration, /v_minute_count|v_day_count|RETURN QUERY SELECT false/);
  assert.match(adminControl, /Per-user request caps: Unlimited \(disabled\)/);
  assert.doesNotMatch(adminControl, /field\("Requests per minute per user"/);
  assert.doesNotMatch(adminControl, /field\("Requests per day per user"/);
});
