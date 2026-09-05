/**
 * THE WORD LISTS THAT DECIDE 2.4.4, 1.1.1 AND 3.3.1 LIVE ON BOTH SIDES OF THE RULES/MODEL SPLIT, IN BOTH
 * LANGUAGES — architecture audit §9. A drift means the rule and the trained head can disagree about the
 * SAME page, and the corpus cannot see it: both were built from whichever list the generator happened to
 * use, so a divergence never shows up as a contaminated case.
 *
 * MEASURED FIRST, against real announcements rather than the literals — `announcement.ts`'s own header
 * records signal regexes breaking on a container prefix, and `placeholderOnlyIsPresent` stripping `^form,`
 * by name so a grammar change never reached it. The same trap applies here: comparing two word lists as
 * TEXT proves nothing about what they do to real NVDA output. Before writing this file, every pair below
 * was run against every unique `evidenceUnits` text value in the shipped training export (5,200 of them)
 * and every unique transcript/structure line in `runs/real-page-corpus` (2,245 of them) — not compared as
 * literals.
 *
 * THREE PAIRS, TWO DIFFERENT ANSWERS:
 *
 * - `FILENAME_RE` (rules.ts) / `FILENAME_GRAPHIC` (screenreader_features.py) — DRIFTED, with no stated
 *   reason on either side, and now ALIGNED and pinned. Python was missing `bmp` and the extensionless
 *   `IMG_1234` shape (arguably the commonest bad-alt filename a camera default produces) and separately
 *   matched a bare extension word ANYWHERE in the evidence, which is exactly the kind of unbounded feature
 *   ADR 0015's shortcut audits exist to catch. Confirmed safe to align: 0 of 5,200 real evidenceUnits
 *   values classified differently either way, so the fix could not retroactively change what any SHIPPED
 *   weight was fitted to.
 * - `ANNOUNCED_ERROR_TEXT` (rules.ts) / `ERROR_WORD` (screenreader_features.py) — IDENTICAL today, with no
 *   guard against silently drifting apart. Pinned so a future edit to one is caught immediately rather
 *   than discovered as a contaminated corpus case.
 *
 * TWO PAIRS DELIBERATELY EXCLUDED FROM ANY PIN, because equality is not the right invariant:
 *
 * - `VAGUE_LINK_NAMES` (rules.ts) / `VAGUE_LINKS` (screenreader_features.py) answer DIFFERENT criteria —
 *   2.4.4 (Link Purpose In Context, which context can rescue) and 2.4.9 (Link Purpose, Link Only, AAA,
 *   which it cannot) respectively. `vague_link_present` was removed as a bare model input for exactly this
 *   reason (see `vague_link_lacks_context`'s own header): the two questions must stay separate, or a linear
 *   head cannot represent their conjunction. A test asserting these are equal would be asking for the
 *   regression that already happened once.
 * - `ERROR_TEXT` (local-judge.ts) is a deliberately WIDER, applicability-only vocabulary ("does the
 *   on-screen prompt look error-related at all") against the narrow, scoring-facing pair above ("did NVDA
 *   actually say an error"). Its own comment states the distinction; this file only confirms the exclusion
 *   is intentional rather than an oversight, so a future reader does not "fix" it into the pin.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RULES = readFileSync(fileURLToPath(new URL("./rules.ts", import.meta.url)), "utf8");
const LOCAL_JUDGE = readFileSync(fileURLToPath(new URL("./local-judge.ts", import.meta.url)), "utf8");
const FEATURES = readFileSync(
  fileURLToPath(new URL("../../scorer/python/screenreader_features.py", import.meta.url)), "utf8");

/** A `const NAME = /pattern/flags;` declaration's pattern body, from TypeScript source. */
function tsRegexBody(source: string, name: string): string {
  const match = new RegExp(`const ${name}\\s*=\\s*/((?:\\\\/|[^/])+)/[a-z]*;`).exec(source);
  assert.ok(match, `${name} not found in its expected \`const NAME = /.../\` shape — this scan is broken`);
  return match![1];
}

