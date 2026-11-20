const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const match = html.match(/function greetingForHour\\(hour = new Date\\(\\)\\.getHours\\(\\)\\) \\{[\\s\\S]*?\\n\\}/);
assert.ok(match, "time-aware greeting helper must exist");
const greetingForHour = new Function(match[0] + "; return greetingForHour;")();

test("welcome greeting follows local device time across every part of the day", () => {
  const cases = [
    [0, "Good night"], [4, "Good night"], [5, "Good morning"],
    [11, "Good morning"], [12, "Good afternoon"], [16, "Good afternoon"],
    [17, "Good evening"], [20, "Good evening"], [21, "Good night"],
    [23, "Good night"]
  ];
  for (const [hour, expected] of cases) {
    assert.equal(greetingForHour(hour), expected, `hour ${hour} should show ${expected}`);
  }
});

test("greeting refreshes while the app remains open and when the user returns to the tab", () => {
  assert.match(html, /setInterval\\(greet, 60_000\\)/);
  assert.match(html, /document\\.addEventListener\\("visibilitychange", \\(\\) => \\{ if \\(!document\\.hidden\\) greet\\(\\); \\}\\)/);
  assert.match(html, /window\\.addEventListener\\("focus", greet\\)/);
});
