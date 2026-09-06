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
// The cross-channel evidence four rules share -- 2.1.1, 2.1.2, 2.4.1 and 2.4.3 all compare what the
// sweep announced against what Tab visited or the transcript reads. `channel-comparison.ts` is the ONE
// implementation; the four rules that read it stay here, together, because their own comments
// cross-reference each other's reasoning directly.
import {
  trailingRepeats,
  tabRingCoverage,
  escapeReleasedFocus,
  ringOffersNoWayOut,
  repeatedStructureContainers,
  repeatedOnThePage,
  unambiguous,
  SHARES_ONE_TAB_STOP,
  NAME_CHANGES_WITH_STATE,
  controlsWithRoles,
  tabOrderCanProveAbsence,
  assertableSweep,
  unverifiedSweeps,
  arrowKeysDidNotMove,
  controlsInReadingOrder,
  comparableNamesForTest,
  comparableNames,
  namesExcluded,
  firstVisitEach,
} from "./channel-comparison.js";
// Re-exported rather than repointing every consumer -- `rules.test.ts`, `sweep-completeness.test.ts` and
// `name-normalisation.test.ts` (a cross-package test reaching this file by relative path) all import
// these from here, and one import per consumer is the smaller change.
export {
  repeatedStructureContainers,
  assertableSweep,
  unverifiedSweeps,
  comparableNamesForTest,
  namesExcluded,
};

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
     * What each activated control announced. `kind` distinguishes a SUBMIT from a disclosure, and it has
     * travelled with the evidence since protocol 8 for exactly the reason 3.3.3 needs it: without it,
     * opening a disclosure counts as submitting a form, and apache.org's search toggle was once reported
     * as a form submitted with invalid input and no error announced.
     *
     * Absent unless `probeForms` was asked for, which is OFF for real-page captures by design — pressing
     * submit on a site we do not own is not a review. So a rule reading this cannot fire on a real page,
     * and must never read absence as a finding.
     */
    formChanges?: { control?: string; after?: string | null; kind?: string }[];
    /** The deliberate re-read of durable field state after a submit. Same probe, same absence rule. */
    postSubmitFields?: string[];
    /**
     * The page title either side of FOCUSING the first control (3.2.1) and either side of TYPING into a
     * field (3.2.2). Absent unless the matching probe was asked for; `null` titles mean nothing was
     * focused or typed, which is not the same as a title that did not change.
     */
    focusContext?: { control?: string; titleBefore?: string | null; titleAfter?: string | null; error?: string };
    typedFeedback?: { titleBefore?: string | null; titleAfter?: string | null; error?: string };
    /**
     * The DISMISSABLE bullet's verdict for 1.4.13, computed by `focusRevealVerdict` (capture-pure.mjs)
     * from three censuses and two focus reads. `revealed: null` means the census could not answer or
     * nothing was focusable; `dismissed: null` means the census after Escape could not answer. Both are
     * "cannot say", never "no" — read only `revealed === true` together with a real boolean `dismissed`.
     */
    focusReveal?: { revealed?: boolean | null; focusHeld?: boolean; dismissed?: boolean | null;
      revealedBy?: [string, number][] };
    /**
     * What each Tab press announced, in order. Absent means the focus probe did not run — which was true
     * of EVERY capture until this rule existed, because `probeFocus` was reachable from no CLI flag and no
     * Action input. Absent must therefore make no claim.
     */
    focusOrder?: string[];
    /**
     * F55 — "using script to remove focus when focus is received" (2.1.1, 2.4.7, 2.4.13, 3.2.1 together,
     * per W3C's own Failure listing). `checked: false` means the oracle could not run (`why` says why) and
     * `log: null` follows it — "cannot say", never "no findings". `checked: true` with an EMPTY array is a
     * real reading of zero: the log ran and genuinely recorded no focus events, which is not the same
     * absence as never having asked.
     *
     * **CAPTURE RECORDS, RULES DECIDE — this shape changed 2026-09-06, twice in one night.** A first
     * revision had `focusEventVerdict` (`capture-pure.mjs`) pre-digest the log into per-control
     * candidates; the CEO's own review went one step further and asked for the RAW SEQUENCE instead,
     * because a stored count or a stored candidate list is still a capture-time judgement about what
     * mattered, and this criterion's own history (see `addFocusEventFindings`'s comment) is two rounds of
     * that judgement being wrong. So `log` is the bounded event sequence itself
     * (`{type, id, name, atMs}[]`, capped by `FOCUS_EVENT_LOG_LIMIT` in `capture-pure.mjs`), and
     * `addFocusEventFindings` below does the ENTIRE analysis — pairing, orphan detection, destination —
     * from it. Nothing upstream of the rule decides anything about this criterion any more.
     *
     * Matched by `id`, not by name or position — two controls sharing a name must never be read as one
     * control losing the focus it just received.
     */
    focusEvents?: { asked?: boolean; checked: boolean; why?: string; events?: number; truncated?: boolean;
      log: { type: string; id: number; name: string; atMs: number }[] | null };
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
  /**
   * Form controls' `autocomplete` ATTRIBUTE, from the DOM — 1.3.5 Identify Input Purpose. Same reasoning as
   * `media` just above: `autocomplete` has no accessibility-tree equivalent, so NVDA cannot report it and
   * this is not screen-reader evidence.
   *
   * NOT YET POPULATED BY ANY CAPTURE. This field, `addUnidentifiedInputPurpose` and its corpus case
   * (`focus-script-blur-window`'s sibling in shape, `input-purpose-*` in case-matrix.mjs) are issue #79's
   * rule half, built and unit-tested against a hand-specified shape rather than against real evidence — the
   * same order 1.4.2's `media` census went in, and the same one `docs/backlog.md` records for a fact stated
   * twice: writing the rule first against a shape nothing produces yet is how `1.3.1:no-headings` shipped
   * `NEVER FIRED ANYWHERE` for a time before anyone noticed the census never reached it. Declaring that risk
   * here rather than discovering it later: a worker-side census reading this attribute (mirroring
   * `mediaCensus`, `packages/nvda-worker/src/browser-session.mjs`) is a SEPARATE, fleet-touching unit this
   * one's region deliberately excludes — worker source changes need `fleet:deploy`, which is not this
   * unit's to run. Absent means NOT CHECKED, exactly as `media`'s own comment states.
   */
  formInputs?: { tag: string; type: string | null; autocomplete: string | null }[];
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
//
// PINNED EQUAL to `FILENAME_GRAPHIC` (screenreader_features.py) by `vocabulary-parity.test.ts` — character
// for character, so the two must be edited together. Found diverged 2026-09-06 with no reason on either
// side (Python was missing `bmp` and the extensionless `IMG_1234` shape, and separately over-matched a
// bare extension word anywhere in the evidence); aligned after confirming 0 of 5,200 real evidenceUnits
// values classify differently either way, so the fix could not have changed what any shipped weight was
// fitted to.
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

