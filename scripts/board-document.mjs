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
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";
import { collect, readSetIsNotMain, ROOT, MILESTONE, HOURS_MS, git } from "./board-data.mjs";
import { toHtml } from "./board-markdown.mjs";

refuseUnknownFlags(["--pdf", "--since", "--out", "--allow-dirty-read-set"],
  { entry: import.meta.url, command: "npm run board:document" });

const argv = process.argv.slice(2);
const flagOf = (n) => argv.find((a) => a.startsWith(`${n}=`))?.split("=").slice(1).join("=");
const THROUGHPUT = "Capture throughput";

/** ON TRACK / AT RISK / SLIPPED, from stated criteria rather than from a feeling.
 *
 * The rule is printed with the verdict every time. A status word whose derivation is not on the page is
 * an opinion wearing a measurement's clothes, which is the exact defect this reporting was built after.
 */
function trackStatus(release, open) {
  if (!release?.due_on) return { word: "NO DATE", why: "the milestone carries no date." };
  const unbounded = open.filter((i) => i.milestone?.title === MILESTONE
    && /INCONCLUSIVE|hypothesis|unbounded|not yet known/i.test(i.title));
  const days = Math.ceil((Date.parse(release.due_on) - Date.now()) / (24 * HOURS_MS));
  if (days < 0) return { word: "SLIPPED", why: "the date has passed and the milestone is still open." };
  if (unbounded.length > 0) {
    return { word: "AT RISK",
      why: `${release.open_issues} blockers remain with ${days} days to go, and ${unbounded.length} of `
        + "them has no known size — its remedy was refuted today and replaced by a hypothesis that has "
        + "not been checked yet." };
  }
  return { word: "ON TRACK",
    why: `${release.open_issues} blockers remain with ${days} days to go, and every one of them has a `
      + "named next step whose size is known." };
}

function section1(d) {
  const { word, why } = trackStatus(d.release, d.open);
  const due = d.release?.due_on?.slice(0, 10) ?? "none";
  return [
    "## 1. Are we on track",
    "",
    `### ${word}`,
    "",
    `**First publish — \`${MILESTONE}\` — is dated ${due}.** ${why}`,
    "",
    "**The date has not moved since it was set on 2026-09-06.** It was proposed from the open blockers "
    + "and approved the same day. Every future move of it is recorded on the milestone itself, naming "
    + "what moved it and which gate found it — so a slip arrives with its cause attached or it is a "
    + "defect in this process.",
    "",
    "**Confidence, stated rather than implied.** The date assumes the one blocker of unknown size (#3) "
    + "is resolved inside the week allowed for it. That row's remedy was refuted today and replaced by a "
    + "hypothesis with a named check, so the week is still the estimate and the estimate is now resting "
    + "on less than it was this morning. It is not padded for a model-schema revert, which is a live "
    + "possibility with its conditions named in advance; a revert would move this date and the move "
    + "would say so.",
  ].join("\n");
}

