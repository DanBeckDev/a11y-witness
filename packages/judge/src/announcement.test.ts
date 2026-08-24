/**
 * Every fixture here is VERBATIM from a capture on disk — corpus pages and real pages both.
 *
 * Invented strings would be written in the shape I already believe, which is exactly how six regexes each
 * encoded a different wrong grammar and every one of them passed its own tests. The cases that cost the most
 * are marked with what they cost.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { announces, nameOf, parseAnnouncement } from "./announcement.js";

test("transcript is role-first: the browse-mode reading order", () => {
  const parsed = parseAnnouncement("heading, level 1, Marina 022 schedule", "transcript");
  assert.deepEqual(parsed.objects, [{ name: "Marina 022 schedule", role: "heading", states: ["level 1"] }]);
});

test("sweep is name-first: the quick-navigation reading order", () => {
  const parsed = parseAnnouncement("Aquarium 001 controls, heading, level 1", "sweep");
  assert.deepEqual(parsed.objects, [{ name: "Aquarium 001 controls", role: "heading", states: ["level 1"] }]);
});

test("the SAME control in the two channels yields the same name", () => {
  // The property that makes one parser possible at all. 884/0 and 0/880 across 300 captures — the channels
  // never overlap, so a single regex could only ever have been right about one of them.
  assert.equal(nameOf("link, Details", "link", "transcript"), "Details");
  assert.equal(nameOf("Details, link", "link", "sweep"), "Details");
});

test("a NAMED container is context, not the control's role", () => {
  // THE GOV.UK DEFECT. `LEADING_CONTAINERS` strips "frame," but not "Radios example, frame," so the leftover
  // began with a role token and a properly named radio read as unnamed — two false 4.1.2 accusations against
  // a design system its publisher declares conformant.
  const raw = "Radios second example, frame, Where do you live?, grouping, clickable, England, radio button";
  const parsed = parseAnnouncement(raw, "sweep");
  assert.deepEqual(parsed.containers, [
    { name: "Radios second example", role: "frame" },
    { name: "Where do you live?", role: "grouping" },
  ]);
  assert.equal(parsed.objects[0].name, "England", "the radio IS named; reporting it unnamed invents a 4.1.2");
  assert.equal(parsed.objects[0].role, "radio button");
});

test("an unnamed container is context too", () => {
  const parsed = parseAnnouncement("main landmark, Park gate 038 links, heading, level 1", "sweep");
  assert.deepEqual(parsed.containers, [{ name: "", role: "main landmark" }]);
  assert.equal(parsed.objects[0].name, "Park gate 038 links");
});

test("several objects in one line are several objects", () => {
  // 8.1% of real-page announcements mentioning a link carry two or more; 0% of corpus ones do. A greedy
  // tail read "Accessibility statement, link, Sitemap, link, Cookies" as ONE link name.
  const raw = "link, Accessibility statement, link, Sitemap, link, Cookies";
  const parsed = parseAnnouncement(raw, "transcript");
  assert.deepEqual(parsed.objects.map((o) => o.name), ["Accessibility statement", "Sitemap", "Cookies"]);
});

test("an EMPTY name is the finding, not a parse failure", () => {
  // "edit, ," is an unnamed edit. Dropping the empty field turns 4.1.2 evidence into a parse artefact.
  const parsed = parseAnnouncement("edit, , button, Submit community forest form", "transcript");
  assert.equal(parsed.objects[0].role, "edit");
  assert.equal(parsed.objects[0].name, "", "an unnamed edit must survive parsing as UNNAMED");
  assert.equal(parsed.objects[1].name, "Submit community forest form");
});

test("stacked roles describing ONE object do not become two", () => {
  // "link, graphic, GOV dot UK" is one link whose content is a graphic. Reporting the link as unnamed here
  // is the opposite error and the worse one, because it invents a failure on a conformant page.
  assert.equal(nameOf("banner landmark, link, graphic, GOV dot UK", "link", "transcript"), "");
  assert.equal(nameOf("banner landmark, link, graphic, GOV dot UK", "graphic", "transcript"), "GOV dot UK");
});

test("`out of X` is the caret LEAVING something, not a control", () => {
  const parsed = parseAnnouncement("out of form, heading, level 1, Delivery address", "transcript");
  assert.deepEqual(parsed.leaving, ["form"]);
  assert.equal(parsed.objects[0].name, "Delivery address");
});

test("prose announces no control", () => {
  const parsed = parseAnnouncement("The next class starts at six.", "transcript");
  assert.deepEqual(parsed.objects, []);
  assert.equal(announces("The next class starts at six.", "link", "transcript"), false);
});

test("a name is not eaten by a following control role", () => {
  // The guard on the named-container rule. Consuming `<anything>, <role>` would strip "England" off
  // "England, radio button" — the same defect this module exists to fix, in reverse.
  const parsed = parseAnnouncement("England, radio button, not checked", "sweep");
  assert.equal(parsed.objects[0].name, "England");
  assert.deepEqual(parsed.objects[0].states, ["not checked"]);
});

test("a description after the role is not part of the name", () => {
  const raw = "Community forest contact, edit, Enter the community forest contact before submitting.";
  assert.equal(nameOf(raw, "edit", "sweep"), "Community forest contact");
});

test("level is an adornment, never a role boundary", () => {
  // Treating "level 1" as a boundary split the name off every heading in the corpus.
  assert.equal(nameOf("heading, level 2, More", "heading", "transcript"), "More");
  assert.equal(nameOf("More, heading, level 2", "heading", "sweep"), "More");
});

test("a vague name and a component name are INDISTINGUISHABLE to the parser, deliberately", () => {
  // The parser answers "what did NVDA say"; whether "Details" is an adequate link purpose is 2.4.4's
  // question and depends on context. Deciding it here would rebuild the wordlist inside the grammar.
  assert.equal(nameOf("link, Details", "link", "transcript"), "Details");
  assert.equal(nameOf("Details, link", "link", "sweep"), "Details");
});

test("the empty-name marker is an ABSENT name, not a name", () => {
  // "edit, ￼" is the canonical unnamed control. Reading U+FFFC as a name made it parse as an edit NAMED
  // "￼", and 4.1.2 stopped firing on the exact evidence it exists for — caught by rules.test.ts, which is
  // why a rewrite must run the tests of everything it replaces rather than only its own.
  assert.equal(parseAnnouncement("edit, ￼", "transcript").objects[0].name, "");
  assert.equal(parseAnnouncement("￼, radio button, not checked", "sweep").objects[0].name, "");
});

test("a container adornment written INSIDE the token is still a container", () => {
  // NVDA writes both "list, with 6 items," and "table with 3 rows," — comma in one, none in the other.
  // Handling only the comma form made "table with 3 rows, link" a link NAMED "table with 3 rows", so an
  // unnamed link inside a table went unreported. The regex this replaced already handled both.
  const parsed = parseAnnouncement("table with 3 rows, link", "sweep");
  assert.deepEqual(parsed.containers, [{ name: "", role: "table" }]);
  assert.equal(parsed.objects[0].name, "", "the link is unnamed; the table is context");
});