/**
 * 3.3.3 Error Suggestion — the error IS announced, and names only the problem.
 *
 * A RULE rather than a head, and the reason is measured. A head was trained for this subtype and had
 * **recall 0.0 on its own training data** under both poolings, with false positives on conformant
 * records — see `known-gaps.md` §22. The distinction is one clause inside a long announcement, which a
 * document average dilutes and an instance max did not rescue.
 *
 * It does not need a head. This project's doctrine is that rules ASSERT what can be READ directly and the
 * scorer TRIAGES judgements, and "does the announced error contain an instruction?" is read directly —
 * the same basis on which `1.1.1:filename-alt` is rules-owned. The signal discriminated 44 captured pairs
 * with no errors while the head could not fit 15.
 *
 * THREE PRECONDITIONS, and each exists because its absence is a different criterion's finding:
 *
 *   - a submit must have HAPPENED. No activation means the probe never ran, and reading that as "no
 *     remedy" would make every capture without a form a 3.3.3 failure.
 *   - an error must have been ANNOUNCED. Silence is 3.3.1's finding, not this one, and asserting both
 *     from one page is how `errorVariant`'s first fixture taught the 3.3.2 head about validation
 *     messages.
 *   - the remedy is matched as an INSTRUCTION, never a sentiment. A vocabulary of "good words" is
 *     `vague_link_present` in a new costume; removing that feature took 2.4.4 from 27 false positives to
 *     0 precisely because it answered a different question with a wordlist.
 *
 * NO PUNCTUATION in the pattern. NVDA speaks "e.g." as "e dot g." and "DD/MM/YYYY" as "DD slash MM slash
 * YYYY", so an alternative leaning on a symbol can never match an announcement — it looks like coverage
 * and matches nothing. Measured; it cost a chain run.
 */
// PINNED EQUAL to `ERROR_WORD` (screenreader_features.py) by `vocabulary-parity.test.ts` — both ask the
// SAME narrow question, "did the announcement actually say an error", for the strict, scoring-facing use
// (this rule asserts; that feature feeds a head). `local-judge.ts`'s wider `ERROR_TEXT` is a DIFFERENT,
// deliberately loose question ("does the on-screen prompt merely look error-related") used only to decide
// whether 3.3.1 applies at all — see that constant's own comment. Do not merge the two kinds.
const ANNOUNCED_ERROR_TEXT = /invalid|\berror\b/i;
const REMEDY_INSTRUCTION =
  /\b(?:enter|use|choose|select|pick|include|must (?:be|start|contain)|for example|such as|format|as dd|at least|between \d)/i;

