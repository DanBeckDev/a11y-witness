/**
 * Deterministic absence-criteria rules.
 *
 * Some WCAG failures are not judgment calls — they are the literal ABSENCE of an
 * accessible name. A screen reader announces these as a role with no name (the
 * U+FFFC object-replacement char, "￼"), e.g. "edit, ￼" or "graphic, ￼". An LLM
 * or NLI verifier cannot reliably infer a violation from "nothing was
 * announced", but a rule can: if the name is empty, it is unlabelled, full stop.
 *
 * These rules run alongside the model-based verifier (which keeps the SEMANTIC
 * criteria: vague links, non-descriptive headings, etc.). They are exact: they
 * only inspect image announcements and role-only controls, never links or
 * headings, so they cannot produce the over-flagging the generative judge did.
 *
 * A note on announcement strings (verified against the real NVDA captures in
 * packages/lab/src/eval/fixtures/nvda/nvda-w3c-*.json, 2026-06-29): published guides document an
 * unlabelled control as "edit, blank" and unnamed image-in-link as a filename or
 * spelled-out URL. Those are JAWS/VoiceOver/version-specific — they do NOT match
 * what our NVDA pipeline emits. Our NVDA announces an empty name as the U+FFFC
 * marker (below) or the literal word "Unlabelled". In our captures the bare word
 * "blank" is empty-LINE/spacing noise on its own line, never role-adjacent, so it
 * is NOT an empty-name signal here and must not be keyed on (it would false-fire
 * on spacing). Validate any new announcement-string rule against our own captures,
 * not against a book's strings.
 */
import type { Channel } from "@a11y-witness/evidence";
import { parseAnnouncement, CONTROL_ROLES } from "@a11y-witness/evidence";
// The ONE list of criteria the rules may emit. Imported rather than restated: writing a second
// copy here is the defect this file has recorded five times, and I made it once before deleting it.
import { RULE_CRITERIA } from "./coverage.js";
import type { Finding, RequirementMapping } from "./judge.js";

/** The capture fields the rules inspect (a subset of JudgeInput; a full
 * JudgeInput is assignable to this). */
export interface RuleInput {
  transcript: string[];
  /** Capture diagnostics. `readingOrder` needs the sweep mark to know which half of a sweep is reversed. */
  diagnostics?: unknown[];
  structure?: { formFields?: string[]; headings?: string[]; links?: string[]; graphics?: string[] };
  interaction?: {
    controls?: string[];
    stateChanges?: { control: string; after: string }[];
    /**
     * What each Tab press announced, in order. Absent means the focus probe did not run — which was true
     * of EVERY capture until this rule existed, because `probeFocus` was reachable from no CLI flag and no
     * Action input. Absent must therefore make no claim.
     */
    focusOrder?: string[];
    /**
     * What the screen reader said the page was called, and what its first heading was, before and after
     * activating a navigation control. Absent unless `probeNavigation` was asked for — and absence must
     * make no claim, because a page nobody probed and a page that navigated silently are different facts.
     */
    routeChange?: {
      control?: string | null;
      titleBefore?: string | null;
      titleAfter?: string | null;
      headingBefore?: string | null;
      headingAfter?: string | null;
      navigated?: boolean;
      /** What one Tab landed on immediately after the activation, before anything rewound the caret. */
      nextFocusAfter?: string | null;
      error?: string;
    };
  };
  /**
   * What the PAGE exposes, from the accessibility tree, as an oracle only.
   *
   * Two rules below assert something is ABSENT, and absence is the one claim a sweep cannot make on its
   * own: quick navigation returns nothing both when a page has no headings and when this pipeline has
   * accidentally left NVDA in focus mode typing its own keys into the page — which it did, on 353
   * captures. So a rule about absence must corroborate with the tree, or it is guessing.
   */
  census?: { heading?: number; link?: number; graphic?: number; graphicUnnamed?: number };
  /**
   * Media elements the PAGE declares, from the DOM rather than the accessibility tree — `autoplay` and
   * `muted` are attributes, not accessibility properties, so no screen reader can report them.
   *
   * Absent means NOT CHECKED and the rule makes no claim, which matters because captures taken before this
   * probe existed have no `media` field. Treating absence as "no autoplaying audio" would turn every one
   * of them into a silent pass for 1.4.2.
   */
  media?: { tag: string; autoplay: boolean; muted: boolean; controls: boolean; loop: boolean }[];
}

const EMPTY_NAME = "￼"; // ￼ — screen reader announced an element with no text/name

// Role and state tokens that are NOT part of an accessible name. Longest first
// so multi-word roles ("edit text") are stripped before their substrings ("edit").
const ROLE_TOKENS = [
  "navigation landmark", "main landmark", "banner landmark", "radio button",
  "edit text", "combo box", "list box", "menu button", "menu item",
  "graphic", "image", "button", "checkbox", "heading", "region", "banner",
  "navigation", "radio", "edit", "link", "list",
].sort((a, b) => b.length - a.length);

const STATE_RE =
  /\b(not checked|checked|not pressed|pressed|collapsed|expanded|not selected|selected|read only|required|invalid entry|out of list|out of region|clickable|multi ?line|level \d+)\b/gi;

// A spoken or written file name used as alt text: "IMG 4821", "photo dot jpg", "logo.png".
const FILENAME_RE = /\b(img[\s_]?\d+|\S+\s+dot\s+(jpe?g|png|gif|svg|webp|bmp)|\S+\.(jpe?g|png|gif|svg|webp|bmp))\b/i;

// NVDA spells out a missing alt: it announces "Unlabelled graphic".
const UNLABELLED_RE = /\bunlabell?ed\b/i;

/**
 * Edge's own prompt for an image it has no description for.
 *
 * Measured, not assumed: the same unchanged page announced
 *
 *   "unlabeled graphic, to get missing image descriptions, open the context menu."   2 of 3 captures
 *   "graphic, to get missing image descriptions, open the context menu."             1 of 3 captures
 *
 * so `UNLABELLED_RE` alone missed 1.1.1 on a third of captures of an image with NO alt text — a false
 * negative in a criterion the rule layer owns authoritatively. Note which part moved: the word
 * "unlabeled" is the UNSTABLE token and this hint is the STABLE one, and the hint is emitted precisely
 * BECAUSE there is no text alternative. Keying on the stable signal is therefore both more reliable
 * and more directly about the failure.
 *
 * This is additive: a capture that still says "unlabeled" matches the first branch exactly as before,
 * so no existing finding changes.
 */
const NO_DESCRIPTION_HINT_RE = /missing image descriptions?\b/i;

