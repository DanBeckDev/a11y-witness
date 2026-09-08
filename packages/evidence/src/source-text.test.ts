import { test } from "node:test";
import assert from "node:assert/strict";
import { stripComments } from "./source-text.js";

test("a line comment is removed", () => {
  assert.equal(stripComments("const a = 1; // trailing comment\nconst b = 2;"),
    "const a = 1; \nconst b = 2;");
});

test("a block comment is removed, including one spanning multiple lines", () => {
  assert.equal(stripComments("const a = /* inline */ 1;"), "const a =  1;");
  assert.equal(stripComments("const a = 1;\n/*\n * a paragraph\n */\nconst b = 2;"),
    "const a = 1;\n\nconst b = 2;");
});

// THE RISK NAMED EXPLICITLY BEFORE THIS FUNCTION WAS WRITTEN, so it is a requirement here, not an
// afterthought: a URL in a string literal contains `//` and must survive whole.
test("a URL inside a string literal survives -- this is the reason a naive strip is unsafe", () => {
  const source = 'const url = "https://example.com/path";';
  assert.equal(stripComments(source), source, "nothing here is a comment; the string must be untouched");
});

test("a URL in a single-quoted string and a template literal both survive", () => {
  assert.equal(stripComments("const a = 'https://example.com';"), "const a = 'https://example.com';");
  assert.equal(stripComments("const a = `see https://example.com for more`;"),
    "const a = `see https://example.com for more`;");
});

test("a block-comment-shaped sequence inside a string survives", () => {
  const source = 'const s = "this is /* not a comment */ actually a string";';
  assert.equal(stripComments(source), source);
});

test("an escaped quote inside a string does not end the string early", () => {
  // If the escape were not honoured, the string would appear to end at \" and the // later on the line
  // would be read as inside code rather than inside the (still-open) string -- or vice versa. Either
  // misreading corrupts everything the guard extracts afterward on affected lines.
  const source = 'const s = "say \\"hi // not a comment\\""; // this one IS a comment';
  assert.equal(stripComments(source), 'const s = "say \\"hi // not a comment\\""; ');
});

test("a comment after real code on the same line is still stripped", () => {
  // One of the three hand-rolled strippers this function replaces only matched a `//` that was the ENTIRE
  // line (only whitespace before it), so a trailing same-line comment survived untouched. This function
  // must not repeat that gap.
  assert.equal(stripComments('const x = 1; // trailing'), "const x = 1; ");
});

test("comments inside comments are not double-unwrapped, and nesting-looking text is inert", () => {
  assert.equal(stripComments("/* outer /* not nested */ still code */"), " still code */");
});

// THE THREE REAL INCIDENTS, reproduced as regression fixtures rather than left as prose in a comment.
test("a call site's own explanatory paragraph does not manufacture a match -- the mapping-parity incident", () => {
  const source = "/**\n"
    + " * Downgraded to secondary. The word conformance appears here, in the paragraph explaining why,\n"
    + " * not in a real add(..., \"conformance\") call.\n"
    + " */\n"
    + "add(\"3.3.3 ...\", \"issue\", \"evidence\");\n";
  const stripped = stripComments(source);
  assert.ok(!stripped.includes("conformance"),
    "the word must be gone once the comment naming it is stripped, leaving only the real call site");
});

test("a field's own doc comment naming it does not stand in for the field being present -- the "
  + "probe-results-reach-the-channel incident", () => {
  const withField = "return {\n  // focusReveal: 1.4.13's verdict, forwarded here.\n  ...(focusReveal ? "
    + "{ focusReveal } : {}),\n};";
  const withoutField = "return {\n  // focusReveal: 1.4.13's verdict, forwarded here.\n};";
  const stillMentionsIt = (text: string) => new RegExp("\\bfocusReveal\\b").test(stripComments(text));
  assert.equal(stillMentionsIt(withField), true, "the real spread must still be visible once stripped");
  assert.equal(stillMentionsIt(withoutField), false,
    "with the spread deleted, only the comment named the field -- and the comment must be gone");
});

test("two functions with an identical comment do not bleed into each other once comments are gone", () => {
  // The near miss recorded in this function's own docstring: an extraction anchored on a comment matched a
  // SIBLING function's identical one. Stripping comments first means an anchor must be a real code token,
  // which cannot collide the same way.
  const source = "// Sequenced first, for the reason stated above.\n"
    + "function probeA() { return 1; }\n"
    + "// Sequenced first, for the reason stated above.\n"
    + "function probeB() { return 2; }\n";
  const stripped = stripComments(source);
  assert.equal(stripped.indexOf("Sequenced"), -1);
  assert.equal([...stripped.matchAll(/function (\w+)/g)].map((m) => m[1]).join(","), "probeA,probeB");
});

