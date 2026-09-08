#!/usr/bin/env node
// @ts-check
// command: run a PR's own stated Acceptance/Refutation command(s) and report RAN/REFUSED/MISSING
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
// #471: THIS JOB ALSO REQUIRES A `Closes:` DECLARATION, on the identical shape -- `Closes #N`,
// `Closes: none — <reason>`, or the job FAILS. Built after #468 (the first PAT-armed merge) proved the
// closing pipeline works and, in the same run, exposed that a PR is allowed to declare nothing at all: its
// row stayed open while the work that closed it landed on main, and nothing said so. See
// `closesDeclarationReport` below; it NEVER infers a row from a branch name or title.
//
// `pull_request`, NEVER `pull_request_target` -- wired in `ci.yml`, not here, but the reason belongs next
// to the code that makes it safe: this module runs the AUTHOR'S OWN commands from a PR body, so it must
// only ever run under the fork's read-only token and the fork's own checked-out code. Nothing in this
// file grants itself write access; it doesn't need to.
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { existsSync, globSync, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";

/** @typedef {{ verdict: "runnable" } | { verdict: "refused", reason: string } | { verdict: "prose", reason: string }} Classification */
/** @typedef {{ kind: "missing" } | { kind: "none", reason: string } | { kind: "commands", commands: string[] }} Section */
/** @typedef {{ kind: "missing" } | { kind: "malformed", detail: string } | { kind: "none", reason: string } | { kind: "closes", numbers: number[] }} ClosesDeclaration */
/** @typedef {{ history: boolean, token: boolean, fleet: boolean }} JobCapabilities */

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

// #446: A LEADING `VAR=value` ASSIGNMENT IS NOT THE COMMAND. This repo's own Acceptance/Mutation lines
// routinely start with one -- `A11Y_ALLOW_ARMED_PUSH="..." git push`, `GH_TOKEN=... gh pr view`,
// `PYTHONDONTWRITEBYTECODE=1 pytest ...` -- and the executable check below must look PAST it, or every
// one of those legitimate, real commands would misclassify as prose over an assignment that was never
// meant to be looked up on `$PATH`.
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=\S*$/;

// #446's OWN STATED SECOND HALF: `command -v` finds these because they genuinely ARE executable, so no
// existence check can catch a line that merely starts with one. Flagged by name instead -- the identical
// shape `FLEET_LAB_PATTERNS`/`CORPUS_PATTERNS` already use, for the identical reason: a check that can
// answer "is this refusable" cannot also answer "is this claim supportable", so it needs its own list.
const UNVERIFIABLE_BUILTINS = new Set(["echo", "true", ":", "test", "time", "["]);

/**
 * The first token of a command that could plausibly BE the command -- skipping any leading `VAR=value`
 * assignments (#446). `undefined` for an empty or whitespace-only line.
 * @param {string} command
 * @returns {string | undefined}
 */
function firstRealToken(command) {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  return tokens.find((token) => !ENV_ASSIGNMENT.test(token));
}

// The three "execute" bits of a POSIX mode (owner+group+other) -- named because `0o111` reads as an
// arbitrary octal constant otherwise.
const EXECUTE_BITS = 0o111;

/**
 * Does `token` resolve to something executable -- the same question `command -v` answers, computed
 * without a subprocess so `classifyCommand` stays pure (this file's own stated invariant) even for this
 * check. A token containing `/` is checked directly as a path (a relative or absolute script, never
 * `$PATH`-searched); anything else is searched across `$PATH`'s own directories, exactly as a shell would.
 * @param {string} token
 * @returns {boolean}
 */
function commandExists(token) {
  const isExecutableFile = (/** @type {string} */ path) => {
    try {
      return (statSync(path).mode & EXECUTE_BITS) !== 0;
    } catch {
      return false;
    }
  };
  if (token.includes("/")) return isExecutableFile(token);
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  return dirs.some((dir) => isExecutableFile(join(dir, token)));
}

// #497/#510: THIS JOB'S ENVIRONMENT IS DECLARED IN ONE PLACE, per docs/pipeline.md. Structural facts
// (`token`, `fleet`) never vary -- a GitHub-hosted runner has no way to hold either, ever, in this job.
// `history` is the one axis a PR itself controls, via `History: full` in the body (#497).
const FULL_CAPABILITIES = /** @type {JobCapabilities} */ ({ history: true, token: true, fleet: true });

// A bare line, deliberately -- `History: full` names nothing else the way `Acceptance:`/`Closes:` name a
// command or an issue, so this needs no section parser, just a marker this PR's checkout should deepen
// before anything else runs.
const HISTORY_FULL_PATTERN = /^\s*History:\s*full\s*$/im;

/**
 * Does the PR body ask for this run's checkout to carry full history (#497)? A PR carrying the line with
 * no historical fixture in its Acceptance command pays only time, never a wrong verdict -- see this
 * file's own header and #497's own "what it must not become" for why that asymmetry is deliberate.
 * @param {string | null | undefined} body
 * @returns {boolean}
 */
export function hasFullHistoryDeclaration(body) {
  return HISTORY_FULL_PATTERN.test(body ?? "");
}

/**
 * What THIS acceptance job can offer a test that names a requirement (#510). `token`/`fleet` are fixed
 * facts about the job itself; `history` is the one thing a PR body can change. `docs/pipeline.md` states
 * this in prose (#511); this is the same fact read by code, never re-typed.
 * @param {string | null | undefined} body
 * @returns {JobCapabilities}
 */
export function jobCapabilities(body) {
  return { history: hasFullHistoryDeclaration(body), token: false, fleet: false };
}

// The header convention `generate-commands-doc.mjs`'s `commandHeader` already uses for `// command:`,
// applied to a different question on a different population (a TEST FILE's own environment needs, not a
// SCRIPT's description). No line-count window here, unlike that one -- a script's header sits in its
// first few lines by convention, but this repo's own test files often carry long doc-comment headers
// (see `pre-push-resolve-toward-main.test.ts`), so the marker is found anywhere in the file rather than
// assuming how far down it landed.
const REQUIRES_HEADER = /^\/\/\s*requires:\s*(.+)$/m;

/**
 * A test file's own declared requirements, split on commas, UNFILTERED against any known vocabulary --
 * an unrecognised word (a typo, a future capability this job has not learned) must never be silently
 * dropped, because that would make a mistyped requirement read as "needs nothing," exactly the silent-pass
 * shape this row exists to end. `unmetRequirements` below is where an unknown word is judged, not here.
 * @param {string} text
 * @returns {string[]}
 */
export function testFileRequirements(text) {
  const match = REQUIRES_HEADER.exec(text);
  if (!match) return [];
  return match[1].split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Which of `requirements` this job's `capabilities` do NOT satisfy -- named, not counted, because "needs
 * history" and "needs a token" send an author to opposite fixes (#510's own acceptance). A requirement
 * word `capabilities` has no key for reads as unmet, never as satisfied by default.
 * @param {string[]} requirements
 * @param {JobCapabilities} capabilities
 * @returns {string[]}
 */
export function unmetRequirements(requirements, capabilities) {
  return requirements.filter((req) => /** @type {Record<string, boolean>} */ (capabilities)[req] !== true);
}

/**
 * The literal file/glob arguments of a `tsx --test <...>` command, in order -- split out of
 * `testFileArgumentsResolve` so the #510 requirements check below reads the SAME tokenisation rather than
 * risking a second, independently-written answer to "what files does this command name" (this file's own
 * most-repeated lesson, one row up).
 * @param {string} command
 * @returns {string[]}
 */
function tsxTestFileArgs(command) {
  const withoutTrailingComment = command.replace(/(?:^|\s)#.*$/, "");
  const tokens = withoutTrailingComment.split(/\s+/).filter(Boolean);
  return tokens
    .filter((token) => token !== "npx" && token !== "tsx" && token !== "--test" && !token.startsWith("-"))
    .map((token) => token.replace(/^['"]|['"]$/g, ""));
}

/**
 * For a `tsx --test <file(s)>` command, every requirement a REAL file it names declares that this job's
 * `capabilities` do not satisfy -- grouped by requirement, naming every declaring file, so a refusal reads
 * as a fact about the tests rather than an opaque code. Glob arguments and files that do not exist are
 * skipped here on purpose: whether a file exists at all is `testFileArgumentsResolve`'s own question, and
 * a glob's members are not individually readable without expanding it, which this check does not attempt.
 * @param {string} command
 * @param {JobCapabilities} capabilities
 * @returns {{ requirement: string, files: string[] }[]}
 */
export function unmetCommandRequirements(command, capabilities) {
  if (!/\btsx\s+--test\b/.test(command)) return [];
  /** @type {Map<string, string[]>} */
  const byRequirement = new Map();
  for (const fileArg of tsxTestFileArgs(command)) {
    if (/[*?[{]/.test(fileArg) || !existsSync(fileArg)) continue;
    const text = readFileSync(fileArg, "utf8");
    for (const req of unmetRequirements(testFileRequirements(text), capabilities)) {
      if (!byRequirement.has(req)) byRequirement.set(req, []);
      /** @type {string[]} */ (byRequirement.get(req)).push(fileArg);
    }
  }
  return [...byRequirement.entries()].map(([requirement, files]) => ({ requirement, files }));
}

/**
 * Does ANY real `tsx --test` file named across `commands` actually declare `// requires: history`? #497's
 * own stated boundary: "a PR carrying `History: full` and no historical fixture is asking for something it
 * does not use -- worth a warning, not a refusal, since the cost is only time." So this is checked
 * independent of `unmetCommandRequirements` (which asks whether a declared requirement is SATISFIED, not
 * whether the declaration exists at all) -- a file naming `requires: history` always counts as "used" here,
 * whether or not `capabilities.history` happens to be true.
 * @param {string[]} commands
 * @returns {boolean}
 */
function anyCommandUsesHistory(commands) {
  return commands.some((command) => {
    if (!/\btsx\s+--test\b/.test(command)) return false;
    return tsxTestFileArgs(command).some((fileArg) => {
      if (/[*?[{]/.test(fileArg) || !existsSync(fileArg)) return false;
      return testFileRequirements(readFileSync(fileArg, "utf8")).includes("history");
    });
  });
}

/**
 * Pure. Never executes anything -- just decides whether this command is this job's to run.
 *
 * #446: A THIRD VERDICT, "prose", for a line that was never a command at all -- either its first token
 * resolves to no executable anywhere (`"full suite green, 3306 pass 0 fail"` -> no `full`), or it resolves
 * to one of a small set of builtins whose exit code can never verify anything (`echo`, `true`, `:`, `test`,
 * `time`, `[`). Checked AFTER the existing fleet/lab/corpus refusals, deliberately: `npm run fleet:deploy`
 * has a perfectly real executable (`npm`) as its first token, and must still be REFUSED for the reason
 * already named there, not reclassified as prose for having a valid executable.
 *
 * `commandExists` IS INJECTABLE (`deps.commandExists`), defaulting to the real, subprocess-free `$PATH`
 * check above -- so a test can assert on a specific token resolving or not without depending on what
 * happens to be installed on whichever machine runs the suite.
 *
 * #510: `capabilities` defaults to `FULL_CAPABILITIES` -- every existing caller that never mentions the
 * new parameter keeps behaving exactly as before, because nothing is unmet against a job that can do
 * everything. `main()` passes the REAL job's capabilities; a test passes whatever it wants to exercise.
 *
 * @param {string} command
 * @param {{ commandExists?: (token: string) => boolean, capabilities?: JobCapabilities }} [deps]
 * @returns {Classification}
 */
export function classifyCommand(command,
  { commandExists: exists = commandExists, capabilities = FULL_CAPABILITIES } = {}) {
  for (const [pattern, reason] of [...FLEET_LAB_PATTERNS, ...CORPUS_PATTERNS]) {
    if (pattern.test(command)) return { verdict: "refused", reason };
  }
  const [firstUnmet] = unmetCommandRequirements(command, capabilities);
  if (firstUnmet) {
    return { verdict: "refused",
      reason: `needs \`${firstUnmet.requirement}\`, which this job does not have -- declared by `
        + firstUnmet.files.join(", ") };
  }
  const token = firstRealToken(command);
  if (!token) {
    return { verdict: "prose", reason: "is not a command (the line is empty)" };
  }
  const bareToken = token.replace(/^['"]|['"]$/g, "");
  if (UNVERIFIABLE_BUILTINS.has(bareToken)) {
    return { verdict: "prose",
      reason: `cannot verify anything -- \`${bareToken}\`'s exit code says nothing about whether the `
        + "claim in this line is true" };
  }
  if (!exists(token)) {
    return { verdict: "prose", reason: `is not a command (no executable "${token}")` };
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
  const missing = tsxTestFileArgs(command).filter((pattern) => {
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

// The full set of field names this parser recognises as SECTION HEADERS -- shared between the header
// pattern (where a section starts) and the stop pattern (where it ends), so the two can never disagree
// about what a header looks like. #438 added "Refutation" here rather than inventing a second parser: a
// bare `Refutation:` line has to end an in-progress `Acceptance:` block exactly the way `Mutation:`
// already did, or the refutation commands would be silently swallowed as more acceptance commands.
const SECTION_FIELD_NAMES = ["Acceptance", "Refutation", "Mutation"];

/**
 * #506: A MARKDOWN HEADING'S TRAILING TEXT IS A TITLE, NOT A COMMAND -- unless a colon follows the field
 * name, which is the one shape the inline-command form actually means (`Acceptance: <command>`, the shape
 * #353's own acceptance test uses). The single pattern this used to be could not tell the two apart: `##
 * Acceptance:?` and `(.*)` shared one capture group, so `## Acceptance -- old read vs new` and `##
 * Acceptance: npm test` produced the identical shape, and `extractSection` ran the FIRST as a command.
 * Caught live on PR #500: `## Acceptance — old read vs new, on the live queue` sent `— old read vs new, on
 * the live queue` to bash. Before #446 this would have been silently EXECUTED (a real word like `test` at
 * the front exits 0 on any non-empty string, a green acceptance that ran nothing -- #446's own defect,
 * arriving through the heading instead of a body line); after #446 it is a loud but wrongly-attributed
 * refusal, naming the missing executable rather than the heading that produced it.
 *
 * Two separate patterns, because a heading and the bold/plain form disagree about what "no colon" means:
 * a bare `## Acceptance` heading with no colon at all is the ESTABLISHED (#419) "commands come from the
 * lines below" shape, so a heading with prose after it and no colon must read the identical way, never as
 * a command. The bold/plain form has no such ambiguity -- `Acceptance:` always requires the colon to match
 * at all, so anything it captures was always meant as inline.
 * @param {string} fieldName
 * @returns {{ heading: RegExp, plain: RegExp }}
 */
function sectionHeaderPatterns(fieldName) {
  return {
    heading: new RegExp(`^\\s*#{1,6}\\s+${fieldName}(:)?\\s*(.*)$`),
    plain: new RegExp(`^\\s*(?:\\*\\*|__)?${fieldName}:(?:\\*\\*|__)?\\s*(.*)$`),
  };
}

/**
 * Whether `line` is this field's header, and -- the fact `sectionHeaderPatterns` alone cannot answer --
 * whether its trailing text is a command at all. `inline: null` means "matched, but nothing here is a
 * command" (a title-only heading); `inline: ""` and a non-empty string are both real captures, exactly as
 * the bare-header and inline-command shapes already behaved.
 * @param {string} fieldName
 * @param {string} line
 * @returns {{ matched: false } | { matched: true, inline: string | null }}
 */
function matchSectionHeader(fieldName, line) {
  const { heading, plain } = sectionHeaderPatterns(fieldName);
  const headingMatch = heading.exec(line);
  if (headingMatch) {
    const hasColon = headingMatch[1] === ":";
    return { matched: true, inline: hasColon ? headingMatch[2].trim() : null };
  }
  const plainMatch = plain.exec(line);
  if (plainMatch) return { matched: true, inline: plainMatch[1].trim() };
  return { matched: false };
}

/**
 * Pure. Finds a named section (`Acceptance:` or `Refutation:`) of a PR body and returns what it says,
 * never what it should say. One parser for both fields -- #438's own rule, because this parser has
 * already been fixed five times for forms authors keep writing (#419, #424, #432), and a second dialect
 * would need every one of those fixes again, silently, one form at a time.
 *
 * Supports two shapes, both seen in real PR bodies in this repo: the command INLINE on the header's own
 * line (`Acceptance: node -e "process.exit(1)"` -- the exact shape #353's own acceptance test uses), or a
 * bare header followed by one command per subsequent non-empty, non-comment line, up to a blank line, a
 * markdown heading, a fenced-code delimiter (stripped, not treated as a command), or another section's
 * header, whichever comes first.
 *
 * #419: A MARKDOWN HEADING IS THE HEADER TOO. `## Acceptance`, `## Acceptance:` and `### Acceptance:` all
 * used to parse as MISSING, because the pattern was anchored at the START of the line with no notion of a
 * `#` prefix -- and every OTHER section in this repo's own PR template uses `## ` headings, so that is the
 * natural shape an author reaches for. Four of seven open PRs failed on it at once. There is no reading in
 * which `## Acceptance` means something other than the field, so it is accepted rather than warned about --
 * "anything relying on a human to remember does not happen" applied to a parser instead of a person.
 *
 * @param {string} fieldName
 * @param {string | null | undefined} body
 * @returns {Section}
 */
function extractSection(fieldName, body) {
  const text = body ?? "";
  const lines = text.split(/\r\n|\r|\n/);
  const headerIndex = lines.findIndex((line) => matchSectionHeader(fieldName, line).matched);
  if (headerIndex === -1) return { kind: "missing" };

  const headerMatch = matchSectionHeader(fieldName, lines[headerIndex]);
  // `inline === null` is a title-only heading (#506) -- there is nothing here to run, and it must fall
  // through to `commandLinesAfter` exactly like a bare `## Acceptance` with nothing on its own line.
  const inline = (headerMatch.matched ? headerMatch.inline : null) ?? "";

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
 * @param {string | null | undefined} body
 * @returns {Section}
 */
export function extractAcceptanceSection(body) {
  return extractSection("Acceptance", body);
}

/**
 * #438: A GUARD CAN ONLY BE SHOWN TO BITE BY A COMMAND WHOSE SUCCESS IS A NON-ZERO EXIT, and
 * `acceptanceReport` hardcoded `passed = code === 0` -- so a PR demonstrating a refusal (the guard
 * correctly refusing a known-bad input) was reported as this job's own failure for doing exactly what it
 * set out to prove. Optional, unlike `Acceptance:` -- most PRs never refuse anything, so its absence is
 * not a MISSING verdict, it just means there is nothing more to run.
 * @param {string | null | undefined} body
 * @returns {Section}
 */
export function extractRefutationSection(body) {
  return extractSection("Refutation", body);
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
    // #438: stops on ANY of the three known section headers, not just Mutation:, so a bare (non-heading)
    // `Refutation:` line ends an in-progress Acceptance: block instead of being read as one more command.
    if (SECTION_FIELD_NAMES.some((name) => new RegExp(`^(?:\\*\\*|__)?${name}:(?:\\*\\*|__)?`, "i").test(trimmed))) break;
    const { command, consumed } = joinContinuations(lines, i, trimmed);
    commands.push(unwrapBackticks(command));
    i += consumed;
  }
  return commands;
}

/**
 * Runs one command and produces its report line and pass/fail -- shared between `Acceptance:` (success is
 * exit 0) and `Refutation:` (success is any NON-zero exit, #438), so classification and the file-argument
 * check cannot drift between the two the way a second, independently-written parser would risk.
 *
 * @param {string} command
 * @param {(command: string) => number} run
 * @param {{ prefix: "ACCEPTANCE" | "REFUTATION", isPass: (code: number) => boolean,
 *           commandExists?: (token: string) => boolean, capabilities?: JobCapabilities }} options
 * @returns {{ line: string, ok: boolean }}
 */
function runOneCommand(command, run, { prefix, isPass, commandExists: exists, capabilities }) {
  const classification = classifyCommand(command, { commandExists: exists, capabilities });
  if (classification.verdict === "refused") {
    return { line: `${prefix}: REFUSED ${command} -> ${classification.reason}`, ok: true };
  }
  // #446: A THIRD, DISTINCT LINE SHAPE -- neither RAN nor REFUSED, so it cannot be mistaken for either.
  // Unlike REFUSED (`ok: true`, a legitimate "not this job's to run"), this IS a failure: the line made a
  // claim the PR body cannot support, and CLAUDE.md's own rule applies -- two different faults ("your
  // command failed" and "that line was never a command") must not print the same word, because they need
  // opposite fixes. Never run -- there is nothing honest a line that was never a command could report by
  // being executed anyway.
  if (classification.verdict === "prose") {
    return { line: `${prefix}: "${command}" ${classification.reason}`, ok: false };
  }
  // CHECKED BEFORE RUNNING, never inferred from the exit code -- an unresolved test file/glob is
  // exactly the shape whose exit code cannot be trusted (#353's fifth hazard). Failing this here means
  // the real command never runs at all: there is nothing honest it could report.
  const fileCheck = testFileArgumentsResolve(command);
  if (!fileCheck.ok) {
    return { line: `${prefix}: RAN ${command} -> fail (matched no file: ${fileCheck.missing.join(", ")})`, ok: false };
  }
  const code = run(command);
  const passed = isPass(code);
  const verb = prefix === "ACCEPTANCE"
    ? (passed ? "pass" : "fail")
    // #438's own point: a Refutation: command that exits 0 is the FAILURE that matters -- the guard was
    // never shown to bite. "fail" here, not "pass", is what makes that absence loud instead of quiet.
    : (passed ? "refused" : "fail (did not refuse)");
  return { line: `${prefix}: RAN ${command} -> ${verb} (exit ${code})`, ok: passed };
}

/**
 * THE VERDICT, driven by an injectable `run` so every outcome (including a real exit code) is testable
 * without a subprocess. `run` returns the exit code; it is never asked to interpret one.
 *
 * `Acceptance:` is mandatory -- its absence is the MISSING verdict this whole job exists to catch.
 * `Refutation:` is optional (#438): most PRs demonstrate nothing refusing, so its absence just means
 * there is nothing more to run, never a failure in its own right.
 *
 * @param {string | null | undefined} body
 * @param {(command: string) => number} run
 * @param {{ commandExists?: (token: string) => boolean, capabilities?: JobCapabilities }} [deps] forwarded
 *   to `classifyCommand` (#446/#510) -- `commandExists` defaults to the real `$PATH` check; `capabilities`
 *   defaults to `jobCapabilities(body)`, so `main()` needs no changes at all to pick up the real job's
 *   environment, and a test overrides either to stay independent of what happens to be true of the machine
 *   or body the suite runs against.
 * @returns {{ ok: boolean, lines: string[] }}
 */
export function acceptanceReport(body, run, deps = {}) {
  const resolvedDeps = { capabilities: jobCapabilities(body), ...deps };
  const section = extractAcceptanceSection(body);
  if (section.kind === "missing") {
    return { ok: false, lines: ["ACCEPTANCE: MISSING"] };
  }

  let ok = true;
  const lines = [];
  if (section.kind === "none") {
    lines.push(`ACCEPTANCE: NONE -> ${section.reason}`);
  } else {
    for (const command of section.commands) {
      const result = runOneCommand(command, run,
        { prefix: "ACCEPTANCE", isPass: (code) => code === 0, ...resolvedDeps });
      lines.push(result.line);
      if (!result.ok) ok = false;
    }
  }

  const refutation = extractRefutationSection(body);
  if (refutation.kind === "none") {
    lines.push(`REFUTATION: NONE -> ${refutation.reason}`);
  } else if (refutation.kind === "commands") {
    for (const command of refutation.commands) {
      const result = runOneCommand(command, run,
        { prefix: "REFUTATION", isPass: (code) => code !== 0, ...resolvedDeps });
      lines.push(result.line);
      if (!result.ok) ok = false;
    }
  }
  // refutation.kind === "missing" -> nothing to report; the section is optional.

  // #497's OWN STATED BOUNDARY: "a PR carrying `History: full` and no historical fixture is asking for
  // something it does not use -- worth a warning, not a refusal, since the cost is only time." So this
  // never touches `ok` -- the one thing it must not become is a flag people add to make a red check green,
  // and a warning that could fail the job would be exactly that in the other direction.
  if (hasFullHistoryDeclaration(body)) {
    const allCommands = [
      ...(section.kind === "commands" ? section.commands : []),
      ...(refutation.kind === "commands" ? refutation.commands : []),
    ];
    if (!anyCommandUsesHistory(allCommands)) {
      lines.push("WARNING: `History: full` is declared, but no named test file declares "
        + "`// requires: history` -- this checkout is being deepened for nothing this PR uses.");
    }
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

// #471: A PR MUST DECLARE WHAT IT CLOSES, and an unrecognised body must not read as an honest opt-out.
// #468 -- the first merge armed under the PAT -- proved the pipeline works and produced this gap in the
// same run: `close-rows` correctly closed nothing, because the PR body declared nothing, and A0's own row
// stayed open while the work that closes it landed on main. The fix is the same shape #446 already built
// for `Acceptance:` -- "nobody wrote one" and "this deliberately has none" must read as different states --
// applied to the other half of the body.
//
// `Closes: none` with NO reason is MALFORMED, never folded into the opt-out -- the identical rule
// `extractSection`'s own `noneMatch` applies to `Acceptance:`, reused rather than re-derived.
//
// NEVER INFERS. Guessing the row from a branch name or a title would close the wrong issue the day the
// guess is wrong, and a wrongly-closed row is worse than an open one -- it leaves work that looks done.
// The declaration is the author's, in the body, or this reports MISSING/MALFORMED and the job fails.
const CLOSES_NONE_PATTERN = /\bCloses:\s*none\b([^\n]*)/i;
const CLOSES_LIST_PATTERN = /\bCloses:?\s*(#\d+(?:\s*(?:,|and)\s*#\d+)*)/i;
const CLOSES_MENTIONED_PATTERN = /\bCloses\b/i;

/**
 * Pure. Never infers a row from anything but the words the author wrote.
 *
 * Three shapes, and only three: `Closes #451` (also `Closes #451, #452`), `Closes: none — <reason>` (a
 * deliberate opt-out, reason required), and neither -- MISSING. A fourth shape exists and must not be
 * folded into any of those: the word "Closes" present but unparseable (prose with no number, or a number
 * that isn't digits) is MALFORMED, distinct from MISSING for the same reason `Acceptance:`'s own malformed
 * "none" is distinct from silence -- a check that cannot tell "wrote something wrong" from "wrote nothing"
 * cannot tell an author who tried from one who never noticed the field.
 *
 * @param {string | null | undefined} body
 * @returns {ClosesDeclaration}
 */
export function extractClosesDeclaration(body) {
  const text = body ?? "";
  const noneMatch = CLOSES_NONE_PATTERN.exec(text);
  if (noneMatch) {
    const reason = noneMatch[1].replace(/^[\s:—-]+/, "").trim();
    return reason.length > 0
      ? { kind: "none", reason }
      : { kind: "malformed", detail: "`Closes: none` names no reason" };
  }
  const listMatch = CLOSES_LIST_PATTERN.exec(text);
  if (listMatch) {
    const numbers = [...listMatch[1].matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
    return { kind: "closes", numbers };
  }
  if (CLOSES_MENTIONED_PATTERN.test(text)) {
    return { kind: "malformed",
      detail: "mentions \"Closes\" but names no `#<number>` and no `none — <reason>` opt-out" };
  }
  return { kind: "missing" };
}

/**
 * THE VERDICT. `ok: false` on both MISSING and MALFORMED -- deliberately the same boolean, because both
 * mean this job cannot tell what the PR closes, and a job that fails on one but not the other invites an
 * author to reach for the vaguer of the two whenever the precise one is inconvenient.
 * @param {string | null | undefined} body
 * @returns {{ ok: boolean, line: string }}
 */
export function closesDeclarationReport(body) {
  const declaration = extractClosesDeclaration(body);
  if (declaration.kind === "missing") {
    return { ok: false,
      line: "CLOSES: MISSING -- no `Closes #N` or `Closes: none — <reason>` declaration" };
  }
  if (declaration.kind === "malformed") {
    return { ok: false, line: `CLOSES: MALFORMED -- ${declaration.detail}` };
  }
  if (declaration.kind === "none") {
    return { ok: true, line: `CLOSES: NONE -> ${declaration.reason}` };
  }
  return { ok: true, line: `CLOSES: #${declaration.numbers.join(", #")}` };
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/acceptance-commands.mjs" });
  // FROM AN ENV VAR, NEVER ARGV -- a PR body is adversarial input (anyone can open a PR), and passing it
  // as a shell argument would put it on a command line for something else to misinterpret. GitHub Actions'
  // own `env:` mapping is what keeps it a single opaque string here, never re-parsed as shell.
  const body = process.env.PR_BODY ?? "";
  const report = acceptanceReport(body, runForReal);
  for (const line of report.lines) console.log(line);
  const closes = closesDeclarationReport(body);
  console.log(closes.line);
  process.exit(report.ok && closes.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
