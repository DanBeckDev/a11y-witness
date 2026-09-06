/**
 * The capture backend interface.
 *
 * A capture backend drives ONE real screen reader through real navigation and
 * returns what it announced. Backends are operating-system-bound (NVDA on
 * Windows, VoiceOver on macOS, Orca on Linux) and run as network services, so
 * the portable core can talk to any of them the same way. The design rationale
 * is in docs/adr/0001-capture-architecture.md.
 */

/** A navigation strategy hint. Backends pick a sensible default if omitted. */
export type NavigationStrategy =
  | "read-through" // browse-mode read from the top, the way a user first explores
  | "by-heading" // jump heading to heading
  | "by-landmark" // jump region to region
  | "forms"; // move through form fields and controls

/**
 * ONE declared form state to submit during the capture (ADR 0024), with the schema already checked by the
 * caller. One per capture and never several: an error submission leaves a dirty form and an error banner,
 * and a success submission may navigate away, so a second state cannot start from the first — the host
 * issues a capture per state rather than the worker looping.
 */
export interface CaptureFormState {
  state?: string;
  submit: string;
  fields: { field: string; within?: string; nth?: number; value?: string; choose?: string; check?: boolean }[];
}

export interface CaptureRequest {
  url: string;
  /** The task the user was attempting, in their own words. */
  task: string;
  strategy?: NavigationStrategy;

  /**
   * The fields below are the NVDA worker's own `POST /capture` wire body, not a cross-backend abstraction
   * — this package has exactly one real backend today, and `CaptureResult`'s `environment` already
   * documents that backend's specifics the same way. Declared here because nothing else does: until
   * 2026-09-05 (architecture-audit.md §5, item 1) this interface named `url, task, strategy?` while the
   * worker accepted 20 fields, so a consumer typing against `@a11y-witness/evidence` could not have known
   * a single probe flag, `formState`, `captureId` or `async` existed.
   *
   * A future VoiceOver or Orca backend is free to ignore every field below; they are all optional for
   * exactly that reason, the same way `strategy` already was.
   */

  /** The read-through's step budget; unset means the worker's own default. */
  steps?: number;
  /**
   * A navigation-instrumentation detail, NOT the `strategy` hint above — `"object"` or `"line"`, read by
   * `capture-core.mjs` alone. Named separately because the two are unrelated despite the similar name:
   * `strategy` is an abstract cross-backend hint this package declared and nothing on the wire implements,
   * while `nav` is a real, narrow NVDA-worker option.
   */
  nav?: "object" | "line";

  /** Ten opt-in probes, each paying for evidence only when asked — `PROBE_FLAGS` in
   *  `@a11y-witness/nvda-worker/capture-pure` is the worker's own copy of this exact list. */
  probeForms?: boolean;
  probeFocus?: boolean;
  probeTables?: boolean;
  probeNavigation?: boolean;
  probeElementsList?: boolean;
  probeArrows?: boolean;
  probeTyping?: boolean;
  probeFocusContext?: boolean;
  probeDialog?: boolean;
  probeFocusReveal?: boolean;

  formState?: CaptureFormState;

  /**
   * Which order the two position-dependent probes run in — a NAME, never a caller-supplied list. Absent
   * means the order that has always run, so no cached capture is affected by adding this field.
   */
  probeOrder?: "focus-first";

  /** Edge stays alive between captures unless overridden per request (see `A11Y_REUSE_BROWSER`). */
  reuseBrowser?: boolean;
  /** Per-request browser choice, e.g. `"chrome"` — evidence, not configuration (CLAUDE.md). */
  browser?: string;
  /** Per-request override of the fleet's NVDA-reuse default. */
  reuseScreenReader?: boolean;

  /**
   * Client-minted, so it can be asked about again after a lost response — the id has to come from the
   * caller, since a worker-minted one would be returned in the very response that went missing.
   */
  captureId?: string;
  /** `true` returns 202 `{captureId}` at once and delivers the result to the store; requires `captureId`. */
  async?: boolean;
}