/** Reduce an announcement to its accessible NAME by removing role/state tokens,
 * the empty-name marker, and punctuation. An empty result means no name. */
function accessibleName(announcement: string): string {
  let s = announcement.split(EMPTY_NAME).join(" ").replace(STATE_RE, " ");
  for (const role of ROLE_TOKENS) s = s.replace(new RegExp(`\\b${role}\\b`, "gi"), " ");
  return s.replace(/[\s,]+/g, " ").trim();
}

/** True when an element is announced with a role but NO accessible name: it
 * carries the empty-name marker (￼) and nothing remains after stripping role and
 * state tokens. Requiring the marker avoids false positives from line-wrapping,
 * where a labelled field's role and name land on separate transcript lines. */
function hasEmptyName(announcement: string): boolean {
  return announcement.includes(EMPTY_NAME) && accessibleName(announcement) === "";
}

const isImage = (line: string): boolean => /\b(graphic|image)\b/i.test(line);

/**
 * A control that takes a VALUE, as opposed to one that performs an action.
 *
 * The distinction carries a criterion. An unnamed button fails 4.1.2 and nothing else — there is no label
 * to be missing, only a name. An unnamed INPUT additionally fails 3.3.2 Labels or Instructions, because
 * the user is being asked to enter something and has not been told what.
 *
 * Measured 2026-08-23: conflating the two put four conformant ICON pages into 3.3.2, because a bare
 * `button` announcement satisfied a check written for form fields.
 */
const isInput = (entry: string): boolean =>
  /\b(edit(?: text)?|radio|checkbox|combo box|list box|spin button|slider)\b/i.test(entry);

/**
 * Report a finding. The fourth argument is its ACT requirement mapping, and it DEFAULTS to `secondary`.
 *
 * Defaulting to the weaker claim is the point: asserting that a criterion is not satisfied has to be an
 * explicit, deliberate act at the call site, so a rule added later cannot accidentally start making
 * accusations. `"conformance"` is spelled out where it is meant, and reads as itself.
 */
type AddFinding =
  (wcag: string, issue: string, evidence: string, mapping?: RequirementMapping) => void;

// FOUR grammar fragments lived here -- CONTROL_ROLE_TOKENS, MAX_CONTEXT_PREFIXES, LEADING_LANDMARKS and
// LEADING_CONTAINERS -- each a partial model of what NVDA says, maintained by hand beside three more in
// other files and other languages. They are gone, not moved: `announcement.ts` holds one grammar,
// validated against 6,555 cross-channel comparisons of captures on disk. Deleting a copy is this
// repo's first-preference remedy for a fact stated twice, and this was the same fact stated seven times.


// The item count sits on EITHER side of the comma depending on the container: NVDA says
// "list, with 6 items, ..." but "table with 3 rows, ...". The first version of this handled only the second
// form, so "list," was consumed and "with 6 items," was left behind — which happened to silence the false
// positive while ALSO silencing a genuinely unnamed button in a list, because the leftover no longer began
// with a role. A guard that stops firing for the wrong reason looks fixed and is not.

// `beginsWithRole` lived here. Its job -- decide whether a leading token is the control's own role or
// the context NVDA prefixed -- is now `parseAnnouncement`'s, which knows that a container may be NAMED
// ("Radios example, frame") and that the order depends on the channel. Both facts it lacked, and both
// cost false 4.1.2 accusations on conformant pages.

/**
 * NO state-change rule here — but NOT for the reason this comment gave until 2026-08-21, which was wrong
 * and expensive.
 *
 * A disclosure that opens without announcing `expanded` is a real 4.1.2 failure, and it is trivially
 * detectable: the corpus gives `"Travel advice, button, collapsed"` -> `"..., focused, collapsed"` for the
 * failing variant and `..., focused, expanded` for the conformant one. A rule on that reached 69/69 EXACT
 * with no false positives across 1001 conformant corpus records.
 *
 * ## The retracted claim: "the evidence does not contain the fact the rule needs"
 *
 * This comment used to argue that the capture could not distinguish a control that was ACTIVATED from one
 * merely FOCUSED, because the announcement says `focused` either way — and concluded the rule was unsound
 * until the probe recorded post-activation state.
 *
 * **That is not what the probe does, and never was.** `probeDisclosure` calls `nvda.act()` — Enter on the
 * control — and only THEN calls `reportFocusedControlWithRetry`. So `after` is already the post-activation
 * state. The word `focused` appears because `reportCurrentFocus` reports the focused control; it is not
 * evidence that focus was all that happened. The state token sits beside it.
 *
 * Proved by capture, not by reading: when `menus-good.html` was given a working toggle, the recapture
 * recorded `"Support, button, focused, expanded"`. If the probe only focused, `aria-expanded` would still
 * be false and it would have said `collapsed`.
 *
 * The real cause of that "conformant page reported as failing" was the FIXTURE. It carried
 * `aria-expanded="false"` with no script and a submenu that was never hidden, so `collapsed` was a false
 * statement and activation genuinely changed nothing. The page was mis-authored and the finding was correct.
 *
 * This mattered beyond tidiness: a stale comment describing a capture gap that did not exist talked a
 * later reader into planning a `CAPTURE_PROTOCOL_VERSION` bump and a full 2,122-capture recapture to fix it.
 * When a comment names a limitation, check the code still has it.
 *
 * ## Why there is still no rule here
 *
 * The reason is now ownership, not evidence. `4.1.2:state-change-silent` is model-owned
 * (`rule-ownership.json`) and scores **59 true positives, 0 false positives, 0 false negatives** on
 * development. A deterministic rule would duplicate a decision that already holds, and this repo's whole
 * ownership declaration exists so exactly one layer decides each subtype.
 *
 * The one argument that survives is narrow and worth testing before acting on: rules still run when the
 * scorer ABSTAINS, and it abstains on 5 of 16 eval failure cases. A rule would reach those pages. Note the
 * "50.7% to 74.5%" figure this comment used to quote predates the current model and must not be reused as
 * the expected gain — measure it against today's scorer or not at all.
 *
 * ## What IS still true: the ambiguity, in the other direction
 *
 * A control that legitimately does not change state when activated — a menu that opens on hover, a disabled
 * toggle, a panel already open — produces evidence indistinguishable from a failure, and the model will
 * call it one. That is a real limit on both layers. It is not a capture gap: the capture records exactly
 * what happened. It is that "nothing changed" has two causes and the page cannot tell you which.
 */

/**
 * Roles a MISSING NAME is a 4.1.2 finding for.
 *
 * Narrower than the parser's role vocabulary, deliberately: a heading or a graphic with no name is 1.3.1 or
 * 1.1.1, and reporting it here would claim a criterion this rule does not decide. Derived from the
 * `isControl` predicate that preceded it so the set cannot quietly widen.
 */
