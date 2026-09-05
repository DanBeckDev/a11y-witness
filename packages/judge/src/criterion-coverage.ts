/**
 * WHY each WCAG 2.2 AA criterion is or is not assessed — all 55, in one place.
 *
 * `coverage.ts` answers WHICH criteria ship. This answers WHY the rest do not, and what each would
 * take. That distinction is the whole point: `criterionOutcomes` returns every uncovered criterion as
 * `untested`, one
 * undifferentiated bucket in which "impossible from assistive-technology evidence" (1.4.3 Contrast) and
 * "trivial, the data is already on disk" (2.4.2 Page Titled) look identical. For anyone deciding what to
 * build next, that is the only distinction that matters.
 *
 * It also records PARTIAL coverage, which nothing else could express. 4.1.2 is assessed, and a role-less
 * `<div onclick>` is not assessable at all from screen-reader evidence. Reported at criterion granularity
 * that page reads as fine; it is not.
 *
 * That sentence used to say "one of its three failure modes", and 4.1.2's own entry said the same. Both
 * were wrong in the same way, which is why this is stated in one place now: the criterion has three
 * CLAUSES, and the role-less div is a second failure mode of the FIRST one (no role), not a third clause.
 * Counting it as the third made the entry read as covering the whole criterion bar one gap. See 4.1.2.
 *
 * Pinned by `criterion-coverage.test.ts` against `WCAG_22_AA` and `assessedCriteria()`, so it cannot
 * drift from what ships in either direction: a criterion that starts being assessed and is still recorded
 * as unreachable fails the test, and so does the reverse.
 *
 * **A SECOND boundary this file did not record until 2026-08-22, and it cuts across every entry below.**
 *
 * Where a subtype is decided by a deterministic RULE (`packages/lab/rule-ownership.json`), the answer is
 * exact and the trained head is suppressed for it. Where the head decides alone, the answer inherits the
 * head's blind spots — and those are measured: `npm run scorer:shortcuts` counts **225 features a head
 * penalises for free**, because they are 0 on every one of its training positives and therefore cost
 * nothing to learn. A page carrying such a feature can go silent on a criterion it genuinely fails.
 *
 * So `status: "assessed"` means "we have evidence and a decider", never "this answer is exact". Which it
 * is depends on the owner, and **`packages/lab/rule-ownership.json` is where that is declared** — read it
 * there rather than here.
 *
 * This paragraph used to enumerate them, and by 2026-08-29 the list said "the nine subtypes the head
 * decides alone", listed TEN, and named several that had since moved to the rules — `4.1.2:state-change-
 * silent` among them, which ADR 0021 moved deliberately and which this file went on citing as head-owned.
 * A prose copy of a machine-readable fact, in the file whose entire purpose is honesty about coverage.
 *
 * The shape is what is worth stating, because it is stable and the membership is not: `rules` (exact,
 * measured at 0 false positives across 1,183 conformant records), `overlap` (the rules cover a deliberate
 * subset and the head owns the rest), and `unavailable` — **nobody decides it**, which is a stronger claim
 * than "the head decides it alone" and the one the old list obscured. `subtype-ownership.test.ts` pins the
 * counts so this can drift no further. See
 * `docs/adr/0015-one-defect-per-page-taught-the-scorer-to-veto.md`.
 *
 * **`needs` is a claim about EVIDENCE, not about difficulty.** It says which source could decide the
 * criterion, and the honest ordering is that `screen-reader` items are reachable with a probe,
 * `accessibility-tree` items with the CDP socket the capture already opens, `dom` items only by crossing
 * the boundary that keeps the model honest (a deterministic rule may, a trained head may not -- see
 * `modelInput()`'s allowlist), and `visual` / `human` / `multi-page` items not by this tool at all.
 */

/** Where the evidence to decide a criterion would have to come from. */
export type EvidenceSource =
  /** NVDA's own output: announcements, quick-nav sweeps, probe responses. What this tool is FOR. */
  | "screen-reader"
  /** The accessibility tree, already fetched over CDP for `structuralCensus`. */
  | "accessibility-tree"
  /** Page source, attributes or computed style. A deterministic rule may use it; the model may not. */
  | "dom"
  /** Rendering — pixels, geometry, colour, motion. Out of scope: this tool never sees a rendered page. */
  | "visual"
  /** More than one page, or a journey through one. The capture is single-page by construction. */
  | "multi-page"
  /** Irreducibly a judgement about meaning or consequence that no automated check settles. */
  | "human";

/**
 * WHICH FIELD of a capture carries the evidence — the channel, not the source.
 *
 * Orthogonal to `EvidenceSource` and added because that axis cannot answer the question that actually comes
 * up: "can THIS capture assess THIS criterion?" `needs: ["screen-reader"]` says a probe could reach it;
 * `channels: ["focusOrder"]` says which field to look in, and therefore whether the field is populated.
 *
 * The cost of not having this was an afternoon. Establishing that 2.4.1, 2.4.3 and 2.1.1 could not be
 * validated meant walking 4,899 corpus captures over SSH to discover `focusOrder` is absent from every one
 * of them, because `probeFocus` is opt-in and the dataset runner never sets it. With the channel named, that
 * is `criteriaAssessableFrom(capture)`.
 *
 * It also makes "unchecked is not clean" enforceable at criterion granularity. `captureWasTruncated` already
 * reports incomplete CHANNELS and `producerFeedsModel` already maps producer to channel for the MODEL; this
 * extends the same idea to criteria, so a report can say "2.4.1 not assessed, focusOrder absent" instead of
 * silently returning no finding. Those are different statements and this project's whole discipline is that
 * they must never look alike.
 *
 * Only `assessed`, `partial` and `reachable` criteria carry channels. A `visual` or `human` criterion has
 * none — not "unknown", but genuinely none, because no field of a capture could carry it.
 */
export type EvidenceChannel =
  /** The read-through, in page order. */
  | "transcript"
  /** Quick-nav sweeps, in `structure`. */
  | "headings" | "landmarks" | "formFields" | "graphics" | "links" | "lists" | "tableCells"
  /**
   * The iframe sweep, capture-protocol 11. A frame with no accessible name announces as a bare
   * `"frame, ..."` where a named one is `"Booking options, frame, ..."` — a failure `announcement.ts` has
   * been able to parse since it was written, on evidence nothing could produce until there was a sweep.
   */
  | "frames"
  /** Interaction probes, in `interaction`. */
  | "controls" | "stateChanges" | "formChanges" | "postSubmitFields" | "focusOrder"
  /**
   * The page title either side of FOCUSING the first control — capture-protocol 14, for 3.2.1 On Focus.
   *
   * Its own channel rather than a field on `focusOrder`, because that one is a list of strings 28 files
   * read and adding a title per stop would change its shape for all of them. A separate channel also
   * keeps the ABSENCE honest: `focusOrder` present and `focusContext` absent means the tab order was
   * walked and the context question was never asked, which are different facts.
   */
  | "focusContext"
  /**
   * The form re-read after a submit, as accessible NAMES rather than field values.
   *
   * FOUND UNCLASSIFIED 2026-09-01 by the corpus test below, which is the whole reason it exists — this one
   * was nobody's new addition. It has been on captures since `postSubmitNames` was introduced, is compared
   * by `evidence:check`, is named in capture-core's protocol note as something criteria read, and the
   * coverage layer had never heard of it.
   *
   * Classified by LOCATION only. Whether 3.3.1 should require it as well as `postSubmitFields` is a real
   * question about what evidence that criterion needs, and answering it silently inside a classification
   * fix is how a criterion comes to be BLOCKED on every capture ever taken.
   */
  | "postSubmitNames"
  /**
   * Escape pressed inside a dialog, capture-protocol 11: focus before, what was announced, focus after.
   *
   * Declared here so `channelsPresent` can SEE it, and deliberately not added to 2.1.2's required
   * `channels`. The trap rule reads it only to SILENCE itself, so its absence blocks nothing — a capture
   * without it is still assessable for 2.1.2, just less precisely. Requiring it would turn every
   * pre-protocol-11 capture into `BLOCKED: 2.1.2`, which is the opposite of what it buys.
   */
  | "dialogEscape"
  /**
   * An arrow pressed inside a radio group, tab list or menu, capture-protocol 13.
   *
   * The observation 2.1.1 abstains without: `SHARES_ONE_TAB_STOP` refuses to decide because a native
   * widget and a broken one both present ONE tab stop, so the tab ring cannot separate them.
   */
  | "arrowNavigation"
  /**
   * Characters typed into a focused field, capture-protocol 13 — the half of 3.3.1 a capture could not
   * reach. Every existing record describes an error surfaced by SUBMITTING; validation that fires while
   * typing arrives with focus unmoved and only a live region can carry it.
   */
  | "typedFeedback"
  /**
   * The DOM media census — `<audio>`/`<video>` with their `autoplay`, `muted` and `controls` attributes.
   *
   * The one channel that is not screen-reader output, and it has to be: those attributes have no
   * accessibility-tree equivalent, so 1.4.2 is decided from the DOM or not at all. It was declared as
   * `transcript` until 2026-08-24 while `addAutoplayingAudio` read `capture.media` — one fact written in
   * two places, and the declaration was the copy that was wrong.
   */
  | "media"
  /**
   * The DOM tab-stop census — how many RENDERED, non-`inert` elements Tab can reach.
   *
   * CAPTURED SINCE 2026-08-28 AND CLAIMED BY NO CRITERION, which is deliberate rather than an oversight.
   *
   * A 2.1.2 rule read it for one afternoon: the ring against the page's tab stops, which separated the
   * corpus perfectly (conformant 14 of 14, trapped 3 of 14) and then produced NINE new findings on 86
   * conformant real pages. A consent banner or a date-picker overlay confines Tab by design, the walks
   * genuinely closed, and no floor distinguishes that from a trap — the difference is not how much of the
   * page the ring covers but whether focus can LEAVE.
   *
   * Kept in the census because it is correct evidence and costs nothing; note that the Escape-based rule
   * it was being kept for has since been refuted too. Listed here so the next reader finds the channel and its verdict together, rather than
   * rediscovering the measurement.
   */
  | "tabStops"
  /**
   * What NVDA said the page was called and what its first heading was, before and after activating a
   * navigation control. The only channel that measures a TRANSITION rather than a state, which is why it
   * reaches a failure no static analyser can: the markup is valid at every instant.
   */
  | "routeChange"
  /** The document title NVDA speaks on entry. Lives in the `documentReady` diagnostic, not in `structure`. */
  | "title"
  /** The accessibility-tree census, for cross-checks the sweeps cannot make alone. */
  | "structureCensus";