/** Screen-reader-derived structural quick-navigation results. These are
 * announcements produced by NVDA's heading, landmark, and form-field commands,
 * not DOM queries. */
export interface CaptureStructure {
  headings: string[];
  landmarks: string[];
  formFields: string[];
  /**
   * The other four sweeps, all of which a real capture carries and none of which this type declared until
   * 2026-08-29.
   *
   * `@a11y-witness/evidence`'s `.` subpath IS the published wire description, so a consumer typing against
   * it would have concluded a capture exposes no links, graphics, lists or table cells. Verified against a
   * live protocol-7 capture, whose `structure` keys are exactly the seven below.
   *
   * OPTIONAL, which is both backward-compatible and true: an older capture predating a sweep carries none,
   * and absence there means "this capture has no such field", never "the page has none of them" — the
   * distinction `sweepCompleteness` exists to make.
   */
  links?: string[];
  graphics?: string[];
  lists?: string[];
  tableCells?: string[];
  /**
   * The iframe sweep, capture-protocol 11 — optional for the same reason as the four above, and here the
   * reason is live rather than historical: every capture taken before protocol 11 carries no `frames`,
   * and absence means "this capture did not sweep for frames", never "the page has none".
   *
   * `@a11y-witness/evidence`'s `.` subpath IS the published wire description, so a consumer typing
   * against it would otherwise conclude a capture cannot expose frames at all — which is what happened to
   * links, graphics, lists and table cells until 2026-08-29.
   */
  frames?: string[];
}

/** Screen-reader-derived results of operating controls. Empty `after` strings
 * are meaningful: they record that activation produced no announcement. */
export interface CaptureInteraction {
  controls: string[];
  stateChanges: { control: string; after: string }[];
  formChanges: { control: string; after: string }[];
  postSubmitFields: string[];
  /**
   * What each Tab press announced, in order — present when `probeFocus` was asked for.
   *
   * Optional because it is opt-in over the wire, and its ABSENCE is load-bearing: a page nobody tabbed and
   * a page with no tab stops are different facts, and 2.1.1, 2.1.2 and 2.4.3 all decline rather than guess
   * when it is missing.
   */
  focusOrder?: string[];
  /**
   * What the screen reader said the page was called, and what its first heading was, before and after
   * activating a navigation control (`probeNavigation`) — 2.4.1's inert-skip-link and 2.4.2's
   * route-changed-but-title-did-not failures. Absent unless the probe was asked for; absence must make no
   * claim, because a page nobody probed and a page that navigated silently are different facts.
   *
   * Added 2026-09-05 (architecture-audit.md §5, item 2): this evidence has existed on the wire since
   * `probeNavigation` shipped, and this type described a capture as though it did not.
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
  /**
   * Set once `probeFormSubmit` runs — `probeForms`'s own oracle for the difference between "the form
   * failed silently" and "the form worked and moved on", which look identical to a probe that only asks
   * whether anything was announced afterwards. `checked: false` means `currentPageUrl()` returned falsy
   * on at least one side (we could not ask), a DIFFERENT fact from `navigated: false` (we asked, and it
   * stayed on the same document) — collapsing those two into one absence is exactly what let
   * `w3.org/.../survey.html`'s submit navigate away with this field absent anyway. Absence of the whole
   * field now means only that this probe never ran. `submitNavigatedTheDocument` (verify.ts) still reads
   * the OLD `{ from, to }`-present-only-when-navigated shape correctly, for captures on disk before this.
   */
  navigatedOnSubmit?: { checked: boolean; navigated?: boolean; from?: string; to?: string };
  /**
   * What the page's accessibility tree shows AFTER a form submit, by name only, never counts — a
   * diagnostic-grade oracle for 3.3.1/4.1.3, not model-visible evidence (`docs/local-model.md` bars the
   * accessibility tree as a model feature). Present only alongside `postSubmitFields`, from the same probe.
   */
  postSubmitNames?: string[];
}

