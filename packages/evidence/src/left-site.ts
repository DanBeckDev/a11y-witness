/**
 * WHERE THE EXAMINATION ENDED, when an activation took the browser off the page's site (#1363).
 *
 * Rehearsal 2 (#915) ran the documented page and task, `https://www.w3.org/WAI` with "Learn about web
 * accessibility". The form-field sweep's FIRST field was the W3C's embedded YouTube player, the task word
 * matched it, and activating it replaced the tab with youtube.com: the activation announced "Opening new
 * window", and the focus pass later read NVDA's own "youtube dot com, 1 of 1". Every probe after that ran on
 * Google's property -- the other 17 "form fields", the post-submit re-read, the link, graphic, list and frame
 * sweeps, the focus pass and the route-change probe -- and the report attributed all of it to w3.org,
 * including its one serious finding. The page's own census counts ONE form field.
 *
 * `ceo`'s ruling (#915, 5654603343): an activation that leaves the page's origin ENDS the examination.
 * Everything after it is NOT EXAMINED with the reason "left the site at <control>", and nothing observed
 * after it is attributed to the page.
 *
 * TWO SOURCES, ONE ANSWER. A capture made since #1363 RECORDS the fact as `interaction.leftSite`: the worker
 * reads the browser's URL after every activation and stops. A capture made before it cannot, so the fact is
 * DERIVED from what the screen reader said -- an activation whose own announcement is "Opening new window"
 * or "Opening new tab". Both rehearsal captures carry exactly that; none of the 31 real captures committed
 * as fixtures in this repository does (counted when this was written).
 */

import type { CaptureStructure } from "./index.js";

/** The steps a capture runs, and the evidence each one writes, in the worker's own order. */
export type ProbePhase = "sweep" | "focus" | "configuredForm" | "routeChange";

const PHASES: readonly ProbePhase[] = ["sweep", "focus", "configuredForm", "routeChange"];

/** Where the examination ended, and how this module knows. */
export interface LeftSite {
  /** The announced control whose activation left the site, as the capture recorded it. */
  control: string;
  /** The kind of activation (`taskButton`, `submit`, `route`, ...), when the capture says. */
  kind: string | null;
  /** The step the activation happened in. */
  phase: ProbePhase;
  /** The page under examination. */
  from: string;
  /** Where the browser went, when that is known. */
  to: string | null;
  /** RECORDED by the worker at capture time, or DERIVED from the announcements of an older capture. */
  source: "recorded" | "derived";
  /** The announcement that shows it, quoted from the capture. */
  evidence: string;
}

/**
 * The parts of a capture this module reads and cuts. Every field is named and optional -- no index
 * signature -- so the wire's own `CaptureResult` (and `cli.ts`'s `CaptureResponse`) is assignable to it.
 */
export interface SiteBoundCapture {
  url: string;
  structure?: Partial<CaptureStructure>;
  interaction?: {
    controls?: unknown[];
    stateChanges?: { control?: string }[];
    formChanges?: { control?: string; kind?: string; after?: string | null }[];
    postSubmitFields?: unknown[];
    postSubmitNames?: unknown[];
    navigatedOnSubmit?: unknown;
    focusOrder?: string[];
    focusContext?: unknown;
    focusReveal?: unknown;
    focusEvents?: unknown;
    dialogEscape?: unknown;
    arrowNavigation?: unknown;
    typedFeedback?: unknown;
    routeChange?: unknown;
    leftSite?: Partial<LeftSite>;
  };
  observed?: Record<string, { asked: boolean; why?: string }>;
  diagnostics?: unknown[];
}

type Fields = Record<string, unknown>;

/**
 * One step of the worker's probe sequence and the fields it writes, from `capture-probes.mjs`:
 * `sweepEveryStructuralType` (headings, landmarks, then form fields, which ACTIVATE controls as the sweep
 * walks them), `EXTRA_SWEEPS` (graphics, links, lists, frames), the table probe and the post-submit re-read,
 * then `probePasses`' focus pass, the configured form and `probeRouteChange`.
 */
interface Step {
  phase: ProbePhase;
  structure: readonly string[];
  interaction: readonly string[];
}

const SWEEP_STEPS: readonly Step[] = [
  { phase: "sweep", structure: ["headings", "landmarks"], interaction: [] },
  { phase: "sweep", structure: ["formFields"], interaction: ["controls", "formChanges", "stateChanges"] },
  {
    phase: "sweep",
    structure: ["graphics", "links", "lists", "frames", "tableCells"],
    interaction: ["navigatedOnSubmit", "postSubmitNames", "postSubmitFields"],
  },
];
const FOCUS_STEP: Step = {
  phase: "focus",
  structure: [],
  interaction: ["focusContext", "focusReveal", "focusOrder", "focusEvents", "dialogEscape", "arrowNavigation",
    "typedFeedback"],
};
const LATER_STEPS: readonly Step[] = [
  { phase: "configuredForm", structure: [], interaction: [] },
  { phase: "routeChange", structure: [], interaction: ["routeChange"] },
];

/** Chromium's own words for an activation that opened a window or tab. Matched on the activation's `after`. */
const NEW_WINDOW = /\bopening new (window|tab)\b/i;

/**
 * The browser's address bar as NVDA reads it, e.g. "Address and search bar, ... selected https: slash slash
 * www dot youtube dot com slash channel ...". Only the scheme and host are taken.
 */
const SPOKEN_ADDRESS = /\bAddress and search bar\b.*?\b(https?): slash slash ((?:[a-z0-9-]+ dot )+[a-z]{2,})\b/i;

/** Did this activation's announcement say a window or tab was opened? */
export function announcesANewWindow(after: string | null | undefined): boolean {
  return NEW_WINDOW.test(String(after ?? ""));
}

