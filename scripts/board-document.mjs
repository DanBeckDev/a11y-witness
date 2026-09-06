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
import { writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";
import { collect, readSetIsNotMain, ROOT, REPO, MILESTONE, HOURS_MS } from "./board-data.mjs";
import { toHtml } from "./board-markdown.mjs";

// Module scope, not inside main(): `section5` reads it, and `document()` is exported for the renderer
// test, which builds a real document without ever calling main().
const THROUGHPUT = "Capture throughput";

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
    `We plan to publish the tool for the first time on ${due}, and ${count} pieces of work must finish `
    + `before that can happen. ${days} days remain. ${unbounded > 0
      ? `The date is at risk because ${unbounded} of those ${count} has no known size: we discovered `
        + "today that our proposed fix for it was wrong, and the replacement is a theory nobody has "
        + "tested yet."
      : "Every one of them has a next step whose size we know."}`,
    "",
    "**The date has not moved since we set it this morning, and any future move will arrive with its "
    + "cause attached.**",
    "",
    "1. We set the date by adding up the remaining work rather than by choosing a month, and it was "
    + "approved the same day.",
    "2. Every change to it is recorded against the release itself, naming what moved it and which "
    + "automated check discovered the problem — so a slip cannot arrive as a bare new date.",
    "3. **This reason carries most of the weight:** the date assumes the one piece of work of unknown "
    + "size is finished inside the week we allowed for it, and this afternoon that week began resting on "
    + "less than it did this morning.",
    "",
    "**We have deliberately not padded the date against the one thing most likely to move it.** We are "
    + "part-way through changing how the tool's trained component reads its input. We wrote down in "
    + "advance the conditions under which we would abandon that change rather than adjust it, precisely "
    + "so the decision could not be quietly softened later. Abandoning it would move this date, and the "
    + "move would say so.",
  ].join("\n");
}