function addErrorWithoutRemedy(input: RuleInput, add: AddFinding): void {
  const changes = input.interaction?.formChanges ?? [];
  const submitted = changes.filter((change) => change.kind === "submit");
  if (!submitted.length) return;
  const spoken = [
    ...submitted.map((change) => String(change.after ?? "")),
    ...(input.interaction?.postSubmitFields ?? []).map((value) => String(value)),
  ].filter((text) => ANNOUNCED_ERROR_TEXT.test(text));
  if (!spoken.length) return;                                    // 3.3.1's finding, not this one
  if (spoken.some((text) => REMEDY_INSTRUCTION.test(text))) return;
  // `secondary`, NOT `conformance` — and this literal said `conformance` for a day after the decision to
  // downgrade it, because `act-rules.ts` was edited and this was not. 3.3.3 forbids withholding a
  // suggestion that is KNOWN, and only where doing so would not "jeopardize the security or purpose of the
  // content". This rule reads "the announced error carries no instruction", which is a different thing:
  // "Incorrect password" is REQUIRED behaviour and was being asserted as a conformance failure.
  add("3.3.3 Error Suggestion",
    "A validation error was announced but names only the problem, never how to correct it",
    spoken.join(" | "), "secondary");
}

/**
 * 3.2.1 On Focus and 3.2.2 On Input — a change of CONTEXT the user did not ask for.
 *
 * Rules rather than heads, on the same reasoning as 3.3.3: whether the page renamed itself between two
 * reads is READ directly, not judged. There is no wording to interpret and no threshold to calibrate — a
 * title either changed or it did not.
 *
 * ONE HELPER, TWO CRITERIA, because the evidence is identical in shape and only the channel differs.
 * `criterion-coverage.ts` says as much: 3.2.2 is "the same shape as 3.2.1, on change rather than focus".
 *
 * A `null` title means the probe found nothing to focus or type into, and comparing two nulls would make
 * every such page conformant on a question nobody asked. Both are required to be strings before anything
 * is claimed — the absence rule this file applies everywhere.
 */
function contextChanged(channel: { titleBefore?: string | null; titleAfter?: string | null; error?: string }
  | undefined): boolean {
  if (!channel || channel.error) return false;
  const { titleBefore, titleAfter } = channel;
  return typeof titleBefore === "string" && typeof titleAfter === "string" && titleBefore !== titleAfter;
}

function addContextChanges(input: RuleInput, add: AddFinding): void {
  const focus = input.interaction?.focusContext;
  if (contextChanged(focus)) {
    // `secondary` for the reason 3.3.3 above gives, and the same missed edit. The criterion's own note:
    // "A change of content is not always a change of context." This reads "two titles differ" and asserted
    // a change of CONTEXT, so a page appending a result count conformed and was accused.
    add("3.2.1 On Focus",
      "Focusing a control changed the page's title, so the user's context moved without them acting",
      `${focus?.control ?? "first control"}: ${focus?.titleBefore} -> ${focus?.titleAfter}`, "secondary");
  }
  const typed = input.interaction?.typedFeedback;
  if (contextChanged(typed)) {
    add("3.2.2 On Input",
      "Typing into a control changed the page's title, so the user's context moved on input alone",
      `${typed?.titleBefore} -> ${typed?.titleAfter}`, "secondary");
  }
}

/**
 * 1.4.13 Content on Hover or Focus — the DISMISSABLE bullet only, from `focusRevealVerdict`'s three
 * censuses and two focus reads. Content appeared on focus, focus never moved, and Escape (pressed twice —
 * NVDA eats the first) did not make it go away.
 *
 * DELIBERATELY DUPLICATED rather than imported from `case-matrix.mjs`'s `focusPanelUndismissable`, on the
 * same basis `contextChanged` above already is for 3.2.1/3.2.2's signal predicate: this package does not
 * depend on `packages/lab`, and the condition is two field reads — cheaper to state twice, in the two
 * languages the packages are, than to cross that boundary for.
 *
 * `revealed`/`dismissed` are tri-state (`true` / `false` / `null`), and only `revealed === true` with a
 * REAL boolean `dismissed` says anything: `null` on either means a census could not answer, which is
 * "cannot say", never "no". That is `focusRevealVerdict`'s own contract, restated rather than re-derived.
 */
function focusRevealUndismissable(
  reveal: { revealed?: boolean | null; focusHeld?: boolean; dismissed?: boolean | null } | undefined,
): boolean {
  if (!reveal || reveal.revealed !== true) return false;
  return reveal.focusHeld === true && reveal.dismissed === false;
}

function addFocusRevealFindings(input: RuleInput, add: AddFinding): void {
  const reveal = input.interaction?.focusReveal;
  if (!focusRevealUndismissable(reveal)) return;
  // `secondary`, not `conformance` — argued, not defaulted. Two of Dismissable's own exceptions are
  // unruled-out by this evidence: it does not fire "unless the additional content communicates an input
  // error or does not obscure or replace other content" (WCAG's own text, both clauses). Whether the
  // revealed content IS an input-error message, and whether it obscures anything, are questions this
  // census cannot answer — the second is pixels, the same reason PERSISTENT can never be asserted here.
  // So a positive here is strong evidence of the MECHANISM'S absence and weak evidence that the criterion
  // is unsatisfied, which is exactly what `secondary` is for.
  add("1.4.13 Content on Hover or Focus",
    "Content appeared on focus and was not dismissed by Escape, with focus held throughout — no "
      + "mechanism to dismiss it without moving focus was observed",
    `revealedBy ${JSON.stringify(reveal?.revealedBy ?? [])}`, "secondary");
}

