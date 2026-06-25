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

/**
 * What a screen reader announced, plus the context the judge needs. This shape
 * is a superset of the judge's input, so a CaptureResult can be judged directly
 * (see src/spike/judge.ts, JudgeInput).
 */
export interface CaptureResult {
  /** Which screen reader produced this, e.g. "NVDA", "VoiceOver", "Orca". */
  screenReader: string;
  url: string;
  task: string;
  /** Ordered log of what the screen reader announced, plus salient events. */
  transcript: string[];
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
