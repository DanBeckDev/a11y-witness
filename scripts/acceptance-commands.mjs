#!/usr/bin/env node
// @ts-check
// NOTHING HAS EVER RUN A ROW'S ACCEPTANCE COMMAND -- pipeline unit 2, #353. Every PR body in this repo
// carries an `Acceptance:` line and its own PR argues its case; the only thing that has ever executed it
// is the author, reporting the result in prose. `capture-check` was mandatory after any `capture-core.mjs`
// change and had never run once; `scorer:verify` was a security check on the one artefact this project
// publishes and nothing invoked it; `release:gate` was broken from the day it was written. Every one of
// those was found the first time something actually ran it. This is the thing that actually runs it.
//
// THREE OUTCOMES, AND THEY MUST NEVER COLLAPSE INTO TWO:
//
//   RAN      the command executed here, in this job, on the fork's own code with a read-only token --
//            its exit code IS the verdict.
//   REFUSED  the command needs the fleet, the lab, or `runs/` -- named, and this never gates on it. A
//            GitHub-hosted runner has no Windows worker and no Proxmox, and `runs/` is gitignored so any
//            corpus-reading gate here would examine nothing and report cleanly -- CLAUDE.md's own rule,
//            "A GATE THAT READS runs/ IS NOT YOURS TO REPORT".
//   MISSING  no acceptance line at all. THE JOB FAILS. A check that finds nothing, runs nothing and
//            reports green is this repository's most-recorded defect wearing a pipeline's clothes -- the
//            `postSubmitFields` empty on all 2,122 captures, the signal-type regex that scraped nothing
//            and asserted over an empty set, the `sweepLog` guard written against a shape nobody verified.
//
// A DELIBERATE, STATED OPT-OUT IS NOT THE SAME AS SILENCE. `Acceptance: none — <reason>` is accepted and
// treated as an honest pass (nothing to run, nothing hidden) -- but the reason is REQUIRED. "Nobody wrote
// one" and "this row deliberately has none" must read as different states, or the second becomes cover
// for the first.
//
// SCOPED TO `Acceptance:` ONLY, DELIBERATELY -- not `Mutation:`. A mutation check edits a real file (even
// restored, it is a mutating, slower operation than this job is built to gate every PR on); #353's own
// region names `scripts/acceptance-commands.mjs`, not a mutation runner, and folding the two together
// would make "did the acceptance command pass" wait on something with a different risk profile and cost.
//
// `pull_request`, NEVER `pull_request_target` -- wired in `ci.yml`, not here, but the reason belongs next
// to the code that makes it safe: this module runs the AUTHOR'S OWN commands from a PR body, so it must
// only ever run under the fork's read-only token and the fork's own checked-out code. Nothing in this
// file grants itself write access; it doesn't need to.
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { existsSync, globSync, realpathSync } from "node:fs";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";

/** @typedef {{ verdict: "runnable" } | { verdict: "refused", reason: string }} Classification */
/** @typedef {{ kind: "missing" } | { kind: "none", reason: string } | { kind: "commands", commands: string[] }} Section */

// `npm run fleet:*` and its siblings -- the resource ban every worker/agent role file below `ceo` and
// `orchestrator` carries, verbatim, elsewhere in this repo. A GitHub-hosted runner is not one of the
// exceptions to it.
const FLEET_LAB_PATTERNS = /** @type {[RegExp, string][]} */ ([
  [/\bfleet:/, "reaches the fleet -- a GitHub runner has no Windows worker"],
  [/\blab:/, "reaches the lab -- a GitHub runner has no Proxmox"],
  [/\btraining:capture/, "captures real evidence, which needs the fleet"],
  [/\bworker:/, "reaches a worker VM, which does not exist on a GitHub runner"],
  [/\bevidence:check\b/, "compares live evidence against a real worker"],
  [/\bgate:stability\b/, "captures canaries against a real worker"],
  [/\bcapture:check\b/, "needs a real worker and NVDA"],
]);

// `runs/` is gitignored -- a GitHub runner never has a corpus, so these read nothing and report cleanly.
// CLAUDE.md: "A GATE THAT READS runs/ IS NOT YOURS TO REPORT."
const CORPUS_PATTERNS = /** @type {[RegExp, string][]} */ ([
  [/\brules:gate\b/, "reads runs/, which is gitignored and absent in CI"],
  [/\brules:coverage\b/, "reads runs/, which is gitignored and absent in CI"],
  [/\bcheck-signals\b/, "reads runs/, which is gitignored and absent in CI"],
  [/\bcorpus:starvation\b/, "reads runs/, which is gitignored and absent in CI"],
  [/\bscorer:shortcuts\b/, "reads runs/, which is gitignored and absent in CI"],
]);