/**
 * How fast a script's synchronous focus change happens — the ONE threshold `addFocusEventFindings` uses
 * twice: whether a completed `focusin`→`focusout` hold is suspiciously fast, and whether a landing counts
 * as the SAME script tick that caused a loss (a redirect) rather than the probe's own later Tab press (an
 * unrelated recovery). Measured twice on real pages at a 633ms floor (12.6x margin) and a 1,944ms mean
 * (38.9x margin) for the slowest side this threshold must stay under; no capture has yet recorded a real
 * script `blur()` to bound the fast side, so this remains a hypothesis with a wide margin, not a
 * calibrated value (`known-gaps.md` §39).
 */
const FOCUS_SCRIPT_WINDOW_MS = 50;

/** Did focus land on a DIFFERENT real control, on the same script tick that caused the loss at `lostId`? */
function focusLandedOnADifferentControl(
  lostId: number, lostAtMs: number, after: { type: string; id: number; atMs: number } | undefined,
): boolean {
  if (after?.type !== "focusin" || after.id === lostId) return false; // nothing next, or "landed" on itself
  return after.atMs - lostAtMs < FOCUS_SCRIPT_WINDOW_MS;
}

/**
 * 2.4.7 Focus Visible — Failure F55, "using script to remove focus when focus is received".
 *
 * `secondary`, not `conformance` — argued in `coverage.ts`, at `RULE_CRITERIA`'s definition, rather than
 * defaulted here. The observation is a TIMING/sequencing read over CDP, not a read of whether a focus
 * indicator was ever drawn; F55 is the reasoned conclusion from it (nothing can hold a visible indicator
 * if nothing holds focus), and that inference is exactly the gap `secondary` exists to mark. Also
 * unruled-out: the other listed failure, F78 (styling an indicator away), which this evidence says
 * nothing about either way — a clean report here is silent on F78, never a pass for 2.4.7 as a whole.
 *
 * THIS RULE DID NOT EXIST UNTIL 2026-09-06, and it went through two designs the same night before this
 * one, each refuted by a real capture:
 *
 * - The ORIGINAL capture-side verdict paired `focusin(X)`→`focusout(X)` within a synchronous window and
 *   called that F55 unconditionally. `keyboard-trap-modal-escape.good`, CONFORMANT, refuted it: its log
 *   holds two such pairs at 0ms — a modal correctly claiming focus for its first field, and the tab ring
 *   correctly wrapping — and BOTH landed on a different real control (id 1, "House number") within 0-1ms.
 *   F55's own text (w3.org/WAI/WCAG22/Techniques/failures/F55) is explicit that every example is a
 *   destination-less `.blur()` and the mechanism "removes focus from the content ENTIRELY" — redirecting
 *   focus to a real destination is not this failure, however fast.
 * - A SECOND capture-side revision added a destination check, but still only recognised COMPLETED pairs.
 *   `focus-removed-on-receipt-order.bad`, one of this criterion's own NINE POSITIVES, refuted that too:
 *   its real failure is an ORPHANED `focusout` — "Delivery instructions" appears in the log only as a
 *   focusout, twice, with no matching `focusin` ever recorded, because the script intercepts so fast the
 *   browser's own focus event never completes. A rule keyed on completed pairs cannot see this at all: it
 *   is not a pair that arrived late, it is one that never formed. Measured against the exported corpus,
 *   both designs together: 0 of 9 positives caught while firing on 10 conformant records.
 *
 * So the decision needs the FULL sequence, walked here rather than pre-digested at capture time (`log`'s
 * own field doc) — captures record, rules decide (ADR 0021). For every `focusout`:
 *
 * 1. Is it a COMPLETED receipt (the immediately preceding event is a `focusin` on the same id) or an
 *    ORPHANED one (anything else)? An orphaned focusout has no `heldMs` to measure and is reported as one
 *    regardless of what follows — the missing `focusin` IS the signal, per the worked example above.
 * 2. A completed receipt is only worth reporting if the hold was script-fast (`FOCUS_SCRIPT_WINDOW_MS`) —
 *    an ordinary Tab transition's `focusout(A)` is caused by the NEXT Tab press, measured at a
 *    633ms-to-1,944ms floor, two orders of magnitude slower.
 * 3. EITHER shape is cleared if focus landed on a different real control within the same script tick
 *    (`focusLandedOnADifferentControl`) — the trap/dialog-redirect case above. Landing on itself, landing
 *    too slowly (the probe's own later Tab press, an unrelated recovery), or nothing following at all are
 *    all still F55.
 *
 * THE PREDICATE MUST NOT MISREAD CONTAINING FOCUS AS RELOCATING IT — "focus trap" is two different
 * mechanisms and only one of them can ever trip this rule. RELOCATING traps (the synthetic modal above)
 * move focus programmatically on `focusin`, which is exactly the 0ms pair this rule reads. CONTAINING
 * traps (a real cookie banner's usual shape) hold focus by tab order and DOM position alone — nothing
 * moves focus on receipt, so no such pair exists and this rule is correctly silent on them already, not
 * silent by accident. Confirmed 2026-09-06 on three real pages whose consent dialogs are exactly this
 * shape, fetched at protocol 15 specifically to check: `design-system.service.gov.uk/components/details/`
 * (296 events), `.../components/radios/` (222 events), `check-for-flooding.service.gov.uk/river-and-sea-
 * levels` (54 events) — hundreds of real focus transitions between them, zero findings. Do not "fix" that
 * silence into firing; it is CONTAINING working as intended, not a gap.
 *
 * ANY 2.4.7 FINDING ON A REAL PAGE MUST BE READ INDIVIDUALLY AGAINST ITS STORED LOG before it is treated
 * as a false positive or absorbed into a baseline — a page that genuinely strips focus with no destination
 * is a real F55 whoever published it, and the baseline must not learn to ignore that any more than it must
 * learn to accuse a conformant redirect. The stored `log` (not a capture-time count) is what makes reading
 * one individually possible at all.
 *
 * `checked: false` means the oracle could not run — reported nowhere, per `focusEvents`' own contract:
 * "cannot say", never "no findings". Only a real `checked: true` reading is examined, and even then a
 * cleared or empty log is a real zero, not an absence.
 */
