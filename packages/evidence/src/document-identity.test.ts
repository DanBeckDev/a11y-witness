import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  IDENTITY_COMPONENTS, compareIdentity, documentIdentity, identitySentence, servedPathOf,
} from "./document-identity.js";

import fixture from "./fixtures/calendly-687.json" with { type: "json" };

/**
 * #687's acceptance clause 1, pinned where CI can run it.
 *
 * The two records the row names live in `runs/witness/`, which CI cannot see — so the three marks
 * `documentIdentity` reads were extracted from them verbatim into `fixtures/calendly-687.json`, with the
 * source path and the file's sha256 recorded beside each. The corpus test below runs the SAME assertion
 * against the real files when they are present, so the fixture cannot quietly drift from what it quotes.
 */
const [first, second] = fixture.captures;

test("the two calendly captures of one URL are reported as DIFFERENT documents", () => {
  const before = documentIdentity(first.capture);
  const after = documentIdentity(second.capture);
  const result = compareIdentity(before, after);

  assert.equal(result.verdict, "DIFFERENT_DOCUMENT",
    `both records say url ${JSON.stringify(first.capture.url)}; the served documents are `
    + `${before.components.servedPath} and ${after.components.servedPath}`);
  // NAMED, not just counted. "different" that cannot say in what respect sends the reader back to the
  // capture path, which is the outcome this row exists to prevent.
  //
  // `servedPath` ALONE, and the missing `title` is the measurement rather than a gap: the 10:42 capture
  // contradicts itself about its own title (below), so a title comparison here would be comparing one
  // capture's ambiguity against the other's fact.
  assert.deepEqual(result.differing.map((d) => d.component), ["servedPath"]);
  assert.deepEqual(result.incomparable, ["title"]);
  assert.deepEqual(result.unstable, ["title"]);
  assert.equal(before.components.servedPath, "https://accounts.google.com/v3/signin/identifier");
  assert.equal(after.components.servedPath, "https://calendly.com/scheduling");
  assert.notEqual(before.digest, after.digest);
});

/**
 * ONE CAPTURE, TWO DOCUMENTS — found by MEASURING the records rather than by reading the row.
 *
 * `documentIdentity` originally took the FIRST `titleSource` mark. The 10:42 record carries eleven of
 * them: ten say "Sign in - Google Accounts" and the last says "Privacy Notice Calendly". Taking the
 * first picked one of two documents and the choice was invisible in the result.
 */
test("a capture whose own marks name two documents has no single identity", () => {
  const straddling = documentIdentity(first.capture);
  assert.equal(straddling.components.title, undefined,
    "a contradicted component must not appear as though it were read");
  assert.deepEqual(straddling.unstable.title,
    // The ZERO-WIDTH SPACE is Edge's own, in the window title NVDA reads. Escaped rather than pasted, so
    // an invisible character cannot be lost by an editor and turn this into a test of nothing.
    ["Sign in - Google Accounts", "Privacy Notice Calendly - Profile 1 - Microsoft\u200B Edge"]);
  // AND IT MUST BE IN THE REPORT. A capture straddling two pages is a louder finding than two captures
  // differing, and it was silent in the first version of the sentence.
  assert.match(identitySentence(straddling), /NAMED MORE THAN ONE DOCUMENT/);
  assert.match(identitySentence(documentIdentity(second.capture)), /^(?!.*NAMED MORE THAN ONE)/s);
});

/**
 * THE MUTATION #687's ACCEPTANCE CLAUSE 2 ASKS FOR, run as a test rather than by hand: a digest that
 * cannot vary makes the assertion above vacuous, so the check must be able to state that it would.
 *
 * A guard never shown to refuse is not a verified guard, and this one's whole job is to refuse.
 */