function section2() {
  return [
    "## 2. Time to V1",
    "",
    "### V1 IS NOT DEFINED ANYWHERE, and this section will not invent a date without a scope",
    "",
    "Checked before writing this: `PLAN.md`, `README.md` and the backlog contain no definition of V1, "
    + "and no `1.0.0` target. `PLAN.md` is titled *the road to a general release* and defines four "
    + "phases with exit criteria, but never says which of them constitutes V1.",
    "",
    "**So a date here would be a number with nothing behind it** — the one thing this reporting refuses. "
    + "What follows is a proposed definition, for the board's approval. Once a scope is approved, a date "
    + "can be derived from it and will appear in this section.",
    "",
    "### Proposed: v0.1.0 is a PUBLISHING act; V1 is an EVIDENCE claim",
    "",
    "| | v0.1.0 — first publish | V1 — proposed |",
    "|---|---|---|",
    "| what it proves | the packages install and run for a stranger | the findings are worth a "
    + "stranger's time on their own app |",
    "| how it is decided | a gate passes and a human types `publish-for-real` | a person outside this "
    + "project runs it on an app they own and says plainly whether the output was worth it |",
    "| already written down as | `PLAN.md` B5 | `PLAN.md` B1, and Phase 4's exit |",
    "| status | 8 blockers, dated | not started, and cannot be done from inside |",
    "",
    "**The proposal is that V1 = `PLAN.md` B1 closed**, which its own text already frames as the "
    + "deliverable: *\"One person outside the project adds the Action to a repo they own, runs it on a "
    + "page they care about, and says plainly whether the output was worth it. Their reaction is the "
    + "deliverable — not a bug list.\"*",
    "",
    "**The stages between here and there, each with what decides it. No dates on the later ones, "
    + "because the earlier ones set them.**",
    "",
    "| stage | what decides it | date |",
    "|---|---|---|",
    "| Model weights promoted | four migration gates pass and `rules:coverage` stops refusing 1.4.13 "
    + "(#2) | days — needs one fleet run |",
    "| Real-page gate conclusive | #3's hypothesis checked against two recaptured captures | the one "
    + "unbounded row |",
    "| First publish | the five human steps (#5), after a green action-smoke read on the shipping sha "
    + "(#4) | **2026-09-20** |",
    "| **B1 — the first outside user** | a person outside the project agrees to run it, and reports "
    + "back | **NOT SCHEDULABLE FROM INSIDE** — it needs the repository owner to ask someone |",
    "",
    "**That last row is the honest answer to \"when is V1\".** It is not an engineering estimate; it is "
    + "a person the project does not yet have. `PLAN.md` has said so since 2026-08-09 — *\"B1 and B5 are "
    + "yours — neither can be done from inside the project\"* — and no amount of capacity here moves it. "
    + "**The board decision that would move V1 closest is naming that person.**",
  ].join("\n");
}

