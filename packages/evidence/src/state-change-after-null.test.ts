/**
 * #1616: the disclosure probe records a FAILED re-read as `{ control, after: null, afterSource: "focus", error }`
 * (`capture-probes.mjs:2343`). The verifier's text of what the screen reader said must not turn that `null` into the
 * word "null".
 *
 * Driven through the published `captureMentionsTitle`. "null" is a significant title word (four letters,
 * `SIGNIFICANT_WORD_LENGTH`, and not a stopword), so a capture whose text contains the literal word matches a page
 * titled "null". Measured at `c57eb362`, before the fix: `true` with the errored entry, `false` without it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { captureMentionsTitle, type CapturedAnnouncements } from "./verify.js";

type StateChanges = NonNullable<CapturedAnnouncements["interaction"]>["stateChanges"];
const ERRORED = { control: "Delivery options, button, collapsed", after: null, afterSource: "focus", error: "reportFocus timed out after 6000ms" };
const capture = (stateChanges: StateChanges): CapturedAnnouncements =>
  ({ transcript: ["Checkout, heading, level 1"], interaction: { controls: [], stateChanges } }) as CapturedAnnouncements;

test("#1616 an errored state change never puts the word null into what the verifier heard", () => {
  assert.equal(captureMentionsTitle(capture([ERRORED]), "null"), false,
    "a page titled \"null\" matched: the verifier's text carries the literal word from a failed re-read");
});

test("#1616 CONTROL: the errored control's own name still counts, and a measured re-read still contributes its text", () => {
  assert.equal(captureMentionsTitle(capture([ERRORED]), "Delivery"), true, "the failed entry's control name was dropped too");
  assert.equal(captureMentionsTitle(capture([{ ...ERRORED, after: "Delivery options, button, expanded", error: undefined }]), "expanded"), true,
    "a measured re-read no longer reaches the verifier's text");
});