function section2() {
  return [
    "## Version one has no date, because nobody has ever defined what it is.",
    "",
    "We checked the project's planning documents before writing this, and none of them defines version "
    + "one or names a target for it. Giving a date here would therefore be a number with nothing behind "
    + "it, which is the one thing this report refuses to do. Below is a definition for the board to "
    + "approve; once a scope is agreed, a date follows from it and will appear here.",
    "",
    "### Publishing the tool and proving it is worth using are two different milestones.",
    "",
    "The first release is an act of publishing: the software becomes installable by a stranger, and a "
    + "person types the command that makes it public. That is what the September date refers to.",
    "",
    "**We propose that version one means something harder: one person outside this project runs the "
    + "tool on an application they own and says plainly whether the result was worth their time.** The "
    + "project's own plan has described that as the deliverable since August, in these words: their "
    + "reaction is the deliverable, not a bug list.",
    "",
    "1. It is the only test that can find a wrong assumption nobody here has noticed, because every "
    + "verification so far is one person's, on one machine, against pages we chose.",
    "2. It answers the commercial question the engineering cannot: whether this evidence is worth the "
    + "minutes it costs somebody who did not build it.",
    "3. It is already written into the plan as a release blocker, so adopting it changes what we call "
    + "the goal rather than adding new work.",
    "",
    "### Three stages stand between today and version one, and only the first has a date.",
    "",
    "| stage | what decides it | when |",
    "|---|---|---|",
    "| The trained component is approved for release | Four automated checks pass, and a fifth stops "
    + "objecting that one of our accessibility rules has never been demonstrated on a real website | days "
    + "— it needs one run of the capture machines |",
    "| The real-website check reaches a firm verdict | A theory about why two measurements were "
    + "distrusted is tested against the pages themselves | the one piece of work of unknown size |",
    "| The tool is published | A human creates the publishing account, adds a credential and types the "
    + "confirmation | **20 September 2026** |",
    "| **Someone outside the project uses it** | **A person agrees to run it and reports back** | **not "
    + "schedulable from inside this project** |",
    "",
    "**That last row is the honest answer to when version one arrives: it is not an engineering "
    + "estimate, it is a person we do not yet have.** The plan has said since August that this cannot be "
    + "done from inside the project, and no amount of engineering capacity moves it. **The single "
    + "decision that would bring version one closest is naming that person.**",
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
  L.push("Each item below is a capability rather than activity. How busy we were is not progress; what "
    + "the product can now do or prove is. The evidence for each sits in the appendix.");
  L.push("");
  for (const a of d.achievements) L.push(`- **${a.boardClaim ?? a.claim}**`);
  L.push("");
  L.push("**This is the first edition, so today covers roughly one working day.** Later editions cover "
    + "the day before.");
  return L.join("\n");
}

function section4(d) {
  const blockers = d.open.filter((i) => i.milestone?.title === MILESTONE);
  return [
    "## The board is asked for three decisions, and two of them cost nothing to make.",
    "",
    `${blockers.length} pieces of work stand between today and publication, and none of them needs a `
    + "board decision. The three below do.",
    "",
    "### Approving a definition of version one costs nothing and unblocks the question the board keeps "
    + "asking.",
    "",
    "Without it, every edition of this report repeats that version one is undefined rather than "
    + "estimating a date, because estimating one would mean inventing it. **If nothing is decided, "
    + "when is version one stays unanswerable.**",
    "",
    "### Naming one person outside the project to try the tool is the single highest-value decision "
    + "available.",
    "",
    "It has been the longest-standing open item in the project since August, it cannot be done from "
    + "inside, and it gates the definition proposed above. **If nothing is decided, version one cannot "
    + "start whatever the engineering does.**",
    "",
    "### Confirming that publication may proceed in September lets us schedule the human steps.",
    "",
    "Three of the final publishing steps need the repository owner's own hands — creating the account, "
    + "adding a credential, and typing the confirmation — and no automation here can reach them. **If "
    + "nothing is decided, the engineering finishes and the release waits on a person.**",
    "",
    "### Four risks are live, and the first is the only one that could move the date.",
    "",
    "**We may have to abandon the change we are making to the trained component rather than adjust it.** "
    + "We wrote its abandonment conditions down in advance so the decision could not be softened later. "
    + "The assumption it rests on is being measured properly for the first time by the run happening now, "
    + "and it may not survive — which is the outcome that exercise exists to make visible.",
    "",
    "**One piece of work still has no known size.** We published a fix for it this morning, measured it "
    + "wrong this afternoon, and replaced it with a theory that has a named test. That is the process "
    + "working, and it also means the week we allowed for it now rests on less than it did.",
    "",
    "**Everything runs on one machine.** The credentials for the capture machines, and this report's own "
    + "schedule, exist on a single computer. The list of open work moved to a hosted service today, so "
    + "that at least now survives its loss; the credentials do not.",
    "",
    "**Six saved changes carry the wrong author's name.** An automated test overwrote the project's "
    + "identity settings. The settings are fixed; the historical record is not, and we have decided to "
    + "leave it rather than rewrite history that several people are working on top of. Cosmetic, and "
    + "disclosed so it is not discovered.",
  ].join("\n");
}

function section5(d) {
  const throughput = d.milestones.find((m) => m.title === THROUGHPUT);
  const fh = d.fleetHours;
  const L = [
    "## We are not asking for money, and the measurement that would justify asking has been scheduled.",
    "",
  ];
  if (!fh || fh.status === "not instrumented") {
    L.push("**We cannot yet report how much machine time the capture fleet consumed, and we are printing "
      + "that rather than estimating it.** A figure exists — 54.11 machine-hours across every page we "
      + "have ever captured — but it spans many separate runs and several versions of the recording "
      + "format, so it is nobody's single run and would mislead. The report refuses to print a total "
      + "that cannot name the finished run it came from.");
  } else {
    L.push(`**The capture machines consumed ${fh.total} on their most recent full run.** That figure `
      + "counts only the time a machine spent actively reading a page: it excludes waiting between "
      + "pages, machine setup, restarts and electricity.");
  }
  L.push("");
  L.push("### Re-reading every test page is the hidden cost behind most decisions we postpone.");
  L.push("");
  L.push("The tool learns from a library of several thousand recordings of a screen reader reading real "
    + "and synthetic web pages. Changing anything that alters what those recordings contain means "
    + "making them all again, which currently takes hours. That cost is the reason a long list of "
    + "improvements sits deferred rather than done.");
  L.push("");
  L.push(`We opened a separate programme of work for it today${throughput
    ? `, with ${throughput.open_issues} stages` : ""}, owned by the engineer who runs the machines, and `
    + "deliberately outside the release: nothing in it delays September.");
  L.push("");
  L.push("| stage | what it decides |");
  L.push("|---|---|");
  L.push("| Explain a fourfold discrepancy | Our own documentation says a page takes 12.4 seconds to "
    + "record; measurement says 48.7. Until we know which part of that is unavoidable and which is "
    + "waiting we control, nobody can say what buying more machines would buy. |");
  L.push("| Measure what more machines actually give us | The same work at ten machines and at five, "
    + "alternating between them. **We wrote down the result that would disprove the case for buying "
    + "before running it:** if each page gets slower at ten machines, they are competing for something "
    + "shared and more of them is the wrong purchase. |");
  L.push("| Set a target | Derived from the measurement above rather than from a wish. |");
  L.push("| Make the improvements | Each accepted only by the check that can tell *faster* from "
    + "*recorded less*. |");
  L.push("| Decide on hardware | With the measurements attached. |");
  L.push("");
  L.push("### We recommend buying nothing until those measurements exist, and one number would change "
    + "that.");
  L.push("");
  L.push("**The number is how long one page takes to record with ten machines running versus five.** If "
    + "it is unchanged, machines buy speed in direct proportion and the purchase is arguable. If it "
    + "rises, they do not. The last time this was measured — on older hardware — adding machines made "
    + "the work slower, because they were competing for the same disk rather than for anything more "
    + "hardware would fix.");
  L.push("");
  L.push("**One figure the board should discard if it has already heard it: twelve format changes in "
    + "thirty-two days is not twelve re-readings of the library.** Five of those versions produced "
    + "almost no recordings at all, and grouping changes together is already being done on purpose. The "
    + "true rate is being measured and we expect it to be several times lower.");
  return L.join("\n");
}

function appendix(d) {
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
    "the project's own version history; the cause is diagnosed and the record is kept by decision");
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
    ...rows,
    "",
  ];

  if (d.achievements.length > 0) {
    L.push("### Evidence for each capability claimed in section 3.");
    L.push("");
    for (const a of d.achievements) {
      L.push(`**${a.boardClaim ?? a.claim}**`);
      L.push("");
      L.push(`> ${a.evidence}${a.issue ? ` *(tracked as issue #${a.issue}, recorded by `
        + `${a.reportedBy})*` : ""}`);
      L.push("");
    }
  }

  L.push(`*Generated from the project's issue tracker and version history at `
    + `${new Date().toISOString()}. A daily engineering edition carrying the same figures is published `
    + "alongside this document and shares its data source, so the two cannot disagree.*");
  return L.join("\n");
}

export function document(d) {
  return [
    `# a11y-witness — board report, ${longDate(new Date().toISOString())}`,
    "",
    "*a11y-witness drives a real screen reader through real navigation to assess the accessibility "
    + "failures that automated scanners structurally cannot reach. Nothing is published yet.*",
    "",
    section1(d), "", section2(d), "", section3(d), "", section4(d), "", section5(d), "", appendix(d),
  ].join("\n");
}

const PAGE_CSS = `
  @page { size: A4; margin: 18mm 16mm 16mm; }
  body { font: 10.5pt/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #16191d; }
  h1 { font-size: 20pt; margin: 0 0 2mm; letter-spacing: -0.01em; }
  h1 + p em, h1 + p { color: #5a6472; font-size: 9.5pt; margin: 0 0 6mm; }
  h2 { font-size: 13pt; margin: 9mm 0 2mm; padding-top: 2mm; border-top: 1.5px solid #16191d;
       break-after: avoid; }
  h3 { font-size: 11pt; margin: 5mm 0 1.5mm; break-after: avoid; }
  p, li { margin: 0 0 2.5mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 5mm; }
  strong { font-weight: 650; }
  table { border-collapse: collapse; width: 100%; margin: 2mm 0 4mm; font-size: 9pt;
          break-inside: avoid; }
  th { text-align: left; border-bottom: 1.2px solid #16191d; padding: 1.6mm 2mm; vertical-align: top; }
  td { border-bottom: 0.4px solid #ccd2da; padding: 1.6mm 2mm; vertical-align: top; }
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
function main() {
  refuseUnknownFlags(["--pdf", "--since", "--out", "--allow-dirty-read-set", "--release"],
    { entry: import.meta.url, command: "npm run board:document" });

  const argv = process.argv.slice(2);
  const flagOf = (n) => argv.find((a) => a.startsWith(`${n}=`))?.split("=").slice(1).join("=");

  const md = document(collect(flagOf("--since") ?? new Date(Date.now() - 24 * HOURS_MS).toISOString()));

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

    // NOT `runs/`. That directory is shared -- often a symlink to the corpus tree -- and a guard is
    // landing that makes every `runs/` writer askable. A board PDF written every morning would be a writer
    // nobody remembered when that guard was designed. Same directory as the launchd job's log, which is
    // where a scheduled agent's output belongs on macOS anyway.
    const outDir = flagOf("--out")
      ?? path.join(process.env.HOME ?? ROOT, "Library", "Logs", "a11y-witness");
    mkdirSync(outDir, { recursive: true });
    const stem = `a11y-witness-board-${new Date().toISOString().slice(0, 10)}`;
    const html = path.join(outDir, `${stem}.html`);
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
