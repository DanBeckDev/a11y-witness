/**
 * One grammar for what NVDA says, in one place.
 *
 * ## Why this exists
 *
 * Six defects in one week shared a single cause: there was no shared model of NVDA's utterance grammar, so
 * every consumer re-derived a fragment of it with its own regex, in three languages, and each encoded a
 * different incomplete guess.
 *
 *   - `role_name` anchored the role at the START, and read a minority of announcements.
 *   - `role_name` then ran to END OF LINE, so three links announced together became one name.
 *   - `ANNOUNCED_ROLE` had to learn that roles STACK as prefixes.
 *   - `LEADING_CONTAINERS` strips a container announced role-first and misses one announced NAME-first, so
 *     every GOV.UK Design System example — each inside a named iframe — reported a named control as unnamed.
 *   - `beginsWithRole` confused a landmark with a container, and reported three conformant W3C pages as
 *     4.1.2 failures.
 *   - Signal regexes broke whenever a container prefix appeared in front of the text they matched.
 *
 * ## The fact that explains all of them
 *
 * **The announcement order depends on how the caret got there.** NVDA's `getPropertiesSpeech` appends name,
 * then role, then states, as separate elements — but browse-mode arrow navigation reverses it for the
 * focused object, which nvaccess/nvda#11102 records as a known behaviour. Our two evidence channels navigate
 * differently, so they carry opposite orders. Measured over 300 corpus captures, with no overlap at all:
 *
 *     structure.*  (quick-nav sweeps)        name-first   884   role-first     0
 *     transcript   (arrow read-through)      name-first     0   role-first   880
 *
 * So a parser cannot infer the order from the text — and must not try. It is TOLD, because the caller knows
 * which sweep produced the string. That is what makes this deterministic rather than another heuristic.
 *
 * ## The grammar
 *
 *     announcement := outOf* container* object+
 *     container    := [name ","] containerRole ","     "Radios example, frame,"  |  "main landmark,"
 *     object       := name "," role [...]              sweep:      "Departure date, edit"
 *                   | role ["," level] "," name        transcript: "heading, level 1, Marina 022 schedule"
 *
 * Containers are always name-then-role, in both channels: the reversal applies to the focused object only.
 * A name is simply absent when there is none, which is why `"edit, ,"` means an UNNAMED edit and not a
 * parse failure — and that distinction is the whole of 4.1.2.
 *
 * ## What this deliberately is not
 *
 * Not built on NVDA's internal `SpeechSequence`, though an add-on could expose it. W3C's AT Driver — the
 * emerging standard for exactly this — defines `interaction.capturedOutput` as plain text, "without
 * speech-specific markup or annotations". Parsing the rendered string is where the ecosystem is going, and
 * a structured side-channel would cost a full recapture for evidence recoverable from what we already hold.
 */

/** Which navigation produced the string, and therefore which order its object is in. */
export type Channel = "sweep" | "transcript";

export type ParsedObject = {
  /** The accessible name. Empty string means NVDA announced none — which IS the 4.1.2 finding. */
  name: string;
  /** The control's own role, lower-cased. Empty when the phrase is prose rather than a control. */
  role: string;
  /** `checked`, `collapsed`, `current page`, `clickable`, `level 1` … in the order announced. */
  states: string[];
};

export type ParsedAnnouncement = {
  /** Enclosing context NVDA prefixed, outermost first. A landmark or a named iframe is context, not a role. */
  containers: { name: string; role: string }[];
  /** `out of table`, `out of list` … NVDA announcing that the caret LEFT something. */
  leaving: string[];
  /** Every object in the phrase. NVDA packs several into one line; 8.1% of real-page link lines carry two. */
  objects: ParsedObject[];
  /**
   * Tokens the grammar could not assign, kept rather than dropped.
   *
   * Silently discarding them cost six false 4.1.2 assertions on real search pages.
   * `"combo box, collapsed, Sort by: Newest"` parsed to a combo box with an EMPTY name — and the select is
   * properly labelled `<label for="order_by">Order results by</label>`, so the empty name was NVDA not
   * repeating it, and "Sort by: Newest" was the selected VALUE, thrown away. An empty name plus discarded
   * content reads exactly like an unnamed control and is not one.
   */
  trailing: string[];
  raw: string;
};

/**
 * Roles that CONTAIN other things. A leading one is context, never the control's own role.
 *
 * Separate from CONTROL_ROLES because the distinction decides whether a leading token may be stripped, and
 * getting it wrong is what produced the two false 4.1.2 accusations this module was written for.
 */