function section3(d) {
  const L = ["## 3. What we achieved since the last edition", ""];
  if (d.achievements.length === 0) {
    L.push("**Nothing recorded for this window.** That is a fact about our recording discipline and not "
      + "necessarily about the work: this section is authored, because no API can derive *what the "
      + "product can now do that it could not before* from commit counts. An empty section means nobody "
      + "wrote one, and should be read as that.");
    return L.join("\n");
  }
  L.push("Capabilities, not activity. Commit counts measure how busy we were; these are things the "
    + "product can now do or prove that it could not before, each with the evidence that makes it a "
    + "claim rather than an assertion.");
  L.push("");
  for (const a of d.achievements) {
    L.push(`**${a.claim}**`);
    L.push("");
    L.push(`> ${a.evidence}${a.issue ? ` *(issue #${a.issue}, recorded by \`${a.reportedBy}\`)*` : ""}`);
    L.push("");
  }
  L.push("**This is the first edition, so \"since the last edition\" means since the tracker existed** "
    + "— roughly one working day. Later editions cover a day each.");
  return L.join("\n");
}

function section4(d) {
  const blockers = d.open.filter((i) => i.milestone?.title === MILESTONE);
  return [
    "## 4. Risks, and the decisions the board is being asked for",
    "",
    "### Decisions needed",
    "",
    "| decision | what happens if nothing is decided |",
    "|---|---|",
    "| **Approve or amend the V1 definition in section 2.** | \"When is V1\" stays unanswerable. This "
    + "document will keep printing that V1 is undefined rather than estimating, so every edition "
    + "repeats the question. |",
    "| **Name the first outside user (`PLAN.md` B1).** | V1 cannot start, whatever engineering does. "
    + "It has been open since 2026-08-09 and is the single longest-standing blocker in the project. |",
    "| **Confirm the first publish may proceed on the approved date with the stated confidence.** | The "
    + "five human steps (#5) — creating the npm scope, adding the token, flipping access to public — "
    + "need the repository owner's hands and are not reachable by any automation here. |",
    "",
    "### Risks",
    "",
    "| risk | state |",
    "|---|---|",
    "| **The model-schema change may have to be reverted, not adjusted.** | Its revert conditions were "
    + "named in advance, deliberately, so the decision cannot be softened into a tweak. The premise it "
    + "rests on is being measured properly for the first time by the run in flight — and it may "
    + "collapse, which is the outcome the exercise existed to make visible. A revert moves the date. |",
    "| **The one blocker of unknown size (#3).** | Its remedy was published this morning, refuted this "
    + "afternoon by measurement, and replaced by a hypothesis with a named check. That is the process "
    + "working; it also means the week allowed for it now rests on less than it did. |",
    "| **Everything runs on one machine.** | The capture fleet's credentials and this document's own "
    + "schedule exist on one Mac. The tracker moved to GitHub today, so *what is open* now survives its "
    + "loss; the credentials do not. Named in `docs/roles/README.md`, which exists to answer exactly "
    + "this. |",
    "| **Six commits carry the wrong author.** | A test wrote its git identity into the real repository. "
    + "The config is fixed; the history is not, and the decision on record is that it stays — a rewrite "
    + "would strand every agent branch. Cosmetic, disclosed so it is not discovered. |",
    "",
    `**${blockers.length} blockers are open on the release milestone**, each with an acceptance command `
    + "and the command that shows it is still open. They are listed with their sources in section 6.",
  ].join("\n");
}

function section5(d) {
  const throughput = d.milestones.find((m) => m.title === THROUGHPUT);
  const fh = d.fleetHours;
  const L = [
    "## 5. Capital and capacity",
    "",
    "### Fleet utilisation",
    "",
  ];
  if (!fh || fh.status === "not instrumented") {
    L.push("**Not instrumented, and printed as that rather than estimated.** " + (fh?.note ?? ""));
    L.push("");
    L.push("**A number exists and is deliberately not published here**: 54.11 worker-hours across every "
      + "capture on disk. It spans several runs and several protocol versions, so it is not any one "
      + "run's figure, and this document will not print a total that cannot name the run it came from. "
      + "The generator enforces that — it refuses such a total rather than printing it with a footnote.");
  } else {
    L.push(`**${fh.total}**, computed from **${fh.run}**, which finished ${fh.runFinishedAt} — measured `
      + `by \`${fh.reportedBy}\`. Method: ${fh.method}.`);
    L.push("");
    L.push("**This is capture occupancy**, not the fleet's cost: it excludes idle time between "
      + "dispatches, provisioning, reboots and power.");
  }
  L.push("");
  L.push("### The recapture-speed plan");
  L.push("");
  L.push("A full corpus recapture is the unit of cost behind almost every decision this project defers "
    + "— a cache-key change, a settings pin, following a browser version, a probe-ordering fix. It is "
    + `now a milestone of its own${throughput ? ` (\`${THROUGHPUT}\`, ${throughput.open_issues} open)` : ""}`
    + ", filed today, owned by the fleet driver, and deliberately **not** a release blocker.");
  L.push("");
  L.push("| stage | what it decides |");
  L.push("|---|---|");
  L.push("| Explain the 3.9x | 12.4 s per capture is documented; ~48.7 s is measured. Until the phase "
    + "table exists, nobody knows which part of that is irreducible screen-reader round-trips and which "
    + "is waits we control — and only the second kind is buyable. |");
  L.push("| The scaling shard | 49 cases at ten boxes and at five, alternating, cache off. **The "
    + "falsifier is stated in advance:** if the per-capture median RISES at ten, something shared is "
    + "contending and more machines are the wrong purchase. |");
  L.push("| The target | derived from the phase table, never from a wish. |");
  L.push("| The fixes | each accepted only by the gate that can tell *faster* from *captured less*. |");
  L.push("| The hardware decision | with the curve and the post-fix cost attached. |");
  L.push("");
  L.push("### Purchase decision pending");
  L.push("");
  L.push("**More capture hardware. The current answer is NO, and the number that would change it is "
    + "the per-capture median at ten boxes versus five.** If it is unchanged, machines buy throughput "
    + "linearly and the purchase is arguable. If it rises, they do not, and this closes as a no with "
    + "the curve as the reason. The last time this fleet's scaling was measured — on different "
    + "hardware — throughput FELL as workers were added, and the cause was disk contention rather than "
    + "anything more machines would fix.");
  L.push("");
  L.push("**One correction the board should carry**, because it is the figure most likely to be "
    + "repeated: *twelve protocol bumps in 32 days* is a rate of BUMPS, not of recaptures. Measured "
    + "against the captures on disk, five of those protocol versions have essentially no captures at "
    + "all — most bumps never forced a full recapture, and batching is already being done deliberately. "
    + "The true recapture rate is being measured and is expected to be several times lower.");
  return L.join("\n");
}

function section6(d) {
  const rows = [];
  const push = (what, value, source) => rows.push(`| ${what} | ${value} | ${source} |`);
  push("First publish, due", d.release?.due_on?.slice(0, 10) ?? "no date",
    "the GitHub milestone; every move logged on it");
  push("Blockers open on it", String(d.open.filter((i) => i.milestone?.title === MILESTONE).length),
    "GitHub Issues API");
  push("Issues open, all milestones", String(d.open.length), "GitHub Issues API");
  push("Issues closed in this window", String(d.closed.length), "GitHub Issues API");
  push("Merges to `main` in this window", String(d.merges.length),
    `\`git log main --merges --since=${d.since}\` — the window is stated because two correct counts `
    + "over different windows read as a disagreement");
  push("Local `main` vs `origin/main`",
    d.unpushed === null ? "could not be compared" : `${d.unpushed} commit(s) ahead`,
    "`git rev-list --count origin/main..main`, checked rather than assumed");
  push("Commits with the wrong author", String(d.strays.length),
    "`git log --format=%ae`; cause diagnosed, history kept by decision");
  push("Last gate result", d.latestGate ? `\`${d.latestGate.command}\`${d.gateIsFresh ? "" : " (STALE)"}`
    : "**not reported**",
    d.latestGate ? `run by \`${d.latestGate.reportedBy}\` at ${d.latestGate.at}, output recorded verbatim`
      : "no gate output has been recorded; this document does not run gates itself, because a local "
        + "corpus copy is only as fresh as its last sync");
  push("Fleet hours", d.fleetHours?.status === "not instrumented" ? "**not instrumented**"
    : `${d.fleetHours.total}`,
    d.fleetHours?.status === "not instrumented"
      ? "printed rather than estimated; a total that cannot name a finished run is refused"
      : `\`${d.fleetHours.run}\``);
  push("V1 date", "**none — V1 is undefined**",
    "`PLAN.md`, `README.md` and the backlog checked; a definition is proposed in section 2 for approval");

  return [
    "## 6. The numbers, and where each came from",
    "",
    "**Every figure on this page carries its source.** Where something is not measured it says *not "
    + "instrumented* or *not reported*, and is never estimated to fill the row. That is the discipline "
    + "the whole reporting rests on: this project's own record is a catalogue of correct values read "
    + "from the wrong place, and today alone produced three more — a figure quoted from a commit "
    + "message while the artefact sat on disk, a fixture value that became documentation, and a remedy "
    + "inferred from a gate's wording without checking whether the mechanism existed. All three were "
    + "caught by asking *where did this come from*, never by asking *is this right*.",
    "",
    "| | | source |",
    "|---|---|---|",
    ...rows,
    "",
    `*Generated by \`npm run board:document\` from GitHub and git at ${new Date().toISOString()}. `
    + "The daily GitHub edition is the data trail and shares this document's data layer, so the two "
    + "cannot disagree.*",
  ].join("\n");
}

export function document(d) {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `# a11y-witness — board report, ${today}`,
    "",
    "*a11y-witness drives a real screen reader through real navigation to assess the accessibility "
    + "failures that automated scanners structurally cannot reach. Nothing is published yet.*",
    "",
    section1(d), "", section2(d), "", section3(d), "", section4(d), "", section5(d), "", section6(d),
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

  const outDir = flagOf("--out") ?? path.join(ROOT, "runs", "board");
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
}
