/**
 * Every fixture here is VERBATIM from a capture on disk — corpus pages and real pages both.
 *
 * Invented strings would be written in the shape I already believe, which is exactly how six regexes each
 * encoded a different wrong grammar and every one of them passed its own tests. The cases that cost the most
 * are marked with what they cost.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { announces, nameOf, parseAnnouncement, isLandmarkRole, CONTAINER_ROLES } from "./announcement.js";

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

test("a STATE interleaved between containers does not end the container prefix", () => {
  // Verbatim from gov.scot and mygov.scot. NVDA puts `clickable` between the landmark and the form:
  //
  //     "main landmark, clickable, form, clickable, Continue, button"
  //
  // The container loop stopped at the first `clickable`, so `form` was never taken as a container and
  // the object parser read the tail as a name — "form Continue". 2.1.1 then reported that as a
  // keyboard-unreachable control on four conformant government pages.
  const parsed = parseAnnouncement("main landmark, clickable, form, clickable, Continue, button", "sweep");
  assert.deepEqual(parsed.containers.map((c) => c.role), ["main landmark", "form"]);
  assert.equal(parsed.objects.length, 1);
  assert.equal(parsed.objects[0].name, "Continue");
  assert.equal(parsed.objects[0].role, "button");
});

test("a state before a CONTROL still belongs to that control", () => {
  // The narrow condition matters: only a state followed IMMEDIATELY by a bare container is stepped over.
  // A state before a control is that control's, and consuming it here would strip it from the object.
  const parsed = parseAnnouncement("clickable, Expand Quick start, button, collapsed", "sweep");
  assert.deepEqual(parsed.containers, []);
  assert.equal(parsed.objects[0].name, "Expand Quick start");
  assert.ok(parsed.objects[0].states.includes("clickable"));
  assert.ok(parsed.objects[0].states.includes("collapsed"));
});

test("a NAMED control before a container role keeps its name", () => {
  // The opposite defect, and the module's comment calls it the worse one: inventing an unnamed control.
  const parsed = parseAnnouncement("England, radio button, not checked", "sweep");
  assert.equal(parsed.objects[0].name, "England");
});

test("an icon-font glyph in the name is stripped, so two channels can still match", () => {
  // Measured on ico.org.uk, where one button announced differently in each channel:
  //
  //   sweep  "content info landmark, Print this page, button"
  //   focus  " Print this page, button, focused"
  //
  // U+E604 is a Private Use Area codepoint — an icon font's glyph, with no assigned meaning and nothing
  // for a screen reader to say. `\s` does not match it and trim() does not remove it, so the names
  // differed and 2.1.1 reported "Print this page" as keyboard-unreachable on two ico pages.
  //
  // The U+FFFC lesson, which EMPTY_NAME_MARKER already carries, in a second alphabet.
  const swept = parseAnnouncement("content info landmark, Print this page, button", "sweep");
  const focused = parseAnnouncement(" Print this page, button, focused", "sweep");
  assert.equal(focused.objects[0].name, "Print this page");
  assert.equal(swept.objects[0].name, focused.objects[0].name,
    "the same control must reduce to the same name in both channels");
});

test("ordinary text is untouched by the glyph strip", () => {
  const parsed = parseAnnouncement("Continue to payment, button", "sweep");
  assert.equal(parsed.objects[0].name, "Continue to payment");
});

test("an element announced with TWO roles is one control, not an unnamed second one", () => {
  // NVDA announces `<button><img alt="Submit Search"></button>` as "Submit Search, graphic, button" —
  // the image's alt, the image's role, then the role of the element containing it. The object loop read
  // that as a named graphic followed by an UNNAMED button, and an empty name IS the 4.1.2 finding.
  //
  // Measured 2026-08-25 on four of W3C's own accessibility TUTORIAL pages, plus lbhf.gov.uk,
  // metoffice.gov.uk and financial-ombudsman.org.uk — and CONFORMANCE-mapped, so an assertion.
  const parsed = parseAnnouncement("Submit Search, graphic, button", "sweep");
  assert.equal(parsed.objects.length, 1);
  assert.equal(parsed.objects[0].name, "Submit Search");
});

test("a genuinely unnamed image button is still ONE unnamed control", () => {
  // The distinction the merge must not destroy, and the one this module exists to hold. With no name at
  // all there is nothing to attach the outer role to, so both objects stay and 4.1.2 still fires.
  const parsed = parseAnnouncement("graphic, button", "sweep");
  assert.ok(parsed.objects.every((o) => o.name === ""),
    "no name anywhere means this really is an unnamed control");
});

test("two separately named controls on one line are still two controls", () => {
  const parsed = parseAnnouncement("Search, edit, Submit, button", "sweep");
  assert.deepEqual(parsed.objects.map((o) => `${o.name}|${o.role}`), ["Search|edit", "Submit|button"]);
});

test("a container role used as a NAME is not stripped as context", () => {
  // "Menu, button, collapsed" on financial-ombudsman.org.uk is a button whose accessible name is "Menu".
  // `menu` is also a container role — GOV.UK labels its nav that way, which is why the vocabulary was
  // widened — so the name was stripped as context and the button reported as having none. A 4.1.2
  // ASSERTION against a correctly labelled control.
  //
  // The disambiguation is what FOLLOWS: a container precedes more context, a name precedes its own role.
  const asName = parseAnnouncement("Menu, button, collapsed", "sweep");
  assert.deepEqual(asName.containers, []);
  assert.equal(asName.objects[0].name, "Menu");

  // And the case the vocabulary was widened FOR still parses as context — more precisely than before.
  // GOV.UK labels its navigation "Menu", and that is now read as the landmark's NAME rather than as a
  // second bare container, which is what it actually is.
  const asContainer = parseAnnouncement("Menu, navigation landmark, list, with 6 items, link", "sweep");
  assert.deepEqual(asContainer.containers.map((c) => c.role), ["navigation landmark", "list"]);
  assert.equal(asContainer.containers[0].name, "Menu");
  assert.equal(asContainer.objects[0].name, "", "the link inside it is still unnamed");
});

test("`property page` is a container, not part of the control's name", () => {
  // NVDA's role for a tab panel. Measured on nls.uk, which announces
  // "Search the site, property page, form, Search site by keyword or category, edit".
  // Absent from the vocabulary, the named-container branch could not match it and the whole preamble
  // became the control's NAME — so 2.1.1 reported "Search the site property page form Search site…" as
  // a keyboard-unreachable control.
  const parsed = parseAnnouncement(
    "Search the site, property page, form, Search site by keyword or category, edit", "sweep");
  assert.deepEqual(parsed.containers.map((c) => c.role), ["property page", "form"]);
  assert.equal(parsed.containers[0].name, "Search the site");
  assert.equal(parsed.objects[0].name, "Search site by keyword or category");
});

test("EVERY landmark in CONTAINER_ROLES is recognised as one, and no other container is", () => {
  // The duplication this replaced: a `/landmark$|^form$|^region$/` regex in `verify.ts`, which missed a
  // landmark announced as bare "banner", "navigation" or "main". Pinning the predicate against the
  // vocabulary it is a subset of is the "make the copies unable to disagree" remedy — the list can grow
  // and this test decides whether the predicate must grow with it.
  const landmarks = CONTAINER_ROLES.filter((r) => r.endsWith("landmark") || r === "landmark");
  assert.ok(landmarks.length >= 8, `only found ${landmarks.length} landmark roles; the filter is broken`);
  for (const role of landmarks) {
    assert.equal(isLandmarkRole(role), true, `"${role}" is a landmark and must be recognised`);
  }
  // Containers that are emphatically NOT landmarks. A false positive here inflates landmark coverage and
  // would make a short sweep read as complete.
  for (const role of ["frame", "dialog", "list", "table", "grouping", "menu", "tab control", "article"]) {
    assert.equal(isLandmarkRole(role), false, `"${role}" is a container but not a landmark`);
  }
});

test("NVDA says a landmark BOTH ways, and both are recognised", () => {
  // "navigation landmark, Page Contents" and "form, Explore Site by Topic:" both occur in the corpus.
  assert.equal(isLandmarkRole("navigation landmark"), true);
  assert.equal(isLandmarkRole("navigation"), true);
  assert.equal(isLandmarkRole("form"), true, "the bare form the old regex got right");
  assert.equal(isLandmarkRole("banner"), true, "and the bare forms it did NOT");
  assert.equal(isLandmarkRole("main"), true);
  assert.equal(isLandmarkRole(""), false);
});

test("AN ANNOUNCEMENT PAST THE OLD 12-OBJECT CAP IS PARSED, not spilled into `trailing`", () => {
  // The cap was a runaway backstop doing double duty as a content limit. Anything past it fell into
  // `trailing`, where `addUnnamedControls` reads unplaced text as "the name may exist and not have been
  // repeated" and downgrades a 4.1.2 ASSERTION to a referral — silently, and in the quiet direction.
  //
  // Measured across 7,082 real announcements the busiest held ELEVEN objects, one below the old cap. This
  // pins the headroom rather than the number: 20 objects must all parse.
  const line = Array.from({ length: 20 }, (_, i) => `Item ${i}, link`).join(", ");
  const parsed = parseAnnouncement(line, "sweep");
  assert.equal(parsed.objects.length, 20, "every announced control must be parsed, not truncated");
  assert.deepEqual(parsed.trailing, [], "nothing should be left unplaced, which is what downgrades a finding");
});

test("and the loop still terminates on its own, without leaning on the backstop", () => {
  // The no-progress break is what actually guarantees termination; the constant is belt-and-braces. A
  // token the parser cannot consume must end the loop rather than spin to the cap.
  const parsed = parseAnnouncement("some, unparseable, prose, with, no, roles", "sweep");
  assert.deepEqual(parsed.objects, []);
  assert.ok(parsed.trailing.length > 0, "unconsumed tokens are reported as trailing, not dropped");
});

test("an unnamed <form> announced as `section` is a CONTAINER, not part of the name", () => {
  // MEASURED as a clean before/after on one unchanged corpus page, same NVDA and guidepup, only Edge moved:
  //
  //   151.0.4129.59   "form, name at example dot com, edit"
  //   152.0.4191.66   "section, name at example dot com, edit"
  //
  // `w3c/html-aria#423` made the `form` role conditional on an accessible name, as `<section>` already was,
  // and Edge 152 implemented it: a form nobody named is not a landmark. Without `section` in
  // CONTAINER_ROLES the whole prefix becomes the control's NAME, which took 18 corpus cases BLIND and
  // stopped a 4.9-hour pipeline at check-signals.
  const parsed = parseAnnouncement("section, name at example dot com, edit", "sweep");
  assert.deepEqual(parsed.objects.map((o) => ({ name: o.name, role: o.role })),
    [{ name: "name at example dot com", role: "edit" }],
    "the container prefix leaked into the control's name");
  assert.equal(parsed.containers[0]?.role, "section");

  // The OLD announcement must still parse identically, because 3,246 captures on disk carry it and a
  // grammar that only understands the current browser cannot read its own corpus.
  const before = parseAnnouncement("form, name at example dot com, edit", "sweep");
  assert.deepEqual(before.objects.map((o) => o.name), ["name at example dot com"]);

  // And a NAMED section keeps its name, which is what stops this being a blanket prefix strip: NVDA
  // announces a named region the same way, and its name is context rather than noise.
  const named = parseAnnouncement("Booking details, section, Full name, edit", "sweep");
  assert.equal(named.containers[0]?.name, "Booking details");
});
