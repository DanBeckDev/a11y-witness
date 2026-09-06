#!/usr/bin/env node
// THE BOARD DOCUMENT — what the board reads. The GitHub edition is the data trail; this is the answer.
//
// It shares `board-data.mjs` with the daily GitHub edition rather than re-deriving anything, so the two
// cannot disagree about a merge count or a blocker list. That is not tidiness: the reports exist to stop
// numbers being read from the wrong place, and two generators with two data layers would reproduce that
// failure inside the reporting itself.
//
// THE TONE THIS DOCUMENT IS WRITTEN IN, recorded because it is a decision and not a style: the release
// was due last month and the board is reading every edition as the answer to "when". So section 1 leads,
// and A DATE IS NEVER STATED WITHOUT ITS REASON AND ITS CONFIDENCE. A bare date reads as a promise.
//
//   npm run board:document                 markdown to stdout
//   npm run board:document -- --pdf        render a PDF and print its path
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync, existsSync, realpathSync }
  from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";
import { collect, readSetIsNotMain, ROOT, REPO, MILESTONE, HOURS_MS, issues, achievementsWhoseWorldMoved} from "./board-data.mjs";
import { toHtml } from "./board-markdown.mjs";

// Module scope, not inside main(): `section5` reads it, and `document()` is exported for the renderer
// test, which builds a real document without ever calling main().
const THROUGHPUT = "Capture throughput";

/** How many WCAG criteria the tool claims what about, COUNTED FROM THE SOURCE OF TRUTH.
 *
 * Read out of `criterion-coverage.ts` at render time rather than typed, for the reason every other number
 * in this document is: a coverage claim that a person maintains by hand drifts from the code the first
 * time a criterion moves, and the drift is invisible -- both numbers look like numbers.
 *
 * It is a text count rather than an import on purpose. Importing the package would resolve through
 * `node_modules` to whichever checkout that symlink points at, which in a worktree is NOT this one -- the
 * defect that cost an hour on 2026-09-06. Reading the file beside us cannot do that.
 */
function criteriaCounts(root = ROOT) {
  const file = path.join(root, "packages/judge/src/criterion-coverage.ts");
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const count = (status) => (text.match(new RegExp(`status: "${status}"`, "g")) ?? []).length;
  const assessed = count("assessed");
  const partial = count("partial");
  return assessed && partial ? { assessed, partial, reachable: count("reachable") } : null;
}

const SUMMARY_WORDS = 120;
// TWO PAGES OF BODY, and the number is MEASURED rather than chosen.
//
// Edition 2 ran to 1,864 words across four pages of body and the chairman called it too long for a daily.
// The cap below is the two-page capacity of the page style set in this file, established by rendering:
// at 910 words the appendix begins on page 3, so sections one to five occupy pages 1 and 2 alongside the
// summary. 925 leaves a little room and is not a round number for the sake of one.
//
// IF THE PAGE CSS CHANGES, RE-MEASURE THIS. A cap carried over from a different typeface or margin is a
// number that no longer describes what it claims to.
export const BODY_WORD_CAP = 925;

/** The hand-written executive summary for a given day, or null.
 *
 * NEVER ASSEMBLED FROM THE SECTIONS. A summary generated from the body is precisely what the chairman's
 * third rule forbids, and it would also be useless: the summary exists to say what the sections cannot,
 * which is what a reader should do about them today. So it is a file a person writes, and its absence
 * stops the edition rather than degrading it.
 */
export function summaryFor(day, root = ROOT) {
  const file = path.join(root, "docs/board/summaries", `${day}.md`);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8").trim();
  return text ? { text, words: text.split(/\s+/).filter(Boolean).length, file } : null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];