const REPORTABLE_CONTROL_ROLES: ReadonlySet<string> = new Set([
  "button", "edit", "edit text", "radio", "radio button", "checkbox", "combo box", "list box",
  "menu item", "link", "slider", "spin button",
]);

/**
 * `channel`, not `requireMarker`, and the difference is the whole fix.
 *
 * The old signature took a boolean that stood in for two unrelated things at once: which announcement ORDER
 * to expect, and whether an empty name needs the U+FFFC marker to be believed. The first is a property of
 * the channel and was never modelled — so `beginsWithRole` stripped a role-first container and missed a
 * NAME-first one, and every GOV.UK Design System example (each inside a named iframe) reported a properly
 * named radio as unnamed. Two false 4.1.2 accusations against a design system its publisher declares
 * conformant, which is the worst error this tool can make.
 *
 * The marker requirement survives, because it is a real and separate policy: in a read-through an empty
 * name can be a line-wrap artefact, while a sweep entry is one object NVDA was asked to describe.
 */
/**
 * States that a control's ACTIVATION is supposed to change.
 *
 * Only the expandable pair. `checked`/`pressed`/`selected` change on activation too, but Enter on a
 * checkbox is not always its activation and "it did not change" then has a second cause. Narrow on purpose:
 * this rule ASSERTS non-conformance, so every case it covers has to have exactly one explanation.
 */
const EXPANDABLE_STATES: ReadonlySet<string> = new Set(["collapsed", "expanded"]);

/**
 * Roles for which pressing Enter IS the activation.
 *
 * `probeDisclosure` calls `nvda.act()` — Enter — on whatever control it is aimed at. For a search combo box
 * or a native `<select>`, Enter is simply not the key that opens the list, so one that stays `collapsed`
 * afterwards is behaving CORRECTLY and the observation is not a state-change test at all.
 *
 * The evidence is identical to a broken disclosure's, character for character apart from the role:
 *
 *     bad  disclosure  "Travel advice, button, collapsed"      -> "…, button, focused, collapsed"
 *     ok   combo box   "Passenger type, combo box, collapsed"  -> "…, combo box, focused, collapsed"
 *
 * `screenreader_features.py` learned this as `TOGGLE_ROLE` at a measured cost of 3 false positives on
 * conformant pages, and its comment says so. This rule then reproduced the identical bug one layer over,
 * at a cost of 12 wrong ASSERTIONS on GOV.UK pages — every one of them the site's search box. The corpus
 * could not catch it: it holds 69 conformant and 69 failing disclosures against six combo-box records, and
 * no corpus page has a search autocomplete at all.
 *
 * A POSITIVE list, deliberately and for the same reason the Python one is: enumerating the EXCLUDED roles
 * would make an unseen role fire, and the safe direction of failure for a rule that ASSERTS is to miss
 * rather than to accuse.
 */
const ENTER_ACTIVATES: ReadonlySet<string> = new Set([
  "button", "checkbox", "radio button", "menu item", "tab",
]);

/**
 * A control that announces an expandable state, is activated, and announces the SAME state afterwards.
 *
 * ## Why this is a rule and not the model's, reversing a decision recorded above
 *
 * The comment above says a rule here "would duplicate a decision that already holds", because
 * `4.1.2:state-change-silent` is model-owned and scores 59/0/0 on development. That reasoning weighed only
 * ACCURACY, and the two layers differ in something else entirely: what they are PERMITTED TO CLAIM.
 *
 * A model finding carries no `mapping`, which `RequirementMapping` defines as `secondary` — so
 * `criterionOutcomes` reports it `cantTell`, "needs human confirmation". A rule may be CONFORMANCE-mapped
 * and assert. Measured on the product path, the tool asserted nothing at all from the model on 18
 * conformant real pages: 0 asserted, 4 referred.
 *
 * And `compare-layers.mjs` names this exact criterion as the differentiator against a static scanner —
 * "axe can see that `aria-expanded` EXISTS; it cannot see that it never CHANGES". So the one finding this
 * project makes that nothing else can was being reported as a maybe, while a deterministic rule for it had
 * already been written and measured at 69/69 EXACT with no false positives across 1,001 conformant records.
 *
 * The ownership rule — exactly one layer decides each subtype — is sound and stays. What it lacked was the
 * observation that "which layer is more accurate" and "which layer may state a conclusion" are different
 * questions, and that a subtype whose evidence is DECISIVE belongs with the layer that can act on it.
 *
 * ## Why the evidence is decisive
 *
 * `probeDisclosure` calls `nvda.act()` and only then reads the state, so `after` is post-activation. A
 * control that said `collapsed`, was activated, and still says `collapsed` has contradicted itself. There
 * is no second reading of that: either the state did not change, or it changed and was not announced, and
 * both are 4.1.2 failures for the same user.
 */
function addSilentStateChanges(
  changes: readonly { control?: string; after?: string | null }[], add: AddFinding,
): void {
  for (const change of changes) {
    // The ROLE gate comes first: a combo box that stays collapsed after Enter is correct behaviour, and
    // asserting from it is this tool's worst error.
    if (!enterActivates(change.control)) continue;
    const before = statesOf(change.control);
    const after = statesOf(change.after);
    // Both sides must actually carry an expandable state. Absent on either side means the control is not
    // a disclosure, or the probe never read it — neither is evidence that a state failed to change, and
    // treating the absence as the finding is the mistake this repo has paid for most often.
    if (!before.length || !after.length) continue;
    if (before[0] !== after[0]) continue;
    add("4.1.2 Name, Role, Value",
      "Control announced the same state after activation, so its state change is not exposed",
      `${change.control} -> ${change.after}`, "conformance");
  }
}

/** Is this a control whose activation is Enter? Read through the shared grammar, never a role regex. */
function enterActivates(announcement: string | null | undefined): boolean {
  if (typeof announcement !== "string" || !announcement) return false;
  return parseAnnouncement(announcement, "sweep").objects
    .some((object) => ENTER_ACTIVATES.has(object.role));
}

/** The expandable states a control announced, via the shared grammar rather than a fourth state vocabulary. */
function statesOf(announcement: string | null | undefined): string[] {
  if (typeof announcement !== "string" || !announcement) return [];
  return parseAnnouncement(announcement, "sweep").objects
    .flatMap((object) => object.states)
    .filter((state) => EXPANDABLE_STATES.has(state));
}