/** The reason every step after the excursion carries, in the ruling's words. */
export function leftSiteReason(left: Pick<LeftSite, "control">): string {
  return `left the site at "${left.control}"`;
}

/** Where the examination ended, or `null` when every activation stayed on the page's site. */
export function leftSite(capture: SiteBoundCapture): LeftSite | null {
  return recordedLeftSite(capture) ?? derivedLeftSite(capture);
}

function recordedLeftSite(capture: SiteBoundCapture): LeftSite | null {
  const recorded = capture.interaction?.leftSite;
  if (!recorded || typeof recorded.control !== "string" || !PHASES.includes(recorded.phase as ProbePhase)) {
    return null;
  }
  return {
    control: recorded.control,
    kind: recorded.kind ?? null,
    phase: recorded.phase as ProbePhase,
    from: recorded.from ?? capture.url,
    to: recorded.to ?? null,
    source: "recorded",
    evidence: recorded.evidence ?? "",
  };
}

/**
 * The older capture's answer. The route-change probe records its activation with `kind: "route"`; every
 * other activation in `formChanges` is the form-field sweep's own (a configured form is not distinguished
 * here, and is therefore attributed to the sweep, which ends the examination no later than it really ended).
 */
function derivedLeftSite(capture: SiteBoundCapture): LeftSite | null {
  const changes = capture.interaction?.formChanges ?? [];
  const change = changes.find((c) => announcesANewWindow(c.after));
  if (!change) return null;
  return {
    control: String(change.control ?? ""),
    kind: change.kind ?? null,
    phase: change.kind === "route" ? "routeChange" : "sweep",
    from: capture.url,
    to: spokenAddress(capture.interaction?.focusOrder ?? []),
    source: "derived",
    evidence: String(change.after),
  };
}

function spokenAddress(announcements: readonly string[]): string | null {
  for (const said of announcements) {
    const match = SPOKEN_ADDRESS.exec(said);
    if (match) return `${match[1].toLowerCase()}://${match[2].toLowerCase().replace(/ dot /g, ".")}`;
  }
  return null;
}

/** The worker's step order for this capture: sweep first unless its `probeOrder` mark says focus first. */
function stepsFor(capture: SiteBoundCapture): readonly Step[] {
  const mark = (capture.diagnostics ?? []).find(
    (m): m is { event: string; order?: string } => (m as { event?: unknown })?.event === "probeOrder");
  const focusFirst = typeof mark?.order === "string" && mark.order.startsWith("focus");
  return focusFirst ? [FOCUS_STEP, ...SWEEP_STEPS, ...LATER_STEPS] : [...SWEEP_STEPS, FOCUS_STEP, ...LATER_STEPS];
}

/** The index of the step the activation happened IN: the form-field step for the sweep. */
function stepOfActivation(steps: readonly Step[], phase: ProbePhase): number {
  if (phase === "sweep") return steps.findIndex((s) => s.structure.includes("formFields"));
  return steps.findIndex((s) => s.phase === phase);
}

/**
 * The capture as far as it was about the page: what ran before the excursion, and the activation itself.
 *
 * Every field written by a later step is removed, and named in `notExamined`. The form-field step is cut
 * INSIDE: fields up to and including the control that left, and activations up to and including that one
 * -- its own announcement ("Opening new window") is the page's behaviour. A route-change or focus-pass
 * excursion removes that whole step, because nothing in it is known to precede the activation.
 *
 * Pure: the input is not modified.
 */
export function withinTheSite<T extends SiteBoundCapture>(capture: T, left: LeftSite):
  { capture: T; notExamined: string[] } {
  const steps = stepsFor(capture);
  const at = stepOfActivation(steps, left.phase);
  const structure: Fields = { ...(capture.structure ?? {}) };
  const interaction: Fields = { ...(capture.interaction ?? {}) };
  const notExamined: string[] = [];
  const cutInside = left.phase === "sweep";
  if (cutInside) notExamined.push(...cutTheFormFieldStep(structure, interaction, left));
  for (const [i, step] of steps.entries()) {
    if (i < at || (i === at && cutInside)) continue;
    notExamined.push(...removeStep(step, structure, interaction));
  }
  const observed = { ...(capture.observed ?? {}) };
  const why = leftSiteReason(left);
  for (const channel of notExamined) observed[channel] = { asked: false, why };
  return { capture: { ...capture, structure, interaction, observed } as T, notExamined };
}

function cutTheFormFieldStep(structure: Fields, interaction: Fields, left: LeftSite): string[] {
  const fields = Array.isArray(structure.formFields) ? structure.formFields : [];
  const kept = fields.slice(0, fields.indexOf(left.control) + 1);
  const cut: string[] = kept.length < fields.length ? ["formFields"] : [];
  structure.formFields = kept;
  if (Array.isArray(interaction.controls)) interaction.controls = [...kept];
  if (Array.isArray(interaction.formChanges)) {
    const changes = interaction.formChanges as { control?: string; after?: string | null }[];
    const through = changes.findIndex((c) => c.control === left.control && announcesANewWindow(c.after));
    interaction.formChanges = changes.slice(0, through < 0 ? changes.length : through + 1);
  }
  if (Array.isArray(interaction.stateChanges)) {
    interaction.stateChanges = (interaction.stateChanges as { control?: string }[])
      .filter((s) => kept.includes(s.control));
  }
  return cut;
}

function removeStep(step: Step, structure: Fields, interaction: Fields): string[] {
  const removed: string[] = [];
  for (const key of step.structure) {
    if (key in structure) { delete structure[key]; removed.push(key); }
  }
  for (const key of step.interaction) {
    if (key in interaction) { delete interaction[key]; removed.push(key); }
  }
  return removed;
}
