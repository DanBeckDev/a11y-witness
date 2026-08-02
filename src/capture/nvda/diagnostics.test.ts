// Parsing `tasklist` output decides what we believe is using the guest's memory — and that number is
// about to decide whether we build a custom Windows image. Worth being sure it is read correctly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTasklistMemory } from "./diagnostics.mjs";

// Real `tasklist /fo csv /nh` shape: image, pid, session name, session #, mem usage.
const CSV = [
  '"msedge.exe","6816","Console","1","512,340 K"',
  '"msedge.exe","6820","Console","1","300,100 K"',
  '"nvda.exe","4912","Console","1","102,400 K"',
  '"node.exe","3120","Console","1","51,200 K"',
].join("\r\n");

test("processes are grouped by image and summed, largest first", () => {
  // Chromium reports many processes under one name; the useful fact is the total, not any one of them.
  const top = parseTasklistMemory(CSV);
  assert.equal(top[0].name, "msedge.exe");
  assert.equal(top[0].count, 2);
  assert.equal(top[0].megabytes, 793, "512,340 K + 300,100 K = ~793 MB");
  assert.deepEqual(top.map((p) => p.name), ["msedge.exe", "nvda.exe", "node.exe"]);
});

test("the thousands-separated, K-suffixed memory column is read correctly", () => {
  // "102,400 K" is 100 MB. Reading it as 102400 MB or 102 MB would both look plausible in a report.
  assert.equal(parseTasklistMemory(CSV).find((p) => p.name === "nvda.exe")!.megabytes, 100);
});

test("the limit is honoured", () => {
  assert.equal(parseTasklistMemory(CSV, 2).length, 2);
});

test("junk lines are skipped rather than poisoning the totals", () => {
  const noisy = ['INFO: no tasks', '', '"bad.exe","1","Console","1"', CSV].join("\r\n");
  const top = parseTasklistMemory(noisy);
  assert.ok(!top.some((p) => p.name === "bad.exe"), "a row with no memory column is not a process");
  assert.equal(top[0].megabytes, 793, "valid rows still total correctly");
});

test("empty output is an empty list, not a crash", () => {
  assert.deepEqual(parseTasklistMemory(""), []);
});