function addUnnamedControls(entries: string[], channel: Channel, add: AddFinding): void {
  for (const entry of entries) {
    const parsed = parseAnnouncement(entry, channel);
    // TRAILING CONTENT MEANS THE EVIDENCE IS AMBIGUOUS, so the finding is REPORTED and not ASSERTED.
    //
    // A select's value trails its role, and its name leads it. The corpus shows both shapes:
    //
    //     unnamed  "combo box, collapsed, English"
    //     named    "Tour language, combo box, collapsed, English"
    //
    // and caselaw.nationalarchives.gov.uk announced `"combo box, collapsed, Sort by: Newest"` — the UNNAMED
    // shape — for a select whose markup is sound. Checked, not inferred: `<label for="order_by">Order
    // results by</label>`, one `id="order_by"` on the page, no duplicate ids, label not hidden. NVDA simply
    // did not repeat the name in that sweep entry.
    //
    // So the two are INDISTINGUISHABLE here, and the honest answer is neither silence nor an accusation.
    // Suppressing it outright lost three real corpus positives (`field-followup-select*`), which `rules:gate`
    // caught; asserting it accused six government publishers of a failure their markup disproves.
    // `secondary` mapping makes `criterionOutcomes` report `cantTell` — the finding is kept, quoted, and
    // handed to a human. ADR 0021 in the other direction: claim strength must match evidence strength.
    const ambiguous = parsed.trailing.length > 0;
    for (const object of parsed.objects) {
      reportIfUnnamed({ object, entry, channel, ambiguous }, add);
    }
  }
}

/**
 * One control, one decision. Extracted because the loop over objects added a nesting level and `max-depth`
 * refused it — which is that rule doing its job: the decision below is a separate thing from walking the
 * announcements, and reads better named.
 */
/**
 * One control, one decision.
 *
 * Takes an OBJECT rather than five positionals, and specifically rather than a trailing boolean: this
 * repo's conventions forbid a flag argument, `max-params` caps at four, and `report(o, e, c, add, true)`
 * at a call site tells a reader nothing about what the `true` means.
 */
interface UnnamedCheck {
  object: { name: string; role: string };
  entry: string;
  channel: Channel;
  /** The announcement carried text the grammar could not place, so an absent name is not decisive. */
  ambiguous: boolean;
}

function reportIfUnnamed({ object, entry, channel, ambiguous }: UnnamedCheck, add: AddFinding): void {
  if (!REPORTABLE_CONTROL_ROLES.has(object.role)) return;
  // The marker requirement is a POLICY about the channel, not about the grammar: in a read-through an empty
  // name can be a line-wrap artefact, while a sweep entry is one object NVDA was asked to describe.
  const unnamed = channel === "transcript"
    ? object.name === "" && entry.includes(EMPTY_NAME)
    : object.name === "";
  if (!unnamed) return;

  // CONFORMANCE-mapped: 4.1.2 requires a programmatically determinable NAME for every user-interface
  // component, and a control the screen reader announces as a bare role has none. The announcement is not a
  // proxy for the failure, it IS the failure — a user meets a control they cannot identify.
  add("4.1.2 Name, Role, Value",
    ambiguous
      ? "Control announced with no accessible name, but its announcement also carries unplaced text — the "
        + "name may exist and not have been repeated. Needs a human to confirm."
      : "Control announced with a role but no accessible name",
    entry, ambiguous ? "secondary" : "conformance");

  // AND 3.3.2, for an input specifically. An input the screen reader announces as a bare role has no label
  // at all — W3C's own description of the failure is a screen reader announcing "edit text" with no
  // indication of the field's purpose, which fails 1.3.1, 3.3.2 and 4.1.2 together.
  //
  // The limit, stated because it bounds the claim: a control CAN pass 4.1.2 with an `aria-label` and still
  // fail 3.3.2 when no label is visible to sighted users. A screen-reader transcript cannot see that case —
  // the name is announced either way — so this rule claims 3.3.2 only for "no name at all", which is the
  // mode it can actually witness. `criterion-coverage.ts` records 3.3.2 as PARTIAL for it.
  //
  // Why this matters beyond correctness: `3.3.2:unnamed-form-field` was declared rule-decided while the
  // rules reported ONLY 4.1.2, so nothing emitted a 3.3.2 finding and the trained head had to stay —
  // load-bearing in production and, briefly, exempt from the release gate. The head then produced eight
  // false accusations on conformant form pages. Emitting the criterion the rule already decides is what
  // lets the head go.
  if (isInput(entry)) {
    add("3.3.2 Labels or Instructions",
      ambiguous ? "Input announced with no label, but unplaced text in the announcement leaves it open"
        : "Input announced with a role but no label",
      entry, ambiguous ? "secondary" : "conformance");
  }
}

/** Apply the deterministic absence rules to a capture. Findings carry
 * confidence 1: an empty name is a fact, not a judgment. */

/**
 * Link names that convey nothing when heard on their own.
 *
 * Deliberately TINY, and the exclusions matter more than the inclusions. "read more" and "learn more" are
 * left out: 2.4.4 is Link Purpose **In Context**, so a link may take its meaning from the paragraph or list
 * item around it, and those two almost always sit next to the text that supplies it. Firing on them would
 * report a large share of the web. What remains is the set that context cannot rescue, because the phrase
 * is about the mechanics of clicking rather than the destination.
 *
 * Worth knowing: axe does not report these at all — its `link-name` rule asks whether a link HAS a name,
 * and "click here" has one. This is a judgement a rule scanner structurally cannot make and a screen
 * reader hears immediately.
 */
const VAGUE_LINK_NAMES = new Set(["click here", "click", "here", "this link", "link", "click this"]);

const isLink = (line: string): boolean => /\blink\b/i.test(line);

/**
 * 1.4.2 — audio that starts on its own with no way to stop it.
 *
 * One of the four NON-INTERFERENCE criteria (WCAG §5.2.5): it applies to ALL content on the page, whether
 * or not that content is relied upon to satisfy anything else. And it is worse for this tool's users than
 * the criterion's wording suggests — audio that plays automatically competes directly with the synthetic
 * speech a screen-reader user is listening to, so it does not merely annoy, it masks the interface.
 *
 * Read from the DOM because `autoplay` and `muted` are attributes with no accessibility-tree equivalent.
 * That makes this the one rule here whose evidence is not something a screen reader said, which is stated
 * in its ACT description rather than hidden.
 */