export interface CriterionCoverage {
  /**
   * `assessed`    — the shipped judge can return a finding for it.
   * `partial`     — assessed, but a named failure mode of it is not covered. Read `note`.
   * `reachable`   — not assessed, and could be, from the sources in `needs`.
   * `out-of-scope`— no amount of work inside this tool's evidence model decides it.
   */
  status: "assessed" | "partial" | "reachable" | "out-of-scope";
  needs?: EvidenceSource[];
  /**
   * Which capture fields decide it. Required for anything assessed, partial or reachable; absent for
   * out-of-scope, where no channel could carry the evidence. Pinned both ways by the tests.
   */
  channels?: EvidenceChannel[];
  /**
   * Why this criterion cannot fire on a REAL-PAGE capture, when that is structurally true.
   *
   * Machine-readable on purpose. `audit-rule-coverage.ts` blocks a criterion this project CLAIMS to assess
   * that has never once fired on a real page, and two criteria are legitimately in that state forever: the
   * form probe is deliberately off for real pages, because submitting a form on a site we do not own is not
   * a review. Left as prose in `note`, that fact could not be told from an oversight — and the audit would
   * either block on something correct or, worse, be softened until it blocked on nothing.
   *
   * Absent means the criterion IS expected to fire on real pages. Only declare it with a reason.
   */
  realPageEvidence?: { available: false; because: string };
  note: string;
}