test("a constant identity turns the calendly assertion red", () => {
  const constant = { ...documentIdentity(first.capture) };
  const result = compareIdentity(constant, { ...constant });
  assert.equal(result.verdict, "SAME_DOCUMENT",
    "with both sides made identical the comparison must say SAME — if it still says DIFFERENT, the "
    + "assertion above is passing for a reason unrelated to the two documents");
});

test("no census and no title is UNCOMPARABLE, never SAME", () => {
  // THE VACUITY FAILURE THIS MODULE WOULD OTHERWISE HAVE. Two captures with nothing to read digest
  // identically — an empty canonical string — so a comparison resting on digest equality would have
  // called every unexamined pair the same page. `compared.length === 0` is the floor that stops it.
  const empty = documentIdentity({ diagnostics: [] });
  assert.deepEqual(empty.read, []);
  const result = compareIdentity(empty, documentIdentity({ diagnostics: [] }));
  assert.equal(result.verdict, "UNCOMPARABLE");
  assert.deepEqual(result.compared, []);
  assert.deepEqual(result.incomparable, [...IDENTITY_COMPONENTS]);
});

test("a component one capture has and the other lacks is incomparable, not a difference", () => {
  // A corpus capture carries `structureCensus` with no `targetUrl` and no `titleSource` at all; a
  // real-page capture carries both. Reading the absence as a difference would declare every such pair a
  // different document — the absence of a measurement is not the measurement zero (#677).
  const withTitle = documentIdentity({ diagnostics: [
    { event: "structureCensus", targetUrl: "https://example.org/a", heading: 3 },
    { event: "titleSource", title: "A", source: "document" },
  ] });
  const withoutTitle = documentIdentity({ diagnostics: [
    { event: "structureCensus", targetUrl: "https://example.org/a", heading: 3 },
  ] });
  const result = compareIdentity(withTitle, withoutTitle);
  assert.equal(result.verdict, "SAME_DOCUMENT");
  assert.deepEqual(result.compared, ["servedPath"]);
  assert.deepEqual(result.incomparable, ["title"]);
});

test("a document title and a spoken title are not compared against each other", () => {
  // `titleSourceVerdict` picks one read per capture. NVDA's spoken title carries the browser window's
  // own furniture ("… - Profile 1 - Microsoft Edge"); `document.title` does not. Comparing the two would
  // report a difference between two READINGS as a difference between two pages.
  const spoken = documentIdentity({ diagnostics: [
    { event: "titleSource", title: "Shop - Profile 1 - Microsoft Edge", source: "spoken" },
  ] });
  const fromDom = documentIdentity({ diagnostics: [
    { event: "titleSource", title: "Shop", source: "document" },
  ] });
  const result = compareIdentity(spoken, fromDom);
  assert.equal(result.verdict, "UNCOMPARABLE");
  assert.deepEqual(result.incomparable, [...IDENTITY_COMPONENTS]);
});

test("a failed census mark is not a reading", () => {
  const failed = documentIdentity({ diagnostics: [
    { event: "structureCensus", error: "CDP listed no page target", targetUrl: "https://example.org/a" },
  ] });
  assert.deepEqual(failed.read, []);
  assert.equal(failed.shape, null);
});

test("the served path survives a per-request nonce and still separates two paths", () => {
  const nonceA = "https://accounts.google.com/v3/signin/identifier?dsh=S1949148502&state=f0b3e949";
  const nonceB = "https://accounts.google.com/v3/signin/identifier?dsh=S9999999999&state=aaaaaaaa";
  assert.equal(servedPathOf(nonceA), servedPathOf(nonceB));
  assert.notEqual(servedPathOf("https://calendly.com/"), servedPathOf("https://calendly.com/scheduling"));
});

test("a target that is not a URL reads as unrecorded, never as a partial string", () => {
  // An opaque origin (`about:`, `data:`, `file:`) renders as the string "null" — see servedPathOf.
  assert.equal(servedPathOf("about:blank#"), "about:blank");
  assert.notEqual(servedPathOf("about:blank"), servedPathOf("about:srcdoc"));
  assert.equal(servedPathOf("not a url"), null);
  assert.equal(servedPathOf(undefined), null);
  assert.equal(servedPathOf(""), null);
});

