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
import type { Channel, CaptureStructure } from "@a11y-witness/evidence";
import type { PageCensus, DomCensus, ProbeStates, Completeness } from "@a11y-witness/evidence/verify";
import { parseAnnouncement } from "@a11y-witness/evidence";
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
  /**
   * A GENUINE SUBSET OF THE WIRE TYPE, derived rather than restated — known-gaps §15.
   *
   * `Pick` keeps the omission meaningful: no rule reads `landmarks`, `lists` or `tableCells` (the two
   * mentions of landmarks in this file are comments), so declaring them would claim a capability that
   * does not exist. `Partial` because a rule must treat every sweep as possibly absent — that is the
   * whole of the completeness work.
   *
   * Derived so it cannot drift: the sibling declaration in `judge.ts` omitted `graphics` while a rule
   * read it, and object spread hid that at runtime for as long as it existed.
   */
  structure?: Partial<Pick<CaptureStructure, "formFields" | "headings" | "links" | "graphics" | "frames">>;
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
  census?: PageCensus;
  /**
   * PER TYPE: DID THE SWEEP ANNOUNCE EVERYTHING THE PAGE EXPOSES? — capture-integrity-plan C1/C2.
   *
   * `structure.headings` is what NVDA announced during a quick-nav walk, and rules read it as what the
   * page HAS. Measured across 106 real captures, those differ on most pages in one direction or the
   * other, and the sweep's output looks the same either way: a list.
   *
   * `phantom` is the direction that produces a WRONG ASSERTION. A name the sweep announced but the page
   * does not expose can never appear in the tab order, so 2.1.1 reports it as a control the keyboard
   * cannot reach — a criterion this tool STATES is unsatisfied, resting on an element that is not there.
   *
   * `unknown` is a real answer and must never read as `exact`. Every capture taken before the counter
   * existed reports it, so a rule that refused on `unknown` would go silent on the whole corpus; the
   * choice made instead is that unknown-backed assertions are COUNTED rather than blocked. See
   * `assertableSweep`.
   */
  completeness?: Record<string, Completeness>;
  /**
   * ANNOUNCEMENTS HEARD IN TRUNCATED FORM — capture-integrity-plan C5, and 40% of real captures.
   *
   * A truncated announcement is a DIFFERENT STRING, not a shorter one. `"o, button"` for a control named
   * "Open account search" matches nothing, so a name comparison drops it silently and 2.1.1 reads the
   * absence as a control the keyboard never reached. Excluded from comparison by `comparableNames`, and
   * the exclusion is COUNTED — a comparison that skipped 40% of its inputs without saying so is the
   * vanishing-denominator defect at the evidence layer.
   */
  truncated?: string[];
  /**
   * The DOM's own counts, which the tree census cannot supply: a page's TAB STOPS among them.
   *
   * Built by `oracleCounts` and therefore present on every path — it was exported and nowhere else until
   * 2026-08-28, so the first rule to read it would have scored perfectly on the corpus and been mute for
   * every user. Absent on a capture taken before the count existed; a rule must make NO claim then.
   */
  dom?: DomCensus;
  /**
   * THE FINGERPRINT EACH PROBE OBSERVED THE PAGE UNDER — determinism-plan D7.
   *
   * A capture is not an instant: the sweep's disclosure probe activates a control, so the focus walk can
   * run against a page that has since opened a panel. `sameState: false` says the page MOVED between the
   * two channels, directly, where `channelRelation.disjoint` only ever inferred it from zero overlap.
   *
   * Absent, or `sameState: undefined`, means nobody asked — never that the page held still.
   */
  probes?: ProbeStates;
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

/**
 * 4.1.2 — a FRAME with no accessible name.
 *
 * The completion of the protocol-11 frame sweep, and without it that sweep produced evidence nothing
 * decided on. `rules:gate` said so directly: *"4.1.2:unnamed-control is rule-decided on 236 record(s) and
 * caught only 227"*, naming `iframe-unnamed.bad` and its variants — a case labelled for a rules-owned
 * subtype whose rule could not see its defect.
 *
 * IT CANNOT REUSE `addUnnamedControls`, and the reason is structural rather than an oversight. NVDA
 * announces a frame as CONTEXT, so `parseAnnouncement` puts it in `containers` while that function walks
 * `objects`. Verified rather than assumed:
 *
 *     "Booking options, frame, ..."  ->  containers [{name: "Booking options", role: "frame"}]
 *     "frame, ..."                   ->  containers [{name: "", role: "frame"}]
 *
 * This repo fixed the mirror of this three days ago — *"a landmark's name is in `containers`, not
 * `objects` — §11 was my bug"* — and it is the same shape read from the other end.
 *
 * ASSERTED, not referred, because the evidence is unambiguous in a way a combo box's is not. A frame's
 * name has no value to be confused with: NVDA either prefixes one or it does not, and there is no second
 * reading of an empty one. That is why `addUnnamedControls` needs its `ambiguous` escape and this does
 * not.
 *
 * WHY IT MATTERS TO A USER, which is the test for whether a rule earns its place: a frame is announced on
 * entry and then not again. An unnamed one tells a screen-reader user only that they have entered
 * something, with no way to know what is inside before committing to reading it.
 */
