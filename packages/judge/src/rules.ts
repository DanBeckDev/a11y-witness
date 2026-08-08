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
import type { Finding } from "./judge.js";

/** The capture fields the rules inspect (a subset of JudgeInput; a full
 * JudgeInput is assignable to this). */
export interface RuleInput {
  transcript: string[];
  structure?: { formFields?: string[]; headings?: string[]; links?: string[]; graphics?: string[] };
  interaction?: { controls?: string[] };
  /**
   * What the PAGE exposes, from the accessibility tree, as an oracle only.
   *
   * Two rules below assert something is ABSENT, and absence is the one claim a sweep cannot make on its
   * own: quick navigation returns nothing both when a page has no headings and when this pipeline has
   * accidentally left NVDA in focus mode typing its own keys into the page — which it did, on 353
   * captures. So a rule about absence must corroborate with the tree, or it is guessing.
   */
  census?: { heading?: number; link?: number; graphic?: number; graphicUnnamed?: number };
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
const isControl = (entry: string): boolean =>
  /\b(button|edit|radio|checkbox|combo box|list box|menu button|link)\b/i.test(entry);

type AddFinding = (wcag: string, issue: string, evidence: string) => void;

/**
 * Flag controls announced with a role but no accessible name. In the transcript
 * (`requireMarker = true`) require the ￼ marker, because a labelled field's role
 * and name can wrap onto separate read-through lines, so a bare role token alone
 * is ambiguous. In the structural sweep (`requireMarker = false`) each entry is
 * ONE control's full announcement, never line-wrapped, so an empty name alone is
 * unambiguous — NVDA announces an unnamed button as just "button" (verified
 * against a real capture, 2026-06-29).
 */
/**
 * True when a sweep announcement BEGINS with its own role, which means it has no accessible name.
 *
 * NVDA puts the name first: a labelled select is "Passenger type, combo box, collapsed, Adult" and an
 * unlabelled one is "combo box, collapsed, Adult". Stripping roles and states from the second leaves
 * "Adult" — the selected VALUE — which `accessibleName` cannot tell from a name, so the rule read every
 * unlabelled select and textarea as named and missed them. Measured: 109 of 115 rule-owned records,
 * which `rules:gate` correctly calls a defect.
 *
 * Only sound for the structural sweep, where each entry is ONE control's complete announcement. In the
 * read-through a role and its name can wrap onto separate lines, so a leading role proves nothing —
 * which is why the marker is still required there.
 */
const CONTROL_ROLE_TOKENS = ROLE_TOKENS.filter((role) => !role.endsWith("landmark"));
const LEADING_LANDMARKS = /^(?:(?:navigation|main|banner|complementary|contentinfo|region|search)\s+landmark\s*,\s*)+/i;

function beginsWithRole(entry: string): boolean {
  // A leading LANDMARK is context, not the control's own role. NVDA prefixes the enclosing landmark, so
  // "main landmark, Web Accessibility Perspectives, region, Video, frame, clickable, Copy link, button"
  // is a NAMED button inside a landmark — and matching "main landmark" here reported three conformant
  // W3C pages as 4.1.2 failures, which is the worst error this tool can make.
  //
  // This is the same landmark-prefix trap as `heading_name` in screenreader_features.py, found twice in
  // one session in two layers. When NVDA prepends context to an announcement, every parser of that
  // announcement has to strip it.
  const start = entry.trim().toLowerCase().replace(LEADING_LANDMARKS, "");
  return CONTROL_ROLE_TOKENS.some((role) => start.startsWith(role));
}

function addUnnamedControls(entries: string[], requireMarker: boolean, add: AddFinding): void {
  for (const entry of entries) {
    if (!isControl(entry)) continue;
    const unnamed = requireMarker
      ? hasEmptyName(entry)
      : accessibleName(entry) === "" || beginsWithRole(entry);
    if (unnamed) add("4.1.2 Name, Role, Value", "Control announced with a role but no accessible name", entry);
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

export function ruleFindings(input: RuleInput): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const add = (wcag: string, issue: string, evidence: string): void => {
    const key = `${wcag}|${evidence}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ issue, wcag, severity: "serious", evidence, confidence: 1 });
  };

  // 1.1.1 — images with no text alternative: announced "unlabelled", an empty
  // name, or a file name used as the alt text.
  for (const line of input.transcript) {
    if (!isImage(line)) continue;
    if (UNLABELLED_RE.test(line) || NO_DESCRIPTION_HINT_RE.test(line)) {
      add("1.1.1 Non-text Content", "Image announced as unlabelled (no text alternative)", line);
    } else if (hasEmptyName(line)) {
      add("1.1.1 Non-text Content", "Image announced with no text alternative", line);
    } else if (FILENAME_RE.test(accessibleName(line))) {
      add("1.1.1 Non-text Content", "Image alternative text is a file name, not a description", line);
    }
  }

  // 4.1.2 — controls announced with a role but no accessible name. Transcript
  // path requires the ￼ marker; the structural-sweep path does not (see
  // addUnnamedControls).
  addUnnamedControls(input.transcript, true, add);
  addUnnamedControls([...(input.structure?.formFields ?? []), ...(input.interaction?.controls ?? [])], false, add);

  // 2.4.4 and 1.3.1 — both about what a screen reader user CANNOT do: tell two links apart, or skim.
  // Neither is reported by axe, which is the point of having them here.
  addVagueLinks([...input.transcript, ...(input.structure?.links ?? [])], add);
  addMissingHeadings(input, add);
  addUnnamedGraphics(input, add);

  return findings;
}
