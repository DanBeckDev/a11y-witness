/**
 * Cross-channel evidence: comparing what the SWEEP announces against what TAB visits and what the
 * TRANSCRIPT reads, and the small facts derived from each channel alone (a repeated stop, a closed cycle,
 * a sweep too short to prove absence).
 *
 * Split out of `rules.ts`, where this machinery sat interleaved with per-criterion rule bodies across
 * ~700 lines. `ChannelRelation`'s own comment states why it has to be ONE implementation rather than a
 * copy per rule: "a comparison shared by four rules is the broadest scope in this file and had the
 * loosest contract: none" — a guard fixed for 2.1.1 once silenced 2.1.2 the same day, because the two
 * criteria read the same comparison in opposite directions and nothing said so.
 *
 * The four rules that share this — `addKeyboardTrap` (2.1.2), `addKeyboardUnreachableControl` (2.1.1),
 * `addInertSkipLink` (2.4.1), `addBrokenFocusOrder` (2.4.3) — stay together in `rules.ts`, because their
 * own comments cross-reference EACH OTHER'S reasoning directly (which criterion owns a confined ring,
 * which direction a guard must read a comparison in). Only the shared machinery those comments describe
 * moves here; nothing here decides which criterion a finding belongs to.
 */
import type { RuleInput } from "./rules.js";
import { parseAnnouncement } from "@a11y-witness/evidence";


/**
 * How many times the LAST focus stop repeats consecutively at the end of the tab order.
 *
 * Separated because "focus stopped moving" is the whole signal and deserves a name. The capture probe
 * stops tabbing after two identical stops, so a trapped page's `focusOrder` ends in a short run rather
 * than filling to the cap.
 */
export function trailingRepeats(stops: string[]): number {
  if (stops.length < 2) return 0;
  const last = stops[stops.length - 1];
  let repeats = 0;
  for (let i = stops.length - 1; i >= 0 && stops[i] === last; i -= 1) repeats += 1;
  return repeats;
}

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
export function tabRingCoverage(stops: string[], input: RuleInput):
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
export function escapeReleasedFocus(input: RuleInput): boolean {
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

/**
 * Roles whose activation is a keyboard means of LEAVING — the test that separates a trap from a modal.
 *
 * Broad on purpose. Every role counted here makes the rule quieter, and a wrong 2.1.2 says a keyboard user
 * cannot use the page at all.
 */
const OFFERS_A_WAY_OUT = /\b(button|link|tab|menu item)\b/;

/** True when nothing in the ring can be activated — you can type, and Tab cycles. */
export function ringOffersNoWayOut(stops: string[]): boolean {
  return stops.every((stop) => parseAnnouncement(stop, "sweep").objects
    .every((object) => !OFFERS_A_WAY_OUT.test(object.role)));
}

/**
 * How many REPEATED-STRUCTURE containers the page announces. See `addBrokenFocusOrder` for why this
 * decides anything.
 *
 * COUNTS `section` AS WELL AS `form`, and Edge 152 is why. `w3c/html-aria#423` made the `form` role
 * conditional on an accessible name, so an unnamed `<form>` — which is every form in this corpus and most
 * on the web — now announces as "section". Measured on one unchanged page: `"form, name at example dot
 * com, edit"` under Edge 151 became `"section, …"` under 152.
 *
 * Counting only "form" would therefore return 0 on a page with three unnamed forms, the guard below would
 * stop firing, and 2.4.3 would go back to reporting a reordering built from two DIFFERENT forms on
 * `w3.org/WAI/tutorials/forms/validation/` — the exact false positive this function was written to stop,
 * reintroduced by a browser upgrade rather than by an edit.
 *
 * The cost is over-suppression: a page with several genuine `<section>` elements now suppresses 2.4.3 too,
 * so a real reordering there is missed. That is the direction this file fails in DELIBERATELY — the
 * comment above `addStaleRouteTitle` says so in as many words, "a MISSED finding rather than an invented
 * one" — and it is the right trade here, because the alternative is accusing one of W3C's own tutorials.
 *
 * The name changed with the meaning. It is no longer counting forms and calling it `formsAnnounced` would
 * be a comment that lies, which is the one kind this repo deletes.
 */
export function repeatedStructureContainers(transcript: readonly string[]): number {
  let containers = 0;
  for (const line of transcript) {
    for (const container of parseAnnouncement(String(line), "transcript").containers) {
      if (container.role === "form" || container.role === "section") containers += 1;
    }
  }
  return containers;
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
export function repeatedOnThePage(transcript: readonly string[]): Set<string> {
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
export function unambiguous(names: string[]): Set<string> {
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
export const SHARES_ONE_TAB_STOP = new Set([
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
export const NAME_CHANGES_WITH_STATE = new Set([
  "collapsed", "expanded", "pressed", "not pressed",
]);

/** Announced controls as name, role and states, so a rule can ask what KIND of control it is. */
export function controlsWithRoles(
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
export function tabOrderCanProveAbsence(tabbedNames: string[], input: RuleInput): boolean {
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

/**
 * Were arrows pressed inside a composite widget, and did NOTHING move?
 *
 * The twin of `arrowKeysAreInert` in `case-matrix.mjs`, which cannot be imported here — it runs under
 * plain `node` for the corpus generator, the same constraint `namesOf`/`comparableNames` has. Two copies,
 * pinned by test rather than trusted.
 *
 * Both halves are required and neither alone is sound. Silence on its own is the ambiguity this repo has
 * paid for repeatedly — a probe that gave up early and a widget that did not move are the same
 * observation. Focus alone is not enough either: NVDA re-announces the same control differently depending
 * on how the caret arrived ("T, o, w, n" then "Town, edit, focused, blank" on one real capture), so raw
 * inequality reads as movement where nothing moved.
 *
 * `false` for an absent observation, which is what keeps this safe: it may only ever remove a reason to
 * abstain, never create a finding on its own.
 */
export function arrowKeysDidNotMove(input: RuleInput): boolean {
  const observed = (input.interaction as { arrowNavigation?: unknown } | undefined)?.arrowNavigation;
  if (!observed || typeof observed !== "object") return false;
  const { announced, focusBefore, focusAfter } = observed as Record<string, unknown>;
  if (String(announced ?? "").trim() !== "") return false;
  const settle = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const before = settle(focusBefore);
  const after = settle(focusAfter);
  if (before === "" || after === "") return false;
  return after === before || after.startsWith(before);
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

export function controlsInReadingOrder(input: RuleInput): string[] {
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

export function comparableNames(entries: string[] | undefined, truncated?: string[]): string[] {
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
export function firstVisitEach(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => (seen.has(name) ? false : (seen.add(name), true)));
}
