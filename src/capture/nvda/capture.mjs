// nvda-capture.mjs — NVDA browse-mode read-through capture.
// MUST run in the interactive desktop session (NVDA needs a real desktop).
import { nvda } from "@guidepup/guidepup";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const url = process.argv[2] || "https://example.com";
const outFile = process.argv[3] || "transcript.json";
const MAX_STEPS = Number(process.argv[4] || 150);

async function main() {
  console.log("launch Edge ->", url);
  spawn(
    "cmd",
    ["/c", "start", "", "msedge",
      "--no-first-run", "--no-default-browser-check", "--start-maximized",
      `--user-data-dir=${process.env.TEMP}\\edge-a11y`, "--new-window", url],
    { detached: true, stdio: "ignore" }
  );
  await sleep(12000); // cold start + page load + take foreground

  console.log("nvda.start()");
  await nvda.start();
  await sleep(3000);

  const transcript = [];
  // Capture the current (top) item first so the page's first heading isn't skipped.
  try {
    const first = ((await nvda.itemText()) || "").trim();
    if (first) transcript.push(first);
  } catch { /* itemText not critical */ }

  // Browse-mode read-through: "read next" repeatedly, the way a user arrows down.
  // Skip silence; stop once the same phrase repeats (reached the bottom).
  let last = null, dupes = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    await nvda.next();
    const phrase = ((await nvda.lastSpokenPhrase()) || "").trim();
    if (!phrase) continue;
    if (phrase === last) { if (++dupes >= 3) break; continue; }
    dupes = 0; last = phrase;
    transcript.push(phrase);
  }

  console.log("captured", transcript.length, "phrases; nvda.stop()");
  await nvda.stop();

  writeFileSync(outFile, JSON.stringify(
    { url, screenReader: "NVDA", capturedAt: new Date().toISOString(), transcript }, null, 2));
  console.log("WROTE", outFile);
}

main().catch((e) => { console.error("CAPTURE_ERROR", (e && e.stack) || e); process.exitCode = 1; });
