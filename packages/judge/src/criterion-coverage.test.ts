/**
 * The coverage map must not drift from what ships, in EITHER direction.
 *
 * A map that says a criterion is unreachable after someone made it work is a roadmap that sends people
 * to build what exists. A map that says a criterion is assessed when it is not is the over-claim that
 * `coverage.ts` was written to prevent, one level of detail down. Both are caught here.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WCAG_22_AA } from "@a11y-witness/evidence/wcag";

import { assessedCriteria } from "./coverage.js";
import { CRITERION_COVERAGE, channelsPresent, criteriaAssessableFrom } from "./criterion-coverage.js";

test("every WCAG 2.2 AA criterion has an entry, and nothing else does", () => {
  const real = WCAG_22_AA.map((c) => c.num).sort();
  assert.deepEqual(Object.keys(CRITERION_COVERAGE).sort(), real,
    "the map must cover all 55 and invent none — a criterion with no entry is one nobody has decided about");
});

test("the assessed entries are exactly what the judge can return a finding for", () => {
  const claimed = Object.entries(CRITERION_COVERAGE)
    .filter(([, c]) => c.status === "assessed" || c.status === "partial")
    .map(([num]) => num).sort();
  assert.deepEqual(claimed, assessedCriteria(),
    "coverage.ts and this map disagree about what ships — one of them is lying to a consumer");
});

test("anything not assessed says what evidence it would need", () => {
  // Without this the map degrades into the same undifferentiated `untested` bucket it exists to replace.
  for (const [num, entry] of Object.entries(CRITERION_COVERAGE)) {
    if (entry.status === "assessed") continue;
    assert.ok(entry.needs?.length, `${num} is ${entry.status} and names no evidence source`);
  }
});

test("every entry carries a reason, not just a status", () => {
  for (const [num, entry] of Object.entries(CRITERION_COVERAGE)) {
    assert.ok(entry.note.length > 30, `${num}: a status with no argument is not a decision`);
  }
});

test("4.1.2 is recorded as PARTIAL, because one of its failure modes is unassessable", () => {
  // The case this map exists for. Reported at criterion granularity a fake-button page reads as fine;
  // it is not, and `rule-ownership.json` declares that subtype `unavailable` for the same reason.
  assert.equal(CRITERION_COVERAGE["4.1.2"].status, "partial");
  assert.match(CRITERION_COVERAGE["4.1.2"].note, /role-less|div onclick/i);
});

test("4.1.2's note accounts for all THREE clauses, including the settable one", () => {
  // Found by the 2026-09-04 criterion audit and closed 2026-09-05. The note read "two of three failure
  // modes are covered", counting the role-less div as the third -- but that is a second failure mode of
  // the FIRST clause (no role), so the criterion's actual second clause was not enumerated anywhere and
  // the entry read as covering more than it did. The criterion, verbatim: "the name and role can be
  // programmatically determined; STATES, PROPERTIES, AND VALUES THAT CAN BE SET BY THE USER CAN BE
  // PROGRAMMATICALLY SET; and notification of changes to these items is available".
  //
  // This is the file whose entire purpose is honesty about coverage, so an unstated clause is the one
  // defect it cannot tolerate. Pinned rather than trusted to prose.
  const note = CRITERION_COVERAGE["4.1.2"].note;
  assert.match(note, /programmatically set|settab/i,
    "4.1.2's note no longer states the SETTABILITY clause, so the entry reads as covering the whole "
    + "criterion bar one gap. It covers the name half of clause 1 and clause 3.");
  assert.match(note, /clause/i, "the note no longer distinguishes the criterion's clauses from failure modes");

  // The stale claim that came back once already: ADR 0021 moved state-change-silent to the RULES on
  // 2026-08-24, and this note went on calling it head-decided with 18 free vetoes for eleven days.
  assert.doesNotMatch(note, /`?state-change-silent`? is head-decided/i,
    "the note claims state-change-silent is head-decided. ADR 0021 moved it to the rules; "
    + "rule-ownership.json is the authority and says `decidedBy: rules`.");
});

test("every criterion that could be assessed names the CHANNELS it reads", () => {
  // The `needs` axis says which SOURCE could decide a criterion; it cannot answer "can this capture decide
  // it?". Without channels that question cost an afternoon of walking 4,899 captures over SSH.
  for (const [num, entry] of Object.entries(CRITERION_COVERAGE)) {
    if (entry.status === "out-of-scope") continue;
    assert.ok(entry.channels?.length, `${num} is ${entry.status} and names no evidence channel`);
  }
});

test("out-of-scope criteria name NO channel, because none could carry them", () => {
  // Not "unknown" — genuinely none. A channel here would imply a probe could reach it, which is the
  // distinction this whole map exists to preserve.
  for (const [num, entry] of Object.entries(CRITERION_COVERAGE)) {
    if (entry.status !== "out-of-scope") continue;
    assert.ok(!entry.channels?.length, `${num} is out-of-scope but claims a channel`);
  }
});

test("an empty channel counts as ABSENT, not as a clean result", () => {
  // The distinction this project keeps paying for. An empty `formChanges` and a probe that never ran are the
  // same shape on disk, and treating the first as evidence is how "we did not look" becomes "nothing there".
  const present = channelsPresent({ transcript: ["a"], interaction: { formChanges: [], focusOrder: ["x"] } });
  assert.ok(present.has("transcript"));
  assert.ok(present.has("focusOrder"));
  assert.ok(!present.has("formChanges"), "an empty array is not evidence");
});

test("a capture with no focus probe cannot assess the focusOrder criteria — the afternoon, as a call", () => {
  // Reproduces a measured fact: `probeFocus` is opt-in, the dataset runner never sets it, so no corpus
  // capture carries `focusOrder`, and every criterion reading it is unassessable there.
  const corpusShaped = {
    transcript: ["heading, level 1, Thing"],
    structure: { headings: ["Thing"], formFields: ["Email, edit"] },
    interaction: { controls: ["Save, button"], formChanges: [{ control: "Email", after: "" }] },
  };
  const { assessable, blocked } = criteriaAssessableFrom(corpusShaped);

  const blockedOnFocus = blocked.filter((b) => b.missing.includes("focusOrder")).map((b) => b.criterion);
  assert.ok(blockedOnFocus.includes("2.1.2"), "2.1.2 reads focusOrder and must be reported blocked");
  assert.ok(blockedOnFocus.includes("2.4.1"), "2.4.1 reads focusOrder");
  assert.ok(!assessable.includes("2.1.2"), "a criterion must never be assessable without its channels");
});

test("out-of-scope criteria are absent from BOTH lists, not reported as blocked", () => {
  // Listing 1.4.3 Contrast as "blocked" would imply a probe could fix it. Nothing is missing; it is simply
  // not this tool's business, and the two must not read alike.
  const { assessable, blocked } = criteriaAssessableFrom({ transcript: ["x"] });
  const names = [...assessable, ...blocked.map((b) => b.criterion)];
  assert.ok(!names.includes("1.4.3"), "contrast is out of scope, not blocked");
});

test("routeChange is a channel a capture can CARRY, not one permanently absent", () => {
  // It was in the `EvidenceChannel` union and missing from `INTERACTION_CHANNELS`, so `channelsPresent`
  // could never report it — and 2.4.1 and 2.4.2, which declare it, read as BLOCKED on every capture ever
  // taken. Measured on `route-title-stale.good.json`, the fixture built to demonstrate 2.4.2: it carries
  // the evidence and was told it did not.
  //
  // `tsc` could not see it: every member of a wider union is a valid element of a narrower array. The
  // arrays are now derived from an exhaustive `Record<EvidenceChannel, ...>`, so a new channel fails to
  // compile until it is classified.
  const present = channelsPresent({
    transcript: ["x"],
    interaction: { routeChange: { titleBefore: "Home", titleAfter: "Bookings - Home" } },
  });
  assert.ok(present.has("routeChange"), `routeChange must be reported present: ${[...present]}`);
});

test("an OBJECT channel counts as carried; classifying it alone would not have been enough", () => {
  // `routeChange` is `{control, titleBefore, ...}`, not a list. `nonEmpty` tested `Array.isArray`, so
  // adding it to the enumeration without widening that test leaves it permanently absent — a channel
  // listed as covered while the reader cannot see its shape, which examines nothing.
  assert.ok(!channelsPresent({ interaction: { routeChange: {} } }).has("routeChange"),
    "an EMPTY object is absence, exactly as an empty array is");
  assert.ok(channelsPresent({ interaction: { routeChange: { titleAfter: "x" } } }).has("routeChange"));
});

test("2.4.2 is assessable from a capture carrying a routeChange", () => {
  // Its declared channels are `title` and `routeChange`. `title` lives in the `documentReady` DIAGNOSTIC
  // rather than in the capture result, which `channelsPresent` documents — my first version of this test
  // supplied `structure.links` instead and failed, because `SWEEPS_FEEDING` in outcomes.ts lists
  // `["link", "routeChange"]` for the same criterion and I read one for the other. They answer different
  // questions and both are right: which sweeps, if truncated, make the CLAIM unsafe, versus which
  // evidence must be present to DECIDE at all.
  const { assessable } = criteriaAssessableFrom({
    transcript: ["Home, document"],
    diagnostics: [{ event: "documentReady", title: "Home" }],
    interaction: { routeChange: { titleBefore: "Home", titleAfter: "Home" } },
  });
  assert.ok(assessable.includes("2.4.2"),
    `2.4.2 needs title+routeChange and both are present: ${JSON.stringify(assessable)}`);
});

test("3.2.1 and 3.2.2's notes state that a title diff is broader than WCAG's 'change of context'", () => {
  // 2026-09-06 `wcag-criterion-check`: the criterion defines change of context as a change to user agent,
  // viewport, FOCUS, or page meaning, and says outright "a change of content is not always a change of
  // context". `contextChanged` (rules.ts) reads only whether two title STRINGS differ, which is strictly
  // broader -- a page appending a result count was once ASSERTED against under exactly this predicate
  // (docs/backlog.md, 2026-09-04) before it was downgraded to `secondary`. That downgrade is the closure;
  // this pins that the REASON is stated where the coverage claim lives, not left to be re-derived.
  for (const num of ["3.2.1", "3.2.2"] as const) {
    const note = CRITERION_COVERAGE[num].note;
    assert.match(note, /change of context/i,
      `${num}'s note must name the criterion's own term, not a paraphrase of it`);
    assert.match(note, /content is not always a change of context|broader than/i,
      `${num}'s note must state that a title diff is broader than a change of context, not merely `
      + "correlated with one");
    assert.match(note, /secondary/,
      `${num}'s note must connect the scope limit to WHY the mapping is secondary (referral, not `
      + "assertion) -- a limit stated with no consequence attached is trivia, not a decision");
  }
});

/** Every non-test `.ts`/`.mjs` source file under `dir`, skipping `node_modules`, `dist` and dotfiles. */
function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) { out.push(...sourceFilesUnder(full)); continue; }
    if (/\.test\.(ts|mjs)$/.test(name)) continue; // any OTHER test may call it too, harmlessly
    if (/\.(ts|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

// Below this, the walk has genuinely found nothing -- `sourceFilesUnder`'s own `readdirSync` swallows a
// missing/wrong `repoRoot` into `[]`, which is precisely the shape that would move a resolution failure
// into `offenders` reading clean. The one thing that would break `repoRoot` is moving THIS FILE, which is
// exactly when the guard is most needed -- the `SIGNAL_TYPES` scrape and the `sweepLog` guard that
// "passed against the very corpus carrying 604 crashes" are both this same defect.
const MIN_EXPECTED_SOURCE_FILES = 100;

test("criteriaAssessableFrom has no production caller -- dead-by-design, not dead-by-accident", () => {
  // Established by grep, not assumed or inherited from a peer's earlier grep: this walks packages/ and
  // scripts/ itself, because trusting a remembered audit is exactly the mistake this test exists to
  // prevent -- see the function's own doc comment for the incident that prompted it. The definition file
  // is exempt: its own declaration line contains the literal substring being searched for.
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const definitionFile = fileURLToPath(new URL("./criterion-coverage.ts", import.meta.url));
  const files = [
    ...sourceFilesUnder(resolve(repoRoot, "packages")),
    ...sourceFilesUnder(resolve(repoRoot, "scripts")),
  ].filter((f) => f !== definitionFile);

  // ANTI-VACUITY: a resolution failure must fail LOUDLY, before the deepEqual below gets a chance to pass
  // having examined nothing.
  assert.ok(files.length > MIN_EXPECTED_SOURCE_FILES,
    `walked only ${files.length} file(s) under ${repoRoot} -- this looks like a broken repoRoot resolution `
    + "(readdirSync swallows a missing directory into []), not a small repo. The offender list below "
    + "cannot be trusted until this walk finds a realistic population.");

  const offenders = files.filter((f) => readFileSync(f, "utf8").includes("criteriaAssessableFrom("));

  assert.deepEqual(offenders, [],
    `criteriaAssessableFrom( appears in non-test code: ${offenders.join(", ")} -- this is a plain text `
    + "search and a match may be a COMMENT mentioning the call rather than an actual call site, so check "
    + "the line before concluding it shipped. Either way: it has shipped (delete this test and the "
    + "warning above the function) or it is a stray caller nobody decided on (revert it).");
});