/**
 * Pure. Never executes anything -- just decides whether this command is this job's to run.
 * @param {string} command
 * @returns {Classification}
 */
export function classifyCommand(command) {
  for (const [pattern, reason] of [...FLEET_LAB_PATTERNS, ...CORPUS_PATTERNS]) {
    if (pattern.test(command)) return { verdict: "refused", reason };
  }
  return { verdict: "runnable" };
}

/**
 * DOES A `tsx --test` COMMAND'S FILE/GLOB ARGUMENT ACTUALLY MATCH ANYTHING? -- #353's fifth hazard, found
 * on #350 an hour before this shipped: `npx tsx --test "packages/lab/src/packaging/nothing-matches-*"`
 * exits 0 with NO diagnostic at all when the pattern matches nothing, and a typo'd path MIXED with one
 * real file exits 0 too -- so "the command exited 0" is not proof the tests it claims to run ever ran.
 * Checked BEFORE running, never inferred from the exit code, because the exit code is exactly the thing
 * this hazard makes unreliable.
 *
 * Scoped to `tsx --test` specifically (never generalised to "any command with a path-shaped argument"):
 * that is the concrete, measured defect, and treating every argument to every command as a file path
 * would produce false refusals on the many acceptance commands that take URLs, flags, or option values
 * that merely look like paths.
 *
 * #419: A TRAILING `# comment` IS NOT A FILE ARGUMENT. Bash itself already treats an unquoted `#` as
 * starting a comment, so `npx tsx --test foo.test.ts  # 2/2, pass` runs perfectly for real -- but this
 * check tokenised the whole line and read `#`, `2/2` and `pass` as file arguments nothing on disk could
 * ever match. Stripped for TOKEN EXTRACTION only, never from the command that actually runs: bash was
 * always going to ignore it, so removing it here only makes this check agree with what execution already
 * does.
 *
 * @param {string} command
 * @returns {{ ok: true } | { ok: false, missing: string[] }}
 */