type FocusLogEvent = { type: string; id: number; name: string; atMs: number };

/**
 * The three things a `focusout` can mean, kept as a discriminated union rather than collapsed into
 * `string | null` — "not F55" and "cannot be asked" must never share one representation, and doing that
 * inside this very function is exactly the defect issue #62 exists to fix, one layer in from where it
 * was already fixed for the caller. `"unpairable"` and `"clear"` are BOTH silence to `addFocusEventFindings`
 * (neither adds a finding), and TypeScript's exhaustiveness is what stops that from re-collapsing them.
 */
type FocusLossVerdict =
  | { kind: "finding"; evidence: string }
  | { kind: "unpairable" }
  | { kind: "clear" };

/**
 * Is `log[i]` (already known to be a `focusout`) a genuine F55, unpairable, or genuinely clear?
 * Split out purely to keep `addFocusEventFindings`'s complexity under gate -- the decision itself is the
 * whole of that function's doc comment, unchanged by moving where the `if`s live.
 */
export function focusLossVerdict(log: FocusLogEvent[], i: number): FocusLossVerdict {
  const event = log[i];
  // AN ORPHAN AT INDEX 0 IS UNPAIRABLE, NOT EVIDENCE -- brought back 2026-09-06 (issue #62), by
  // MEASUREMENT rather than reasoned back into existence. The `i === 0` exception was deleted the same
  // day on the premise that `installFocusEventListenerBeforeFirstFocus` (`capture-core.mjs`) makes
  // `log[0]` always a real, listener-witnessed focusin -- true of a FRESH capture, and not yet true of
  // the captures already on disk: `rules:real-pages` produced 80 findings at exactly this position.
  //
  // Read individually rather than trusted from the count: the nhs.uk cookie-banner shape kept as a
  // regression fixture in `rules.test.ts` (`log[0]` a bare focusout, immediately followed by a real
  // focusin on the very next control WITHIN THE SAME MILLISECOND) is the identical signature the nine
  // genuine corpus positives show one index later, where a preceding `focusin` proves the listener really
  // was watching. At index 0 there is no preceding event to prove that either way -- "the page stripped
  // focus with nowhere to go" and "the listener started after this element already held it" produce the
  // same three fields (`type`, `id`, `atMs`), and no amount of looking at the log alone tells them apart.
  //
  // So this is UNPAIRABLE: neither a finding (the ambiguity is real, and asserting through it repeats the
  // 37-false-positive mistake §42 was written to fix) nor silently "clear" (the page is not thereby
  // vindicated -- `addFocusEventFindings` treats this identically to `"clear"` in that neither adds a
  // finding, and this type exists so the two can never again be merged into one bare `null` the way this
  // function's own prior revision did). Half 2 -- the listener recording `document.activeElement` as the
  // log's own first entry, so `i === 0` stops being a special position -- closes this from the capture
  // side and is explicitly NOT this function's fix; see the comment above `addFocusEventFindings`.
  //
  // ONE EXCEPTION, VERIFIED AGAINST TWO SEPARATE REAL MECHANISMS BEFORE BEING CARVED OUT: a focusout at
  // index 0 immediately followed by a focusin for the SAME id (`focus-event-order.test.ts`'s REVERSED
  // fixture) is decidable with no prior context at all. UI Events can dispatch a synchronous same-tick
  // `.blur()` from inside a `focus` handler BEFORE the browser's own `focusin` for that identical receipt
  // completes, so the pair describes one control's own out-of-order receipt-then-loss -- it does not
  // depend on whether the listener was already watching, unlike the different-id case just above, which
  // is `case-matrix.mjs`'s own `focus-removed-on-receipt-*` mechanism (an `onfocus` handler that calls
  // `.focus()` on a LATER field): verified against that family's real captured `order.bad` log, per its
  // own construction comment, which shows exactly an orphaned focusout for the skipped field followed
  // immediately by a real focusin on the NEXT field -- the identical shape a real page's ambiguous index-0
  // orphan produces, and the reason position (having prior context), not "what follows", is what actually
  // separates the two for a DIFFERENT id.
  if (i === 0) {
    const next = log[i + 1];
    const sameControlReversed = next?.type === "focusin" && next.id === event.id;
    if (!sameControlReversed) return { kind: "unpairable" };
  }
  const prior = log[i - 1];
  const completedReceipt = prior?.type === "focusin" && prior.id === event.id;
  const heldMs = completedReceipt ? event.atMs - prior.atMs : null;
  if (completedReceipt && heldMs !== null && heldMs >= FOCUS_SCRIPT_WINDOW_MS) return { kind: "clear" }; // an ordinary Tab transition
  // A redirect can only clear a COMPLETED receipt. An ORPHANED focusout is F55 regardless of what follows
  // -- the missing focusin is itself the signal, and the very next event after an orphaned loss is
  // routinely another real focusin (whatever the probe reaches next), which must NOT be read as this
  // control's own destination.
  if (completedReceipt && focusLandedOnADifferentControl(event.id, event.atMs, log[i + 1])) return { kind: "clear" };
  const holdPhrase = heldMs === null
    ? "focus was never fully received before it was removed"
    : `focus held ${heldMs}ms`;
  return { kind: "finding", evidence: `${event.name || "unnamed control"} (id ${event.id}): ${holdPhrase}` };
}

