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
import { execFileSync } from "node:child_process";
import { sandboxGitEnv } from "./git-env.mjs";
import { REPO, ROOT, gh, git } from "./board-data.mjs";

const HOURS_MS = 3600_000;
const ISSUE = "20";
const SUMMARY_WORDS = 120;

/** Refused, but for a cause a person can act on tonight. */
const EXIT = { WILL_RENDER: 0, ACT_TONIGHT: 1, CANNOT_ASK: 2 };

/**
 * THE SUMMARY AS `origin/main` HAS IT — which is the only copy the 08:00 edition will ever see.
 *
 * `board-report.yml` checks out `ref: main` on a GitHub runner. A summary in somebody's working tree, or
 * on an unmerged branch, does not exist as far as the edition is concerned — and this check said *"the
 * 08:00 edition will render"* on the strength of the local file. **Correct about what it examined, and
 * examining the wrong copy**: a gate that does not exercise what ships, where the thing that ships is the
 * version on `origin/main`.
 *
 * It cost twice in one evening. A rewritten summary was committed locally and the push was refused three
 * times — a non-fast-forward, a worktree with no toolchain, and a real test failure — and each time this
 * check went on saying the edition would render. Separately a correction to a false achievement was
 * pushed to a branch while `origin/main` kept the false sentence, caught only because somebody ran
 * `git show origin/main:...` by hand.
 *
 * FETCHES FIRST, and that is not belt-and-braces. A remote-tracking ref is only as fresh as the last
 * fetch, so reading `origin/main` without one reproduces the identical defect one layer along: a
 * confident answer about a copy that has moved. Failing to fetch is INCONCLUSIVE rather than absent —
 * "I could not ask" and "it is not there" demand opposite responses, and only one of them is somebody's
 * fault.
 *
 * @param {string} day
 * @returns {{ text: string | null, asked: boolean, why: string }}
 */
function summaryOnOriginMain(day) {
  const ref = `origin/main:docs/board/summaries/${day}.md`;
  try {
    git(["fetch", "origin", "main", "--quiet"]);
  } catch (error) {
    return { text: null, asked: false, why: `could not fetch origin/main: ${String(error).slice(0, 120)}` };
  }
  try {
    // STDERR CAPTURED, not forwarded. `git show` on a path the ref does not carry writes
    // `fatal: path ... does not exist in 'origin/main'`, and `execFileSync` passes a child's stderr
    // through by default -- so the ORDINARY "no summary written yet" run printed a `fatal:` above its own
    // sentence. An expected state that prints a fatal error reads as a broken tool, and a tool that looks
    // broken on its normal path is one people stop believing. `sandboxGitEnv` is kept: an inherited
    // GIT_DIR would point this at another repository, which is the 2026-09-06 incident.
    const text = execFileSync("git", ["show", ref],
      { encoding: "utf8", cwd: ROOT, env: sandboxGitEnv(), stdio: ["ignore", "pipe", "pipe"] });
    return { text, asked: true, why: "read from origin/main" };
  } catch (error) {
    // `git show` fails the same way for "the ref has no such path" and for a broken repository. The first
    // is the finding; treating the second as the finding would report an unwritten summary on a machine
    // that simply could not look, so the message carries what git said rather than swallowing it.
    void error;
    return { text: null, asked: true, why: `no such path on origin/main (${ref})` };
  }
}

const wordsIn = (text) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * THE VERDICT, PURE — so the four states can be exercised without a network, a clock or a checkout.
 *
 * The IO is `summaryOnOriginMain` and `main`; everything decided here is a function of what those found.
 * That separation is what lets `board-summary-check.test.ts` drive the state this check exists for — a
 * summary present locally and absent from `origin/main` — which is otherwise reachable only by arranging
 * an unpushed commit at the moment the test runs.
 *
 * @param {{day: string, present: boolean, localText: string,
 *          remote: {text: string | null, asked: boolean, why: string}}} state
 * @returns {{code: number, message: string}}
 */