export const CRITERION_COVERAGE: Record<string, CriterionCoverage> = {
  // ---- assessed today -------------------------------------------------------------------------
  "1.1.1": { status: "assessed", channels: ["graphics", "transcript"], note: "Rules own missing and filename alt text exactly; the head owns generic alt ('image', 'photo')." },
  "1.3.1": { status: "assessed", channels: ["headings", "tableCells", "transcript"], note: "Pages with NO headings at all (confirmed by the accessibility tree, not merely unseen by the sweep), fake headings, and tables whose headers are not associated. Heading HIERARCHY (h2 -> h4) is not checked — see 'reachable' note on 2.4.10-style structure below; `moveToNextHeadingLevel` would supply it." },
  "1.4.2": {
    status: "assessed", needs: ["dom"], channels: ["media"],
    // MEASURED, not assumed: 89 real captures, 8 carry `<audio>`/`<video>` at all, and **0 autoplay**.
    // The probe runs and the channel is populated — this rule is exercised and correctly silent, which
    // on a page that does not autoplay is the right answer.
    //
    // It is not going to fire on this corpus, and the reason is the corpus rather than the rule: these
    // are UK public-body information pages, and autoplaying sound is the thing the regulations they
    // publish under exist to stop. A blocker that can only be closed by finding a public body breaking
    // that rule is a blocker nobody can close, so it is declared here instead — with the measurement,
    // so a future reader can check whether it is still true rather than take it on trust.
    realPageEvidence: {
      available: false,
      because: "89 real captures carry 8 media elements between them and NONE autoplay — measured "
        + "2026-08-25. The rule is exercised and silent because the failure does not occur on public-body "
        + "information pages, not because it cannot run",
    },
    note: "Rule-only, and the exception that proves the boundary: `autoplay` and `muted` are attributes with no accessibility-tree equivalent, so a deterministic rule reads the DOM and no head is trained on it. TWO OF THE CRITERION'S CLAUSES ARE OUT OF REACH and the rule is `secondary` because of them, not from timidity. It fails only when audio plays automatically FOR MORE THAN 3 SECONDS -- duration is a property of the media file, not an attribute, so a two-second chime conforms and the rule cannot tell it from a soundtrack. And it offers TWO alternatives: a pause/stop mechanism (the `controls` attribute, which the rule does check and skip) OR a mechanism to control volume independently of the system -- a custom slider conforms and nothing here can recognise one. Both make the rule over-eager, which is exactly what reporting `cantTell` is for." },
  // VALIDATED 2026-08-28, and every clause of what stood here was true when written and is now false.
  // It read: "no corpus case targets it, it is absent from `rule-ownership.json` ... and it reads
  // `focusOrder`, which is present on 0 of 4,899 corpus captures". There are now four cases, the subtype is
  // declared `decidedBy: "rules"`, and the cases carry `probeFocus: true`.
  //
  // Left in full rather than deleted, because a coverage file whose entries go stale IN THE OPTIMISTIC
  // DIRECTION is the failure mode this file exists to prevent — the census-based 1.1.1 rule was unreachable
  // for months while its criterion read `validated on real evidence`, precisely because sibling rules fired.
  // This one went stale pessimistically, which is harmless to a user and still misleading to the next reader.
  //
  // WHAT IS STILL PARTIAL, and it is not what this comment used to claim: the tab-ring branch reads
  // `dom.tabbable`, which no capture taken before 2026-08-28 carries, and it makes NO claim without it. So
  // it is exercised only on captures taken since — `rules:gate` reports `dom.tabbable on N record(s)` so
  // that a green 2.1.2 cannot silently mean "not one record could have tripped it".
  "2.1.2": { status: "partial", needs: ["screen-reader"], channels: ["focusOrder"], note: "Keyboard trap, from `focusOrder`. TWO failure modes: focus STALLING (Tab pressed, the same control announced each time) and focus CONFINED to a cycling ring that offers NO ACTIONABLE CONTROL. `decidedBy: \"rules\"`; the one 2.1.2 in the real-page baseline (scotcourts) is the first. The second took four attempts and the first three were withdrawn the same day: ring vs swept form fields (7 false positives on 86 conformant real pages), ring vs rendered tab stops (9), and an Escape probe that was inert because `anchorToTop` presses Escape before the walk. All three asked how MUCH of the page the ring covers, and SIZE is what a consent banner also differs by. What separates them is what the ring OFFERS — tfl reads link, link, button, button, button ('Accept all cookies'), the corpus trap reads edit, edit, edit. A ROLE test via `parseAnnouncement`, never the words, so it is not the 2.4.4 wordlist shortcut. Deliberately conservative: any actionable role anywhere in the ring silences it, including a Submit button in a genuinely trapped form — 2.1.2 is non-interference, so a wrong accusation says the page is unusable outright. Validated by `rules-real-pages`: 0 new findings on 86 conformant pages." },
  "2.4.4": { status: "assessed", channels: ["links", "transcript"], note: "Vague link text. Rules cover a six-phrase subset (19 of 100 corpus records, a declared overlap); the head owns the rest." },
  "2.4.6": {
    // THE HEADINGS HALF ONLY — and the status stays `assessed`, which is a correction of a correction.
    //
    // I changed this to `partial` on 2026-09-04 and put it back the same hour: this file's own header
    // defines the term — "`status: "assessed"` means 'we have evidence and a decider', never 'this answer
    // is exact'" — and we do have both for headings. Changing it was acting on a paraphrase of `partial`
    // instead of the definition twelve lines up, which is the exact failure the criterion audit exists to
    // catch, committed inside the audit.
    //
    // What IS wrong and stays corrected is the note. The criterion is "Headings AND LABELS
    // describe topic or purpose", and `label` is defined as "Text or other component with a text
    // alternative that is presented to a user to identify a component within web content". We cover the
    // HEADINGS half only: the corpus has one subtype, `2.4.6:regex`, built from `headings-vague-*` cases,
    // and the engineered feature is `generic_heading_present`. Nothing looks at labels.
    //
    // The label half is REACHABLE and simply not built — NVDA announces a field's label, so a vague one
    // ("Field 1", "Input", "Text box") is as audible as a vague heading. That makes this a gap in the
    // corpus rather than in the layer, which is why it is `partial` and on the backlog rather than
    // out-of-scope.
    //
    // WHAT THE CRITERION DOES NOT ASK, and a rule here must not: it "does not require headings or
    // labels" to exist at all — W3C is explicit, and points at 3.3.2 for whether a label is present.
    // A rule detecting ABSENCE would fire on conformant pages, which is the shape 2.4.1 was nearly
    // shipped with.
    status: "assessed", channels: ["headings", "transcript"],
    note: "Vague headings, learned. Deliberately contextual — whether 'Welcome' is vague depends on the "
      + "page, so this head is document-pooled. ONE of the criterion's two halves: it reads 'Headings and "
      + "LABELS describe topic or purpose' and nothing here looks at labels, though NVDA announces them "
      + "and a vague one is as audible as a vague heading." },
  "3.3.1": { status: "assessed", realPageEvidence: { available: false, because: "`formChanges` is absent from all 77 real captures as exported — **NOT structural any more, and the distinction is the point.** ADR 0024 put a DECLARED `formState` in the corpus beside the URL: the page owner's own example, with the values recorded, so submitting is something the corpus says to do rather than something the probe decides. `probeForms` stays off and SECURITY.md's rule is untouched. Measured live 2026-09-03 on W3C's `after/survey.html` — three fields filled, submitted, NVDA announced 'Submission Failed' — and `probeConfiguredForm` records a `kind: 'submit'` entry, which is this rule's first precondition. What is missing is a real-page CAPTURE RUN that exports it, not a capability. 'Structurally unreachable' and 'not yet captured' need opposite work, and this entry said the first for as long as it was the second." }, channels: ["formChanges", "postSubmitFields"], note: "WHAT THE CRITERION ASKS, quoted, because this note used to describe a page that may CONFORM: 'If an input error is automatically detected, the item that is in error is identified and the error is described to the user IN TEXT.' It does not require the error to be ANNOUNCED, so 'displayed but never announced' — which is what this entry claimed we find — is not by itself a failure of 3.3.1. THE REAL ARGUMENT is narrower and stronger: the probe re-reads the field AFTER the submit, and silence there is evidence the error text is not programmatically ASSOCIATED with the field. An error a screen reader cannot reach is not one where 'the item that is in error is identified' for that user, and `input error` is defined as 'Information provided by the user that is not accepted'. It REFERS rather than asserts: `rule-ownership.json` does not claim this criterion for the rule layer, so it is model-decided, sets no `mapping` and reports `cantTell`. That is the LAYER's doing rather than the reasoning's, and if the subtype ever moves to the rules the argument above is what it must assert on. Needs the form probe, on by default in the Action and off in the CLI — but NOT therefore unreachable on a real page: see `realPageEvidence` above, which this note contradicted until 2026-09-04." },
  "3.3.2": {
    status: "partial",
    needs: ["dom"],
    channels: ["formFields", "transcript"],
    note: "THE CRITERION IS \"LABELS OR INSTRUCTIONS\" AND THIS ENTRY ONLY EVER CONSIDERED LABELS — found 2026-09-05 by re-reading the 17 claim-bearing criteria against the audit's own tells. W3C: 3.3.2 does NOT require labels or instructions to be marked up, identified, or ASSOCIATED with their controls (that is 1.3.1), and a field can PASS 3.3.2 while FAILING 1.3.1. So a bare role does not prove the criterion failed: it proves the accessible NAME is absent, which is 4.1.2 and 1.3.1. **The rule's 3.3.2 mapping was DOWNGRADED to `secondary` as a result** — the third rule found asserting where the criterion permits, after 3.3.3 and 3.2.1/3.2.2 the day before, and the only one of the three whose counter-example is in our OWN corpus: `form-unlabelled.bad` is `<span>Recipient name</span><input>`, text presented to the user that identifies the control, which is WCAG's definition of a label. Instructions widen it further and may sit anywhere on the page. A field with no label at all IS still the failure, and the rules see the announcement exactly; what they cannot see is whether anything else on the page supplied it. "
      + "A field labelled ONLY by its placeholder is NOT covered, and cannot be from screen-reader "
      + "evidence — when a field has no label the browser uses the placeholder as its accessible name, so "
      + "NVDA speaks it exactly as it speaks a real label. `<input placeholder=\"Email address\">` and "
      + "`<label>Email address</label><input>` both announce \"Email address, edit\". Identical words, "
      + "identical order; the difference exists only in the DOM. THAT IS AXE'S JOB, and this tool sits "
      + "alongside axe-core rather than instead of it — a DOM scanner sees the missing `<label>` in one "
      + "pass. Attempting it here was a category error, not a gap to close. Measured 2026-08-23: the "
      + "trained head produced EIGHT false accusations on conformant pages because it had no placeholder "
      + "feature at all (encoder weight mass 598.9 against 9.26 across every document feature) and had "
      + "learned the corpus's placeholder WORDING — it fired on 4 of the 6 clean pages containing "
      + "\"Example value\" and 0 of the 34 without it. Declared `unavailable` in rule-ownership.json. "
      + "See ADR 0018.",
  },
  "4.1.3": { status: "assessed", realPageEvidence: { available: false, because: "`postSubmitFields` is absent from all 77 real captures as exported, and the same declared-formState route now reaches it — see 3.3.1 — **NOT structural any more, and the distinction is the point.** ADR 0024 put a DECLARED `formState` in the corpus beside the URL: the page owner's own example, with the values recorded, so submitting is something the corpus says to do rather than something the probe decides. `probeForms` stays off and SECURITY.md's rule is untouched. Measured live 2026-09-03 on W3C's `after/survey.html` — three fields filled, submitted, NVDA announced 'Submission Failed' — and `probeConfiguredForm` records a `kind: 'submit'` entry, which is this rule's first precondition. What is missing is a real-page CAPTURE RUN that exports it, not a capability. 'Structurally unreachable' and 'not yet captured' need opposite work, and this entry said the first for as long as it was the second." }, channels: ["postSubmitFields", "formChanges"], note: "A status message after form activation that the screen reader never speaks. ONE of the criterion's FOUR categories: `status message` is defined as content change reporting 'the success or results of an action, the waiting state of an application, the progress of a process, or the existence of errors', and the single corpus subtype covers the first and overlaps the fourth with 3.3.1. WAITING STATE and PROGRESS are not covered — reachable, since a live region saying 'Loading...' is as audible as any other, so a corpus gap rather than a layer one. WHICH CHANNEL ANSWERS IT MATTERS, because the criterion says status messages must be presented 'WITHOUT RECEIVING FOCUS'. `formChanges[].after` is the speech delta `activateAndCaptureDelta` takes immediately after the activation and before any navigation, so it is speech the page produced on its own — that is the evidence. `postSubmitFields` is a RE-READ reached by navigating to the fields, so text found there proves only that it exists somewhere reachable: a page with no live region at all announces its error on re-read. `post_submit_present` reads that channel and is available to the head, so treat it as corroboration, never as evidence that this criterion is met. Needs the form probe — see 3.3.1 and `realPageEvidence` above for why that is no longer a structural bar on real pages." },

  "4.1.2": {
    status: "partial",
    needs: ["dom"],
    channels: ["controls", "formFields", "stateChanges", "structureCensus"], note: "THE CRITERION HAS THREE CLAUSES AND THIS ENTRY USED TO ENUMERATE TWO OF THEM AS THREE. Verbatim: \"the name and role can be programmatically determined; states, properties, and values that can be set by the user can be programmatically set; and notification of changes to these items is available\". CLAUSE 1 (name/role) is covered for the NAME half -- a control announced with a role and no name, rules-owned and exact on 147 records. Its other half, a role-less `<div onclick>` styled as a button, is NOT covered and cannot be from screen-reader evidence: the screen reader cannot perceive it, which IS the failure, so a page with a fake button and a page with no button are identical to NVDA. Declared `unavailable` in rule-ownership.json; `hasEvidenceFor('4.1.2')` also suppresses any finding on such a page, since it requires controls to exist. CLAUSE 3 (notification of changes) is covered by `state-change-silent`, RULES-owned since ADR 0021 and measured 69/0/0 across 144 captures carrying state evidence. CLAUSE 2 (settability) IS NOT COVERED AND IS NOT REACHABLE HERE, which is the part this note previously did not say at all. It asks whether an assistive technology can programmatically SET a value the user can set -- a question about the UIA/IA2 surface (a ValuePattern, a TogglePattern), not about anything NVDA says. Our capture drives NVDA, which operates controls by EMULATING THE KEYBOARD, so `probeArrows` and `probeTyping` witness operability rather than settability; a control the AT cannot set presents as one that does not respond, which is 2.1.1's failure and indistinguishable from it in speech. So the gap is structural rather than a corpus gap, and no new case closes it. THE TWO COVERED HALVES ARE BOTH RULE-DECIDED and therefore exact -- this note used to call `state-change-silent` \"head-decided\" carrying 18 free vetoes, which ADR 0021 stopped being true on 2026-08-24. The head's own score on an unnamed control is poor (the identical announcement scores 0.9240 on a page without a table and 0.4525 on one with), but neither mode reaches a report through the head, because the rules own both. See ADR 0015 and ADR 0021.",
  },

  // ---- reachable from evidence we already have, or could capture -------------------------------
  // MEASURED 2026-08-21. First conclusion was "cheap to build, worthless to ship" on the strength of
  // "zero failures in 4,895 captures" — and that number proves nothing, because NEITHER population can
  // produce the fault:
  //
  //   - the 4,822 corpus captures come from `page()` in case-matrix.mjs, which hardcodes `<title>`, so a
  //     titleless generated page is impossible BY CONSTRUCTION;
  //   - the 77 real captures are UK public-sector pages, the most templated and most audited on the web.
  //
  // That is this repo's own "a canary that cannot express the fault is worthless" rule, applied to the
  // criterion when it belonged to the measurement. The evidence was never the problem: the title is
  // captured reliably, with an `ok` flag, on 98.3% of everything on disk.
  //
  // The claim survives on THIRD-PARTY data instead. WebAIM's 2026 Million report tests 1,000,000 home pages
  // and names six categories covering 96% of all errors — contrast 83.9%, alt text 53.1%, form labels 51%,
  // empty links 46.3%, empty buttons 30.6%, document LANGUAGE 13.5%. Missing document TITLE is not among
  // them, and since they do measure document-level attributes, title absence sits well below 13.5%.
  //
  // The evidence is genuinely there — 4,818 of 4,899 corpus captures and 77 of 77 real ones carry a
  // `documentReady` diagnostic with NVDA's SPOKEN title, and the 81 without have `ok: false`, so "we could
  // not measure" is distinguishable from "the page has no title". That distinction is the one this criterion
  // would live or die on.
  //
  // What killed it is the failure rate. The detectable subset is ABSENCE — no title, or a placeholder like
  // "Untitled" or "index.html" — and across 4,895 measurable captures there are **zero** of either. Every
  // CMS template on earth emits a title.
  //
  // And the documented failures are the other kind. W3C's own report for the BAD survey page lists 2.4.2 as
  // "page title doesn't describe content", yet the page's actual title is
  // "Welcome to CityLights! [Inaccessible Survey Page]" — descriptive by any reading. Whether a title
  // describes its topic is human judgement, the same wall 2.4.6 stops at.
  //
  // So a rule here would fire only on pages authored to trip it, and would add a row to this table without
  // adding any detection. That is the "canary that cannot express the fault" shape, sold as coverage.
  "2.4.2": { status: "partial", needs: ["screen-reader"], channels: ["title", "routeChange"], note: "PARTIAL, and the part is chosen rather than incidental. The missing-title mode is not worth a rule — ZERO missing or placeholder titles across 4,895 captures, and WebAIM's million-page survey does not list it among the failures covering 96% of errors — and the does-not-describe mode is human judgement, the same wall 2.4.6 stops at (W3C flags 2.4.2 on a page titled 'Welcome to CityLights! [Inaccessible Survey Page]'). What IS assessed, since 2026-08-22, is the single-page-app transition: `probeNavigation` activates a navigation control and asks NVDA for the page title before and after, and `addStaleRouteTitle` reports a route that moved while the title stood still. A static analyser cannot reach this at all — the markup is valid at every instant and the failure is the TRANSITION. Two known limits: the probe activates the FIRST link, which on a real site may be a skip link (then the heading does not change either and the rule correctly makes no claim), and the corroborating signal is deliberately NOT 'nothing was announced' — measured, the failing page announced 'visited'." },
  "2.4.1": { status: "partial", needs: ["screen-reader"], channels: ["focusOrder", "links", "routeChange"], note: "PARTIAL since 2026-08-22, and the scope was settled against W3C rather than assumed. A skip link is NOT required: headings alone satisfy this (H69), landmarks alone satisfy it (ARIA11), and the criterion does not intend to require methods redundant to the user agent — so detecting ABSENCE would fire on conformant pages, and every corpus page has an h1. Whether a mechanism exists is a DOM fact the static layer answers better than our landmark sweep, which is documented as nondeterministic; same call as 3.1.1, where the attribute is the fact. What is assessed is a mechanism that is present and INERT: `probeNavigation` activates the first link and records where one Tab lands immediately afterwards, and `addInertSkipLink` fires when that is exactly where the ordinary tab order would have gone anyway. Measured on a pair differing only in the target id: 'Search the archive, edit' against 'News and updates, link'. A checker sees a link and a plausible href and passes the page." },
  "2.4.3": { status: "partial", needs: ["screen-reader"], channels: ["focusOrder", "formFields"], note: "PARTIAL since 2026-08-22. The blocker recorded here was real and is now gone: `focusOrder` existed on real captures and on NO corpus capture, so no rule could be validated — `probeFocus` is forwarded end to end now and `focus-order-tabindex` supplies the pair. `addBrokenFocusOrder` compares what the page READS (formFields, document order) against what Tab VISITS (focusOrder), on accessible name, restricted to controls in both and taking each control's FIRST visit — the tab order is a cycle, and comparing it raw made the conformant variant differ from itself. Whether an order 'preserves meaning' in general stays human judgement, the wall 2.4.6 also stops at, so this covers the contradiction case only. Worth noting what the measured failure looks like: positive `tabindex` did not pull the fields to the FRONT of the traversal, it displaced them past every link to the end — a user tabbing the form reaches Notes, then six unrelated links, then Postcode." },
  "2.1.1": { status: "partial", needs: ["screen-reader"], channels: ["focusOrder", "formFields"], note: "PARTIAL since 2026-08-22. Assesses one mode: a control the page ANNOUNCES as operable that Tab never reaches — a `div role=button` with a click handler and no `tabindex`, which a screen-reader user meets as 'I can hear it and I cannot press it'. Deliberately NOT the roleless `<div onclick>` of the custom-control family: that is invisible to the screen reader (its 4.1.2 finding) and a capture cannot tell it from a page with no button. POSITIONAL, because the focus probe truncates at 12 stops on every corpus page — absence from `focusOrder` alone would fire almost everywhere, so a control counts as unreachable only when something LATER in reading order was reached. Keyboard operation of a control that is NOT announced, and operation by keys other than Tab, remain outside this. AND SO DOES THE CRITERION'S TIMING CLAUSE, which this note omitted until 2026-09-05 while enumerating the other two exclusions — the omission that makes an enumeration misleading rather than incomplete. Verbatim: functionality must be operable \"WITHOUT REQUIRING SPECIFIC TIMINGS FOR INDIVIDUAL KEYSTROKES\", which W3C explains as keystrokes that must be repeated \"within a short period of time\" or a key \"held down for an extended period\". That is a DISTINCT failure from unreachability — keyboard access exists and the demand is temporal — and it is invisible here for a structural reason rather than a corpus one: the focus probe presses Tab once per stop and measures nothing about how long or how fast, so a control needing three keystrokes in 500 ms is reached, announced, and looks entirely conformant." },
  "3.3.3": {
    status: "assessed",
    channels: ["formChanges", "postSubmitFields"],
    realPageEvidence: {
      available: false,
      because: "the rule's FIRST precondition is a SUBMIT activation, and no real capture AS EXPORTED "
        + "carries a submit-kind `formChanges` entry — measured 0 of 26 reachable locally, so the rule "
        + "returns on its first line there. Note the coverage audit reads this as EXERCISED because "
        + "`postSubmitFields` appears on some real capture, which is true and not sufficient: that channel "
        + "is a supplement the rule consults AFTER a submit it never sees. 3.3.1 and 4.1.3 are exempt for "
        + "the same reason. "
        + "THIS USED TO SAY THE PROBE SETTING MADE IT 0 EVERYWHERE RATHER THAN BY ACCIDENT, WHICH READ AS "
        + "A PERMANENT LIMIT. It is not one. ADR 0024 put a DECLARED `formState` in the corpus beside the "
        + "URL — the page owner's own example, values recorded — so submitting is something the corpus "
        + "says to do rather than something the probe decides, and `probeForms` stays off with "
        + "SECURITY.md's rule untouched. Measured live 2026-09-03 on W3C's `after/survey.html`: three "
        + "fields filled, submitted, NVDA announced 'Submission Failed'. What is missing is a real-page "
        + "CAPTURE RUN that exports it, not a capability — and 'structurally unreachable' and 'not yet "
        + "captured' need opposite work",
    },
    note:
      "Error Suggestion, ASSESSED since 2026-09-02 and decided by a RULE rather than a head. The pair is "
      + "single-criterion by construction: both variants announce the error correctly (aria-invalid, "
      + "role=alert, focus moved) so both satisfy 3.3.1, and the only difference is whether the message "
      + "names a remedy -- 'Enter the visit date as DD slash MM slash YYYY' against 'Invalid entry'. "
      + "A HEAD WAS TRIED FIRST AND FAILED, measurably: recall 0.0 on its own training data under both "
      + "document-mean and instance-max pooling, with false positives on conformant records "
      + "(known-gaps.md §22). One clause inside a long announcement is diluted by an average and was not "
      + "rescued by a max. It does not need a head: whether the announced error carries an INSTRUCTION is "
      + "read directly, which is this project's own test for what a rule may assert, and the same basis "
      + "as 1.1.1:filename-alt. Measured on 2,170 captures: fires on every positive, 0 false positives.",
  },
  "3.2.1": {
    status: "assessed",
    channels: ["focusContext"],
    realPageEvidence: {
      available: false,
      because: "the rule RUNS on real pages and finds nothing, which is the correct answer on a "
        + "conformant one. `probeFocusContext` was turned on for real-page captures on 2026-09-02 — it "
        + "presses Tab, which `probeFocus` already pressed on every one of them, so it observes something "
        + "this tool was doing anyway rather than doing anything new to a stranger's site. The coverage "
        + "audit confirms the channel is present across those captures and the rule stayed silent on all "
        + "of them: none of the 39 renames itself when a control is focused. What is missing is a real "
        + "page that EXHIBITS the failure, not the evidence or the opportunity — the same position 1.4.2 "
        + "is in, where 8 media elements across 89 captures and none autoplaying. Its sibling 3.2.2 is "
        + "exempt for the OPPOSITE reason and the two must not be read as the same claim: that one cannot "
        + "run at all, because typing into a stranger's field is not a review",
    },
    note:
      "On Focus, ASSESSED since 2026-09-02 and decided by a RULE. `probeFocusContext` walks up to eight "
      + "tab stops reading the page title either side of each — walking rather than pressing Tab once, "
      + "because the first focusable thing on a page is almost never the control you mean, and one press "
      + "landed on the skip link on all 28 corpus cases. Rules-owned because the comparison is READ "
      + "rather than judged: two titles are equal or they are not. It runs FIRST among the focus probes, "
      + "since `probeFocusOrder` walks the whole tab order and a page that renames itself on focus has "
      + "already done so by the time that finishes. Cost a CAPTURE_PROTOCOL_VERSION bump (13 -> 14) and "
      + "one full recapture, bundled with 3.2.2.",
  },
  "3.2.2": {
    status: "assessed",
    channels: ["typedFeedback"],
    realPageEvidence: {
      available: false,
      because: "the evidence comes from `probeTyping`, which enters characters into a field — and that is "
        + "`probeForms`'s problem in another costume: typing into a stranger's form is not a review, so it "
        + "is off for every real-page capture. Its sibling 3.2.1 IS demonstrated on real pages, because "
        + "`probeFocusContext` only presses Tab and `probeFocus` already does that on every one of them. "
        + "The two criteria are the same shape and land on opposite sides of the consent line, which is "
        + "why this is declared here and not there",
    },
    note:
      "On Input, ASSESSED since 2026-09-02 and decided by a RULE. The pair differs only in whether typing "
      + "rewrites the page title, so both variants announce identically and nothing here is a 3.3.x "
      + "finding in disguise. Rules-owned because the comparison is READ rather than judged: two titles "
      + "are equal or they are not, with no wording to interpret and no threshold to calibrate. One helper "
      + "decides this and 3.2.1, because the evidence differs only in which probe produced it — 3.2.2 is "
      + "3.2.1 'on change rather than focus', which is how this table described the pair years before "
      + "either was built. Cost a CAPTURE_PROTOCOL_VERSION bump (13 -> 14) and one full recapture, taken "
      + "as a bundle with 3.2.1.",
  },
  "1.3.5": { status: "reachable", needs: ["dom"], channels: ["formFields"], note: "Identify Input Purpose is the `autocomplete` attribute against a fixed token list — deterministic, and squarely a rule. Needs the DOM, like 1.4.2." },
  "3.1.1": { status: "reachable", needs: ["dom"], channels: ["transcript"], note: "Language of Page: `<html lang>`. THE CONCLUSION STANDS AND ITS STATED MECHANISM WENT STALE on 2026-09-03. This read \"NVDA switching SYNTHESISER LANGUAGE is an indirect and unreliable proxy\", which described NVDA at its defaults; `speech.reportLanguage` has been ON since that date, so NVDA SPEAKS the language and it lands in the transcript as text. The signal is therefore direct, not a proxy -- and the criterion is still not decidable from it, for the reason 3.1.2 records: an announcement CONFIRMS a language was declared, while SILENCE is what both a missing `lang` and a page matching NVDA's own default produce. Absence is the failure here, so the transcript can satisfy but never accuse, and the attribute remains the fact. Keeping a stale mechanism beside a right answer is how a reader concludes the answer was never re-examined.", },
  // 3.1.2 CLAIMED THE TRANSCRIPT AND THE TRANSCRIPT CANNOT CARRY IT — corrected 2026-09-01, measured.
  //
  // `/diagnostics` returns NVDA's config on the fleet: 396 characters, no sections, so every setting sits
  // at its default and `documentFormatting.reportLanguage` carries no override. NVDA's default for Report
  // Language is OFF, and what automatic language switching does instead is change the VOICE. A voice
  // change emits no text, and this pipeline reads the speech stream rather than the synthesiser — so at
  // defaults the speech channel is silent on this criterion in BOTH directions. It cannot see the pass and
  // it cannot see the fail, which is the symmetry that makes it a non-claim rather than a miss.
  //
  // Turning Report Language on would put it in the transcript, and would make every capture describe a
  // user who has changed a setting most users have not. CLAUDE.md's rule is the deciding one: *"record
  // them; do not tune them -- NVDA's defaults are what a real user experiences."*
  //
  // WHAT REMAINS IS A DOM ROUTE, AND IT IS AXE'S. `lang` is an attribute; reading it needs no screen
  // reader, exactly as 2.5.3's note says of Label in Name -- *"highly automatable and axe-core covers it
  // well; worth deciding whether to duplicate or defer."* This project sits ALONGSIDE axe-core rather than
  // instead of it, and a criterion where the screen-reader layer adds nothing is one to defer.
  //
  // `channels` is now absent rather than wrong. That is the whole correction: an aspirational channel that
  // cannot carry the evidence is a claim, and this file's own header says `status` means "we have evidence
  // and a decider", never "this answer is exact".
  "3.1.2": {
    // THIS ENTRY'S PREMISE CHANGED ON 2026-09-03, and the entry is corrected rather than left standing.
    //
    // It read `out-of-scope` because "at NVDA's defaults" a language change is announced as a change of
    // VOICE and no text — true, and the last clause of the old note named the fix while ruling it out:
    // "Report Language ON would put it in the transcript at the cost of describing a non-default user."
    // That cost was accepted as a product decision. The setting is on across the fleet, verified by
    // reading it back from NVDA, and `screenReaderSettings` carries it into the cache key so evidence
    // taken under it can never blend with evidence taken without it.
    //
    // SO IT IS NO LONGER out-of-scope BY THAT ARGUMENT — but it is NOT assessed either, and saying so is
    // the honest state. `reachable` under this file's definition: a channel could now carry it, and
    // nothing yet does. There is no rule, and — measured — essentially no corpus case has a `lang` change
    // for one to fire on, which is §17's lesson exactly: the capability arriving before anything for it
    // to observe. Marking it `assessed` on the strength of a setting would be a coverage claim resting on
    // a config value.
    status: "reachable", needs: ["screen-reader", "dom"], channels: ["transcript"],
    note: "Language of Parts: `lang` on elements whose text differs from the page language. At NVDA's "
      + "DEFAULTS this is announced as a change of VOICE with no text, which is why it was recorded as out "
      + "of scope. `[speech] reportLanguage` is ON as of 2026-09-03 (a product decision, keyed in "
      + "`screenReaderSettings`), and 29 corpus cases now prove NVDA speaks the language into the "
      + "transcript — check-signals discriminates all of them. THE SCREEN READER CANNOT DECIDE IT ALONE, "
      + "and W3C says so directly: auditors 'cannot solely rely on the spoken output from assistive "
      + "technologies, but must verify whether or not changes in natural language have been identified "
      + "correctly in the underlying code or markup'. But 'not alone' is not 'not at all', and reading it "
      + "as the second was an error corrected on 2026-09-04. WCAG defines PROGRAMMATICALLY DETERMINED as "
      + "'determined by software from AUTHOR-SUPPLIED DATA ... assistive technologies can extract and "
      + "present', so the question is whether the author supplied it — and NVDA announcing the language IS "
      + "that extraction, in the modality the definition names. Four cases, not one: marked-and-announced "
      + "is SATISFIED and only this tool can demonstrate it; MARKED-AND-SILENT is a failure only this tool "
      + "can witness; an invalid `lang` is axe's `valid-lang`; and only an UNMARKED foreign passage needs "
      + "language detection. The corpus pair is that last one, which is why this read as undecidable. The "
      + "DOM census (`documentLang`, `partLangs`, `partLangCount`, deployed 2026-09-04) supplies the "
      + "markup half W3C asks for; the marked-and-silent rule is on the backlog.",
  },
  "2.5.3": { status: "reachable", needs: ["dom", "accessibility-tree"], channels: ["controls", "structureCensus"], note: "Label in Name — visible text must be contained in the accessible name. Highly automatable and axe-core covers it well; worth deciding whether to duplicate or defer." },
  // WHY THE SCREEN READER CANNOT ANSWER THIS ONE, recorded because it looks like an oversight and is not.
  // In browse mode single letters ARE NVDA's quick-nav commands -- h heading, k link, f form field, g
  // graphic, l list, and most of the rest of the alphabet -- so NVDA CONSUMES them and the page never
  // receives the keystroke. Focus mode passes keys through, but it engages when focus is on an editable,
  // so the character goes INTO that field rather than to a global shortcut handler. Either way the key
  // never arrives where 2.1.4 lives.
  //
  // The irony is worth keeping: 2.1.4 exists BECAUSE single-key shortcuts collide with screen-reader and
  // speech-input users. It protects exactly the user this tool simulates, and simulating them is what
  // makes it unobservable here.
  //
  // `needs: ["dom"]` is therefore right but understates it. A listener census (CDP
  // `DOMDebugger.getEventListeners`) plus synthetic key dispatch gets you "a handler exists" -- and the
  // criterion is not "are there shortcuts", it is "if there are, can they be turned off, remapped, or
  // scoped to focus". Detecting the ABSENCE of a turn-off mechanism means finding a settings UI and
  // judging it, which is why axe ships no rule for it either. Nobody has failed to build this; the
  // negative is a semantic judgement.
  "2.1.4": { status: "reachable", needs: ["dom"], channels: ["focusOrder", "transcript"], note: "Character Key Shortcuts: single-character key handlers with no way to disable or remap them. NVDA consumes single letters as quick-nav commands in browse mode, so the screen-reader channel is structurally blind to this -- see the comment above." },

  // ---- out of scope: the evidence does not exist in this tool ----------------------------------
  "1.4.3": { status: "out-of-scope", needs: ["visual"], note: "No assistive-technology signal exists; this is a rule/visual scanner's job. \"A PROPERTY OF RENDERED PIXELS\" IS LOOSE, and the looseness would misdirect anyone building it: W3C says to \"refer to the foreground and background colors obtained from the user agent, OR THE UNDERLYING MARKUP AND STYLESHEETS, rather than the text as presented on screen\" -- explicitly because anti-aliasing makes the screen read lower than the authored colours. So it is computed from styles, not sampled from a screenshot, which is exactly how axe-core does it. The conclusion is unchanged: colour is `visual` by this file's own definition, and nothing in the accessibility tree carries it.", },
  "1.4.11": { status: "out-of-scope", needs: ["visual"], note: "Exactly as 1.4.3, including the correction recorded there -- W3C directs the same \"colors obtained from the user agent, or the underlying markup and stylesheets\" for this one, so it is computed rather than sampled. Two bullets, both visual: \"visual information required to identify user interface components and states\" at 3:1, and \"parts of graphics required to understand the content\". Checked for a non-visual half, as 2.2.2, 2.4.7 and 2.5.4 each turned out to have one; this criterion has none.", },
  "1.4.1": { status: "out-of-scope", needs: ["visual"], note: "Use of Colour requires knowing what colour conveys, which needs the rendering and usually a human." },
  "1.4.4": { status: "out-of-scope", needs: ["visual"], note: "Resize Text needs the page re-rendered at 200%." },
  "1.4.5": { status: "out-of-scope", needs: ["visual"], note: "Images of Text needs pixel inspection or OCR." },
  "1.4.10": { status: "out-of-scope", needs: ["visual"], note: "Reflow needs a 320px viewport and geometry." },
  "1.4.12": { status: "out-of-scope", needs: ["visual"], note: "Text Spacing needs re-rendering with overridden CSS." },
  // MOVED OUT OF `out-of-scope` 2026-09-05 by the audit of these reasons. The old note read "needs
  // pointer hover and geometry; the screen-reader path never hovers", which is true of HALF the criterion
  // and was written as if it settled the whole of it.
  "1.4.13": {
    status: "reachable",
    needs: ["screen-reader", "accessibility-tree"],
    channels: ["dialogEscape", "focusOrder", "structureCensus"],
    note: "THE CRITERION EXPLICITLY COVERS KEYBOARD FOCUS, AND WE DRIVE KEYBOARD FOCUS. Verbatim: \"Where receiving and then removing pointer hover OR KEYBOARD FOCUS triggers additional content to become visible and then hidden\". The previous reason ruled the criterion out on the hover trigger alone, which is the reasoning error `out-of-scope` cannot afford: that status means no amount of work inside this tool's evidence model decides it, and one of the three bullets is decidable. HOVERABLE is genuinely out of reach and stays so -- it is conditioned on `if pointer hover can trigger` and we never use a pointer. DISMISSABLE is reachable: it asks for a mechanism to dismiss the additional content WITHOUT MOVING FOCUS, and `dialogEscape` is already exactly that observation -- focus before, what was announced, focus after, Escape pressed twice because NVDA eats the first. Focus a trigger, hear content appear, press Escape, ask whether it is gone. PERSISTENT is asymmetric: \"remains visible\" is pixels, so we can never confirm it, but content vanishing from the accessibility tree while the trigger still holds focus is SUFFICIENT evidence of failure without being necessary -- the same shape as every other absence this tool reasons about. What is missing is a probe, not evidence: nothing today diffs the census across a focus change, which is why this is `reachable` and not `partial`. Do not build it before there is a corpus case, per the rule that a probe built now produces evidence nothing can validate.",
  },
  "1.3.4": { status: "out-of-scope", needs: ["dom", "visual"], note: "THE `needs` WAS WRONG AND THE CONCLUSION HOLDS. This read \"needs the page rendered in two orientations\", and `needs` is defined in this file as a claim about which EVIDENCE SOURCE could decide a criterion -- not about what we intend to do. F97, locking the view to portrait or landscape, is a CSS media query or transform: STATIC, and decidable by code review without rendering anything, which is why axe-shaped tooling can reach it. So `visual` alone understated what could decide it. F100 -- a message asking the user to reorient -- is the other half and is TEXT a screen reader would read aloud, but only once the page is in the orientation it objects to, and the capture is a desktop window in landscape. Out of scope for THIS tool either way: neither half produces an assistive-technology signal in the session we drive. Recorded because a wrong `needs` misroutes the next person building coverage.", },
  "1.3.2": { status: "out-of-scope", needs: ["human", "visual"], note: "THE CONCLUSION IS RIGHT AND THE REASON WAS NOT. This read \"compares reading order to VISUAL order ... cannot say whether it matches what a sighted user sees\", and the criterion does not ask that. Verbatim: \"When the sequence in which content is presented affects its meaning, a correct reading sequence can be programmatically determined\" -- and the Understanding page states outright that the two orders MAY differ without failing (\"the visual presentation of the sections does not match the programmatically determined order, but the meaning of the page does not depend on the order\"). So a mismatch is not the failure, and a tool built on the old reason would have looked for the wrong thing. What actually puts it out of reach is two judgements no capture supplies: whether sequence AFFECTS MEANING here at all, and whether a given linearisation is a CORRECT one. The listed failures are F32/F33/F34 (whitespace used for layout in plain text), F49 (a layout table that does not make sense linearised) and F1 (CSS positioning changing meaning) -- F49 is the one a screen reader comes closest to, and \"does not make sense\" is exactly the judgement it cannot make. A WRONG REASON FOR A RIGHT CONCLUSION IS STILL A DEFECT: it is what the next person reads before deciding what to build.", },
  "1.3.3": { status: "out-of-scope", needs: ["visual", "human"], note: "Sensory Characteristics — instructions relying on shape, position or sound. Needs the rendering and a judgement." },
  "2.3.1": { status: "out-of-scope", needs: ["visual"], note: "Three Flashes needs frame-by-frame analysis of motion." },
    // Reclassified 2026-09-05: one of its two listed failures is not visual at all.
  "2.4.7": {
    status: "reachable",
    needs: ["screen-reader", "visual"],
    channels: ["focusOrder", "focusContext"],
    note: "TWO LISTED FAILURES, AND ONLY ONE OF THEM IS ABOUT PIXELS. F78 -- styling outlines and borders so the indicator is not visible -- is the common one and is rendering, exactly as the old note said. F55 is the other: \"using script to remove focus when focus is received\", which fails this criterion because nothing holds focus for an indicator to be drawn on. That is not a pixel question and `focusOrder` is the channel for it. THE REPO ALREADY KNEW THIS FROM THE OTHER END: 3.2.1's rule states F55 as an unclosed gap and says outright that `focusOrder` could witness it, so ONE PROBE WOULD SERVE BOTH CRITERIA -- and neither entry mentioned the other. THE AMBIGUITY IS REAL AND MUST BE DESIGNED FOR: a control that receives focus and has it stripped presents as a control focus never reached, which is 2.1.1's signature. Distinguishing them needs the focus event, not just the resulting tab-stop list, and that is why this is `reachable` rather than `partial` -- the evidence to tell the two apart is not captured yet. Do not build it without a corpus case that carries F55 specifically.",
  },
  "2.4.11": { status: "out-of-scope", needs: ["visual"], note: "Focus Not Obscured is geometry: is the focused element covered by other content." },
  "2.5.8": { status: "out-of-scope", needs: ["visual"], note: "Target Size is geometry: the rendered width and height of a control, and its spacing from its neighbours. Nothing in the accessibility tree carries it." },
  "2.5.1": { status: "out-of-scope", needs: ["dom", "human"], note: "Pointer Gestures — path-based gestures needing a single-pointer alternative. Not observable from a keyboard-driven screen-reader session." },
  "2.5.2": { status: "out-of-scope", needs: ["dom"], note: "Pointer Cancellation is about down-event behaviour; this tool never uses a pointer to operate anything." },
  "2.5.4": { status: "out-of-scope", needs: ["dom", "human"], note: "TWO REQUIREMENTS, AND THIS NAMED ONE -- the third instance of that shape in this file, with 2.2.2 and 2.4.7. Verbatim: functionality operable by device or user motion \"can ALSO be operated by user interface components AND responding to the motion CAN BE DISABLED to prevent accidental actuation\". The old note covered the alternative-controls half. The disable half is testable without any device motion at all -- F106 is \"inability to deactivate motion actuation\", and a setting or toggle is an ordinary control this capture would announce. It stays out of scope because ESTABLISHING THE CRITERION APPLIES still needs the motion handlers, which is DOM and produces no assistive-technology signal: without knowing motion actuation exists, a page with no disable toggle is indistinguishable from a page with nothing to disable. Absence read as a value, which is the conflation this project names everywhere else.", },
  "2.5.7": { status: "out-of-scope", needs: ["dom"], note: "Dragging Movements need a pointer-driven session and a single-pointer alternative, exactly as 2.5.1." },
  "1.2.1": { status: "out-of-scope", needs: ["human"], note: "Whether an alternative CONVEYS the media is a judgement about content, not a property observable from a page." },
  "1.2.2": { status: "out-of-scope", needs: ["human"], note: "Captions: presence is detectable from the DOM, but accuracy and completeness are not." },
  "1.2.3": { status: "out-of-scope", needs: ["human"], note: "Audio Description or Media Alternative: presence may be detectable, adequacy is not, exactly as 1.2.1." },
  "1.2.4": { status: "out-of-scope", needs: ["human"], note: "Live captions cannot be assessed from a static capture at all." },
  "1.2.5": { status: "out-of-scope", needs: ["human"], note: "Whether the description conveys what the video shows is a judgement about content. NOT \"exactly as 1.2.3\", and the difference cuts the way that matters for automation: 1.2.3 (A) lets an author choose audio description OR a full text alternative, while 1.2.5 (AA) MANDATES audio description specifically. One acceptable artefact rather than two makes presence MORE mechanically detectable here, not less -- a `track` of kind `descriptions`, or a described audio track. Presence is still not the criterion; adequacy is, and that is the judgement. Recorded because \"exactly as X\" is how a distinction stops being visible.", },
  "2.2.1": { status: "out-of-scope", needs: ["dom", "human"], note: "Timing Adjustable needs a time limit to exist and be observed over time; a 12-second capture cannot see one." },
  "2.2.2": { status: "out-of-scope", needs: ["visual", "dom", "human"], note: "TWO PARTS, AND THIS REASON USED TO COVER ONE. It read \"needs moving content and a control for it, observed over time\", which is the MOVING/BLINKING/SCROLLING half -- five seconds, presented in parallel, a mechanism to pause. The second half is AUTO-UPDATING information, which has no five-second condition and is not about movement at all: \"for any auto-updating information that (1) starts automatically and (2) is presented in parallel with other content, there is a mechanism ... to pause, stop, or hide it or to control the frequency\". A live region updating on a timer is exactly that, and it is the one half a screen reader CAN hear -- so the old reason ruled the criterion out on a property the failing half does not have. Same shape as 1.4.13. It stays out of scope on the half that is audible, for a different reason: the failure is the ABSENCE OF A MECHANISM for that particular region, and relating a control to the region it would pause is a judgement no capture supplies. Observing the updates is unreliable too -- not-working.md \u00a718 measures a polite live region reaching the delta 2 times in 6, unexplained -- so even the audible half cannot be relied on to appear. State both halves, because a reader deciding what to build needs to know the second one exists.", },
  "2.4.5": { status: "out-of-scope", needs: ["multi-page"], note: "Multiple Ways is a property of a SITE — more than one route to a page. The capture is single-page by construction." },
  "3.2.3": { status: "out-of-scope", needs: ["multi-page"], note: "Consistent Navigation compares pages to each other." },
  "3.2.4": { status: "out-of-scope", needs: ["multi-page"], note: "Consistent Identification compares how the same function is labelled across pages, so it needs more than one." },
  "3.2.6": { status: "out-of-scope", needs: ["multi-page"], note: "Consistent Help compares the position of help mechanisms across pages, so it needs more than one." },
  "3.3.4": { status: "out-of-scope", needs: ["human"], note: "THE FLOW WAS NOT THE BARRIER, and this is the third reason in this file to say it was (see 3.3.7 and 3.3.8). W3C: assessment does NOT necessarily require observing a complete transaction; the \"Confirmed\" bullet asks whether \"a mechanism is available for reviewing, confirming, and correcting information before finalizing\", and an order-review page shows that on its own. So `multi-page` was wrong and is dropped. What remains is genuinely a judgement, and it is the FIRST clause rather than the three bullets: deciding that a page \"causes legal commitments or financial transactions\" or \"modifies or deletes user-controllable data\" is a claim about consequence in the world, which no capture carries. And as with 3.3.8 there is a second, independent bar: satisfying oneself that submissions are Reversible would mean submitting one, and `probeForms` is off for pages we do not own precisely because pressing a stranger's button is not a review.", },
  "3.3.7": { status: "reachable", needs: ["screen-reader"], channels: ["formFields", "formChanges"], note: "TWO CORRECTIONS, A DAY APART, AND THE SECOND REVERSED THE FIRST'S CONCLUSION. The original reason was `multi-page`: \"Redundant Entry spans steps of a process\". The criterion governs re-entry \"in the same process\", and W3C puts a process inside one page explicitly -- an email field, then \"confirm your email\", no auto-population, is the textbook failure and entirely one document. The word \"process\" had been read as \"pages\". That correction kept it out of scope on the EXCEPTIONS, assuming they were judgements broad enough to make any rule unsafe. THEY ARE NOT, AND ASSUMING SO WITHOUT READING THEM WAS THE SAME DEFECT ONE LAYER ON. Read: the SECURITY exception explicitly covers password confirmation -- \"having users re-validate their new string is allowed as an exception\" -- and the ESSENTIAL exception is narrow, defined as information whose removal \"would fundamentally change the information or functionality\", with memory games as its only example. **Verifying accuracy does not qualify.** So the common conformant pattern is not a judgement at all, it is one named exception, and NVDA announces a password field distinctly -- the discriminator is in the evidence rather than in a human's head. WHAT IS ACTUALLY MISSING IS A PROBE: nothing today fills one field and asks whether a later one populates, though `probeTyping` already writes to controls. And the mapping should be `secondary` when it is built, not because of the exceptions but because \"these two fields want the same information\" is a LABEL HEURISTIC -- \"Home address\" and \"Billing address\" are similar strings and different information, which is the `vague_link_present` shape that took 2.4.4 to 27 false positives. Corpus case first, per the rule that a probe built now produces evidence nothing can validate.", },
  "3.3.8": { status: "out-of-scope", needs: ["dom", "human"], note: "\"NEEDS A REAL AUTHENTICATION FLOW\" IS NOT WHAT THE CRITERION REQUIRES, and it was also the wrong `needs`. W3C is explicit that failures are identifiable from the LOGIN PAGE ITSELF: whether paste is blocked, the form field markup and naming, the presence of a cognitive test, and what alternatives are offered. Blocking paste into a password field is named as a failure outright (F109), and an `onpaste` handler is static DOM -- so this never needed a flow, a second page, or an account. Out of scope for THIS tool for two reasons the old note did not give. First, the detectable half is DOM and produces no assistive-technology signal, which makes it axe-shaped rather than ours. Second, and independently: SECURITY.md forbids the alternative. Deciding whether an \"Alternative\", \"Mechanism\", \"Object Recognition\" or \"Personal Content\" exception applies is a judgement, and `probeForms` already refuses to press buttons on pages we do not own -- attempting an authentication step on a stranger's site is not a review. A wrong reason matters here because \"needs a real flow\" reads as \"do it when we can log in\", and the right answer is that we should not.", },
};