export const CONTAINER_ROLES = Object.freeze([
  "banner landmark", "complementary landmark", "content info landmark", "navigation landmark",
  "main landmark", "search landmark", "form landmark", "region landmark",
  "landmark", "region", "frame", "grouping", "group", "dialog", "tree view", "menu bar", "tab control",
  // "menu" CONTAINS its items, and it is also an ordinary page word: GOV.UK labels its navigation "Menu",
  // so `"Menu, navigation landmark, list, with 6 items, link, Details"` refused to parse while it was a
  // control role — the named-container branch rejects a name that looks like a control, and this name did.
  // Same collision as "clickable" and "text": a role vocabulary that matches real page wording.
  "menu",
  "list", "table", "form", "article", "banner", "navigation", "main", "blockquote",
]);

/** Roles a control is announced WITH. A phrase ending or beginning with one names a control. */
export const CONTROL_ROLES = Object.freeze([
  "button", "link", "graphic", "heading", "edit text", "edit", "checkbox", "radio button", "radio",
  "combo box", "list box", "slider", "spin button", "menu item", "tab", "separator",
  "progress bar", "status", "cell", "list item",
  // NOT "clickable": NVDA announces it as a STATE adornment, and listing it here made it win the role match
  // in "…, grouping, clickable, England, radio button" — so the radio's name was consumed as a prefix and a
  // properly named control reported as unnamed. The exact defect this module was written to remove.
  //
  // NOT "text", "row" or "column" either: they occur in ordinary prose and as table position adornments
  // ("row 2", "column 2, Stall"), and a role vocabulary that matches prose reports controls that do not
  // exist. Over-inclusion here is silent; a missing role at least shows up as an unparsed phrase.
]);

/**
 * States and adornments NVDA appends. Not part of the name, and not a role.
 *
 * `level N` is here rather than in the role because "heading, level 1, Marina" is ONE heading whose level is
 * an adornment — treating it as a role boundary split the name off every heading in the corpus.
 */
const STATE_PATTERNS: readonly RegExp[] = Object.freeze([
  /^level \d+$/i, /^with \d+ items?$/i, /^\d+ of \d+$/i, /^row \d+$/i, /^column \d+$/i,
  /^(?:not )?(?:checked|pressed|selected|expanded|collapsed)$/i,
  // `focused` was MISSING, and its absence was silent in the worst way: the parser stopped at it, so
  // "aquarium rules, button, focused, collapsed" yielded NO states at all and the `collapsed` after it was
  // lost. A rule comparing the state before and after activation would have compared two empty lists and
  // found them equal — reporting every disclosure as broken, or none, depending which way it read.
  //
  // Derived from the captures rather than guessed: these are the tokens that actually appear in
  // `interaction.stateChanges` and `formChanges` across the corpus — collapsed 219, focused 144,
  // invalid entry 125, blank 125, expanded 69.
  /^focused$/i,
  /^(?:current page|clickable|visited|read only|required|invalid entry|has auto complete|editable|multi line|blank|bullet|same page|has pop up|busy|unavailable)$/i,
]);

const LEAVING = /^out of\s+(.+)$/i;

/** Longest first, so "edit text" is not read as "edit" and "main landmark" is not read as "main". */
const byLengthDesc = (a: string, b: string): number => b.length - a.length;
const CONTAINERS_ORDERED = [...CONTAINER_ROLES].sort(byLengthDesc);
const CONTROLS_ORDERED = [...CONTROL_ROLES].sort(byLengthDesc);

/**
 * NVDA's OBJECT REPLACEMENT CHARACTER, which it speaks for an element with no text at all.
 *
 * It is the ABSENCE of a name written down, so a name made only of it is empty. Reading it as a name made
 * `"edit, ￼"` — the canonical unnamed control — parse as an edit NAMED "￼", and 4.1.2 stopped firing on the
 * exact evidence it exists for. See docs/ufffc-investigation.md for the other reason this character matters.
 */
const EMPTY_NAME_MARKER = /\uFFFC/g;

/**
 * Private Use Area codepoints — icon-font glyphs that leak into an accessible name.
 *
 * They are not text. An icon font maps a picture onto a codepoint with no assigned meaning, so a screen
 * reader has nothing to say for it and a comparison between two channels has nothing to match on.
 *
 * Measured 2026-08-24 on ico.org.uk, where the same button announced:
 *
 *     sweep   "content info landmark, Print this page, button"
 *     focus   "\uE604 Print this page, button, focused"
 *
 * `\s` does not match U+E604 and `trim()` does not remove it, so the two names differed and 2.1.1
 * reported "Print this page" as a control the keyboard cannot reach — on two ico pages.
 *
 * This is the U+FFFC lesson exactly, which `EMPTY_NAME_MARKER` above already carries: a non-text
 * character riding along in an announcement, invisible in a diff, and decisive in a comparison. The
 * ranges are the BMP Private Use Area and the two supplementary planes reserved for the same purpose.
 */