export function summaryVerdict({ day, present, localText, remote }) {
  if (!remote.asked) {
    return { code: EXIT.CANNOT_ASK,
      message: `CANNOT SAY whether the ${day} edition will render: ${remote.why}.\n`
        + "This is INCONCLUSIVE, not clear. The 08:00 job renders from `origin/main`, so a check that "
        + "could not read origin/main has not checked anything -- and reporting that as fine is how "
        + "'verified' comes to mean 'unexamined'. Re-run with a network, or read it by hand:\n"
        + `  git fetch origin main && git show origin/main:docs/board/summaries/${day}.md` };
  }

  const onMain = remote.text !== null && remote.text.trim().length > 0;
  if (onMain) {
    // THE LENGTH IS CHECKED HERE, NOT ONLY AT RENDER TIME, and the reason is a real trap. The render-time
    // gate reads TODAY's summary, so one written the evening before is the one nobody checks until the
    // morning it is due -- an over-length summary sits looking fine all night and refuses the edition at
    // 08:00, when nobody is awake to cut two words. Found by writing a 122-word summary and watching every
    // check pass. COUNTED ON THE REMOTE TEXT, because a local trim that was never pushed changes nothing.
    const words = wordsIn(/** @type {string} */ (remote.text));
    if (words > SUMMARY_WORDS) {
      return { code: EXIT.ACT_TONIGHT,
        message: `The summary for ${day} is ${words} words on origin/main, over the ${SUMMARY_WORDS}-word `
          + "cap.\nThe 08:00 edition will REFUSE it. Cut it now, while there is somebody awake to." };
    }
    // "IT IS ON MAIN" DOES NOT MEAN "WHAT YOU WROTE IS ON MAIN". The second 2026-09-06 incident was
    // exactly this: a correction pushed to a branch while origin/main kept the previous version. Both
    // files exist and both are non-empty, so only a comparison tells them apart.
    if (present && localText.trim() !== (remote.text ?? "").trim()) {
      return { code: EXIT.ACT_TONIGHT,
        message: `The ${day} summary on origin/main is NOT the one in your working tree `
          + `(${wordsIn(localText)} words local, ${words} on origin/main).\n`
          + "The 08:00 edition renders from origin/main, so it will publish the version you can see with:\n"
          + `  git show origin/main:docs/board/summaries/${day}.md\n`
          + "If your edit is the one that should ship, push it. If it is not, this is only a note." };
    }
    return { code: EXIT.WILL_RENDER,
      message: `summary for ${day} is on origin/main, ${words} words. The 08:00 edition will render.` };
  }

  // WRITTEN, AND NOT WHERE THE EDITION LOOKS. Its own refusal, because the remedy differs: the summary
  // exists and somebody has to PUSH it, which is not the same job as writing one.
  //
  // NO `--post` BRANCH FOR THIS STATE, deliberately, and it is not an omission. The 21:00 workflow checks
  // out `main` on a runner, so there the working tree IS origin/main and this state cannot arise --
  // handling it there would be code that can never run. It is a LOCAL finding for the person who wrote
  // the summary, which is exactly who needs it.
  if (present) {
    return { code: EXIT.ACT_TONIGHT,
      message: `The ${day} summary exists in your working tree and NOT on origin/main `
        + `(${wordsIn(localText)} words, unpushed).\n`
        + "The 08:00 edition renders from origin/main, so as things stand it will REFUSE and there will "
        + "be no edition. This is the state where somebody must act tonight: push it.\n"
        + "Measured 2026-09-06: a push was refused three times for three unrelated reasons and this check "
        + "went on reporting that the edition would render, because it was reading the local file." };
  }
  return { code: EXIT.ACT_TONIGHT, message: "" };
}

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

  const remote = summaryOnOriginMain(day);
  const verdict = summaryVerdict({
    day, present, localText: present ? readFileSync(file, "utf8") : "", remote,
  });
  if (verdict.message) {
    (verdict.code === EXIT.WILL_RENDER ? console.log : console.error)(verdict.message);
    process.exit(verdict.code);
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