/**
 * Exactly the capture fields the channel map reads. Narrow on purpose, like `ScorableCapture` in the scorer:
 * this package should not depend on a full `CaptureResult` to answer a question about coverage, and naming
 * the fields makes the coupling visible. TypeScript is structural, so a real capture satisfies it uncast.
 */
export interface ChannelBearingCapture {
  transcript?: string[];
  structure?: Record<string, unknown> | null;
  interaction?: Record<string, unknown> | null;
  diagnostics?: Array<Record<string, unknown>> | null;
}

/**
 * WHERE `channelsPresent` LOOKS FOR EACH CHANNEL — one classification, exhaustive by construction.
 *
 * This replaced two hand-written arrays that had to be kept in step with the `EvidenceChannel` union by
 * memory, and were not. `routeChange` was added to the union and never to `INTERACTION_CHANNELS`, so
 * `channelsPresent` could not report it and 2.4.1 and 2.4.2 read as BLOCKED on every capture ever taken —
 * measured on `route-title-stale.good.json`, the fixture built to demonstrate 2.4.2, which carries the
 * evidence and was told it did not.
 *
 * `tsc` could not catch that: every member of a wider union is a valid element of a narrower array. It CAN
 * catch this, because `Record<EvidenceChannel, ...>` is exhaustive — a channel added to the union above
 * fails to compile until it is classified here. That is the difference between a rule a human must
 * remember and one the build enforces, which is this repo's first-choice remedy for a fact stated twice.
 */