export function testFileArgumentsResolve(command) {
  if (!/\btsx\s+--test\b/.test(command)) return { ok: true };
  const withoutTrailingComment = command.replace(/(?:^|\s)#.*$/, "");
  const tokens = withoutTrailingComment.split(/\s+/).filter(Boolean);
  const fileArgs = tokens
    .filter((token) => token !== "npx" && token !== "tsx" && token !== "--test" && !token.startsWith("-"))
    .map((token) => token.replace(/^['"]|['"]$/g, ""));
  const missing = fileArgs.filter((pattern) => {
    if (/[*?[{]/.test(pattern)) {
      try {
        return globSync(pattern).length === 0;
      } catch {
        return true;
      }
    }
    return !existsSync(pattern);
  });
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

/**
 * Pure. Finds the `Acceptance:` section of a PR body and returns what it says, never what it should say.
 *
 * Supports two shapes, both seen in real PR bodies in this repo: the command INLINE on the header's own
 * line (`Acceptance: node -e "process.exit(1)"` -- the exact shape #353's own acceptance test uses), or a
 * bare `Acceptance:` header followed by one command per subsequent non-empty, non-comment line, up to a
 * blank line, a markdown heading, a fenced-code delimiter (stripped, not treated as a command), or a
 * `Mutation:` header, whichever comes first.
 *
 * #419: A MARKDOWN HEADING IS THE HEADER TOO. `## Acceptance`, `## Acceptance:` and `### Acceptance:` all
 * used to parse as MISSING, because the pattern was anchored at the START of the line with no notion of a
 * `#` prefix -- and every OTHER section in this repo's own PR template uses `## ` headings, so that is the
 * natural shape an author reaches for. Four of seven open PRs failed on it at once. There is no reading in
 * which `## Acceptance` means something other than the field, so it is accepted rather than warned about --
 * "anything relying on a human to remember does not happen" applied to a parser instead of a person.
 *
 * @param {string | null | undefined} body
 * @returns {Section}
 */
export function extractAcceptanceSection(body) {
  const text = body ?? "";
  const lines = text.split(/\r\n|\r|\n/);
  const headerPattern = /^\s*(?:#{1,6}\s+Acceptance:?|(?:\*\*|__)?Acceptance:(?:\*\*|__)?)\s*(.*)$/;
  const headerIndex = lines.findIndex((line) => headerPattern.test(line));
  if (headerIndex === -1) return { kind: "missing" };

  const headerMatch = headerPattern.exec(lines[headerIndex]);
  const inline = (headerMatch?.[1] ?? "").trim();

  const noneMatch = /^none\b\s*[-—]?\s*(.*)$/i.exec(inline);
  if (noneMatch) {
    const reason = noneMatch[1].trim();
    // A STATED reason is what makes "deliberately none" different from silence -- without one, this is
    // not an honest opt-out, it is the missing case wearing the word "none" as a disguise.
    return reason.length > 0 ? { kind: "none", reason } : { kind: "missing" };
  }

  if (inline.length > 0) return { kind: "commands", commands: [unwrapBackticks(inline)] };

  const commands = commandLinesAfter(lines, headerIndex);
  return commands.length > 0 ? { kind: "commands", commands } : { kind: "missing" };
}

/**
 * #419: A BACKTICKED COMMAND IS STILL THE COMMAND. This repository's own prose convention wraps a command
 * in single backticks (`` `like this` ``), and that is exactly wrong for a line the extractor hands
 * verbatim to bash -- the backticks stayed attached, so the file check saw `` `npx `` as a token and
 * reported it missing for a command that runs perfectly. Stripped only when they wrap the WHOLE command
 * (start and end), never partial backticks inside one, which are the author's own quoting to preserve.
 * @param {string} command
 * @returns {string}
 */
function unwrapBackticks(command) {
  return /^`[^`]+`$/.test(command) ? command.slice(1, -1) : command;
}

/**
 * #419: A `\` LINE CONTINUATION IS ONE COMMAND, NOT TWO. Read line by line, a shell continuation split the
 * command in half: the first half ended in a dangling backslash and the second half became its OWN
 * "command" -- a bare filename or flag that fails the moment it is run on its own. Joins forward from
 * `startIndex` while the accumulated text still ends in `\`, so an author can chain any number of
 * continuation lines exactly as they would in a real shell script.
 * @param {string[]} lines
 * @param {number} startIndex
 * @param {string} firstLine
 * @returns {{ command: string, consumed: number }}
 */
function joinContinuations(lines, startIndex, firstLine) {
  let command = firstLine;
  let consumed = 0;
  while (/\\\s*$/.test(command) && startIndex + consumed + 1 < lines.length) {
    consumed += 1;
    command = `${command.replace(/\\\s*$/, "").trimEnd()} ${lines[startIndex + consumed].trim()}`;
  }
  return { command, consumed };
}

/**
 * The lines of a bare `Acceptance:` block, one command per line -- split out of `extractAcceptanceSection`
 * purely to keep that function's complexity within this repo's ESLint budget; the two are one algorithm.
 *
 * FENCE-AWARE, because `#` is ambiguous outside one: a bare `# 1. explain this` at the top level of a PR
 * body reads as a markdown heading and correctly ends the section, but the identical text inside a
 * ```shell fence is a shell comment annotating the command below it (real shape: #331's own issue body
 * used exactly this). The same character means opposite things depending on where it sits, so this has to
 * track that rather than guess from the character alone.
 *
 * HTML-COMMENT-AWARE, for the same reason and a sharper cost. GitHub's own PR-template convention is an
 * HTML comment (`<!-- one command per line -->`) left under a field as unfilled guidance, so a template
 * built from this repo's own `.github/pull_request_template.md` produces exactly that shape under
 * `Acceptance:`. Unlike `#`, `<!--` is never ambiguous with a heading -- it is always a comment, fenced or
 * not -- so it is stripped in both places rather than only inside a fence. Left unstripped, that line
 * reached `execSync` with `shell: "/bin/bash"`: bash reads `<!--` as a redirect from a file named `--`,
 * which errors loudly rather than doing something silent -- but the failure was baffling to an author who
 * never wrote a command at all, on the exact PR-body shape GitHub's own convention encourages.
 *
 * #419 FOLLOW-UP: A BLANK LINE AFTER THE HEADER IS NOT THE TERMINATOR -- ONLY A BLANK LINE AFTER A COMMAND
 * IS. Markdown convention puts a blank line after every heading (every other `## ` section in this repo's
 * own PR template has one), so `## Acceptance` -- the very form #419 just made acceptable -- combined with
 * that convention landed straight back on MISSING: the block "ended" at the blank line before a single
 * command was ever read. `Acceptance:` followed by a blank line has the identical shape. So a blank line
 * is skipped while NO command has been found yet, and still ends the block the moment one has -- which
 * keeps `Acceptance:` + blank + `Mutation:` reading as MISSING (correct: the block never gains a command)
 * while letting `## Acceptance` + blank + a real command through.
 *
 * @param {string[]} lines
 * @param {number} headerIndex
 * @returns {string[]}
 */
function commandLinesAfter(lines, headerIndex) {
  const commands = [];
  let inFence = false;
  let inHtmlComment = false;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (inHtmlComment) {
      if (trimmed.includes("-->")) inHtmlComment = false;
      continue;
    }
    if (trimmed.startsWith("<!--")) {
      if (!trimmed.includes("-->")) inHtmlComment = true;
      continue;
    }
    if (trimmed.startsWith("```")) { inFence = !inFence; continue; }
    if (inFence) {
      if (trimmed !== "" && !trimmed.startsWith("#")) {
        // A continuation is understood to still be part of the command that started it, whatever it looks
        // like on its own -- the stop rules below apply only to where a command BEGINS.
        const { command, consumed } = joinContinuations(lines, i, trimmed);
        commands.push(unwrapBackticks(command));
        i += consumed;
      }
      continue;
    }
    if (trimmed === "") {
      if (commands.length === 0) continue; // leading blank, before any command -- not the terminator
      break;
    }
    if (/^#{1,6}\s/.test(trimmed)) break;
    if (/^(?:\*\*|__)?Mutation:(?:\*\*|__)?/i.test(trimmed)) break;
    const { command, consumed } = joinContinuations(lines, i, trimmed);
    commands.push(unwrapBackticks(command));
    i += consumed;
  }
  return commands;
}

/**
 * THE VERDICT, driven by an injectable `run` so every outcome (including a real exit code) is testable
 * without a subprocess. `run` returns the exit code; it is never asked to interpret one.
 *
 * @param {string | null | undefined} body
 * @param {(command: string) => number} run
 * @returns {{ ok: boolean, lines: string[] }}
 */
export function acceptanceReport(body, run) {
  const section = extractAcceptanceSection(body);

  if (section.kind === "missing") {
    return { ok: false, lines: ["ACCEPTANCE: MISSING"] };
  }
  if (section.kind === "none") {
    return { ok: true, lines: [`ACCEPTANCE: NONE -> ${section.reason}`] };
  }

  let ok = true;
  const lines = [];
  for (const command of section.commands) {
    const classification = classifyCommand(command);
    if (classification.verdict === "refused") {
      lines.push(`ACCEPTANCE: REFUSED ${command} -> ${classification.reason}`);
      continue;
    }
    // CHECKED BEFORE RUNNING, never inferred from the exit code -- an unresolved test file/glob is
    // exactly the shape whose exit code cannot be trusted (#353's fifth hazard). Failing this here means
    // the real command never runs at all: there is nothing honest it could report.
    const fileCheck = testFileArgumentsResolve(command);
    if (!fileCheck.ok) {
      ok = false;
      lines.push(`ACCEPTANCE: RAN ${command} -> fail (matched no file: ${fileCheck.missing.join(", ")})`);
      continue;
    }
    const code = run(command);
    const passed = code === 0;
    if (!passed) ok = false;
    lines.push(`ACCEPTANCE: RAN ${command} -> ${passed ? "pass" : "fail"} (exit ${code})`);
  }
  return { ok, lines };
}

/**
 * Runs a command for real, via a shell (these are arbitrary shell strings out of a PR body, potentially
 * carrying flags/pipes/quoting -- the same trust boundary `merge-guard.mjs`'s `--ci-gate` and this
 * project's other CI-invoked scripts already accept, contained by `pull_request`'s read-only token and
 * fork checkout rather than by refusing shell syntax).
 * @param {string} command
 * @returns {number}
 */
function runForReal(command) {
  try {
    execSync(command, { stdio: "inherit", shell: "/bin/bash" });
    return 0;
  } catch (error) {
    const status = /** @type {{ status?: number }} */ (error).status;
    return typeof status === "number" ? status : 1;
  }
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/acceptance-commands.mjs" });
  // FROM AN ENV VAR, NEVER ARGV -- a PR body is adversarial input (anyone can open a PR), and passing it
  // as a shell argument would put it on a command line for something else to misinterpret. GitHub Actions'
  // own `env:` mapping is what keeps it a single opaque string here, never re-parsed as shell.
  const body = process.env.PR_BODY ?? "";
  const report = acceptanceReport(body, runForReal);
  for (const line of report.lines) console.log(line);
  process.exit(report.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