function addFocusEventFindings(input: RuleInput, add: AddFinding): void {
  const focusEvents = input.interaction?.focusEvents;
  if (!focusEvents?.checked) return;
  const log = focusEvents.log ?? [];
  for (let i = 0; i < log.length; i += 1) {
    if (log[i]?.type !== "focusout") continue;
    const verdict = focusLossVerdict(log, i);
    // "unpairable" and "clear" are both silence here, and the TYPE above is what keeps them distinguishable
    // to a reader and a test rather than merged into the same bare skip.
    if (verdict.kind !== "finding") continue;
    add("2.4.7 Focus Visible",
      "A control received focus and had it removed by script before a visible focus indicator could "
        + "have been shown to the user",
      verdict.evidence, "secondary");
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

  // AND 3.3.2 for an input — as a REFERRAL, never an assertion, corrected 2026-09-05.
  //
  // This said "an input the screen reader announces as a bare role has no label AT ALL", and asserted on
  // it. The Understanding page says 3.3.2 does NOT require labels or instructions to be marked up,
  // identified, or associated with their controls — that is 1.3.1's subject — and that a field can PASS
  // 3.3.2 while FAILING 1.3.1. So "no accessible name" is not "no label"; it is two cases this evidence
  // cannot separate:
  //
  //   no visible label and no instructions -> 3.3.2 really fails
  //   a visible label, not associated      -> 3.3.2 SATISFIED, 1.3.1 and 4.1.2 fail
  //
  // The corpus is the second case. `form-unlabelled.bad` is `<span>Recipient name</span><input>`, which is
  // text presented to the user identifying the control — WCAG's own definition of a label.
  //
  // Note the criterion is "labels OR INSTRUCTIONS" and instructions may sit anywhere on the page. A screen
  // reader HEARS that text; deciding a given paragraph is an instruction FOR a given field is the
  // judgement, and judgement is what `secondary` is for.
  //
  // 4.1.2 above keeps `conformance`. That clause is about the accessible NAME, which a bare role proves
  // absent — the finding is not weaker, it is correctly attributed.
  //
  // Why this matters beyond correctness: `3.3.2:unnamed-form-field` was declared rule-decided while the
  // rules reported ONLY 4.1.2, so nothing emitted a 3.3.2 finding and the trained head had to stay —
  // load-bearing in production and, briefly, exempt from the release gate. The head then produced eight
  // false accusations on conformant form pages. Emitting the criterion the rule already decides is what
  // lets the head go.
  if (isInput(entry)) {
    add("3.3.2 Labels or Instructions",
      "Input announced with a role but no accessible name. Whether a visible label or an instruction is "
        + "present elsewhere on the page cannot be decided from what the screen reader announces, and "
        + "3.3.2 is satisfied by either. Needs a human, or the DOM.",
      entry, "secondary");
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
 *
 * DELIBERATELY NOT THE SAME LIST AS `VAGUE_LINKS` (`screenreader_features.py`), and audit §9 asked
 * whether that was an oversight — it is not. That list answers 2.4.9 (Link Purpose, Link Only, AAA):
 * "is the text alone vague", which is why it happily includes "read more"/"learn more" and "details" —
 * words THIS list excludes on purpose because 2.4.4 lets context rescue them. `vague_link_lacks_context`
 * (features.py) computes the conjunction "vague alone AND unrescued by context" as one feature for the
 * 2.4.4 head; see that function's own header for the measured cost of ever treating "vague alone" as
 * sufficient on its own (`vague_link_present` fired on 22 of 44 conformant `component-index` pages).
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
/*
 * TWO OF THE CRITERION'S CLAUSES ARE OUT OF REACH HERE, and both are stated rather than left implicit --
 * added 2026-09-05 by the audit that found three rules asserting where their criterion permits.
 *
 * Verbatim: "If any audio ... plays automatically for MORE THAN 3 SECONDS, either a mechanism is available
 * to pause or stop the audio, OR a mechanism is available to control audio volume independently from the
 * overall system volume level."
 *
 *   THE 3-SECOND THRESHOLD. Duration is not an attribute; it is a property of the media file. A two-second
 *   notification chime conforms and this rule cannot tell it from a looping soundtrack.
 *
 *   THE VOLUME BRANCH. `controls` is checked below and is the pause/stop mechanism, but a page offering a
 *   CUSTOM volume slider and no native controls also conforms, and nothing here can recognise one.
 *
 * Both make this rule over-eager in a direction the mapping already accounts for: 1.4.2 is declared
 * `secondary` in `act-rules.ts`, so it reports `cantTell` and never accuses. That is what makes the two
 * gaps tolerable rather than defects -- and stating them is what stops somebody later reading the
 * `secondary` as timidity and "fixing" it.
 */
function addAutoplayingAudio(input: RuleInput, add: AddFinding): void {
  if (!input.media) return; // absent means not checked; only a probe's silence is a finding
  for (const element of input.media) {
    // Muted media makes no sound, so there is nothing to control. `controls` gives the native pause and
    // stop mechanism the criterion asks for -- one of its two alternatives; see the note above for the
    // other, which cannot be recognised from the DOM.
    if (!element.autoplay || element.muted || element.controls) continue;
    add("1.4.2 Audio Control",
      "Audio starts automatically with no visible control to pause or stop it, so it competes with the "
        + "screen reader's own speech",
      `<${element.tag} autoplay${element.loop ? " loop" : ""}> with no controls attribute`);
  }
}

/**
 * The normative `autocomplete` token vocabulary — HTML's "Autofill field name" table
 * (html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill-detail-tokens), which is what
 * WCAG 2.2's "Input Purposes for User Interface Components" section names by reference. Two categories,
 * because they take different optional qualifiers (below): most take an optional `shipping`/`billing`
 * prefix, and the CONTACT category (`tel*`, `email`, `impp`) additionally takes an optional contact-type
 * prefix (`home`/`work`/`mobile`/`fax`/`pager`) that the other category does not.
 */
const AUTOCOMPLETE_NORMAL_TOKENS = new Set([
  "name", "honorific-prefix", "given-name", "additional-name", "family-name", "honorific-suffix",
  "nickname", "organization-title", "username", "new-password", "current-password", "one-time-code",
  "organization", "street-address", "address-line1", "address-line2", "address-line3", "address-level4",
  "address-level3", "address-level2", "address-level1", "country", "country-name", "postal-code",
  "cc-name", "cc-given-name", "cc-additional-name", "cc-family-name", "cc-number", "cc-exp",
  "cc-exp-month", "cc-exp-year", "cc-csc", "cc-type", "transaction-currency", "transaction-amount",
  "language", "bday", "bday-day", "bday-month", "bday-year", "sex", "url", "photo",
]);
const AUTOCOMPLETE_CONTACT_TOKENS = new Set([
  "tel", "tel-country-code", "tel-national", "tel-area-code", "tel-local", "tel-local-prefix",
  "tel-local-suffix", "tel-extension", "email", "impp",
]);
const AUTOCOMPLETE_CONTACT_PREFIXES = new Set(["home", "work", "mobile", "fax", "pager"]);
const AUTOCOMPLETE_SHIPPING_PREFIXES = new Set(["shipping", "billing"]);

/**
 * Does this `autocomplete` value identify a real input purpose — a well-formed token from the list above,
 * in the qualifier order the HTML spec fixes (`[section-*] [shipping|billing] [contact-type] TOKEN
 * [webauthn]`) — per ACT rule 73f2c2's own expectation?
 *
 * DELIBERATELY NOT A FULL GRAMMAR. `section-*` and a trailing `webauthn` are stripped by POSITION alone
 * (leading/trailing) without validating `section-*`'s own suffix is non-empty, and a value with tokens out
 * of the fixed order (`"billing shipping"`, a contact-type prefix on a NON-contact token) is read the same
 * as one with an unknown token -- both correctly read "does not identify a purpose", which is this
 * function's only question. A caller wanting compliance-report-grade token-ordering detail should reach
 * for the ACT rule's own reference implementation instead.
 */
function isValidAutocompletePurpose(value: string): boolean {
  const tokens = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.at(-1) === "webauthn") tokens.pop();
  if (tokens.length === 0) return false;
  if (tokens[0]?.startsWith("section-")) tokens.shift();
  if (tokens.length && AUTOCOMPLETE_SHIPPING_PREFIXES.has(tokens[0]!)) tokens.shift();
  if (tokens.length > 1 && AUTOCOMPLETE_CONTACT_PREFIXES.has(tokens[0]!)) tokens.shift();
  if (tokens.length !== 1) return false;
  const token = tokens[0]!;
  return AUTOCOMPLETE_NORMAL_TOKENS.has(token) || AUTOCOMPLETE_CONTACT_TOKENS.has(token);
}

/**
 * 1.3.5 Identify Input Purpose — Failure F107, "incorrect autocomplete attribute values".
 *
 * `secondary`, not `conformance` -- ACT rule 73f2c2's own ASSUMPTIONS note is the reason: "Custom taxonomy
 * values may satisfy WCAG 1.3.5 even if this rule fails." A value outside the standard vocabulary is not
 * provably wrong the way a missing `alt` is; it is merely NOT the mechanism H98 names, and a nonstandard
 * taxonomy some assistive technology recognises is a real, if unlikely, second reading this project's own
 * rule against asserting through genuine ambiguity (`rules.ts`'s own catalogue of that mistake) argues
 * against overriding by default.
 *
 * ONLY THE F107 HALF, NOT THE WHOLE CRITERION -- named here rather than left implicit, matching 1.4.2's own
 * practice above. 1.3.5 requires the purpose to be programmatically determinable AT ALL, and H98's only
 * sufficient technique is a VALID `autocomplete` value -- so a personal-data field with NO `autocomplete`
 * attribute is arguably just as unsatisfied as one with a malformed value. This rule does not say so,
 * because doing so would need to decide WHICH fields "collect information about the user" independently of
 * any attribute the page already declares -- exactly the word-sense/vocabulary guessing this project has
 * paid for once already (`corpus:starvation`), and the fixed Input-Purposes list has no signal in a bare
 * `<input>`'s tag, type or label that reliably says "this one is a name field" without reading the words a
 * human wrote. Firing only when the page has ALREADY attempted to declare a purpose sidesteps that guess
 * entirely: every field this rule examines is one whose own markup asserts it is one of the listed
 * purposes, so the only question left is whether that assertion is spelled correctly.
 */
function addUnidentifiedInputPurpose(input: RuleInput, add: AddFinding): void {
  if (!input.formInputs) return; // absent means not checked; only a probe's silence is a finding
  for (const element of input.formInputs) {
    const value = element.autocomplete?.trim().toLowerCase();
    if (!value || value === "on" || value === "off") continue; // no purpose asserted; not this rule's claim
    if (isValidAutocompletePurpose(value)) continue;
    add("1.3.5 Identify Input Purpose",
      "A form field's `autocomplete` attribute does not identify a real input purpose, so a user agent or "
        + "assistive technology cannot fill it from the user's own stored data",
      `<${element.tag}${element.type ? ` type="${element.type}"` : ""} autocomplete="${element.autocomplete}">`);
  }
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
  // THE ARROW EXEMPTION IS LIFTED WHEN THE ARROWS WERE ACTUALLY PRESSED — capture-protocol 13, and the
  // paragraph above `SHARES_ONE_TAB_STOP` asked for exactly this: *"a capture cannot tell 'reachable by
  // arrow keys' from 'unreachable', because the probe presses only Tab ... Driving the arrows is what
  // would settle it."*
  //
  // `probeArrowNavigation` drives them. When it records that nothing moved -- no announcement AND focus
  // unchanged -- a composite widget's members are not reachable by arrows either, and the exemption is
  // protecting a page that has nothing left to reach them with. Without this the evidence exists and no
  // rule reads it, which is what `rules:gate` caught: "2.1.1 is rule-decided on 15 record(s) and caught
  // only 10", naming all five `radio-group-arrows-inert` variants.
  //
  // ABSENCE STILL EXEMPTS. A capture that never pressed an arrow cannot say the widget is unreachable, so
  // `arrowsProvedInert` is false and the members stay untrackable exactly as before. That is the same
  // asymmetry `escapeReleasedFocus` uses: the observation may only ever REMOVE a reason to abstain.
  const arrowsProvedInert = arrowKeysDidNotMove(input);
  const untrackable = new Set(announced
    .filter((c) => (SHARES_ONE_TAB_STOP.has(c.role) && !arrowsProvedInert)
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
  if (repeatedStructureContainers(input.transcript ?? []) > 1) return;
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
  addUnidentifiedInputPurpose(input, add);
  addKeyboardTrap(input, add);
  addStaleRouteTitle(input, add);
  addBrokenFocusOrder(input, add);
  addInertSkipLink(input, add);
  addKeyboardUnreachableControl(input, add);
  addErrorWithoutRemedy(input, add);
  addContextChanges(input, add);
  addFocusRevealFindings(input, add);
  addFocusEventFindings(input, add);

  return findings;
}