function addAutoplayingAudio(input: RuleInput, add: AddFinding): void {
  if (!input.media) return; // absent means not checked; only a probe's silence is a finding
  for (const element of input.media) {
    // Muted media makes no sound, so there is nothing to control. `controls` gives the native pause and
    // stop mechanism the criterion asks for.
    if (!element.autoplay || element.muted || element.controls) continue;
    add("1.4.2 Audio Control",
      "Audio starts automatically with no visible control to pause or stop it, so it competes with the "
        + "screen reader's own speech",
      `<${element.tag} autoplay${element.loop ? " loop" : ""}> with no controls attribute`);
  }
}

/**
 * How many times the LAST focus stop repeats consecutively at the end of the tab order.
 *
 * Separated because "focus stopped moving" is the whole signal and deserves a name. The capture probe
 * stops tabbing after two identical stops, so a trapped page's `focusOrder` ends in a short run rather
 * than filling to the cap.
 */
function trailingRepeats(stops: string[]): number {
  if (stops.length < 2) return 0;
  const last = stops[stops.length - 1];
  let repeats = 0;
  for (let i = stops.length - 1; i >= 0 && stops[i] === last; i -= 1) repeats += 1;
  return repeats;
}

/**
 * 2.1.2 — Tab stopped moving, so focus is trapped.
 *
 * A non-interference criterion (WCAG §5.2.5): it applies to ALL content whether or not it is relied upon,
 * and unlike most failures it is TOTAL. A keyboard user who cannot leave a control cannot use the rest of
 * the page at all, so a trap outranks everything else on the report.
 *
 * The capture probe deliberately does not decide this — its own comment says "the same control twice
 * running means Tab stopped moving: either the end of the document or a focus trap. Which one it is, is
 * the judge's call." This is that call, and it is made conservatively, on TWO signals:
 *
 * 1. Focus repeated the same control at the end of the tab order, and
 * 2. it visited fewer distinct controls than the form-field sweep found on the page.
 *
 * The second is what separates a trap from the end of a short document. Requiring only the first would
 * fire on any page whose last control is genuinely last — and, worse, on a stale announcement, which this
 * pipeline produces often enough to have a whole section about.
 */
function addKeyboardTrap(input: RuleInput, add: AddFinding): void {
  const stops = input.interaction?.focusOrder;
  if (!stops || stops.length < 3) return; // absent means the probe did not run; too short proves nothing
  if (trailingRepeats(stops) < 2) return;
  const reached = new Set(stops).size;
  const onPage = (input.structure?.formFields ?? []).length;
  if (onPage === 0 || reached >= onPage) return; // no corroboration, or focus did reach everything
  add("2.1.2 No Keyboard Trap",
    "Tab stopped moving: focus repeated the same control and never reached the rest of the page, so a "
      + "keyboard user cannot get past it",
    `focus stopped at "${stops[stops.length - 1]}" after reaching ${reached} of ${onPage} controls`);
}

/**
 * 2.4.2 — the route changed and the title did not, so the page still announces the previous one.
 *
 * The half of Page Titled worth detecting. Absence of a title is vanishingly rare in the wild (zero across
 * 4,895 captures here, and WebAIM's million-page survey does not list it among the failures covering 96% of
 * errors), and "does the title DESCRIBE its topic" is human judgement — W3C flags 2.4.2 on a page titled
 * "Welcome to CityLights! [Inaccessible Survey Page]".
 *
 * This is the single-page-app case, and a static analyser cannot reach it at all: the markup is valid at
 * every instant and the failure is the TRANSITION. A screen reader can, because the title is something the
 * user asks for and hears.
 *
 * TWO signals, like `addKeyboardTrap`, and the second one was chosen the hard way. "Nothing was announced"
 * seems the natural corroboration and is wrong: measured, the failing page announced `"visited"` — NVDA
 * reporting the link's own state, which is not silence and names nothing about where the user now is. So
 * the rule would have been silent on the page it was written for. What actually separates the failure is
 * that the VIEW MOVED while the title stood still.
 *
 * That also handles the probe's real limitation. It activates the first link on the page, which on a real
 * site may be a skip link or a plain fragment jump — and then the heading does not change either, so this
 * correctly makes no claim.
 */
function addStaleRouteTitle(input: RuleInput, add: AddFinding): void {
  const route = input.interaction?.routeChange;
  if (!route || route.error || !route.navigated) return; // not probed, or the probe could not answer
  const { titleBefore, titleAfter, headingBefore, headingAfter } = route;
  if (!titleBefore || !titleAfter) return;
  if (headingBefore === headingAfter) return; // nothing navigated; there is no transition to judge
  if (titleBefore !== titleAfter) return;
  add("2.4.2 Page Titled",
    "Navigating changed the page but not its title, so the screen reader still announces the previous "
      + "page — a user who checks where they are is told the wrong thing",
    `after activating "${route.control}" the page moved to ${JSON.stringify(headingAfter)} `
      + `while the title stayed ${JSON.stringify(titleAfter)}`);
}

/**
 * Names that identify exactly ONE control in a sequence.
 *
 * Two controls can announce identically — MDN has a sidebar toggle and a theme toggle, both "Toggle" — and
 * a comparison between two sequences cannot then tell "the same control moved" from "a different control
 * with the same name". Everything built on matching names has to drop those, or it invents findings on any
 * page with a repeated control name, which is most real pages.
 *
 * Found by running the tool on MDN: 2.4.3 reported a reordering whose entire evidence was
 * `reads ["Toggle","Search the site","Toggle",...]` against `tabs ["Search the site","Toggle",...]`. Once
 * ambiguous names are dropped the two sequences are IDENTICAL. The report's own §2 already names the
 * mechanism — "the two differ where identical announcements collapse" — as a limit of coverage; it is also
 * a source of false positives.
 */
function unambiguous(names: string[]): Set<string> {
  return new Set(names.filter((name) => names.indexOf(name) === names.lastIndexOf(name)));
}

/**
 * Did the tab order return to where it started?
 *
 * Tab cycles: past the last focusable it wraps to the first. So a recording that revisits its own starting
 * control has seen the COMPLETE set — and only then does "announced but never focused" mean unreachable
 * rather than "the probe stopped". The focus probe truncates at a fixed number of stops on every page of
 * any size, so without this the cap is indistinguishable from a keyboard trap of the whole page.
 */
function cycleClosed(tabOrder: string[]): boolean {
  return tabOrder.length > 1 && tabOrder.lastIndexOf(tabOrder[0]) > 0;
}

