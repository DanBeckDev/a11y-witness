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

export interface CaptureRequest {
  url: string;
  /** The task the user was attempting, in their own words. */
  task: string;
  strategy?: NavigationStrategy;
}

/** Screen-reader-derived structural quick-navigation results. These are
 * announcements produced by NVDA's heading, landmark, and form-field commands,
 * not DOM queries. */
export interface CaptureStructure {
  headings: string[];
  landmarks: string[];
  formFields: string[];
}

/** Screen-reader-derived results of operating controls. Empty `after` strings
 * are meaningful: they record that activation produced no announcement. */
export interface CaptureInteraction {
  controls: string[];
  stateChanges: { control: string; after: string }[];
  formChanges: { control: string; after: string }[];
  postSubmitFields: string[];
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
