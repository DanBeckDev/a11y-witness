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
 * src/spike/fixtures/nvda-w3c-*.json, 2026-06-29): published guides document an
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
  structure?: { formFields?: string[] };
  interaction?: { controls?: string[] };
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
  /\b(not checked|checked|not pressed|pressed|collapsed|expanded|not selected|selected|read only|required|invalid entry|out of list|out of region|clickable|level \d+)\b/gi;

// A spoken or written file name used as alt text: "IMG 4821", "photo dot jpg", "logo.png".
const FILENAME_RE = /\b(img[\s_]?\d+|\S+\s+dot\s+(jpe?g|png|gif|svg|webp|bmp)|\S+\.(jpe?g|png|gif|svg|webp|bmp))\b/i;

// NVDA spells out a missing alt: it announces "Unlabelled graphic".
const UNLABELLED_RE = /\bunlabell?ed\b/i;

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
function addUnnamedControls(entries: string[], requireMarker: boolean, add: AddFinding): void {
  for (const entry of entries) {
    if (!isControl(entry)) continue;
    const unnamed = requireMarker ? hasEmptyName(entry) : accessibleName(entry) === "";
    if (unnamed) add("4.1.2 Name, Role, Value", "Control announced with a role but no accessible name", entry);
  }
}

/** Apply the deterministic absence rules to a capture. Findings carry
 * confidence 1: an empty name is a fact, not a judgment. */
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
    if (UNLABELLED_RE.test(line)) {
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

  return findings;
}