// EXPORTED so a corpus test can compare it against what captures actually carry. `tsc` makes this Record
// exhaustive over the union, which catches a channel added to the UNION and not classified -- and is blind
// in the direction that actually happens: a channel added to CAPTURES and mentioned in neither. Protocol 11
// added two and the whole suite stayed green. `evidence-channels.corpus.test.ts` is what asks the corpus.
export const CHANNEL_LOCATION: Record<EvidenceChannel, "structure" | "interaction" | "read-specially" | "unclaimed"> = {
  transcript: "read-specially",
  headings: "structure",
  landmarks: "structure",
  formFields: "structure",
  graphics: "structure",
  links: "structure",
  lists: "structure",
  tableCells: "structure",
  controls: "interaction",
  stateChanges: "interaction",
  formChanges: "interaction",
  postSubmitFields: "interaction",
  focusOrder: "interaction",
  routeChange: "interaction",
  dialogEscape: "interaction",
  arrowNavigation: "interaction",
  typedFeedback: "interaction",
  focusContext: "interaction",
  postSubmitNames: "interaction",
  frames: "structure",
  // Read from somewhere other than `structure`/`interaction`: `media` sits at the top level, `title`
  // inside the `documentReady` diagnostic, `structureCensus` is a diagnostic's presence.
  media: "read-specially",
  title: "read-specially",
  structureCensus: "read-specially",
  // CAPTURED AND CLAIMED BY NO CRITERION, deliberately — see the union's own note: the 2.1.2 rule that
  // read it produced nine findings on conformant real pages and was withdrawn. Classified rather than
  // omitted, so "nothing needs it" and "somebody forgot" are different states.
  tabStops: "unclaimed",
};

