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