/** A `NAME = re.compile(r"pattern", ...)` declaration's pattern body, from Python source, across line wraps. */
function pyRegexBody(source: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*re\\.compile\\(\\s*\\n?\\s*r"((?:[^"\\\\]|\\\\.)*)"`).exec(source);
  assert.ok(match, `${name} not found in its expected \`NAME = re.compile(r"...")\` shape — this scan is broken`);
  return match![1];
}

test("FILENAME_RE (rules.ts) and FILENAME_GRAPHIC (screenreader_features.py) are pinned equal", () => {
  const ts = tsRegexBody(RULES, "FILENAME_RE");
  const py = pyRegexBody(FEATURES, "FILENAME_GRAPHIC");
  assert.equal(py, ts,
    "the two filename-alt-text patterns have drifted -- edit both together, or the rule (1.1.1:filename-alt, "
    + "which ASSERTS) and the model feature will disagree about the same page");
});

test("ANNOUNCED_ERROR_TEXT (rules.ts) and ERROR_WORD (screenreader_features.py) are pinned equal", () => {
  const ts = tsRegexBody(RULES, "ANNOUNCED_ERROR_TEXT");
  const py = pyRegexBody(FEATURES, "ERROR_WORD");
  assert.equal(py, ts,
    "the two \"did NVDA actually say an error\" patterns have drifted -- edit both together");
});

test("VAGUE_LINK_NAMES and VAGUE_LINKS answer DIFFERENT criteria and must stay different", () => {
  // Not an equality pin -- the opposite. This is the canary that would fire if someone "fixed" the two
  // into alignment, which is the exact regression `vague_link_present`'s removal already paid for once.
  const rulesSection = RULES.slice(RULES.indexOf("const VAGUE_LINK_NAMES"));
  const namesMatch = /const VAGUE_LINK_NAMES = new Set\(\[([^\]]*)\]\)/.exec(rulesSection);
  assert.ok(namesMatch, "VAGUE_LINK_NAMES not found in its expected shape");
  const ruleWords = new Set(JSON.parse(`[${namesMatch![1]}]`) as string[]);

  const linksMatch = /VAGUE_LINKS = \{([^}]*)\}/.exec(FEATURES);
  assert.ok(linksMatch, "VAGUE_LINKS not found in its expected shape");
  const modelWords = new Set(
    (linksMatch![1].match(/"([^"]*)"/g) ?? []).map((s) => JSON.parse(s) as string));

  // The exact words 2.4.4's own note says context rescues, and 2.4.9's list therefore must still carry.
  // If either goes missing, the deliberate split has quietly become an accidental one.
  for (const rescued of ["read more", "learn more", "details"]) {
    assert.ok(modelWords.has(rescued),
      `VAGUE_LINKS lost "${rescued}" -- it exists specifically because context CANNOT rescue it for 2.4.9, `
      + "even though 2.4.4's rule excludes it for the opposite reason");
    assert.ok(!ruleWords.has(rescued),
      `VAGUE_LINK_NAMES gained "${rescued}" -- 2.4.4 is Link Purpose IN CONTEXT and this word is excluded `
      + "specifically because context usually supplies it; asserting on it would report a large share of the web");
  }
});

test("local-judge.ts's ERROR_TEXT is declared, in its own comment, as deliberately wider", () => {
  // Confirms the exclusion from the pin above is a decision that is still written down, not merely true
  // today by accident of nobody having touched the comment.
  const section = LOCAL_JUDGE.slice(LOCAL_JUDGE.indexOf("const ERROR_TEXT") - 400, LOCAL_JUDGE.indexOf("const ERROR_TEXT"));
  assert.match(section, /DELIBERATELY WIDER/,
    "ERROR_TEXT's exclusion from the vocabulary pin is no longer documented at its definition -- a reader "
    + "has no way to tell this apart from an oversight");
});