const channelsIn = (where: "structure" | "interaction"): EvidenceChannel[] =>
  (Object.keys(CHANNEL_LOCATION) as EvidenceChannel[]).filter((c) => CHANNEL_LOCATION[c] === where);

const STRUCTURE_CHANNELS: EvidenceChannel[] = channelsIn("structure");
const INTERACTION_CHANNELS: EvidenceChannel[] = channelsIn("interaction");

/**
 * Does the capture actually CARRY this channel?
 *
 * Arrays are the common case and emptiness counts as absence, deliberately — see `channelsPresent`.
 *
 * OBJECTS COUNT TOO, and classifying `routeChange` above without this would have fixed nothing: it is
 * `{control, titleBefore, titleAfter, headingBefore, headingAfter}`, not a list, so an `Array.isArray`
 * test rejects it and the channel stays permanently absent. The identical trap caught `evidence-diff.mjs`
 * the same day — a field listed as covered while the reader cannot see its shape is coverage that
 * examines nothing, which is worse than the omission it replaces.
 */
const nonEmpty = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
};

/**
 * Which channels this capture actually CARRIES — populated, not merely declared.
 *
 * Emptiness counts as absence deliberately, and that is the whole point of the type. An empty
 * `formChanges` and a `formChanges` the probe never ran are the same shape on disk, and this project has
 * repeatedly paid for treating one as the other: "0 of 77 real captures carry `formChanges`" is why 3.3.1
 * cannot fire on a real page. A caller that needs to tell "probe did not run" from "probe found nothing"
 * must read `captureWasTruncated`, which reports exactly that and is a separate question from this one.
 *
 * `title` is read from the `documentReady` DIAGNOSTIC because that is where it lives — the capture result
 * has no title field, though `documentTitle` is computed and passed to the read-through. Promoting it would
 * be cleaner and is a capture change; reading it here is honest about where the evidence actually is.
 */