/** "20 September 2026" -- a board reads dates, not timestamps. */
const longDate = (iso) => {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** ON TRACK / AT RISK / SLIPPED, from stated criteria rather than from a feeling.
 *
 * The rule is printed with the verdict every time. A status word whose derivation is not on the page is
 * an opinion wearing a measurement's clothes, which is the exact defect this reporting was built after.
 */
function trackStatus(release, open) {
  if (!release?.due_on) return { word: "has no date", why: "no date has been set." };
  const unbounded = open.filter((i) => i.milestone?.title === MILESTONE
    && /INCONCLUSIVE|hypothesis|unbounded|not yet known/i.test(i.title));
  const days = Math.ceil((Date.parse(release.due_on) - Date.now()) / (24 * HOURS_MS));
  if (days < 0) return { word: "has slipped", why: "the date has passed and work remains open." };
  if (unbounded.length > 0) {
    return { word: "is at risk", days, unbounded: unbounded.length };
  }
  return { word: "is on track", days, unbounded: 0 };
}

function section1(d) {
  const { word, days, unbounded } = trackStatus(d.release, d.open);
  const due = d.release?.due_on ? longDate(d.release.due_on) : "no date";
  const count = d.release?.open_issues ?? 0;
  return [
    `## The first public release is dated ${due} and ${word}.`,
    "",
    `${count} pieces of work must finish before we can publish, and ${days} days remain. `
    + `${unbounded > 0
      ? "One has no known size."
      : "Every one has a next step whose size we know."}`,
    "",
    "1. We set the date by adding up the remaining work, and every change to it is recorded — a slip "
    + "cannot arrive as a bare new date.",
    "2. **This carries most of the weight:** the date assumes the one item of unknown size finishes "
    + "inside the week we allowed, and this afternoon that week began resting on less.",
    "3. It is not padded against the risk most likely to move it, stated below.",
  ].join("\n");
}

function section2() {
  return [
    "## Version one has no date until the outside user is named.",
    "",
    "**Version one means one person outside this project runs the tool on an application they own and "
    + "says whether it was worth their time**, approved by the board on 6 September. **That person exists "
    + "and is waiting for first publish**, so the date is theirs: however long they take to form a view.",
    "",
    "| stage | what decides it | when |",
    "|---|---|---|",
    "| The trained component is approved | Four checks pass, and a fifth stops objecting that one rule "
    + "was never shown to work on a real website | days |",
    "| The real-website check reaches a verdict | A theory about two distrusted measurements is tested "
    + "| unknown |",
    "| The tool is published | A person creates the account, adds a credential, types the confirmation "
    + "| **20 September 2026** |",
    "| **Someone outside the project uses it** | **A person agrees to run it and reports back** | **not "
    + "schedulable from inside** |",
    "",
    "**That last row is the honest answer: version one waits on a person we do not yet have.**",
  ].join("\n");
}

function section3(d) {
  const L = ["## We made four things demonstrable today that were previously only claimed."];
  L.push("");
  if (d.achievements.length === 0) {
    L.push("Nothing was recorded for this period. That is a statement about our record-keeping and not "
      + "necessarily about the work: this section is written by hand, because no automated source can "
      + "tell you what the product can now do that it could not before. An empty section means nobody "
      + "wrote one.");
    return L.join("\n");
  }
  L.push("These are capabilities rather than activity, and the evidence for each is in the "
    + "appendix.");
  L.push("");
  for (const a of d.achievements) L.push(`- **${a.boardClaim ?? a.claim}**`);
  L.push("");

  return L.join("\n");
}

function section4(d) {
  const blockers = d.open.filter((i) => i.milestone?.title === MILESTONE);
  return [
    "## The board is asked for three decisions, and two of them cost nothing to make.",
    "",
    `None of the ${blockers.length} pieces of work between today and publication needs a board `
    + "decision. These three do.",
    "",
    "| decision | if nothing is decided |",
    "|---|---|",
    "| **Approve the definition of version one.** | The question the board keeps asking stays "
    + "unanswerable, and every edition repeats that. |",
    "| **Name one person outside the project to try the tool.** | Version one cannot start, whatever "
    + "engineering does. Open since August. |",
    "| **Confirm publication may proceed in September.** | Three final steps need the owner's hands, so "
    + "the engineering finishes and the release waits. |",
    "",
    "**One rule we assess can currently be seen only on some pages**, because a page that fails it hides "
    + "its own evidence from the path a user takes. **The check now says \"cannot say\" rather than "
    + "\"nothing found\"**, which is the difference between a gap and a clean bill of health. Widening "
    + "it is tracked work. The appendix says how the failure hid.",
    "",
    "### Four risks are live, and only the first could move the date.",
    "",
    "| risk | state |",
    "|---|---|",
    "| **We may abandon the change to the trained component rather than adjust it.** | Its abandonment conditions were written in advance so the decision could not be softened, and the assumption it rests on is being measured properly for the first time now. |",
    "| **One item still has no known size.** | We published a fix this morning, measured it wrong this "
    + "afternoon, and replaced it with a theory nobody has tested. The process working — and the week we "
    + "allowed now rests on less. |",
    "| **Everything runs on one machine.** | The capture machines' credentials live on one computer. "
    + "The list of open work moved off it today; the credentials have not. |",
  ].join("\n");
}

function section5(d) {
  const throughput = d.milestones.find((m) => m.title === THROUGHPUT);
  const fh = d.fleetHours;
  const L = ["## We are not asking for money, and the measurement that would justify asking is "
    + "scheduled.", ""];
  if (!fh || fh.status === "not instrumented") {
    L.push("**Machine time consumed by the capture fleet is not instrumented**, and the appendix says "
      + "so rather than estimating it.");
  } else {
    L.push(`**The capture machines consumed ${fh.total} on their most recent full run.** That counts `
      + "only time spent actively reading a page: not waiting between pages, setup, restarts or "
      + "electricity.");
  }
  L.push("");
  L.push("**A capture takes about a minute at median on our last sample**, and **we have not established "
    + "what it should cost on the current recording format** — the first of "
    + `${throughput?.open_issues ?? "several"} stages in a programme opened today, outside the release: `
    + "nothing in it delays September. The appendix lists them.");
  L.push("");
  L.push("**The architect's two findings are planned in; the appendix says what was done with each.**");
  L.push("");
  L.push("**The product has a name and a home: a11ign, at a11ign.com**, and the board has decided it is "
    + "an all-in-one accessibility tool rather than a screen-reader one — so its parts are renamed "
    + "around that **before** publication. The appendix says what that costs.");
  L.push("");
  L.push("### We recommend buying nothing yet, and one number would change that.");
  L.push("");
  L.push("**The number is how long one page takes to record with ten machines against five.** "
    + "Unchanged, and machines buy speed in proportion. Higher, and they do not — which is what happened "
    + "last time, on older hardware, where they competed for one disk.");

  return L.join("\n");
}

/** The source table: every figure the body states, with where it came from. */
function sourceTable(d) {
  const rows = [];
  const push = (what, value, source) => rows.push(`| ${what} | ${value} | ${source} |`);
  push("First public release, planned date", d.release?.due_on ? longDate(d.release.due_on) : "no date",
    "the project's issue tracker, on the release milestone; every change of this date is logged against "
    + "it (GitHub milestone `v0.1.0 — first publish`)");
  push("Pieces of work blocking that release",
    String(d.open.filter((i) => i.milestone?.title === MILESTONE).length),
    "the project's issue tracker (GitHub Issues API)");
  push("Open work items in total", String(d.open.length), "the project's issue tracker");
  push("Work items closed in this period", String(d.closed.length), "the project's issue tracker");
  push("Saved changes merged in this period", String(d.merges.length),
    "the project's own version history, over the stated window — two correct counts over different "
    + `windows read as a disagreement, so the window is named (\`git log main --merges --since=${d.since}\`)`);
  push("Unpublished local changes",
    d.unpushed === null ? "could not be compared" : `${d.unpushed} change(s)`,
    "compared directly against the published copy, checked rather than assumed "
    + "(`git rev-list --count origin/main..main`)");
  push("Changes carrying the wrong author", String(d.strays.length),
    `the project's own version history, over the SAME window as the merge count above (since `
    + `${d.since}); the cause is diagnosed and the record is kept by decision`);
  push("Most recent automated check result",
    d.latestGate ? `${d.latestGate.command}${d.gateIsFresh ? "" : " — older than this report's window"}`
      : "**not reported**",
    d.latestGate
      ? `run by the engineer who owns the machines at ${d.latestGate.at}, output recorded word for word`
      : "no result has been recorded. This report does not run these checks itself: they read a library "
        + "of recordings, and a local copy of that library is only as current as its last synchronisation "
        + "— one measured here was 89 hours old and answered cleanly having examined a library that no "
        + "longer existed");
  push("Machine time consumed by the capture fleet",
    d.fleetHours?.status === "not instrumented" ? "**not instrumented**" : String(d.fleetHours.total),
    d.fleetHours?.status === "not instrumented"
      ? "printed rather than estimated. The report refuses a total that cannot name the finished run it "
        + "came from, so no figure appears until one does"
      : `measured from ${d.fleetHours.run}`);
  push("Version one, planned date", "**none — version one is undefined**",
    "the project's planning documents, all checked; a definition is proposed in section 2 for approval "
    + "(`PLAN.md`, `README.md`, `docs/backlog.md`)");

  return rows;
}

/** What the rename costs, and why the naming rule is more than a coat of paint. */
function renameBackground(L) {
  const counts = criteriaCounts();
  if (counts) {
    L.push("### What the tool claims about how many accessibility rules, and the one it withdrew.");
    L.push("");
    L.push(`Counted from the source rather than maintained by hand: **${counts.assessed} rules it `
      + `assesses**, **${counts.partial} it assesses in part**, and **${counts.reachable} it could reach `
      + "and does not yet.**");
    L.push("");
    L.push("**None of those numbers moved today, and one nearly did.** Content on hover or focus is "
      + "claimed as partly assessed. Downgrading it to *reachable* was ruled and then **refused by our "
      + "own coverage test**: the rule still produces findings, and calling it unassessed would document "
      + "a criterion we report on as one we do not. **Partial is true as written**, and it stays.");
    L.push("");
    L.push("**What changed is what the check says when it cannot see.** A page that FAILS this rule "
      + "leaves its panel open, so the check compared a changed page against a changed page and found no "
      + "change. **On a page that passes, the same check is correct** — which is why it read as working "
      + "for exactly as long as it was only ever asked about pages that pass. It now speaks only from a "
      + "baseline it trusts and is silent otherwise, so the claim is narrower than it looked and true. "
      + "Widening it is tracked work.");
    L.push("");
  }

  L.push("### Commit authorship, disclosed rather than listed as a risk.");
  L.push("");
  L.push("An automated test overwrote our identity settings, so some saved changes carry the wrong "
    + "author's name — the count and its window are in the table above. **The settings are fixed; the "
    + "record is not**, and we leave it rather than rewrite history other people are building on. It is "
    + "here rather than among the risks because it changes no decision: it is disclosed so that nobody "
    + "discovers it and wonders what else was not mentioned.");
  L.push("");

  L.push("### The rename, and what it costs to do it before publication rather than after.");
  L.push("");
  L.push("Three hundred and fifty-two files in the project mention the old name, and every one of the "
    + "six things we will publish changes its name. **Doing it now costs a fortnight's care; doing it "
    + "after publication would cost every person who had already installed it** — and there is nobody in "
    + "that position yet, which is exactly why now is the moment.");
  L.push("");
  L.push("**The naming rule is what makes it worth more than a coat of paint.** A part that produces one "
    + "kind of evidence carries that in its name; a part belonging to the product itself never does. So "
    + "the screen-reader pieces say so, and the pieces that would serve any future kind of checking do "
    + "not. A second kind of checking can then join without a second rename, which is the debt this "
    + "avoids.");
  L.push("");
}

/** Why re-reading the library is expensive, and the programme opened for it. */
function throughputBackground(L) {
  renameBackground(L);
  L.push("### The architect's two findings, and what was done with each.");
  L.push("");
  L.push("**Our development copies read one another's build output rather than their own**, because they "
    + "share one dependency folder between them — so building in your own copy changes nothing the tools "
    + "see, which cost an engineer an hour convinced a component was broken when it was faithfully using "
    + "two-hour-old code. The fix is a different dependency tool that gives each copy its own; it is "
    + "**scheduled for after publication**, because that tool sits on the publishing path and changing it "
    + "a fortnight before the one irreversible step is the wrong order.");
  L.push("");
  L.push("**What accumulates on the single machine we run everything from is now measured rather than "
    + "guessed at** — thirty-six working copies, 4.4 gigabytes of them, a gigabyte of Python "
    + "environments, and a 417-megabyte local copy of the test library. **Each now gets a rule or a "
    + "recorded decision that it needs none**, rather than a clear-out that decays: the one accumulator "
    + "that was given a rule today is the one that stopped growing.");
  L.push("");
  L.push("### Why re-reading every test page is expensive, and the programme opened for it.");
  L.push("");
  L.push("The tool learns from several thousand recordings of a screen reader reading web pages. "
    + "Changing anything that alters what those recordings contain means making them all again, which "
    + "costs hours of machine time — and that is why a list of improvements sits deferred. The five "
    + "stages are: establish what a page should cost to record on the current format; measure what more "
    + "machines actually give us; set a target from that; make the improvements; and decide on hardware "
    + "with the numbers attached.");
  L.push("");
  L.push("### Why the capacity measure is not instrumented yet, and what the first design got wrong.");
  L.push("");
  L.push("The measure is the gap between a session finishing a piece of work and being given the next. "
    + "The first design keyed it on who a row was assigned to — and **every session in this project "
    + "operates as the same account**, of which there are two assignable and nine sessions. It could "
    + "have recorded *assigned* and never *which*, accruing a week of data that could not answer the "
    + "question it was collected for. It now keys on a per-session label instead, which carries "
    + "attribution and timing in one mechanism.");
  L.push("");
  L.push("**One thing that will distort the first week, recorded now so it cannot be read as progress:** "
    + "the rule for taking the next piece of work changed today, from taking it after reporting to "
    + "taking it before. The measured gap becomes structurally smaller from that moment. A first week "
    + "spanning the change will show an improvement that is a definition change rather than anyone "
    + "waiting less.");
  L.push("");
  L.push("**WITHDRAWN: a figure this board was given yesterday.** Yesterday's edition said our own "
    + "documentation claimed 12.4 seconds to record a page while measurement showed 48.7 — a fourfold "
    + "gap presented as the thing to explain. **Checked on 6 September against everything on disk, it "
    + "cannot be derived.** No document in the project produces 48.7, and the 12.4 comes from three "
    + "retired machines under an older recording format, measured as a median where the other number is "
    + "a rate. Three different things compared as one ratio. There is no fourfold gap, and the stage that "
    + "was to explain it is now the stage that establishes what a page should cost.");
  L.push("");
  L.push("**What the same check did establish, on the sample it could read:** the four costliest steps "
    + "in recording a page are all the screen reader answering, and everything our own software controls "
    + "sums to under two and a half seconds. If that holds on the current machines, faster software is "
    + "not the lever.");
  L.push("");
  L.push("**One figure to discard if the board has heard it: twelve format changes in thirty-two days "
    + "is not twelve re-readings of the library.** Five of those versions produced almost no recordings "
    + "at all, and grouping changes together is already done deliberately. We are measuring the true "
    + "rate and expect it several times lower.");
  L.push("");
}

function appendix(d) {
  const L = [
    "## Appendix: every figure above, and where it came from.",
    "",
    "**No number in this report is estimated.** Where something is not measured it says so, in those "
    + "words. That discipline exists because this project's own record is a catalogue of correct values "
    + "read from the wrong place, and today alone produced three more: a figure quoted from a summary "
    + "note while the real measurement sat on disk, an example number invented for a test that was then "
    + "copied into documentation, and a proposed fix inferred from an error message without checking "
    + "whether the cause it named existed. All three were caught by asking where a number came from, "
    + "never by asking whether it looked right.",
    "",
    "| | | source |",
    "|---|---|---|",
    ...sourceTable(d),
    "",
  ];
  throughputBackground(L);
  if (d.achievements.length > 0) {
    L.push("### Evidence for each capability claimed in section 3.");
    L.push("");
    for (const a of d.achievements) {
      L.push(`**${a.boardClaim ?? a.claim}**`);
      L.push("");
      L.push(`> ${a.evidence}`);
      L.push("");
    }
  }
  L.push(`*Generated from the project's issue tracker and version history at `
    + `${new Date().toISOString()}. A daily engineering edition carrying the same figures is published `
    + "alongside this document and shares its data source, so the two cannot disagree.*");
  return L.join("\n");
}

export function document(d, summary) {
  return [
    `# a11y-witness — board report, ${longDate(new Date().toISOString())}`,
    "",
    "*a11y-witness drives a real screen reader through real navigation to assess the accessibility "
    + "failures that automated scanners structurally cannot reach. Nothing is published yet.*",
    "",
    ...(summary ? ["## Executive summary", "", summary.text, ""] : []),
    section1(d), "", section2(d), "", section3(d), "", section4(d), "", section5(d), "", appendix(d),
  ].join("\n");
}

const PAGE_CSS = `
  /* TYPOGRAPHY IS WHERE THE TWO-PAGE BODY IS PAID FOR, not content.
     The body reached 910 words with every repetition removed and all evidence moved to the appendix;
     the next cut would have been a risk or a number, which the chairman's rules forbid. So the page is
     set tighter instead: 14mm margins and 10pt/1.42 rather than 18mm and 10.5pt/1.5. Still comfortably
     readable in print, and it buys roughly a third of a page. */
  @page { size: A4; margin: 14mm 14mm 13mm; }
  body { font: 10pt/1.42 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #16191d; }
  h1 { font-size: 20pt; margin: 0 0 2mm; letter-spacing: -0.01em; }
  h1 + p em, h1 + p { color: #5a6472; font-size: 9.5pt; margin: 0 0 6mm; }
  h2 { font-size: 12.5pt; margin: 6.5mm 0 2mm; padding-top: 2mm; border-top: 1.5px solid #16191d;
       break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 4mm 0 1.5mm; break-after: avoid; }
  p, li { margin: 0 0 2mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 5mm; }
  strong { font-weight: 650; }
  table { border-collapse: collapse; width: 100%; margin: 2mm 0 4mm; font-size: 9pt;
          break-inside: avoid; }
  th { text-align: left; border-bottom: 1.2px solid #16191d; padding: 1.3mm 2mm; vertical-align: top; }
  td { border-bottom: 0.4px solid #ccd2da; padding: 1.3mm 2mm; vertical-align: top; }
  code { font: 9pt/1.4 ui-monospace, "SF Mono", Menlo, monospace; background: #f1f3f6;
         padding: 0.3mm 1mm; border-radius: 2px; }
  pre { background: #f1f3f6; padding: 2.5mm 3mm; border-radius: 3px; overflow-x: auto;
        break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: 8.5pt; }
  blockquote { margin: 0 0 3mm; padding: 0 0 0 4mm; border-left: 2px solid #c3cad4; color: #3d4552;
               font-size: 9.5pt; }
  a { color: #16191d; }
  hr { border: 0; border-top: 0.4px solid #ccd2da; margin: 5mm 0; }
`;

// NOTHING RUNS ON IMPORT -- see the note in `board-report.mjs`. `document()` stays exported above
// so the renderer test can build a real document without rendering a PDF or touching GitHub.
/** THE SUMMARY GATES THE EDITION, and a missing one is a MISSING EDITION rather than a summary-less
 * document. A summary assembled from the sections below it is precisely what the chairman's third rule
 * forbids, so there is no fallback to generate one -- the only way to publish is for a person to have
 * written it. Returns the summary, or exits.
 */
function requireSummary(publishing) {
  const today = new Date().toISOString().slice(0, 10);
  const summary = summaryFor(today);
  if (publishing && !summary) {
    console.error(`REFUSING to render: no executive summary for ${today}.\n\n`
      + `Write at most ${SUMMARY_WORDS} words in docs/board/summaries/${today}.md, answering three `
      + "things: are we on the date, what changed since yesterday, what must the board decide today.\n"
      + "It is written by hand, per edition, and is NOT assembled from the sections below it -- a "
      + "machine-written summary is the thing the chairman's rules forbid.\n"
      + "Nothing was written. A missing summary is a missing edition.");
    process.exit(5);
  }
  if (summary && summary.words > SUMMARY_WORDS) {
    console.error(`REFUSING to render: the summary for ${today} is ${summary.words} words, over the `
      + `${SUMMARY_WORDS}-word cap. Cut it; that cap is what makes it a summary.`);
    process.exit(5);
  }
  return summary;
}

/**
 * REFUSE, DO NOT WARN, and the reason is the render itself: this document is produced at 08:00
 * unattended. A warning in a log nobody reads is exactly how the false sentence would have shipped —
 * which it nearly did (#90), and was caught only because a person happened to re-read it.
 *
 * The refusal names the entry, its claim and what moved, so re-affirming is a ten-second act rather than
 * an investigation. `--allow-dirty-read-set` deliberately does NOT override it: that flag is about which
 * COPY of the read set is quoted, and this is about whether a quoted sentence still describes the world.
 */
function refuseIfTheWorldMoved(achievements) {
  const cited = achievements.map((a) => a.issue).filter((n) => n !== undefined);
  if (!cited.length) return;
  const issueState = Object.fromEntries(issues().map((i) => [String(i.number), i.state]));
  const moved = achievementsWhoseWorldMoved({ achievements, issueState });
  if (!moved.length) return;

  console.error(`REFUSING to render: ${moved.length} achievement(s) in docs/board/reported.json have `
    + "outlived what they were written against. Section 3 is the one part of this document no gate "
    + "computes, so it is also the one nothing re-checks -- and an entry that is true when written stays "
    + "in the file after it stops being true.\n");
  for (const { index, claim, why } of moved) {
    console.error(`  achievements[${index}]  ${claim}\n      ${why}\n`);
  }
  console.error("This does NOT say the claims are false -- it says nobody has looked since the world "
    + "moved. Re-affirm an entry with an `affirmed` field saying why it still stands, or retire it.");
  process.exit(1);
}

function main() {
  refuseUnknownFlags(["--pdf", "--since", "--out", "--allow-dirty-read-set", "--release"],
    { entry: import.meta.url, command: "npm run board:document" });

  const argv = process.argv.slice(2);
  const flagOf = (n) => argv.find((a) => a.startsWith(`${n}=`))?.split("=").slice(1).join("=");

  const summary = requireSummary(argv.includes("--pdf") || argv.includes("--release"));
  const d = collect(flagOf("--since") ?? new Date(Date.now() - 24 * HOURS_MS).toISOString());
  refuseIfTheWorldMoved(d.achievements);
  const md = document(d, summary);

  if (!argv.includes("--pdf")) {
    process.stdout.write(md + "\n");
  } else {
    // THE SAME REFUSAL AS THE GITHUB EDITION. A PDF that reaches the board is harder to retract than a
    // comment, so the read set must be `main`'s or nothing is rendered.
    const dirt = argv.includes("--allow-dirty-read-set") ? null : readSetIsNotMain();
    if (dirt) {
      console.error("REFUSING to render: the files this document reads out of the working tree are not "
        + "`main`'s, so the PDF would carry something nobody has reviewed.\n\n" + dirt
        + "\n\nNothing was written. Commit and merge the read set, or pass --allow-dirty-read-set, which "
        + "renders and stamps the document with the fact.");
      process.exit(3);
    }
    const stamped = argv.includes("--allow-dirty-read-set") && readSetIsNotMain()
      ? md + "\n\n---\n\n*Rendered with `--allow-dirty-read-set`: the files this edition reads out of the "
        + "working tree are not `main`'s, so the gate line and the fleet-hours line may quote something "
        + "unreviewed. Stated here rather than left for a reader to discover.*"
      : md;

    // WHERE THE CHAIRMAN LOOKS, which is the only requirement this path has.
    //
    // It was `~/Library/Logs/a11y-witness`, beside the scheduled job's log, on the reasoning that a
    // LaunchAgent's output belongs there on macOS. That reasoning was about the LOG. A board document is
    // not a log -- it is a deliverable a person opens, and a deliverable filed where its reader does not
    // look has not been delivered. So: `~/Documents/a11y-witness-board-reports/`, one file per date. The
    // log stays in `~/Library/Logs/a11y-witness/`, where the original reasoning does still hold.
    //
    // NOT in the repository, and deliberately: `runs/` is shared -- often a symlink to the corpus tree --
    // and a guard is landing that makes every `runs/` writer askable, so a PDF written every morning
    // would be a writer nobody remembered when that guard was designed.
    const outDir = flagOf("--out")
      ?? path.join(process.env.HOME ?? ROOT, "Documents", "a11y-witness-board-reports");
    mkdirSync(outDir, { recursive: true });
    const stem = `a11y-witness-board-${new Date().toISOString().slice(0, 10)}`;
    // THE INTERMEDIATE HTML DOES NOT GO WHERE THE CHAIRMAN LOOKS. It is Chrome's input, not a
    // deliverable, and "one file per date" means one file: a folder holding two files per day, one of
    // which opens as unstyled markup, is a folder somebody has to learn to read past.
    const html = path.join(mkdtempSync(path.join(tmpdir(), "board-")), `${stem}.html`);
    const pdf = path.join(outDir, `${stem}.pdf`);
    writeFileSync(html, `<!doctype html><meta charset="utf-8"><title>${stem}</title>`
      + `<style>${PAGE_CSS}</style>${toHtml(stamped)}`);

    // HEADLESS CHROME, not pandoc or a PDF library. Chrome is already on this machine because the capture
    // fleet needs a Chromium; pandoc is not installed and would make the board's daily document depend on
    // an operator running `brew install`. A dependency the board's report cannot be produced without is a
    // worse risk than a slightly plainer typeface.
    const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    execFileSync(chrome, ["--headless", "--disable-gpu", "--no-pdf-header-footer",
      `--print-to-pdf=${pdf}`, `file://${html}`], { stdio: "pipe" });
    process.stdout.write(`${pdf}\n`);

    if (argv.includes("--release")) publishToDraftRelease(pdf);
  }

  /** Deliver the PDF as an asset on a DRAFT GitHub Release, which is one click from the Releases tab.
   *
   * A draft release was chosen over attaching to the report issue because GitHub's API cannot attach a file
   * to an issue comment at all -- that is a web-UI drag-and-drop, so a daily automated attachment is
   * impossible, not merely awkward.
   *
   * THE TAG IS NAMESPACED `board/<date>` AND THE RELEASE STAYS A DRAFT, both deliberately. A draft creates
   * no git tag until it is published, so nothing here can be mistaken for a product version or picked up by
   * the changesets machinery -- which matters in a repo whose first npm publish has not happened yet and
   * whose release workflow reads tags.
   */
}

function publishToDraftRelease(pdf) {
  const tag = `board/${new Date().toISOString().slice(0, 10)}`;
  const title = `Board report — ${new Date().toISOString().slice(0, 10)}`;
  const notes = "The daily board document. Generated from GitHub and git; every figure carries its "
    + "source, and anything unmeasured says so rather than being estimated. The GitHub issue edition is "
    + "the data trail.";
  const exists = (() => {
    try {
      const raw = execFileSync("gh", ["release", "view", tag, "--repo", REPO, "--json", "isDraft"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      return JSON.parse(raw);
    } catch { return null; }
  })();

  if (!exists) {
    execFileSync("gh", ["release", "create", tag, pdf, "--repo", REPO, "--draft",
      "--title", title, "--notes", notes], { stdio: "pipe" });
  } else if (!exists.isDraft) {
    // REFUSE rather than overwrite. A published release is visible to everyone with the repository; a
    // re-render replacing its asset would change what somebody has already been sent, silently.
    console.error(`REFUSING to replace assets on ${tag}: it is PUBLISHED, not a draft. A re-render would `
      + "change a document somebody has already been given. Render with --out and deliver by hand, or "
      + "cut a new tag.");
    process.exitCode = 4;
    return;
  } else {
    execFileSync("gh", ["release", "upload", tag, pdf, "--repo", REPO, "--clobber"], { stdio: "pipe" });
  }
  process.stdout.write(`https://github.com/${REPO}/releases/tag/${encodeURIComponent(tag)} (draft)\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