/**
 * How much of the page the tab cycle actually accounts for, against a count taken independently.
 *
 * `cycleClosed` asks the tab order about itself, and a repeated navigation block answers yes. Measured
 * 2026-08-24, after the focus probe was allowed to run past twelve stops: `gov.scot/publications` recorded
 * a closed cycle in 10 stops on a page whose sweeps found 78 focusable elements, and `networkrail` in 7 of
 * 29. Both then reported keyboard-unreachable controls, on a tab order that was incomplete while claiming
 * to be complete — the exact fault `addKeyboardUnreachableControl`'s guard exists to prevent, arriving
 * through the guard instead of around it.
 *
 * The sweeps are a SEPARATE instrument: quick-nav walks the document, Tab walks the focus ring, and
 * neither can produce the other's error. That is what makes this check worth more than a longer
 * confirmation inside the probe, which would still be the tab order vouching for itself.
 *
 * Deliberately generous. The two counts measure different things — the focus ring holds controls no
 * quick-nav type sweeps, and a page can have far more links than tab stops — so this rejects only the
 * order-of-magnitude disagreement that a false wrap produces, and never adjudicates a near miss.
 */
const CYCLE_COVERAGE_FLOOR = 0.5;

function cycleCoversThePage(tabOrder: string[], input: RuleInput): boolean {
  const structure = input.structure ?? {};
  const sweptFocusable = ["links", "formFields", "buttons"]
    .reduce((total, key) => total + ((structure as Record<string, unknown>)[key] as unknown[] ?? []).length, 0);
  if (sweptFocusable === 0) return true;
  return tabOrder.length >= sweptFocusable * CYCLE_COVERAGE_FLOOR;
}

/**
 * 2.1.1 — a control the page announces as operable that the keyboard never reaches.
 *
 * The failure a screen-reader user meets as "I can hear it and I cannot press it": a `div role="button"`
 * with a click handler and no `tabindex`. Perfectly perceivable, entirely unusable.
 *
 * NOT the roleless `<div onclick>` of the custom-control family — that one is invisible to the screen
 * reader, which is its 4.1.2 finding, and a capture cannot tell it from a page with no button at all.
 *
 * POSITIONAL, because the focus probe truncates: measured, every corpus page stops at 12 tab stops, so
 * "absent from `focusOrder`" usually just means the probe stopped. A control counts as unreachable only
 * when something LATER in reading order was reached — the probe demonstrably got past it and never landed
 * on it. That makes the claim sound at the tail, where the evidence runs out.
 */
function addKeyboardUnreachableControl(input: RuleInput, add: AddFinding): void {
  const reading = comparableNames(input.structure?.formFields);
  const tabbedNames = comparableNames(input.interaction?.focusOrder);
  const tabbed = new Set(tabbedNames);
  if (reading.length < 2 || tabbed.size === 0) return;
  // THE WHOLE TAB CYCLE, OR NO CLAIM. Tab wraps: past the last control it returns to the first, so a
  // recording that revisits its own starting control has observed every focusable there is — and a control
  // the page announces but that cycle never contains is genuinely unreachable, whatever the stop cap.
  //
  // This replaced a READING-ORDER proxy ("something later in reading order was reached, so the probe got
  // past this point"), which is unsound for the exact reason 2.4.3 exists: the two orders can differ.
  // Measured on developer.mozilla.org — 18 controls read, 12 stops, truncated, cycle never closed — the
  // proxy reported the theme switch, language picker and sidebar toggle as keyboard-unreachable. They sit
  // early in READING order and late in TAB order, so the probe simply stopped before them. A well-built
  // page, accused on the first run.
  if (!cycleClosed(tabbedNames)) return;
  // ...and the cycle has to account for the page. See `cycleCoversThePage`: a wrap the tab order detects
  // in itself can be a repeated nav block, and then every control past it reads as unreachable.
  if (!cycleCoversThePage(tabbedNames, input)) return;
  // A control whose announced name is shared with another cannot be said to have been missed: its name
  // appearing in the tab order may be the OTHER control, and its absence may mean the other one was
  // reached. Same reasoning as 2.4.3 — see `unambiguous`.
  const trackable = unambiguous(reading);
  const missed = reading.filter((name) => trackable.has(name) && !tabbed.has(name));
  if (!missed.length) return;
  add("2.1.1 Keyboard",
    "The page announces a control the keyboard cannot reach: Tab passed the point where it sits and never "
      + "landed on it, so a keyboard user can hear it and not operate it",
    `never focused: ${JSON.stringify(missed)} — while Tab completed a full cycle of the page`);
}

/**
 * 2.4.1 — the skip link is there and it does nothing.
 *
 * NOT "the page has no skip link", which would be wrong: W3C's Understanding page is explicit that headings
 * alone satisfy this criterion (H69) and landmarks alone satisfy it (ARIA11), so absence is not a failure —
 * and every page in this corpus has an h1, so such a rule would fire on conformant pages. Whether any
 * mechanism EXISTS is a DOM fact the static layer answers better than we can.
 *
 * What no markup inspection can answer is whether the mechanism works. A checker sees a link, a plausible
 * fragment href and a page full of content, and passes it. Measured here on a pair differing only in the
 * target id:
 *
 *   works   activating it →  "Search the archive, edit"   (past the block, in the content)
 *   inert   activating it →  "News and updates, link"     (the first nav link — where Tab went anyway)
 *
 * "Did nothing" is stated against the SECOND item of the ordinary tab order, so the claim is that the next
 * Tab landed exactly where it would have landed without ever touching the link. That is stronger than
 * "focus is still near the top" and needs no knowledge of where the block ends.
 */
function addInertSkipLink(input: RuleInput, add: AddFinding): void {
  const route = input.interaction?.routeChange;
  if (!route || route.error || !route.navigated) return;
  // It has to BE a skip link. The probe activates the first link on the page, which elsewhere is a logo or
  // a cookie banner — finding focus unmoved after activating one of those says nothing about bypassing.
  if (!/\b(skip|jump)\b/i.test(String(route.control ?? ""))) return;
  const landed = comparableNames([route.nextFocusAfter ?? ""])[0];
  if (!landed) return; // not measured, or focus went somewhere silent — no claim either way
  const ordinary = comparableNames(input.interaction?.focusOrder)[1];
  if (!ordinary || landed !== ordinary) return;
  add("2.4.1 Bypass Blocks",
    "The skip link does not skip anything: activating it left focus exactly where the next Tab would have "
      + "gone anyway, so the repeated block still has to be tabbed through",
    `activating ${JSON.stringify(String(route.control).slice(0, 40))} left focus on ${JSON.stringify(landed)}`);
}

