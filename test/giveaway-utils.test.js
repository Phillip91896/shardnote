const test = require("node:test");
const assert = require("node:assert/strict");
const { DAY_MS, MAX_TIMER_DELAY_MS, GIVEAWAY_TEXTS, parseDuration, pickRandomWinners, timerDelayUntil, giveawayText, hasCompleteGiveawayTranslations } = require("../src/giveaway-utils");

test("parses supported durations and enforces the 30-day reminder cap", () => {
  assert.equal(parseDuration("10m"), 600000);
  assert.equal(parseDuration("2h"), 7200000);
  assert.equal(parseDuration("1d"), DAY_MS);
  assert.equal(parseDuration(" 3 s "), 3000);
  assert.equal(parseDuration("30d"), 30 * DAY_MS);
});

test("rejects invalid or unsafe duration formats", () => {
  for (const value of ["", "abc", "0s", "-2m", "2.5h", "31d", "999999999999999999d"]) assert.equal(parseDuration(value), null, String(value));
});

test("winner selection removes duplicate IDs and caps the winner count", () => {
  const winners = pickRandomWinners(["a", "b", "a", "c", ""], 20, (max) => max - 1);
  assert.deepEqual(winners, ["a", "b", "c"]);
  assert.equal(new Set(winners).size, winners.length);
});

test("winner selection is deterministic when a test random function is supplied", () => {
  assert.deepEqual(pickRandomWinners(["a", "b", "c"], 2, () => 0), ["b", "c"]);
  assert.deepEqual(pickRandomWinners(["a", "b"], 0), []);
});

test("timer delays are clamped and invalid dates fail safely", () => {
  assert.equal(timerDelayUntil(100000000000000, 0), MAX_TIMER_DELAY_MS);
  assert.equal(timerDelayUntil(500, 1000), 0);
  assert.equal(timerDelayUntil("invalid-date", 0), 0);
});

test("all 18 languages provide all giveaway messages", () => {
  assert.equal(hasCompleteGiveawayTranslations(), true);
  assert.equal(Object.keys(GIVEAWAY_TEXTS).length, 18);
  assert.equal(giveawayText("da", "title", { prize: "Test" }), "🎉 Giveaway: Test");
  assert.equal(giveawayText("zh", "title", { prize: "测试" }), "🎉 抽奖：测试");
});