export function channelsPresent(capture: ChannelBearingCapture): Set<EvidenceChannel> {
  const present = new Set<EvidenceChannel>();
  if (nonEmpty(capture.transcript)) present.add("transcript");
  for (const channel of STRUCTURE_CHANNELS) {
    if (nonEmpty((capture.structure ?? {})[channel])) present.add(channel);
  }
  for (const channel of INTERACTION_CHANNELS) {
    if (nonEmpty((capture.interaction ?? {})[channel])) present.add(channel);
  }
  if (nonEmpty((capture as { media?: unknown[] }).media)) present.add("media");
  const ready = (capture.diagnostics ?? []).find((mark) => mark.event === "documentReady");
  if (typeof ready?.title === "string" && ready.title.trim()) present.add("title");
  if ((capture.diagnostics ?? []).some((mark) => mark.event === "structureCensus")) {
    present.add("structureCensus");
  }
  return present;
}

/** A criterion this capture cannot decide, and the channels it would have needed. */
export interface BlockedCriterion { criterion: string; missing: EvidenceChannel[] }

/**
 * Which criteria this capture can decide, and which it cannot AND WHY.
 *
 * The reason this exists, in one sentence: establishing that 2.4.1, 2.4.3 and 2.1.1 were unvalidatable took
 * an afternoon of walking 4,899 captures over SSH to find that `focusOrder` is absent from every one of them,
 * because `probeFocus` is opt-in and the dataset runner never sets it. This turns that into a call.
 *
 * A criterion needs ALL of its channels, not any: 3.3.1 reads `formChanges` and `postSubmitFields` and a rule
 * with only one of them would be deciding on half the evidence. Where that is too strict for a specific
 * criterion the fix is to correct that criterion's channel list, not to weaken this.
 *
 * `out-of-scope` criteria are absent from both lists rather than reported as blocked — nothing is missing,
 * they are simply not this tool's business, and listing them as blocked would imply a probe could fix it.
 */
export function criteriaAssessableFrom(capture: ChannelBearingCapture):
  { assessable: string[]; blocked: BlockedCriterion[] } {
  const present = channelsPresent(capture);
  const assessable: string[] = [];
  const blocked: BlockedCriterion[] = [];
  for (const [criterion, entry] of Object.entries(CRITERION_COVERAGE)) {
    if (entry.status === "out-of-scope" || !entry.channels?.length) continue;
    const missing = entry.channels.filter((channel) => !present.has(channel));
    if (missing.length) blocked.push({ criterion, missing });
    else assessable.push(criterion);
  }
  return { assessable, blocked };
}