function addUnnamedFrames(frames: string[], add: AddFinding): void {
  for (const entry of frames) {
    // "sweep", the same channel the swept-control call uses -- the grammar is told its channel
    // rather than inferring it, because name-first and role-first orders differ by channel and
    // guessing was 884-vs-0 wrong across 300 captures.
    const parsed = parseAnnouncement(entry, "sweep");
    for (const container of parsed.containers) {
      if (container.role !== "frame" || container.name.trim() !== "") continue;
      add("4.1.2 Name, Role, Value",
        "A frame is announced with no name, so a screen-reader user is told they have entered something "
          + "and not what it contains",
        `heard "${entry.slice(0, 80)}"`);
    }
  }
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
/**
 * HOW THE TWO CHANNELS RELATE — computed once, so four rules cannot each decide it differently.
 *
 * The sweep walks the document with quick navigation; the focus probe walks the tab ring. Four functions
 * here asked variations of "how do those two compare?" and none of them said so, which is *Fundamentals of
 * Software Architecture*'s definition of brittle: "a single implementation change can cause unexpected
 * rippling side effects that break many other (ostensibly unrelated) things… the broader the scope, the
 * looser the coupling should be." A comparison shared by four rules is the broadest scope in this file and
 * had the loosest contract: none.
 *
 * MEASURED COST, 2026-08-28. A guard added to 2.1.1 asserted "the ring is smaller than the swept controls",
 * which is 2.1.1's OWN PREMISE, and silenced every genuine finding — the two criteria read that comparison
 * in OPPOSITE directions and nothing in the code said so. A denominator changed for 2.1.2 the same day
 * moved a rule nobody was editing.
 *
 * `disjoint` is the field that matters most and the one no caller had. When Tab reached NOT ONE of the
 * controls the sweep announced, the two channels are describing different STATES of the page — a modal
 * holds Tab inside it while quick-nav walks the document behind — and their COUNTS can still agree.
 * Measured: swept 4, reached 4, overlap 0, and every count-based guard passed while 2.1.1 accused all four.
 */
interface ChannelRelation {
  /** Distinct controls the SWEEP announced. */
  swept: number;
  /** Distinct stops the TAB WALK reached. */
  reached: number;
  /** How many the two channels agree on. Zero means they describe different states, not a smaller page. */
  overlap: number;
  /** A stop recurred, so the walk wrapped — it saw the whole ring rather than being cut short. */
  cycleClosed: boolean;
  /**
   * The announced controls the tab ring never visited, BY NAME.
   *
   * Named rather than counted so a finding can say which controls a keyboard user cannot reach:
   * "four unreached" and "Full name, Email, Phone, Delivery notes unreached" are different
   * claims, and only the second can be checked against the page by a human.
   */
  unreached: string[];
  /** Nothing in common. The counts may still match; that is the trap. */
  disjoint: boolean;
  /**
   * Did the two probes MEASURE the same page? Read from the capture, not inferred.
   *
   * `false` is a statement that the page's shape changed between the sweep and the focus walk;
   * `undefined` means the capture cannot say and no claim follows from it.
   */
  sameState?: boolean;
}

function channelRelation(input: RuleInput): ChannelRelation {
  // THE COUNT IS RAW AND THE OVERLAP IS BY NAME, and conflating those two was a real regression.
  //
  // `comparableNames` ends in `.filter(Boolean)`, so it DROPS every entry whose accessible name is empty —
  // and an empty name IS the 4.1.2 and 3.3.2 finding. Counting the comparable names therefore excludes
  // exactly the controls this corpus is built around. Measured on
  // `keyboard-trap-modal-cycle+also-bare-edit-inert-vague-link-inert.bad`:
  //
  //     raw        5   ["Full name, edit", "Email, edit", "Phone, edit", "Delivery notes, edit", "edit"]
  //     by name    4   the bare "edit" — the defect — silently gone
  //
  // The tab ring holds 4, so `4 < 5` reported the trap and `4 < 4` did not. `rules:gate` caught it as
  // "2.1.2:focus-trapped is rule-decided on 10 record(s) and caught only 9".
  //
  // This is the rule that cost this project the most, arriving inside a refactor meant to prevent that
  // class: A CHECK MUST NEVER REJECT EVIDENCE WHOSE ABSENCE IS THE FINDING. An unnamed control is still a
  // control; it just cannot be compared BY NAME, which is a fact about the comparison, not about the page.
  const sweptControls = input.structure?.formFields ?? [];
  const named = comparableNames(sweptControls, input.truncated);
  const stops = input.interaction?.focusOrder ?? [];
  const reachedNames = comparableNames(stops, input.truncated);
  const overlap = named.filter((name) => reachedNames.includes(name)).length;
  // WHICH announced controls the ring never reached — the set, not its size. `swept - reached`
  // assumes the ring is a SUBSET of the announced controls, and for a modal it is DISJOINT from
  // them by construction: the dialog hides the page, so the sweep announces what is behind it
  // and Tab visits what is inside it. Measured on `keyboard-trap-modal-cycle`, where both sets
  // held four and the count comparison read `4 < 4` — a real trap, invisible.
  const unreached = named.filter((name) => !reachedNames.includes(name));
  return {
    swept: sweptControls.length,
    reached: new Set(stops).size,
    overlap,
    unreached,
    cycleClosed: cycleClosed(reachedNames),
    // Guarded on the NAMED sets, because overlap can only ever be computed between things that have names.
    // A page whose controls are all unnamed is not "disjoint", it is unanswerable by this comparison.
    disjoint: named.length > 0 && reachedNames.length > 0 && overlap === 0,
    // PASSED THROUGH, NOT RECOMPUTED. This function owns the cross-channel question, so the direct
    // answer belongs beside the inferred one rather than being read separately by each rule -- which is
    // how there came to be four hand-rolled spellings of the overlap comparison.
    sameState: input.probes?.sameState,
  };
}

/**
 * How much of the page the tab ring covers, measured against the swept FORM FIELDS — or null when nothing
 * corroborates a trap.
 *
 * A denominator is the whole rule. Swept form fields answer "did focus reach every field", where 2.1.2
 * asks "did focus reach the page" — so when a dialog holds every field, `reached >= onPage` and this goes
 * silent on the most total trap there is. That gap is REAL and still open; `keyboard-trap-modal-total` is
 * the case that fails it, and A3 in `docs/reliability-plan.md` records why the obvious fix does not work.
 *
 * A tab-stop denominator was built, measured on real pages, and withdrawn — see below.
 */
function tabRingCoverage(stops: string[], input: RuleInput):
  { reached: number; total: number; unit: string; missed: number } | null {
  // From `channelRelation`, which owns this comparison. `stops` stays a parameter because the two branches
  // below read the ring's SHAPE (whether a stop recurred, what roles it holds) and not just its size.
  const { reached, swept, unreached } = channelRelation(input);
  // A SET DIFFERENCE, NOT `reached < swept`. The count version assumed the ring is a subset of
  // the announced controls; a modal makes them disjoint, so two sets of four compared as `4 < 4`
  // and a real trap was invisible. Non-empty here means there are controls the page announced
  // and focus never visited, which is the corroboration this was always meant to be.
  // `missed` TRAVELS WITH THE DECISION, because the evidence string cannot recompute it.
  //
  // The comment above explains why `unreached` had to be a set difference rather than `swept - reached`:
  // for a modal the two sets are DISJOINT, so both hold four and a count comparison reads `4 < 4`. The
  // decision was fixed and the MESSAGE was not — it said "never reached the other ${total - reached}",
  // which on exactly that case printed "never reached the other 0 of 4 controls" while asserting a trap.
  // A number computed on a different basis from the claim it accompanies, in the sentence a human reads.
  if (unreached.length > 0) return { reached, total: swept, unit: "control", missed: unreached.length };

  // THE TAB-STOP DENOMINATOR IS WITHDRAWN, and what it cost to learn is worth more than the branch was.
  //
  // It compared the ring against `dom.tabbable` when the cycle had closed, and it worked exactly as
  // designed on the corpus: `keyboard-trap-modal-total` 3 of 16 reported, both conformant variants at
  // 1.00 silent. Then `rules-real-pages` scored it on 86 conformant real pages and it produced NINE new
  // 2.1.2 findings. Measured on three of them, with the probe's own marks beside the rule's:
  //
  //     tfl.gov.uk/modes/tube/     5 distinct of 67 tabbable   cycled=true truncated=false
  //     gov.scot/publications/     7 distinct of 116           cycled=true truncated=false
  //
  // The walks genuinely CLOSED — the probe and the rule agree, so this is not truncation and not a weak
  // wrap test, which were the two hypotheses. The rings are real: tfl's first stop is inside the cookie
  // banner, gov.scot's is a date-picker overlay. A modal confining Tab is a modal DOING ITS JOB, and
  // under 2.1.2 it conforms whenever the user can leave by a documented means.
  //
  // Six of the nine open with a consent banner. A systematic pattern across independent publishers is the
  // signature of a TOOL problem rather than nine site bugs — this repo's own rule about uniform inflation
  // across independent guests, pointed at findings instead of timings.
  //
  // So the evidence cannot tell a conformant modal from a trap, and no floor fixes that: the difference is
  // not how MUCH of the page the ring covers, it is whether focus can LEAVE. Nothing here presses Escape,
  // so nothing here can ask. Tuning the floor until real pages go quiet would be fitting a threshold to a
  // symptom, which is how a rule comes to be clean by going deaf.
  //
  // `dom.tabbable` is KEPT in the census. It is correct evidence, it is additive, and it is the
  // denominator the Escape-based rule will need — it was never the wrong measurement, only an insufficient
  // one. See A3 in `docs/reliability-plan.md` for what closing this actually requires.
  return null;
}

/**
 * Did the capture OBSERVE Escape leaving the dialog? Absent evidence is not a release.
 *
 * Read from `interaction.dialogEscape`, which exists only when `probeDialog` and `probeFocus` both ran --
 * Escape from the browse caret measures the document rather than any dialog, so the pair is required for
 * the observation to be about a dialog at all.
 *
 * A release is EITHER an announcement or focus moving to a different control, and requiring both would
 * make this deaf: NVDA re-announces the same control differently depending on how the caret reached it
 * ("T, o, w, n" then "Town, edit, focused, blank" on one real capture), so a page could release focus and
 * still look stationary by name. The asymmetry is deliberate and matches which error costs more -- this
 * function SILENCES an accusation, so it should be generous about evidence of a way out. 2.1.2 is
 * non-interference under WCAG 5.2.5: a wrong accusation says the whole page is unusable.
 */
function escapeReleasedFocus(input: RuleInput): boolean {
  const observed = (input.interaction as { dialogEscape?: unknown } | undefined)?.dialogEscape;
  if (!observed || typeof observed !== "object") return false;
  const { announced, focusBefore, focusAfter } = observed as Record<string, unknown>;
  if (String(announced ?? "").trim() !== "") return true;
  const settle = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const before = settle(focusBefore);
  const after = settle(focusAfter);
  if (before === "" || after === "") return false;
  return after !== before && !after.startsWith(before);
}

function addKeyboardTrap(input: RuleInput, add: AddFinding): void {
  const stops = input.interaction?.focusOrder;
  if (!stops || stops.length < 3) return; // absent means the probe did not run; too short proves nothing
  const coverage = tabRingCoverage(stops, input);
  if (!coverage) return; // no corroboration, or focus did reach the page
  const { reached, total } = coverage;
  // Pluralised rather than written "control(s)". This evidence string is quoted to a human in a report,
  // and it is also asserted on by tests — where `control(s)` inside a regex is a CAPTURE GROUP matching
  // "controls", so the literal spelling silently stops matching the string it was copied from.
  const unit = total === 1 ? coverage.unit : `${coverage.unit}s`;
  // THE STALLED PATH NEEDS THE SAME GUARD AS THE CYCLE ONE, and it did not have it.
  //
  // It was unreachable on a page like this only because `reached < swept` happened to return null when the
  // ring was BIGGER than the sweep — an accident, not a guard. Making the coverage test honest (a set
  // difference) exposed it immediately: nrscotland.gov.uk/publications, a page whose publisher declares it
  // conformant, where Tab stalls on a policy link INSIDE a cookie banner whose ring also holds "Accept all
  // cookies, button". WCAG 2.1.2 asks whether focus CAN be moved away; there it can.
  //
  // `ringOffersNoWayOut` is the discriminator that survived three withdrawn versions of this rule, each of
  // which fired on consent banners. Applying it to one of the two paths and not the other is this repo's
  // most expensive recurring shape — a remedy that reaches one caller.
  // The SAME guard on both paths. Applying a remedy to one of two callers is this file's own stated
  // "most expensive recurring shape", and the paragraph three lines below says so about `ringOffersNoWayOut`
  // for these exact two branches.
  if (trailingRepeats(stops) >= 2 && ringOffersNoWayOut(stops) && !escapeReleasedFocus(input)) {
    add("2.1.2 No Keyboard Trap",
      "Tab stopped moving: focus repeated the same control and never reached the rest of the page, so a "
        + "keyboard user cannot get past it",
      `focus stopped at "${stops[stops.length - 1]}"; ${coverage.missed} of ${total} ${unit} the page `
        + "announced were never reached");
    return;
  }
  // THE CYCLING CASE, on the fourth attempt, and the first three are why this one is shaped as it is.
  //
  // Three rules asked HOW MUCH of the page the ring covers — against swept form fields, then against
  // rendered tab stops, then with an Escape probe. Each was exact on the corpus and wrong on the web (7 and
  // 9 new findings on 86 conformant real pages; the third was inert). They all failed the same way: SIZE is
  // exactly what a consent banner also differs by, so a rule fitted to it learns "is there a modal".
  //
  // The question is not how big the ring is. It is what the ring OFFERS. Measured on the pages that
  // accused the earlier rules:
  //
  //     tfl.gov.uk        ring 5   link, link, button, button, button   <- "Accept all cookies"
  //     networkrail       ring 4   link, button, button, button         <- "Allow all cookies"
  //     the corpus trap   ring 3   edit, edit, edit                     <- nothing to activate
  //
  // Every consent banner offers a control that dismisses it. The trap offers nothing: you can type, and Tab
  // cycles. That is 2.1.2 read literally — focus must be movable away "using only a keyboard", and
  // activating a button in the ring is exactly that, whereas a ring of bare text fields has no such move.
  //
  // A ROLE TEST, NOT A WORDLIST. It asks `parseAnnouncement` for the role and never looks at the words, so
  // it cannot become the 2.4.4 shortcut — a feature answering a different question, taken because it was
  // the cheapest separator available. It would behave identically on a banner written in any language.
  //
  // DELIBERATELY CONSERVATIVE. Any actionable role anywhere in the ring silences it, including a Submit
  // button inside a genuinely trapped form. That is a miss, and the right one to accept: this criterion is
  // NON-INTERFERENCE under WCAG 5.2.5, so a wrong accusation says the whole page is unusable.
  //
  // THAT LAST CLAIM WAS WRONG, AND MEASURING IT IS WHAT FOUND THE HOLE. This comment used to end:
  // *"`anchorToTop` presses Escape before the walk, so a ring that survives to be measured here has
  // ALREADY outlived an Escape."* It has not. `anchorToTop` presses Escape in BROWSE MODE with focus still
  // on the document body, and a real dialog scopes its Escape handler to itself -- so the handler never
  // fires and the ring is measured with the dialog fully intact.
  //
  // Measured 2026-09-01 on `keyboard-trap-modal-escape`, whose two pages differ in that one handler and
  // nothing else: with a DOCUMENT-level handler `anchorToTop`'s Escape did release the trap; scoped to the
  // dialog, it did not, and this rule then accused the conformant page. So the safety net the paragraph
  // claimed was doing no work, and the false-positive class it was thought to cover is real -- any modal
  // that closes on Escape and holds no operable control in its ring.
  //
  // `probeDialog` now asks the question directly, and an OBSERVED release silences this. Absence is not a
  // release: a capture that never ran the probe cannot say, and reading that silence as conformance would
  // be the opposite error to the one being fixed.
  if (reached < stops.length && ringOffersNoWayOut(stops) && !escapeReleasedFocus(input)) {
    add("2.1.2 No Keyboard Trap",
      "Focus cycles among a few controls and never reaches the rest of the page, and none of them can be "
        + "activated to leave — so a keyboard user who enters that group cannot get out",
      `focus visited ${reached} distinct ${reached === 1 ? "control" : "controls"} in ${stops.length} `
        + `tab stops, none of them operable, and never reached ${coverage.missed} of the ${total} `
        + `${unit} the page announced`);
  }
}

/**
 * Roles whose activation is a keyboard means of LEAVING — the test that separates a trap from a modal.
 *
 * Broad on purpose. Every role counted here makes the rule quieter, and a wrong 2.1.2 says a keyboard user
 * cannot use the page at all.
 */
const OFFERS_A_WAY_OUT = /\b(button|link|tab|menu item)\b/;

/** True when nothing in the ring can be activated — you can type, and Tab cycles. */
function ringOffersNoWayOut(stops: string[]): boolean {
  return stops.every((stop) => parseAnnouncement(stop, "sweep").objects
    .every((object) => !OFFERS_A_WAY_OUT.test(object.role)));
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
/**
 * NVDA announcing that there is nothing further of a type — not a control it activated.
 *
 * `probeRouteChange` names the control it pressed by diffing the speech log, so whatever NVDA said in
 * response becomes the "control". When quick-nav runs out, what NVDA says is `"no next link"` — and that
 * string was then carried into a finding as though a control by that name had been activated.
 *
 * Measured 2026-08-24 on `gov.scot/publications`: *after activating "no next link" the page moved to
 * "AUGUST 2025, heading, level 2" while the title stayed…*. Nothing was activated. The heading changed
 * because the caret moved, which is what quick-nav does.
 *
 * This is the lesson `sweepInDirection` already carries — *NVDA announces the end of a page, so
 * `exhausted` is the sound terminus* — applied to the one probe that never learned it. Fixed here rather
 * than in the capture so existing evidence is covered without another recapture; the capture should stop
 * recording it as a control too, and `interaction.routeChange.navigated` is where that belongs.
 */
const NOTHING_FURTHER = /^\s*no (next|previous) \w+/i;

function addStaleRouteTitle(input: RuleInput, add: AddFinding): void {
  const route = input.interaction?.routeChange;
  if (!route || route.error || !route.navigated) return; // not probed, or the probe could not answer
  // The probe reached the end of the links instead of activating one. See `NOTHING_FURTHER`.
  if (NOTHING_FURTHER.test(String(route.control ?? ""))) return;
  const { titleBefore, titleAfter, headingBefore, headingAfter } = route;
  if (!titleBefore || !titleAfter) return;
  // BOTH HEADINGS MUST HAVE BEEN READ, and the title guard above had this and this line did not.
  //
  // `headingAfter` is `string | null`, and null means the probe could not read a heading — not that the
  // page has none. Without this, `headingBefore: "Welcome"` with `headingAfter: null` differs, so the rule
  // fired and quoted `the page moved to null while the title stayed "Home"`. Absence read as a value, in
  // a sentence shown to a user, in the one rule whose entire premise is that the VIEW MOVED — which a
  // failed read does not establish.
  //
  // Latent rather than live: no capture on disk carries `routeChange` at all, because `probeNavigation` is
  // opt-in and the dataset runner never sets it. It becomes reachable the moment that changes, which is
  // the same shape as `focusOrder` before its rule existed.
  //
  // It costs the `null -> "Latest news"` case, where the before-read failed and the after-read succeeded.
  // That is a MISSED finding rather than an invented one, which is the direction this file fails in
  // deliberately, and the comparison there was never between two known values anyway.
  if (!headingBefore || !headingAfter) return;
  if (headingBefore === headingAfter) return; // nothing navigated; there is no transition to judge
  if (titleBefore !== titleAfter) return;
  add("2.4.2 Page Titled",
    "Navigating changed the page but not its title, so the screen reader still announces the previous "
      + "page — a user who checks where they are is told the wrong thing",
    `after activating "${route.control}" the page moved to ${JSON.stringify(headingAfter)} `
      + `while the title stayed ${JSON.stringify(titleAfter)}`);
}

/** How many separate FORMS the page announces. See `addBrokenFocusOrder` for why this decides anything. */
function formsAnnounced(transcript: readonly string[]): number {
  let forms = 0;
  for (const line of transcript) {
    for (const container of parseAnnouncement(String(line), "transcript").containers) {
      if (container.role === "form") forms += 1;
    }
  }
  return forms;
}

/**
 * Names the PAGE uses more than once, counted in the raw transcript rather than in what was extracted.
 *
 * `unambiguous` drops a name that appears twice in a sequence, which is the right idea and can be
 * defeated: a name missed by extraction in one channel and present in the other looks unique in both.
 *
 * Measured 2026-08-25 on `w3.org/WAI/tutorials/forms/validation/`, a tutorial page carrying several
 * example forms and therefore several buttons called Submit. One is announced as
 * `"form, Name (required):, edit, required, , button, Submit"` — name-first inside a transcript line, a
 * shape the reading-order extractor does not take — and another as `"out of grouping, button, Submit"`,
 * which it does. So `Submit` appeared once in the extracted reading order and once in the tab order, and
 * 2.4.3 compared two different buttons and reported a reordering on one of W3C's own tutorials.
 *
 * Counting raw lines instead makes the check independent of what extraction happened to catch, which is
 * the property it needed: the ambiguity is a fact about the PAGE, not about the parse.
 */
function repeatedOnThePage(transcript: readonly string[]): Set<string> {
  const seen = new Map<string, number>();
  for (const line of transcript) {
    for (const object of parseAnnouncement(String(line), "transcript").objects) {
      const name = object.name.trim();
      if (name) seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    // Also the name-first shapes the reading-order extractor skips, which is exactly where the missed
    // duplicate lived. Counted from the same line by the other grammar.
    for (const object of parseAnnouncement(String(line), "sweep").objects) {
      const name = object.name.trim();
      if (name) seen.set(name, (seen.get(name) ?? 0) + 1);
    }
  }
  // > 2, not > 1: every line is counted by BOTH grammars above, so one occurrence scores two. A name is
  // repeated on the page only when it clears that doubling.
  return new Set([...seen].filter(([, count]) => count > 2).map(([name]) => name));
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
  // DELIBERATELY A WIDER DENOMINATOR THAN `channelRelation.swept`, and that is why it is not folded in.
  // This asks whether the tab order accounts for everything FOCUSABLE the sweep found — links and buttons
  // as well as form fields — because a false wrap is detected against the whole focus ring, not against the
  // form. `channelRelation` answers "do these two channels describe one page"; this answers "did the walk
  // cover it". Two questions, and merging them would make one of them wrong.
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
/**
 * Roles whose GROUP shares one tab stop, so Tab reaching only one member is correct behaviour.
 *
 * Native HTML gives a radio group a single tab stop: Tab moves to the checked radio (or the first if
 * none is), and the ARROW keys move between members. ARIA's Authoring Practices codify the same shape
 * for custom widgets as the "roving tabindex" pattern, which is why a tablist, a menu and a tree behave
 * the same way. None of it is a keyboard trap; all of it is the documented interaction.
 *
 * Measured 2026-08-24 on `design-system.service.gov.uk/components/radios`, where the focus probe recorded
 * `"England, radio button, focused, not checked, 1 of 5"` — Tab reached exactly one radio of each group,
 * exactly as specified — and 2.1.1 reported `"Phone"`, `"Wales"` and `"Scotland"` as controls the
 * keyboard cannot reach. Same on the tabs component, with `"Past month"` and `"Past week"`.
 *
 * **A capture cannot tell "reachable by arrow keys" from "unreachable", because the probe presses only
 * Tab.** So this is not a narrower claim, it is the absence of one — the same discipline as everywhere
 * else here: where the evidence cannot decide, make no finding. Driving the arrows is what would settle
 * it, and `docs/screenreader-coverage.md` is where that belongs when somebody adds it.
 */
const SHARES_ONE_TAB_STOP = new Set([
  "radio button", "radio", "tab", "menu item", "tree item", "option", "grid cell", "cell",
]);

/**
 * States that mean a control's NAME may change under it, so it cannot be tracked by name across time.
 *
 * A disclosure button is labelled "Expand Quick start" while collapsed and "Collapse Quick start" while
 * expanded. A capture spans an interaction — `probeDisclosure` activates a control unconditionally — so
 * the structural sweep can record BOTH labels for one button while the focus probe, running afterwards,
 * only ever sees the second.
 *
 * Measured 2026-08-24 on `docs.sign-in.service.gov.uk`, verbatim from one capture:
 *
 *     sweep   "clickable, Expand Quick start, button, collapsed"
 *     sweep   "clickable, Collapse Quick start, button, expanded"
 *     focus   "Collapse Quick start, button, focused, expanded"
 *
 * 2.1.1 reported "Expand Quick start" as a control the keyboard cannot reach. It is the same button,
 * before it was pressed.
 *
 * As with `SHARES_ONE_TAB_STOP`, this is the absence of a claim rather than a narrower one: the capture
 * cannot tell a control that was RENAMED by an interaction from one nothing can reach.
 */
const NAME_CHANGES_WITH_STATE = new Set([
  "collapsed", "expanded", "pressed", "not pressed",
]);

/** Announced controls as name, role and states, so a rule can ask what KIND of control it is. */
function controlsWithRoles(
  entries: string[] | undefined,
): { name: string; role: string; states: string[] }[] {
  const out: { name: string; role: string; states: string[] }[] = [];
  for (const entry of entries ?? []) {
    for (const object of parseAnnouncement(String(entry), "sweep").objects) {
      const name = object.name.replace(FOCUS_ONLY_STATES, " ").replace(/[\s,]+/g, " ").trim();
      if (name) out.push({ name, role: object.role, states: object.states });
    }
  }
  return out;
}

/**
 * Can this tab order support a claim that a control was NEVER reachable?
 *
 * Three ways it cannot, each learned from a page it accused wrongly.
 *
 * THE WHOLE TAB CYCLE, OR NO CLAIM. Tab wraps: past the last control it returns to the first, so a
 * recording that revisits its own starting control has observed every focusable there is — and a control
 * the page announces but that cycle never contains is genuinely unreachable, whatever the stop cap.
 * 
 * This replaced a READING-ORDER proxy ("something later in reading order was reached, so the probe got
 * past this point"), which is unsound for the exact reason 2.4.3 exists: the two orders can differ.
 * Measured on developer.mozilla.org — 18 controls read, 12 stops, truncated, cycle never closed — the
 * proxy reported the theme switch, language picker and sidebar toggle as keyboard-unreachable. They sit
 * early in READING order and late in TAB order, so the probe simply stopped before them. A well-built
 * page, accused on the first run.
 * ...and the cycle has to account for the page. See `cycleCoversThePage`: a wrap the tab order detects
 * in itself can be a repeated nav block, and then every control past it reads as unreachable.
 * A CONFINED RING IS NOT A SURVEY OF THE PAGE, so absence from it proves nothing about the page.
 * 
 * Found by `rules:gate` on 2026-08-28, on the CONFORMANT variant of `keyboard-trap-modal-cycle`: a dialog
 * holds focus, and this reported the four fields behind it as
 * `never focused: ["Full name","Email","Phone","Delivery notes"] — while Tab completed a full cycle`.
 * Every word true, and the conclusion wrong — close the dialog and all four are reachable. "A capture is
 * not an instant", which this repo already records for sportengland's search panel, reaching 2.1.1.
 * 
 * `cycleCoversThePage` was supposed to catch this and its floor is computed from STOPS (7 here) rather
 * than DISTINCT stops (4), so a ring that revisits itself looks like a walk that covered ground.
 * `tabRingCoverage` compares what was actually VISITED against what the page holds, which is the same
 * question this guard was reaching for.
 * 
 * It is also the right division of labour: on a confined ring the finding is the CONFINEMENT, which 2.1.2
 * owns and reports when nothing in the ring can be activated. Two criteria describing one dialog from
 * opposite ends would be the same evidence counted twice.
 */
function tabOrderCanProveAbsence(tabbedNames: string[], input: RuleInput): boolean {
  if (!cycleClosed(tabbedNames)) return false;
  if (!cycleCoversThePage(tabbedNames, input)) return false;

  // THE TWO CHANNELS MUST BE DESCRIBING THE SAME PAGE, and on a modal they are not.
  //
  // Measured on the CONFORMANT variant of `keyboard-trap-modal-cycle`, which reported
  // `never focused: ["Full name","Email","Phone","Delivery notes"] — while Tab completed a full cycle`:
  //
  //     swept formFields  4   ["Full name, edit", "Email, edit", "Phone, edit", "Delivery notes, edit"]
  //     distinct stops    4   the dialog's three fields and its Close button
  //
  // Quick-nav surveyed the page BEHIND the dialog; Tab was held INSIDE it. The two sets are DISJOINT, and
  // their counts happen to match — so every count-based guard here passed and the rule accused all four.
  // A rule reporting 100% of a page's announced controls as unreachable has found a broken measurement,
  // not a broken page: close the dialog and all four are reachable. "A capture is not an instant", which
  // this repo already records for sportengland's search panel, reaching 2.1.1.
  //
  // Overlap is the honest test, and it is not a count: if Tab reached NOT ONE of the controls the sweep
  // announced, the two channels are describing different states and no absence claim is available.
  // Read from `channelRelation`, which owns this comparison for every rule that makes it.
  const relation = channelRelation(input);
  // THE PAGE MOVED, stated by the capture rather than inferred from overlap — determinism-plan D7.
  //
  // This is the same refusal as the overlap test below and it is strictly better evidence, so it comes
  // first: `disjoint` cannot tell "the page changed" from "the sweep found nothing", and it says nothing
  // at all when the two channels overlap a little. Measured on `nls.uk/join/`, where the sweep opens a
  // search panel and the tab ring goes from 150 stops to 10 — a page where SOME names still match, so
  // `disjoint` is false and an absence claim was available on a comparison of two different pages.
  //
  // `=== false` deliberately: `undefined` means the capture never took the fingerprint, and treating
  // that as "the page moved" would silence this rule on every capture predating D7.
  if (relation.sameState === false) return false;
  // Kept, and NOT redundant: a capture with no fingerprint reaches here with `sameState: undefined`, and
  // the whole corpus captured before 2026-08-28 is in that state. Removing this would make the older
  // half of the evidence unguarded.
  if (relation.disjoint) return false;

  // NO SECOND GUARD ON RING SIZE, and the attempt is worth recording. `tabRingCoverage` — "the ring is
  // smaller than the swept controls" — was added here and SUBSUMED THE RULE: that is 2.1.1's own premise,
  // so guarding on it silenced every genuine finding. Two unit tests caught it immediately, including
  // "a cycle that DOES account for the page still reports a genuinely missed control", which exists for
  // exactly this. On a confinement the finding is 2.1.2's; the way to keep them apart is the overlap test
  // above, not a size comparison that both criteria read in opposite directions.
  return true;
}

/**
 * MAY A RULE ASSERT FROM THIS SWEEP? — capture-integrity-plan C2.
 *
 * Absence is the one claim a sweep cannot make alone, and this repo already states that rule and then
 * applies it BY HAND in the two places somebody remembered: `addMissingHeadings` corroborates with
 * `census.heading === 0`, `tabOrderCanProveAbsence` checks `channelRelation.disjoint`. Nothing made the
 * NEXT absence rule do either, which is this project's most expensive recurring shape.
 *
 * **THE CLAIM KIND IS REQUIRED, and the first version of this did not have it.** It refused `phantom` AND
 * `truncated` for every caller, which silently discarded real findings: measured directly, a page with an
 * unnamed button reported 1 finding on an `exact` sweep and 0 on a `truncated` one. The button was
 * ANNOUNCED — we heard it — and a short sweep does not make it less real.
 *
 *   PRESENCE  "here is a control with no name"    one instance proves it. A short sweep is still enough,
 *                                                   and withholding discards a true finding on exactly the
 *                                                   pages a publisher already admits are broken.
 *   ABSENCE   "Tab never reached this control"    ranges over the WHOLE channel. A list we know is short
 *                                                   cannot support it.
 *
 * That distinction is not mine: `completeness.ts` made it on 2026-08-24 and was never wired to anything,
 * so C2 rebuilt half of it and got this half wrong. `phantom` refuses BOTH, because a sweep announcing
 * things the page does not have may have announced this one.
 *
 * @param input the rule input, carrying `completeness` from `oracleCounts`
 * @param type the census type the rule's evidence is swept from
 * @param claim whether the rule concludes something IS there or that something is NOT
 * @returns whether the claim may rest on this sweep
 */
export function assertableSweep(input: RuleInput, type: string, claim: "presence" | "absence"): boolean {
  const verdict = input.completeness?.[type];
  // A sweep that announced more than the page exposes may have announced THIS one. Fatal to either claim.
  if (verdict === "phantom") return false;
  // Short: it cannot rule anything out, but what it DID hear was still heard.
  if (verdict === "truncated") return claim === "presence";
  // `exact`, and `unknown` — which is deliberately allowed and COUNTED rather than refused, because every
  // capture predating the counter reports it and refusing would silence 2.1.1 across the whole corpus.
  return true;
}

export function unverifiedSweeps(input: RuleInput, types: string[]): string[] {
  return types.filter((type) => (input.completeness?.[type] ?? "unknown") === "unknown");
}

function addKeyboardUnreachableControl(input: RuleInput, add: AddFinding): void {
  const reading = comparableNames(input.structure?.formFields, input.truncated);
  const tabbedNames = comparableNames(input.interaction?.focusOrder, input.truncated);
  const tabbed = new Set(tabbedNames);
  if (reading.length < 2 || tabbed.size === 0) return;
  // C2. This rule's whole claim is "the sweep announced it and Tab never landed on it", so it is exactly
  // as good as the sweep's fidelity. A phantom name is unreachable by construction — it is not there.
  if (!assertableSweep(input, "formControl", "absence")) return;
  if (!tabOrderCanProveAbsence(tabbedNames, input)) return;
  // A control whose announced name is shared with another cannot be said to have been missed: its name
  // appearing in the tab order may be the OTHER control, and its absence may mean the other one was
  // reached. Same reasoning as 2.4.3 — see `unambiguous`.
  const trackable = unambiguous(reading);
  // A member of a composite widget is reached by ARROW keys, not Tab — see `SHARES_ONE_TAB_STOP`. Its
  // absence from the tab order is the specified behaviour, and this probe presses only Tab, so the
  // capture cannot tell that from a control nothing can reach.
  const announced = controlsWithRoles(input.structure?.formFields);
  // DID A DISCLOSURE OPEN OR CLOSE DURING THIS CAPTURE? If so the set of focusable controls changed
  // while we were measuring it, and a set comparison across that is unsound.
  //
  // Measured 2026-08-24 on sportengland.org. The sweep recorded `"Close search, button, expanded"` and
  // the fields inside the open panel; the focus probe, running at another moment, recorded
  // `"Toggle search, button, focused, collapsed"`. Controls inside a closed panel are not focusable —
  // correctly — so 2.1.1 reported "Search" and "Submit search query" as unreachable when they simply
  // did not exist at the time Tab was pressed.
  //
  // A capture is not an instant: `probeDisclosure` activates a control unconditionally, and the sweeps
  // and the focus probe run before and after it. One name announced BOTH expanded and collapsed is that
  // fact made visible, and it is the whole page's evidence that is affected, not one control's.
  const toggled = new Set<string>();
  for (const control of announced) {
    if (!control.states.includes("expanded")) continue;
    if (announced.some((other) => other.name === control.name && other.states.includes("collapsed"))) {
      toggled.add(control.name);
    }
  }
  if (toggled.size) return;
  const untrackable = new Set(announced
    .filter((c) => SHARES_ONE_TAB_STOP.has(c.role)
      || c.states.some((state) => NAME_CHANGES_WITH_STATE.has(state)))
    .map((c) => c.name));
  const missed = reading.filter((name) =>
    trackable.has(name) && !tabbed.has(name) && !untrackable.has(name));
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
 * "Did nothing" is stated against the ordinary tab order, so the claim is that the next Tab landed where
 * it would have landed without ever touching the link — or EARLIER. That is stronger than "focus is still
 * near the top" and needs no knowledge of where the block ends.
 *
 * TWO POSITIONS, not one, and the second was a real blind spot. Index 1 is "the link changed nothing".
 * Index 0 is "the link put you back before you started", which is strictly worse and was uncovered.
 * Measured 2026-08-28 on `skip-link-target-hidden`, whose target keeps its `tabindex="-1"` — somebody
 * knew the pattern — and is `hidden`, so it is in neither the rendering nor the accessibility tree:
 *
 *   works    activating it →  "Search the archive, edit"        (past the block, in the content)
 *   inert    activating it →  "News and updates, link"          (the first nav link — index 1)
 *   hidden   activating it →  "Skip to main content, link"      (the skip link ITSELF — index 0)
 *
 * A third mechanism was tried and REFUTED: a target that exists with no `tabindex` behaves exactly like
 * the conformant page, because Chromium moves the sequential-focus starting point anyway. Recorded on the
 * corpus case so nobody re-derives it.
 */
function addInertSkipLink(input: RuleInput, add: AddFinding): void {
  const route = input.interaction?.routeChange;
  if (!route || route.error || !route.navigated) return;
  // It has to BE a skip link. The probe activates the first link on the page, which elsewhere is a logo or
  // a cookie banner — finding focus unmoved after activating one of those says nothing about bypassing.
  if (!/\b(skip|jump)\b/i.test(String(route.control ?? ""))) return;
  const landed = comparableNames([route.nextFocusAfter ?? ""], input.truncated)[0];
  if (!landed) return; // not measured, or focus went somewhere silent — no claim either way
  const ordinary = comparableNames(input.interaction?.focusOrder, input.truncated).slice(0, 2);
  if (ordinary.length < 2 || !ordinary.includes(landed)) return;
  add("2.4.1 Bypass Blocks",
    "The skip link does not skip anything: activating it left focus where the next Tab would have gone "
      + "anyway, or earlier, so the repeated block still has to be tabbed through",
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
/**
 * Roles the FORM-FIELD sweep would have reached — the scope this rule was always written for.
 *
 * Not every control. Widening it to links took 2.4.3 from 29% of conformant real pages to **74%**, and
 * the extra findings were not failures: a cookie banner takes focus before a skip link that precedes it
 * in the DOM, and page-level navigation is reordered for good reasons on nearly every real site. The
 * criterion is about an order that CONTRADICTS meaning, and a form whose fields are reached out of
 * sequence is that; a consent dialog jumping the queue is not.
 *
 * The rule's own comment already said so — *"`focusOrder` also holds links and anything else focusable,
 * while the form-field sweep holds controls Tab may never reach"* — and I widened the scope while fixing
 * the ordering, which is two changes in one and only one of them was wanted.
 */
const FORM_FIELD_ROLES = new Set([
  "edit", "edit text", "combo box", "check box", "checkbox", "radio button", "radio",
  "list box", "spin button", "slider", "button", "menu button",
]);

function controlsInReadingOrder(input: RuleInput): string[] {
  const names: string[] = [];
  // NVDA WRAPS a field's label and its role onto separate transcript lines, and the corpus is full of it:
  //
  //     "form, Full name"     <- the label, with no role
  //     "edit"                <- the role, with no name
  //
  // Requiring both on one line found nothing there, so 2.4.3 caught 0 of the 4 corpus records it owns —
  // clean on real pages by being deaf, which `rules:gate` refused. `hasEmptyName` already names this
  // exact shape: "line-wrapping, where a labelled field's role and name land on separate transcript
  // lines". A bare label line is therefore held and used by the next role that arrives without one.
  let pendingLabel = "";
  for (const line of input.transcript ?? []) {
    const parsed = parseAnnouncement(String(line), "transcript");
    if (!parsed.objects.length) {
      pendingLabel = parsed.trailing.join(" ").replace(/[\s,]+/g, " ").trim();
      continue;
    }
    for (const object of parsed.objects) {
      const own = object.name.replace(FOCUS_ONLY_STATES, " ").replace(/[\s,]+/g, " ").trim();
      const name = FORM_FIELD_ROLES.has(object.role) ? own || pendingLabel : "";
      if (name) names.push(name);
      pendingLabel = "";
    }
  }
  return names;
}

function addBrokenFocusOrder(input: RuleInput, add: AddFinding): void {
  // READING order from the transcript, ordered by construction. `structure.formFields` is a count sweep
  // and cannot answer this — see `controlsInReadingOrder`.
  const reading = firstVisitEach(controlsInReadingOrder(input));
  const tabbed = firstVisitEach(comparableNames(input.interaction?.focusOrder, input.truncated));
  if (reading.length < 2 || tabbed.length < 2) return; // absent or too short proves nothing
  // Only names that identify one control in BOTH sequences. A repeated name cannot be tracked between
  // them, and comparing it invents a reordering — see `unambiguous`.
  const readingOnce = unambiguous(reading), tabbedOnce = unambiguous(tabbed);
  // MORE THAN ONE FORM MEANS THE NAMES REPEAT BY CONSTRUCTION, so nothing here can be tracked between
  // the two channels. A tutorial page carries several worked examples and therefore several buttons
  // called Submit; `w3.org/WAI/tutorials/forms/validation/` has three forms and 2.4.3 reported a
  // reordering built from two different ones.
  //
  // `repeatedOnThePage` below cannot always see it: that page announces one Submit as
  // "form, Name (required):, edit, required, , button, Submit", where the name lands in `trailing`
  // rather than as a parsed object, so it is uncountable. Counting FORMS is the fact that is actually
  // available, and it is the right one — the ambiguity is a property of the page's structure.
  if (formsAnnounced(input.transcript ?? []) > 1) return;
  const onPage = repeatedOnThePage(input.transcript ?? []);
  const shared = new Set([...readingOnce]
    .filter((name) => tabbedOnce.has(name) && !onPage.has(name)));
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

function comparableNames(entries: string[] | undefined, truncated?: string[]): string[] {
  // C5. A TRUNCATED ANNOUNCEMENT IS EXCLUDED BEFORE NORMALISATION, never normalised and then compared.
  // The exclusion is on the announcement as heard, which is what the capture marked; normalising first
  // would make the exclusion set and the entries two different alphabets, which is the defect this fixes.
  const drop = new Set(truncated ?? []);
  return (entries ?? [])
    .filter((entry) => !drop.has(String(entry)))
    .map((entry) => parseAnnouncement(String(entry), "sweep").objects[0]?.name ?? "")
    .map((name) => name.replace(FOCUS_ONLY_STATES, " ").replace(/[\s,]+/g, " ").trim())
    .filter(Boolean);
}

/**
 * How many announcements a comparison could not use, and why — capture-integrity-plan C5.
 *
 * `namesExcluded` is reported rather than inferred: "the tab order and the reading order disagree" and
 * "we dropped nine names before comparing them" are different claims, and only the second explains a
 * denominator that moved.
 *
 * @param entries the announcements a rule was about to compare
 * @param truncated the announcements this capture marked as truncated
 * @returns how many of `entries` were excluded
 */
export function namesExcluded(entries: string[] | undefined, truncated?: string[]): number {
  const drop = new Set(truncated ?? []);
  return (entries ?? []).filter((entry) => drop.has(String(entry))).length;
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

/**
 * Is this line MARKUP being read aloud, rather than a control being announced?
 *
 * NVDA speaks punctuation, so a code sample on the page becomes text: `<input type="image"
 * src="searchbutton.png" alt="Search">` is announced as *"less input type equals image src equals
 * searchbutton dot png alt equals Search greater"*.
 *
 * Measured 2026-08-25 on three of W3C's own accessibility TUTORIAL pages. `isImage` matched the word
 * "image" inside `type equals image`, and the filename rule then matched `searchbutton dot png` — so the
 * pages that TEACH how to write image alternatives were reported as having a filename for an alternative.
 * The example is the subject of the lesson, printed as an example.
 *
 * Keyed on the two characters NVDA renders as words when reading a tag — `<` as "less" and `=` as
 * "equals", or `>` as "greater". Prose does not put those together in that order; markup always does.
 */
const READ_ALOUD_MARKUP = /\bless\s+\w+\b[^]*\b(equals|greater)\b/i;

const isReadAloudMarkup = (line: string): boolean => READ_ALOUD_MARKUP.test(String(line));

/**
 * 1.1.1 — images with no text alternative: announced "unlabelled", an empty name, or a file name.
 *
 * Extracted from `ruleFindings`, which the complexity gate stopped at 16 when the markup guard was added.
 * It reads better as its own step anyway: one criterion, three ways of failing it, one level of
 * abstraction.
 */
function addImageAlternatives(transcript: string[], add: AddFinding): void {
  for (const line of transcript) {
    if (isReadAloudMarkup(line)) continue; // a code SAMPLE, not an image — see `READ_ALOUD_MARKUP`
    if (!isImage(line)) continue;
    if (UNLABELLED_RE.test(line) || NO_DESCRIPTION_HINT_RE.test(line)) {
      // CONFORMANCE-mapped: NVDA said "Unlabeled graphic" in so many words. The screen reader is
      // reporting non-text content with no text alternative, which is the criterion stated directly.
      add("1.1.1 Non-text Content", "Image announced as unlabelled (no text alternative)", line,
        "conformance");
    } else if (hasEmptyName(line)) {
      add("1.1.1 Non-text Content", "Image announced with no text alternative", line);
    } else if (FILENAME_RE.test(accessibleName(line))) {
      add("1.1.1 Non-text Content", "Image alternative text is a file name, not a description", line);
    }
  }
}

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

  addImageAlternatives(input.transcript, add);

  // 4.1.2 — controls announced with a role but no accessible name. Transcript
  // path requires the ￼ marker; the structural-sweep path does not (see
  // addUnnamedControls).
  addSilentStateChanges(input.interaction?.stateChanges ?? [], add);
  addUnnamedControls(input.transcript, "transcript", add);
  // C2. DROP ONLY THE UNTRUSTWORTHY CHANNEL, never the whole call. 4.1.2 is rules-owned, so an unnamed
  // control here is ASSERTED — and a phantom form control has no name by construction, which is the
  // finding itself manufactured out of a capture defect. `interaction.controls` is the focus probe and a
  // different channel entirely; silencing it because the SWEEP is unreliable would trade a real finding
  // for a caution about a different measurement.
  addUnnamedControls([
    ...(assertableSweep(input, "formControl", "presence") ? (input.structure?.formFields ?? []) : []),
    ...(input.interaction?.controls ?? []),
  ], "sweep", add);
  // Frames go to their own rule, because a frame's name is a CONTAINER prefix and `addUnnamedControls`
  // walks objects. Not gated on `assertableSweep`: a phantom frame is not a shape this sweep produces --
  // the guard above exists for a truncated FORM-CONTROL sweep manufacturing an unnamed control out of a
  // capture defect, and an empty `frames` array simply yields no findings.
  addUnnamedFrames(input.structure?.frames ?? [], add);

  // 2.4.4 and 1.3.1 — both about what a screen reader user CANNOT do: tell two links apart, or skim.
  // Neither is reported by axe, which is the point of having them here.
  // The transcript is ordered by construction and always trustworthy here; the link sweep is not. 2.4.4 is
  // not rules-owned so this is a referral rather than an assertion, but a phantom link is a phantom link.
  addVagueLinks([...input.transcript,
    ...(assertableSweep(input, "link", "presence") ? (input.structure?.links ?? []) : [])], add);
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
