"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const yaml = fs.readFileSync(require.resolve("../render.yaml"), "utf8");

test("Render Blueprint describes the existing MahiCloud static site", () => {
  assert.match(yaml, /type: web/);
  assert.match(yaml, /name: mahi-ai/);
  assert.match(yaml, /runtime: static/);
  assert.match(yaml, /branch: main/);
  assert.match(yaml, /autoDeployTrigger: commit/);
  assert.match(yaml, /buildCommand: echo 'Mahi-AI static site deployment'/);
  assert.match(yaml, /staticPublishPath: \.\/public/);
  assert.doesNotMatch(yaml, /runtime: node|startCommand:|healthCheckPath:|^\s+plan:|^\s+region:/m);
});

test("static site Blueprint applies baseline browser security headers without blocking app voice", () => {
  assert.match(yaml, /name: X-Content-Type-Options\s+value: nosniff/);
  assert.match(yaml, /name: Referrer-Policy\s+value: strict-origin-when-cross-origin/);
  assert.match(yaml, /name: X-Frame-Options\s+value: DENY/);
  assert.match(yaml, /name: Permissions-Policy\s+value: camera=\(\), microphone=\(self\), geolocation=\(\)/);
});
