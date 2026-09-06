#!/usr/bin/env node
// THE 21:00 CHECK: is tomorrow's executive summary written?
//
// The 08:00 job refuses an edition with no hand-written summary for that day, which is correct and was
// approved -- a summary a machine wrote is the thing the board explicitly forbade. But a refusal at 08:00
// is a missing edition discovered at 08:00, by nobody, in a log. This puts the same gap in front of a
// person ELEVEN HOURS EARLIER, on the tracker the board already reads.
//
// IT GENERATES NO SUMMARY TEXT, and that is the whole point. It reports an absence; it does not fill one.
// The moment this script writes a sentence of summary, it has become the machine-written summary that the
// gate exists to prevent, arriving through the warning instead of through the document.
//
//   npm run board:summary-check            say whether tomorrow's summary exists
//   npm run board:summary-check -- --post  and comment on the report issue if it does not
import { existsSync, readFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";
import { REPO, ROOT, gh } from "./board-data.mjs";

const HOURS_MS = 3600_000;
const ISSUE = "20";
const SUMMARY_WORDS = 120;

/** The date the NEXT 08:00 edition will render for. */
function nextEditionDay(now = new Date()) {
  return new Date(now.getTime() + 24 * HOURS_MS).toISOString().slice(0, 10);
}

function main() {
  refuseUnknownFlags(["--post", "--issue", "--day"],
    { entry: import.meta.url, command: "npm run board:summary-check" });
  const argv = process.argv.slice(2);
  const flag = (n) => argv.find((a) => a.startsWith(`${n}=`))?.split("=").slice(1).join("=");

  const day = flag("--day") ?? nextEditionDay();
  const file = path.join(ROOT, "docs/board/summaries", `${day}.md`);
  const present = existsSync(file) && readFileSync(file, "utf8").trim().length > 0;

  if (present) {
    // THE LENGTH IS CHECKED HERE, NOT ONLY AT RENDER TIME, and the reason is a real trap.
    //
    // The render-time gate reads TODAY's summary. A summary written the evening before is therefore the
    // one nobody checks until the morning it is due -- so an over-length one sits looking fine all night
    // and refuses the edition at 08:00, when nobody is awake to cut two words. Found by writing a
    // 122-word summary and watching every check pass.
    const words = readFileSync(file, "utf8").trim().split(/\s+/).filter(Boolean).length;
    if (words > SUMMARY_WORDS) {
      console.error(`The summary for ${day} is ${words} words, over the ${SUMMARY_WORDS}-word cap.\n`
        + "The 08:00 edition will REFUSE it. Cut it now, while there is somebody awake to.");
      process.exit(1);
    }
    console.log(`summary for ${day} is written, ${words} words. The 08:00 edition will render.`);
    process.exit(0);
  }

  console.error(`NO SUMMARY FOR ${day}. The 08:00 edition will REFUSE and there will be no edition.\n`
    + `Write at most 120 words in docs/board/summaries/${day}.md, answering three things: are we on the `
    + "date, what changed since yesterday, what must the board decide today.\n"
    + "Do not restate a count the document computes -- it goes stale between writing this and rendering.");

  if (!argv.includes("--post")) process.exit(1);

  // ONE COMMENT PER DAY, not one per run. A warning that repeats is a warning people filter.
  const marker = `no summary for ${day}`;
  const issue = flag("--issue") ?? ISSUE;
  const existing = gh(["issue", "view", issue, "--repo", REPO, "--json", "comments",
    "--jq", ".comments[].body"]);
  if (existing.includes(marker)) {
    console.error("(already reported for this date; not commenting again)");
    process.exit(1);
  }
  gh(["issue", "comment", issue, "--repo", REPO, "--body",
    `**There is ${marker} (${day}), so tomorrow's 08:00 edition will refuse and no document will be `
    + "published.**\n\nThe summary is written by hand, by design: a summary a machine assembled from the "
    + "sections below it is what the board explicitly forbade, so there is no fallback and this warning "
    + "does not write one. It reports the absence eleven hours early so a person can close it.\n\n"
    + `Write at most 120 words in \`docs/board/summaries/${day}.md\`, answering: are we on the date, what `
    + "changed since yesterday, what must the board decide today. **Do not restate a count the document "
    + "computes** — it goes stale between writing the summary and rendering the edition, which happened "
    + "on the first day.\n\n*Posted automatically at 21:00 by the summary check. It generates no summary "
    + "text.*"]);
  console.error(`reported on https://github.com/${REPO}/issues/${issue}`);
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