/** What a screen reader announced, plus capture metadata. `task` is request
 * metadata for task-completion probing; it is not part of the accessibility
 * model's evidence boundary. */
export interface CaptureResult {
  /** Which screen reader produced this, e.g. "NVDA", "VoiceOver", "Orca". */
  screenReader: string;
  url: string;
  task?: string;
  /** Ordered log of what the screen reader announced, plus salient events. */
  transcript: string[];
  /** Optional structural navigation output produced by the screen reader. */
  structure?: CaptureStructure;
  /** Optional control-operation output produced by the screen reader. */
  interaction?: CaptureInteraction;
  /** Capture timestamp and structured worker diagnostics, when available. */
  capturedAt?: string;
  diagnostics?: unknown[];
  /** Backend metadata: tool/SR versions, strategy used, timings, etc. */
  meta?: Record<string, unknown>;
  /**
   * Media elements the PAGE declares, from the DOM rather than the accessibility tree — `autoplay` and
   * `muted` are attributes, not accessibility properties, so no screen reader can report them. `null`
   * means the probe did not run, which is NOT the same as an empty array (the page declares no media);
   * a rule reading this makes no claim on `null`.
   *
   * Added 2026-09-05 (architecture-audit.md §5, item 2): on the wire since 1.4.2's rule shipped, and this
   * type described a capture as though the field did not exist.
   */
  media?: { tag: string; autoplay: boolean; muted: boolean; controls: boolean; loop: boolean }[] | null;
  /**
   * What this capture ASKED about each optional channel, beside what it heard — "the probe is opt-in and
   * this case did not request it" and "the page had no control to activate" are different facts, and a
   * consumer that only sees an empty array cannot tell them apart. Keyed by channel name.
   */
  observed?: Record<string, {
    asked: boolean;
    complete?: boolean;
    why?: string;
    activated?: number;
    stop?: { prev: string; next: string };
  }>;
  /**
   * The worker's own runtime, reported alongside every result — screen reader and browser versions, the
   * settings digest, OS/architecture, the deployed code and protocol versions, and the provisioning
   * revision. Every field here is a capture-cache-key input; two captures whose `environment`s differ must
   * never be treated as interchangeable evidence.
   *
   * Added 2026-09-05 (architecture-audit.md §5, item 1/2): server.mjs has appended this to every response
   * since the fleet existed, and cli.ts cast around its absence from this type rather than the type
   * describing what actually arrives.
   */
  environment?: {
    measuredAt: string;
    screenReader: string;
    screenReaderVersion: string;
    browser: string;
    browserVersion: string;
    guidepupVersion: string;
    screenReaderSettings: string;
    nodeVersion: string;
    windowsVersion: string;
    architecture: string;
    workerCode: string;
    captureProtocol: number;
    provisionRevision: string;
  };
}

/**
 * Implemented in-process for local backends and over HTTP for remote workers
 * (POST /capture { url, task } -> CaptureResult). The pipeline depends only on
 * this interface, never on a specific screen reader or transport.
 */
export interface CaptureBackend {
  /** Stable identifier, e.g. "nvda-windows", "voiceover-macos", "orca-linux". */
  readonly id: string;
  capture(request: CaptureRequest): Promise<CaptureResult>;
}

/**
 * The grammar of what NVDA says.
 *
 * Lives here, not in `judge` or `scorer`, because BOTH interpret announcements and this package is what they
 * share. It was seven partial copies across three languages until 2026-08-24; one of them is the whole point.
 */
export {
  parseAnnouncement, nameOf, announces, annotateCapture, CONTAINER_ROLES, CONTROL_ROLES,
} from "./announcement.js";
export type { Channel, ParsedAnnouncement, ParsedObject } from "./announcement.js";

/** Whether the capture examined enough of a channel to support a finding on it. */