const ICON_FONT_GLYPH = /[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;

const cleanName = (parts: string[]): string =>
  parts.join(", ").replace(EMPTY_NAME_MARKER, "").replace(ICON_FONT_GLYPH, "")
    .replace(/\s*,\s*,\s*/g, ", ")
    .replace(/^[\s,]+|[\s,]+$/g, "").trim();

/**
 * Is this token written the way NVDA writes a ROLE, rather than the way an author writes a NAME?
 *
 * NVDA lower-cases roles and adornments — `banner landmark`, `table with 3 rows`, `list` — and passes a
 * name through as authored. So case separates `"Menu, button"` (a button named Menu) from
 * `"menu, list, link"` (a menu containing a list containing a link), which no amount of looking at
 * neighbouring tokens can do reliably.
 */
const isLowerCaseRole = (token: string): boolean => {
  const trimmed = token.trim();
  return trimmed.length > 0 && trimmed === trimmed.toLowerCase();
};

/** A container announced with no name of its own: the role word alone, as NVDA writes it. */
const isBareContainer = (token: string): boolean =>
  isLowerCaseRole(token) && containerAt(token) !== "";

const isState = (token: string): boolean => STATE_PATTERNS.some((pattern) => pattern.test(token.trim()));
const matches = (token: string, vocabulary: readonly string[]): string =>
  vocabulary.find((role) => token.trim().toLowerCase() === role) ?? "";

/**
 * A container token, which may carry its size adornment INSIDE it: NVDA writes both `"list, with 6 items,"`
 * and `"table with 3 rows,"` — comma in one, no comma in the other.
 *
 * Missing the second form made `"table with 3 rows, link"` parse as a link NAMED "table with 3 rows", so a
 * genuinely unnamed link inside a table stopped being reported. The regex this replaced already handled
 * both, and losing that on the way through is how a rewrite regresses.
 */
function containerAt(token: string): string {
  const exact = matches(token, CONTAINERS_ORDERED);
  if (exact) return exact;
  const inline = /^(.+?)\s+with\s+\d+\s+\w+$/i.exec(token.trim());
  return inline ? matches(inline[1], CONTAINERS_ORDERED) : "";
}

/**
 * Split on commas, keeping empty fields.
 *
 * The empty ones are load-bearing: `"edit, , button, Submit"` is an UNNAMED edit followed by a named button,
 * and dropping the empty token turns the unnamed control — the finding — into a parse artefact.
 */
function fields(raw: string): string[] {
  return raw.split(",").map((part) => part.trim());
}

/** Consume state adornments from the front, so the object parser meets a role where it expects one. */
function takeStates(tokens: string[]): string[] {
  const states: string[] = [];
  while (tokens.length && isState(tokens[0])) states.push(tokens.shift()!.trim().toLowerCase());
  return states;
}

/** Consume `out of X` markers from the front. */
function takeLeaving(tokens: string[]): string[] {
  const leaving: string[] = [];
  while (tokens.length) {
    const match = LEAVING.exec(tokens[0]);
    if (!match) break;
    leaving.push(match[1].trim().toLowerCase());
    tokens.shift();
  }
  return leaving;
}

/**
 * Consume container prefixes, which are name-then-role in BOTH channels.
 *
 * A container is recognised by its role token; the optional name is the field before it. Only consumed when
 * the role that follows is a CONTAINER — otherwise `"England, radio button"` would lose its name, which is
 * the opposite defect and a worse one, since it invents an unnamed control.
 */
function takeContainers(tokens: string[]): { name: string; role: string }[] {
  const containers: { name: string; role: string }[] = [];
  for (;;) {
    // A CONTAINER ROLE THAT IS ALSO A NAME. `"Menu, button, collapsed"` on financial-ombudsman.org.uk is a
    // button whose accessible name is "Menu" — but `menu` is a container role, so it was stripped as
    // context and the button reported as having no name at all. That is a 4.1.2 ASSERTION against a
    // correctly labelled control.
    //
    // The disambiguation is CASE. NVDA writes a role in lower case and a name as its author wrote it, so
    // a capitalised token that happens to collide with the role vocabulary is a name.
    //
    // Deciding it on what FOLLOWS instead was tried first and was wrong: it made a container token before
    // a control role always a name, which broke `"banner landmark, link, graphic, GOV dot UK"` and
    // `"table with 3 rows, link"` — both legitimately a container in front of an unnamed control, and
    // both already pinned by tests. Those tests caught it, which is what they are for.
    if (isBareContainer(tokens[0] ?? "")) {
      containers.push({ name: "", role: containerAt(tokens.shift() ?? "") });
      continue;
    }
    // NVDA INTERLEAVES A STATE BETWEEN CONTAINERS, and this loop used to stop at the first one.
    // Measured 2026-08-24 on gov.scot and mygov.scot, verbatim:
    //
    //     "main landmark, clickable, form, clickable, Continue, button"
    //
    // The loop consumed `main landmark`, met `clickable`, and returned — so `form` was never taken as a
    // container and the object parser read the whole tail as a name, giving "form Continue". That is the
    // container-prefix defect this module exists to prevent, arriving through a state token instead of a
    // role one, and it made 2.1.1 report `"form Continue"` as a keyboard-unreachable control on four
    // conformant government pages.
    //
    // Only stepped over when a bare container FOLLOWS immediately: a state before a control belongs to
    // that control, and consuming it here would strip states from the object that owns them.
    if (isState(tokens[0] ?? "") && containerAt(tokens[1] ?? "")) {
      tokens.shift();
      continue;
    }
    // A NAMED container: "Radios example, frame". Only two tokens ahead, never a longer scan, so a control
    // name that happens to precede an unrelated container is not swallowed.
    const role = containerAt(tokens[1] ?? "");
    if (role && tokens[0] && !isState(tokens[0]) && !matches(tokens[0], CONTROLS_ORDERED)) {
      containers.push({ name: tokens[0].trim(), role });
      tokens.splice(0, 2);
      continue;
    }
    return containers;
  }
}

/** `role, [level,] name` — the browse-mode reading order. */
function takeRoleFirst(tokens: string[]): ParsedObject | null {
  const role = matches(tokens[0] ?? "", CONTROLS_ORDERED);
  if (!role) return null;
  tokens.shift();
  const states: string[] = [];
  while (tokens.length && isState(tokens[0])) states.push(tokens.shift()!.trim().toLowerCase());
  const nameParts: string[] = [];
  while (tokens.length && !matches(tokens[0], CONTROLS_ORDERED) && !LEAVING.test(tokens[0])) {
    if (isState(tokens[0])) states.push(tokens.shift()!.trim().toLowerCase());
    else nameParts.push(tokens.shift()!);
  }
  return { name: cleanName(nameParts), role, states };
}

/** `name, role, [states]` — the quick-navigation reading order. */
function takeNameFirst(tokens: string[]): ParsedObject | null {
  const roleAt = tokens.findIndex((token) => matches(token, CONTROLS_ORDERED));
  if (roleAt === -1) return null;
  const nameParts = tokens.splice(0, roleAt).filter((token) => !isState(token));
  const role = matches(tokens.shift() ?? "", CONTROLS_ORDERED);
  const states: string[] = [];
  while (tokens.length && isState(tokens[0])) states.push(tokens.shift()!.trim().toLowerCase());
  return { name: cleanName(nameParts), role, states };
}

/**
 * Parse one announcement.
 *
 * `channel` is required and never inferred. The order is a property of how the caret moved, which the caller
 * knows and the text does not reliably reveal — guessing it is how six separate regexes each got it wrong.
 */
export function parseAnnouncement(raw: string, channel: Channel): ParsedAnnouncement {
  const tokens = fields(raw);
  const containers: { name: string; role: string }[] = [];
  const leaving: string[] = [];
  const objects: ParsedObject[] = [];
  const take = channel === "transcript" ? takeRoleFirst : takeNameFirst;

  // A loop, because NVDA packs several objects into one line — measured at 8.1% of real-page announcements
  // that mention a link, against 0% in the corpus, which is why a single-object parser looked correct here
  // and merged three links into one name out there.
  for (let guard = 0; guard < 12 && tokens.length; guard += 1) {
    const before = tokens.length;
    leaving.push(...takeLeaving(tokens));
    containers.push(...takeContainers(tokens));
    // Leading states, and they are common: "bullet, same page, link, Annual review 2019" begins with two.
    // Without this the object parser met "bullet" where it expected a role and returned nothing — and a
    // parser that returns nothing is indistinguishable from a page with no links, which is the failure this
    // module exists to end.
    const leadingStates = takeStates(tokens);
    const object = take(tokens);
    if (object) objects.push({ ...object, states: [...leadingStates, ...object.states] });
    if (tokens.length === before) break;
  }
  return {
    containers, leaving, objects: mergeNestedRoles(objects),
    trailing: tokens.filter((t) => t.length > 0), raw,
  };
}

/**
 * One element announced with TWO roles is one control, not two — and the second is not unnamed.
 *
 * NVDA announces `<button><img alt="Submit Search"></button>` as `"Submit Search, graphic, button"`: the
 * image's alt text, the image's role, then the role of the element containing it. The object loop read
 * that as `Submit Search|graphic` followed by a SECOND object with an empty name and the role `button` —
 * and an empty name IS the 4.1.2 finding, so a correctly labelled image button was reported as a control
 * with no accessible name.
 *
 * Measured 2026-08-25, and where it was measured is the point: four of W3C's own accessibility TUTORIAL
 * pages, plus lbhf.gov.uk, metoffice.gov.uk and financial-ombudsman.org.uk. Those tutorials are as close
 * to ground truth as this project can get, and the finding was CONFORMANCE-mapped — an assertion, not a
 * referral.
 *
 * Merged only when the previous object HAS a name. `"graphic, button"` with no name at all is a genuinely
 * unnamed image button and stays exactly one unnamed object, so the real 4.1.2 still fires — which is the
 * distinction this whole module exists to hold, and losing it would be the worse defect.
 */
function mergeNestedRoles(objects: ParsedObject[]): ParsedObject[] {
  const merged: ParsedObject[] = [];
  for (const object of objects) {
    const previous = merged[merged.length - 1];
    if (object.name === "" && previous && previous.name !== "") {
      previous.states.push(...object.states);
      continue;
    }
    merged.push(object);
  }
  return merged;
}

/**
 * The accessible name of the first object announced with `role`, or "" when it has none.
 *
 * The replacement for `link_name`/`graphic_name`. Empty means NVDA announced no name, which is evidence and
 * not an error — the distinction the whole of 4.1.2 rests on.
 */
export function nameOf(raw: string, role: string, channel: Channel): string {
  const wanted = role.trim().toLowerCase();
  const found = parseAnnouncement(raw, channel).objects.find((object) => object.role === wanted);
  return found ? found.name : "";
}

/** Does this phrase announce a control of `role` at all, named or not? */
export function announces(raw: string, role: string, channel: Channel): boolean {
  const wanted = role.trim().toLowerCase();
  return parseAnnouncement(raw, channel).objects.some((object) => object.role === wanted);
}

/**
 * Attach the parse to a capture, so a consumer that cannot run this code reads FIELDS instead of guessing.
 *
 * The featurizer is Python and computed `form_field_named`/`form_field_unnamed` with its own anchored
 * role-first regex over `structure.formFields` — a NAME-first channel. Measured on GOV.UK Design System
 * captures, `LEADING_ROLE` matched the word "Radio" at the start of
 *
 *     "Radio items with hint – Radios example, frame, How do you want to sign in?, grouping, …"
 *
 * which is the example's TITLE, not a role. So a role-token regex matched English prose and reported an
 * unnamed form field on a page where every field is named. No corpus page begins a heading with "Radio
 * items", which is why it could only ever be found on somebody else's site.
 *
 * Node always precedes Python in this pipeline — export before training, `local-judge` and the abstention
 * sweep before `score.py` — so Python never has to parse at all. That DELETES a copy rather than pinning two
 * equal, which is this repo's first-preference remedy and the reason the parser is not ported.
 *
 * Additive: it adds a field and changes none, so nothing about the existing evidence means anything
 * different. It does change what the featurizer computes FROM, so `FEATURE_SCHEMA_VERSION` moves with it.
 */
export function annotateCapture<T extends Record<string, unknown>>(capture: T): T {
  const structure = (capture.structure ?? {}) as Record<string, unknown>;
  const interaction = (capture.interaction ?? {}) as Record<string, unknown>;
  const strings = (value: unknown): string[] =>
    (Array.isArray(value) ? value : []).filter((v): v is string => typeof v === "string");

  const parse = (values: unknown, channel: Channel): ParsedAnnouncement[] =>
    strings(values).map((text) => parseAnnouncement(text, channel));

  return {
    ...capture,
    parsed: {
      // The channel per field is not a guess: quick-navigation sweeps announce name-first and the arrow
      // read-through announces role-first, measured at 884/0 and 0/880 with no overlap.
      transcript: parse(capture.transcript, "transcript"),
      formFields: parse(structure.formFields, "sweep"),
      links: parse(structure.links, "sweep"),
      graphics: parse(structure.graphics, "sweep"),
      headings: parse(structure.headings, "sweep"),
      tableCells: parse(structure.tableCells, "sweep"),
      controls: parse(interaction.controls, "sweep"),
    },
  };
}
