/**
 * Internals, exported on purpose and **with no semver guarantee**.
 *
 * They exist so a test can drive the REAL gate rather than a copy of it. This project already paid for the
 * alternative: recovery was once keyed on a regex over `error.message`, and the unit tests asserted on a
 * string that lived in the test file — so rewording the message broke production while the tests stayed
 * green. A test that cannot reach the real predicate is testing its own fixture.
 *
 * No promise is made about these names or their behaviour across minor versions. `docs/METHODOLOGY.md`
 * records that these guards were tuned against the eval cases, and a public promise on tuned thresholds
 * would freeze numbers this project fully intends to move (ADR 0004).
 */
export { hasEvidenceFor, evidenceFor, findingsFromScores, scoreCapture } from "./local-judge.js";
export { applyGate } from "./verify-gate.js";