test("the digest names its component set, so a title-only and a path-only identity cannot collide", () => {
  const pathOnly = documentIdentity({ diagnostics: [
    { event: "structureCensus", targetUrl: "https://example.org/x" }] });
  const titleOnly = documentIdentity({ diagnostics: [
    { event: "titleSource", title: "https://example.org/x", source: "document" }] });
  assert.notEqual(pathOnly.digest, titleOnly.digest,
    "the same string under two different components must not digest equal");
});

test("the shape is reported from whichever census carries it, and says which", () => {
  const both = documentIdentity({ diagnostics: [
    { event: "structureCensus", heading: 1, link: 5 },
    { event: "domCensus", heading: 1, link: 5, tabbable: 11, formField: 3, landmark: 2, graphic: 2 },
  ] });
  assert.equal(both.shapeFrom, "domCensus");
  assert.equal(both.shape?.tabbable, 11);
  const axOnly = documentIdentity({ diagnostics: [{ event: "structureCensus", heading: 1, link: 5 }] });
  assert.equal(axOnly.shapeFrom, "structureCensus");
  assert.equal(axOnly.shape?.tabbable, undefined, "the AX census has no tabbable count and must not invent one");
});

test("the counts are reported and never decide the verdict", () => {
  // A real page recaptured an hour later has moved links and is the SAME document. Deciding identity on
  // counts would refuse the whole population this runs against, and the refusal would be ignored.
  const mark = (link: number) => ({ diagnostics: [
    { event: "structureCensus", targetUrl: "https://news.example/", link },
    { event: "titleSource", title: "News", source: "document" },
  ] });
  const result = compareIdentity(documentIdentity(mark(40)), documentIdentity(mark(81)));
  assert.equal(result.verdict, "SAME_DOCUMENT");
});

test("the report line names the render, and says so when it cannot", () => {
  const sentence = identitySentence(documentIdentity(second.capture));
  assert.match(sentence, /served https:\/\/calendly\.com\/scheduling/);
  assert.match(sentence, /tabbable=98/);
  assert.match(sentence, /NOT CONFIRMED \(targetMatch: fallback\)/);
  assert.match(identitySentence(documentIdentity({ diagnostics: [] })), /served document NOT RECORDED/);
});

/**
 * THE SAME ASSERTION, AGAINST THE FILES THEMSELVES.
 *
 * `runs/` is a copy only as fresh as its last sync and CI has none at all, so this skips honestly rather
 * than passing quietly — the discipline `verify.corpus.test.ts` already follows. Its job is to keep the
 * fixture above honest: if the extraction ever stops matching the records it quotes, this is what says so.
 */
const RUNS = resolve(import.meta.dirname, "../../../runs/witness");

test("the real capture records on disk say the same thing as the fixture", (t) => {
  const present = fixture.captures
    .map((c) => resolve(import.meta.dirname, "../../..", c.source))
    .filter((path) => existsSync(path));
  if (present.length < fixture.captures.length) {
    t.skip(`needs both records under ${RUNS} — found ${present.length} of ${fixture.captures.length}`);
    return;
  }
  const identities = present.map((path) =>
    documentIdentity(JSON.parse(readFileSync(path, "utf8")).capture));
  const result = compareIdentity(identities[0], identities[1]);
  assert.equal(result.verdict, "DIFFERENT_DOCUMENT");
  assert.deepEqual(result.differing.map((d) => d.component), ["servedPath"]);
  assert.deepEqual(result.unstable, ["title"]);
  // The fixture is a REDUCTION of these records, so the identities it produces must be identical.
  assert.equal(identities[0].digest, documentIdentity(first.capture).digest);
  assert.equal(identities[1].digest, documentIdentity(second.capture).digest);
});