/**
 * The controls a screen-reader user meets, in the order they meet them.
 *
 * From the TRANSCRIPT, which is an arrow-key read-through line by line and therefore document order by
 * construction — not from `structure.formFields`, which cannot be reading order at all.
 *
 * That distinction was established the hard way. `collectByType` sweeps BACKWARDS from the caret and then
 * forwards, deduplicating, so its output is a COUNT of a type and never an ordering. Recording where the
 * two walks met (`prevCount`) made a reconstruction possible and it is STILL wrong, because the caret can
 * fall anywhere: measured on `design-system.service.gov.uk/components/date-input`, the caret landed
 * between Month and Year of one date group, so the reconstruction placed Day and Month early and Year
 * seventeen entries later. The transcript has them adjacent at lines 61, 63 and 65, which is what the
 * page actually reads like.
 *
 * The cost is honest and worth stating: in browse mode some fields announce as a bare label with no role
 * on that line ("Day"), so this reaches fewer controls than the sweep does. The rule compares only names
 * present in BOTH sequences, so a control missing here is simply not compared — and comparing fewer
 * controls in a real order beats comparing more in an invented one.
 */
function controlsInReadingOrder(input: RuleInput): string[] {
  const names: string[] = [];
  for (const line of input.transcript ?? []) {
    for (const object of parseAnnouncement(String(line), "transcript").objects) {
      if (!CONTROL_ROLES.includes(object.role)) continue;
      const name = object.name.replace(FOCUS_ONLY_STATES, " ").replace(/[\s,]+/g, " ").trim();
      if (name) names.push(name);
    }
  }
  return names;
}

function addBrokenFocusOrder(input: RuleInput, add: AddFinding): void {
  // READING order from the transcript, ordered by construction. `structure.formFields` is a count sweep
  // and cannot answer this — see `controlsInReadingOrder`.
  const reading = firstVisitEach(controlsInReadingOrder(input));
  const tabbed = firstVisitEach(comparableNames(input.interaction?.focusOrder));
  if (reading.length < 2 || tabbed.length < 2) return; // absent or too short proves nothing
  // Only names that identify one control in BOTH sequences. A repeated name cannot be tracked between
  // them, and comparing it invents a reordering — see `unambiguous`.
  const readingOnce = unambiguous(reading), tabbedOnce = unambiguous(tabbed);
  const shared = new Set([...readingOnce].filter((name) => tabbedOnce.has(name)));
  if (shared.size < 2) return;
  const readingOrder = reading.filter((name) => shared.has(name));
  const tabOrder = tabbed.filter((name) => shared.has(name));
  if (readingOrder.join("|") === tabOrder.join("|")) return;
  add("2.4.3 Focus Order",
    "Tab moves through the controls in a different order from the one the page reads in, so the sequence "
      + "a keyboard user experiences does not match the sequence the content implies",
    `reads as ${JSON.stringify(readingOrder)} but tabs as ${JSON.stringify(tabOrder)}`);
}

/**
 * Announcements reduced to accessible names, so the sweep and the focus probe can be compared.
 *
 * The focus channel adds words the sweep never says — NVDA announces a focused empty field as
 * "Postcode, edit, focused, blank" where the sweep says "Postcode, edit". `accessibleName` does not strip
 * them, so without this the two channels share NO names, the shared set is empty, and the rule silently
 * makes no claim on the very pages it exists for. Measured: it fired on neither variant.
 *
 * Stripped HERE rather than added to `STATE_RE`, which `accessibleName` applies for every rule. Widening a
 * shared helper to fix one comparison would change what 2.4.4 and 4.1.2 consider a name, and "blank" is a
 * plausible fragment of a real label in a way "collapsed" is not.
 */
const FOCUS_ONLY_STATES = /\b(focused|blank|visited|same page|linked|has auto ?complete|autocomplete|clickable|selected|required|invalid entry)\b/gi;

/**
 * A CONTAINER the sweep names before the control, which the focus channel does not.
 *
 * The structural sweep announces the first control inside a container with that container's name attached —
 * `"form, Full name, edit"` — where focusing the same control says `"Full name, edit, focused"`. Compared
 * raw, the two channels never match on that control, and a rule keyed on "reached or not" then reports a
 * conformant page as failing. Measured: the 2.1.1 rule fired on BOTH variants of its own pair, naming
 * `"form Full name"` as never focused on the page where it plainly was.
 *
 * This is the fourth appearance of one lesson, and `beginsWithRole` already carries it: *"a leading LANDMARK
 * is context, not the control's own role … reported three conformant W3C pages as 4.1.2 failures"*. The fix
 * there was to strip CONTAINERS rather than landmarks specifically, and every real nav bar is a list inside
 * a landmark. Same correction, applied where two channels are compared rather than where a role is read.
 *
 * THE FIFTH APPEARANCE IS WHY THE REGEX THAT USED TO LIVE HERE IS GONE. It handled a container announced as
 * one comma group (`"banner landmark,"`) and not one announced as two (`"Main navigation, navigation
 * landmark,"`), and it knew nothing of `frame` or `grouping`. Measured on real pages 2026-08-24: the first
 * entry of a sweep carries the whole container preamble, because NVDA announces context once on entry — so
 * `"banner landmark, Main navigation, navigation landmark, list, with 6 items, About us, button"` reduced to
 * `"main navigation navigation with 6 items about us"` and matched nothing in the tab order. 2.1.1 then
 * reported a keyboard-unreachable control on 23 of 35 CONFORMANT pages, and 2.4.3 on 19.
 *
 * It had been latent for the life of the corpus: `addKeyboardUnreachableControl` refuses to claim anything
 * unless the tab cycle closes, and with a 12-stop probe it never did. Raising the stop cap ran this
 * normaliser against real pages for the first time.
 *
 * `parseAnnouncement` already answers all of it, is channel-aware, and is validated on 6,555 cross-channel
 * comparisons at 0.08% disagreement. Patching the regex a fifth time would have been the wrong repair: the
 * rule this file kept relearning is that a second encoding of one grammar drifts from the first.
 */

/**
 * Exported ONLY so `name-normalisation.test.ts` can pin this equal to the dataset signals' own copy in
 * `case-matrix.mjs`. The two encode one rule in two languages and drifted within an hour of being
 * written; that test is what makes the duplication safe.
 */
export const comparableNamesForTest = (entries: string[] | undefined): string[] => comparableNames(entries);

