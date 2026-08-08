import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("pilot is read-only by default and requires two independent switches", () => {
  const source = read("lib/pilot-mode.ts");
  assert.match(source, /PILOT_READ_ONLY === "false"/);
  assert.match(source, /PILOT_EXTERNAL_WRITES === WRITE_UNLOCK/);
  assert.match(source, /ALLOW_PILOT_EXTERNAL_WRITES/);
});

test("all material external write connectors use the pilot guard", () => {
  const expected = [
    ["lib/intervals.ts", "intervals.create_workout"],
    ["lib/intervals.ts", "intervals.delete_workout"],
    ["lib/intervals.ts", "intervals.register_webhook"],
    ["lib/trainingpeaks.ts", "trainingpeaks.create_workout"],
    ["lib/trainingpeaks.ts", "trainingpeaks.delete_workout"],
    ["lib/whatsapp.ts", "whatsapp.send"],
    ["app/api/intervals/update-ftp/route.ts", "intervals.update_ftp"],
  ];
  for (const [path, operation] of expected) {
    assert.match(read(path), new RegExp(`requirePilotExternalWrites\\(\"${operation.replaceAll(".", "\\.")}\"\\)`), path);
  }
});

test("direct Zwift upload is disabled; pilot writes flow through Intervals.icu", () => {
  const source = read("app/api/zwift/push-workout/route.ts");
  assert.match(source, /Direct Zwift upload disabled/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /accessToken/);
});

test("the planner selects exactly the latest 30 activities", () => {
  assert.match(read("lib/plan-runner.ts"), /selectChartActivities\(activities, 30\)/);
});

test("the pilot cannot fall back to the production URL or scheduled crons", () => {
  assert.doesNotMatch(read("lib/plan-runner.ts"), /zwift-delta\.vercel\.app/);
  assert.deepEqual(JSON.parse(read("vercel.json")), {});
});

test("debug endpoint never returns credential prefixes", () => {
  const source = read("app/api/debug/icu-state/route.ts");
  assert.match(source, /Debug endpoint disabled in pilot/);
  assert.doesNotMatch(source, /starts with/);
  assert.doesNotMatch(source, /\.slice\(0, 20\)/);
  assert.doesNotMatch(source, /decryptSession|kvGet|cookies/);
});

test("raw ICU credential read-back is disabled", () => {
  const source = read("app/api/admin/reveal-icu-key/route.ts");
  assert.match(source, /Credential read-back is disabled/);
  assert.doesNotMatch(source, /getIntervalsCredentials/);
  assert.doesNotMatch(source, /icuKey:/);
});