// KNOWN, DOCUMENTED LIMITATIONS -- stated as passing tests that pin the boundary, not hidden.
test("KNOWN LIMITATION: a comment inside a template literal's ${} interpolation is not stripped", () => {
  const source = "const s = `value: ${/* not stripped */ 1}`;";
  assert.equal(stripComments(source), source,
    "the whole template literal, interpolation included, is treated as string content -- documented in "
      + "this function's own comment, not a silent gap");
});

// FIXED, having stopped being hypothetical -- A2/#453. A nested template literal inside an interpolation
// used to corrupt the OUTER literal's own end, silently swallowing real code after it -- but only when the
// TOTAL backtick count inside the interpolation is ODD. An even count (one simple `` `a` : `b` `` ternary,
// say) happens to resynchronise by luck: each misidentified boundary just shifts which characters read as
// "inside" a string, and with an even number of delimiters the drift cancels out by the true end anyway.
// So the naive regression case is not a regression case at all -- verified before trusting it, by running
// the OLD (unfixed) scanner against it and finding it survived unchanged. The real incident had an ODD
// count, from string CONCATENATION (`` `a` + `b` ``) mixed into the ternary, which does not resynchronise.
test("MUTATION TARGET: the exact shape measured on scripts/select-changed-tests.mjs -- concatenated "
  + "template literals inside a ternary inside one interpolation, ODD backtick count, real code after it", () => {
  const source = "function report(result) {\n"
    + "  console.log(`select-changed-tests: ${result.broad.length > 0\n"
    + "    ? `BROAD -- ${result.broad.length} file(s) outside packages/*/src/ (${result.broad.slice(0, 5)"
    + ".join(\", \")}` + `${result.broad.length > 5 ? \", ...\" : \"\"}), falling back`\n"
    + "    : `${result.selectedTests.length} test file(s) selected precisely` + (result.fallbackPackages"
    + ".length > 0\n"
    + "      ? `, plus the full suite of ${result.fallbackPackages.length} package(s)`\n"
    + "      : \"\")}`);\n"
    + "}\n"
    + "function main() {\n"
    + "  refuseUnknownFlags([], { entry: import.meta.url });\n"
    + "}\n";
  const stripped = stripComments(source);
  assert.ok(stripped.includes("refuseUnknownFlags("),
    "the real call after the corrupting template literal must survive stripping -- this is the exact "
      + "shape that made a guarded file (select-changed-tests.mjs) read as unguarded");
});

test("a comment INSIDE a nested-template interpolation is still not stripped -- the KNOWN LIMITATION "
  + "above is unchanged by the nesting fix, only the outer literal's END is now found correctly", () => {
  const source = "const s = `${cond ? `/* not stripped */a` : `b`}`;";
  assert.equal(stripComments(source), source);
});

// FIXED, having stopped being hypothetical a second time in the same fix -- the FIRST version of
// `skipInterpolation` (walking an interpolation as full code, comments included) reproduced this repo's
// own already-documented, accepted limitation ("a regex literal is not distinguished from a division") in
// a MUCH more damaging place. `/^https?:\/\//` (stripping a URL scheme -- a real, common pattern in this
// codebase) contains an escaped slash immediately followed by the regex's own closing slash, which reads
// as a line-comment start. At the top level that costs one unstripped line; INSIDE an interpolation it
// swallowed the interpolation's own closing `}` (and the outer literal's closing backtick with it),
// corrupting everything scanned afterward -- measured for real on `calibrate-abstention.mjs`, where it
// misread three later, unrelated `//` comments as still being inside the first string.
test("MUTATION TARGET: a regex literal inside an interpolation does not corrupt the outer literal's end", () => {
  const source = "function report(item) {\n"
    + "  process.stdout.write(`    ${item.criterion}  `\n"
    + "    + `${String(item.url).replace(/^https?:\\/\\//, \"\").slice(0, 52)}\\n`);\n"
    + "}\n"
    + "function main() {\n"
    + "  // a real comment that must still be stripped\n"
    + "  refuseUnknownFlags([], { entry: import.meta.url });\n"
    + "}\n";
  const stripped = stripComments(source);
  assert.ok(stripped.includes("refuseUnknownFlags("),
    "the real call after the corrupting regex-in-interpolation must survive stripping");
  assert.ok(!stripped.includes("a real comment"),
    "a genuine top-level comment AFTER the interpolation must still be stripped normally -- proving the "
      + "scanner's state was not left corrupted");
});

test("KNOWN LIMITATION: a regex literal is not distinguished from a division, so `//` inside one can "
  + "be misread as a comment start", () => {
  // Written to PIN the limitation, not to endorse it: if a guard this helper serves ever needs a regex
  // literal containing `//` handled correctly, this test is where that requirement would first be stated,
  // and it would need to fail before the fix landed.
  const source = "const r = /a\\/\\//;"; // a regex literal containing two escaped slashes
  const stripped = stripComments(source);
  assert.notEqual(stripped, source,
    "this documents that the naive slash-scan sees a comment start inside the regex literal -- if this "
      + "assertion ever starts failing, the limitation has been fixed and this test should be inverted");
});