function comparableNames(entries: string[] | undefined): string[] {
  return (entries ?? [])
    .map((entry) => parseAnnouncement(String(entry), "sweep").objects[0]?.name ?? "")
    .map((name) => name.replace(FOCUS_ONLY_STATES, " ").replace(/[\s,]+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Each control's FIRST visit, in order.
 *
 * The tab order is a CYCLE: past the last control Tab wraps to the first, so a faithful recording ends by
 * repeating something it began with. Measured on the conformant variant — five fields, six links, then
 * "Full name" again — and comparing that raw against the reading order made the correct page differ from
 * itself. Deduplicating only CONSECUTIVE repeats was not enough, because the wrap is separated from the
 * original by everything in between.
 *
 * First visit is also the right question: 2.4.3 is about the order in which controls are REACHED.
 */
function firstVisitEach(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => (seen.has(name) ? false : (seen.add(name), true)));
}

/** 2.4.4 — a link whose announced name says nothing about where it goes. */
function addVagueLinks(entries: string[], add: AddFinding): void {
  for (const line of entries) {
    if (!isLink(line)) continue;
    const name = accessibleName(line).toLowerCase().replace(/[.,;:!?]+$/, "").trim();
    if (!VAGUE_LINK_NAMES.has(name)) continue;
    add("2.4.4 Link Purpose (In Context)",
      "Link text does not say where the link goes; heard on its own it is not distinguishable from any other link",
      line);
  }
}

/**
 * 1.3.1 — a page of content with no headings at all.
 *
 * Heading navigation is how a screen reader user skims, so a page with none forces a line-by-line read of
 * everything to find anything. Requires the tree to CONFIRM zero headings: a sweep alone cannot tell "this
 * page has none" from "we could not ask", and this project spent 2,122 captures not making that distinction.
 * Also requires the page to have real content, since a fragment or an error page legitimately has none.
 */
function addMissingHeadings(input: RuleInput, add: AddFinding): void {
  const exposed = input.census?.heading;
  if (exposed !== 0) return; // undefined means no oracle, so no claim
  if ((input.structure?.headings?.length ?? 0) !== 0) return;
  if (input.transcript.length < MIN_CONTENT_LINES) return;
  add("1.3.1 Info and Relationships",
    "The page has no headings, so there is no way to skim it or tell its sections apart by structure",
    `${input.transcript.length} announcements, no heading among them`);
}

/** Below this a page is a fragment or an error, and having no headings is unremarkable. */
const MIN_CONTENT_LINES = 15;


/**
 * 1.1.1 — images the page exposes with NO accessible name.
 *
 * The announcements cannot always reach these, which is why the tree is consulted. NVDA's quick navigation
 * walks past a wholly nameless graphic: where an image at least has a filename it says "Unlabeled graphic"
 * and the sweep records it (that is how the W3C pages are caught), but an `<img>` with no alt and a `data:`
 * URI has nothing to announce at all. Measured on the eval fixtures — tree 2 / sweep 1, tree 1 / sweep 0,
 * tree 3 / sweep 2 — three real 1.1.1 failures this layer could see and did not.
 *
 * Safe because the census skips IGNORED nodes: Chromium marks a decorative `alt=""` image as ignored, so it
 * never reaches the counter. A non-ignored graphic with no name is an image a user meets and cannot
 * identify — which is the criterion, stated directly.
 *
 * It also skips GENERATED content, and that guard exists because this rule accused a conformant page.
 * Chromium exposes a CSS `list-style-image` bullet as an unnamed role=image node, so two bullets became
 * "2 images have no text alternative" against the W3C BAD "after" pages — which W3C publishes as fully
 * WCAG 2.0 AA conformant. Measured after the fix: 0 unnamed on both of those, all 33 still found on the
 * inaccessible "before" page. The guard belongs in `censusFromAXTree`, which is the only place holding the
 * AX node needed to judge it, but this is where the accusation is made, so it is recorded here too.
 *
 * The tree is the oracle and never the evidence. It answers "is there something here", and what the screen
 * reader said remains what is quoted.
 */
function addUnnamedGraphics(input: RuleInput, add: AddFinding): void {
  const unnamed = input.census?.graphicUnnamed ?? 0;
  if (unnamed === 0) return; // 0 is an answer; undefined means no oracle, and both stop here
  const announced = (input.structure?.graphics ?? []).length;
  add("1.1.1 Non-text Content",
    `${unnamed} image(s) on the page have no text alternative, so a screen reader cannot identify them`,
    `${unnamed} of ${input.census?.graphic ?? unnamed} images expose no accessible name; `
      + `the screen reader reached ${announced}`);
}

const RULE_CRITERIA_SET = new Set<string>(RULE_CRITERIA);

export function ruleFindings(input: RuleInput): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const add: AddFinding = (wcag, issue, evidence, mapping = "secondary"): void => {
    const criterion = wcag.split(" ")[0];
    if (!RULE_CRITERIA_SET.has(criterion)) {
      throw new Error(`rule reported ${criterion}, which is not in RULE_CRITERIA. Add it there — the `
        + "coverage audit asks which criteria have never fired, and it cannot ask about one it "
        + "does not know exists.");
    }
    const key = `${wcag}|${evidence}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ issue, wcag, severity: "serious", evidence, confidence: 1, mapping });
  };

  // 1.1.1 — images with no text alternative: announced "unlabelled", an empty
  // name, or a file name used as the alt text.
  for (const line of input.transcript) {
    if (!isImage(line)) continue;
    if (UNLABELLED_RE.test(line) || NO_DESCRIPTION_HINT_RE.test(line)) {
      // CONFORMANCE-mapped: NVDA said "Unlabeled graphic" in so many words. The screen reader is reporting
      // non-text content with no text alternative, which is the criterion stated directly.
      add("1.1.1 Non-text Content", "Image announced as unlabelled (no text alternative)", line,
        "conformance");
    } else if (hasEmptyName(line)) {
      add("1.1.1 Non-text Content", "Image announced with no text alternative", line);
    } else if (FILENAME_RE.test(accessibleName(line))) {
      add("1.1.1 Non-text Content", "Image alternative text is a file name, not a description", line);
    }
  }

  // 4.1.2 — controls announced with a role but no accessible name. Transcript
  // path requires the ￼ marker; the structural-sweep path does not (see
  // addUnnamedControls).
  addSilentStateChanges(input.interaction?.stateChanges ?? [], add);
  addUnnamedControls(input.transcript, "transcript", add);
  addUnnamedControls([...(input.structure?.formFields ?? []), ...(input.interaction?.controls ?? [])],
    "sweep", add);

  // 2.4.4 and 1.3.1 — both about what a screen reader user CANNOT do: tell two links apart, or skim.
  // Neither is reported by axe, which is the point of having them here.
  addVagueLinks([...input.transcript, ...(input.structure?.links ?? [])], add);
  addMissingHeadings(input, add);
  addUnnamedGraphics(input, add);
  addAutoplayingAudio(input, add);
  addKeyboardTrap(input, add);
  addStaleRouteTitle(input, add);
  addBrokenFocusOrder(input, add);
  addInertSkipLink(input, add);
  addKeyboardUnreachableControl(input, add);

  return findings;
}
