"""An untrustworthy delta is not evidence of silence — and the asymmetry is the whole design.

`capture-core` attaches `baselineQuiet` to every `formChanges` entry with a stated reason: *"a consumer
deciding what this activation proves needs to know whether the measurement was sound. Carried on the
evidence rather than left in a log, because a log nothing reads is a comment."* Nothing read it, in the
same way nothing read `kind` until the same day.

It matters ASYMMETRICALLY. An unsettled baseline can credit a late phrase to the wrong activation, so an
entry whose `after` is empty may be empty because nobody waited — and "nothing was announced" IS the
finding for 3.3.1 and 4.1.3. That is the fixed-sleep defect, which inverted a finding rather than adding
noise: 1 in 20 captures of a correct page looked broken. A feature claiming PRESENCE fails the safe way
round, so it does not consult the field, and these tests pin that difference rather than leaving it to
whoever edits next.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

import screenreader_features as features  # noqa: E402

PARSED = {"transcript": [], "headings": [], "tableCells": [], "controls": [], "postSubmitFields": [],
          "formFields": [{"containers": [], "leaving": [], "objects": [
              {"name": "Email", "role": "edit", "states": []}]}]}

SOUND_SILENT = {"control": "Send, button", "kind": "submit", "after": "", "baselineQuiet": True}
UNSOUND_SILENT = {"control": "Send, button", "kind": "submit", "after": "", "baselineQuiet": False}
# The text must match ERROR_WORD, or this asserts nothing about `baselineQuiet` and everything about
# my choice of wording — which is how the first version of this test failed.
UNSOUND_SPOKE = {"control": "Send, button", "kind": "submit", "after": "Email address, invalid entry",
                 "baselineQuiet": False}
LEGACY_SILENT = {"control": "Send, button", "kind": "submit", "after": ""}  # pre-field capture


def value(changes, feature, post_submit=("Email, edit",)):
    record = {"input": {
        "transcript": ["Page, document"],
        "structure": {"headings": [], "formFields": ["Email, edit"], "tableCells": []},
        "interaction": {"controls": [], "stateChanges": [], "formChanges": list(changes),
                        "postSubmitFields": list(post_submit)},
        "evidenceUnits": [{"channel": "transcript", "text": "Page, document"}],
        "evidenceText": "Page, document", "parsed": PARSED,
    }}
    return features.structured_feature_values(record)[feature]


def test_a_soundly_measured_silence_is_the_finding():
    assert value([SOUND_SILENT], "validation_error_missing") == 1.0
    assert value([SOUND_SILENT], "form_change_empty") == 1.0


def test_an_unsoundly_measured_silence_is_NOT():
    # The inversion this prevents: an empty `after` that is empty because nobody waited.
    assert value([UNSOUND_SILENT], "validation_error_missing") == 0.0
    assert value([UNSOUND_SILENT], "form_change_empty") == 0.0


def test_the_two_are_DISTINGUISHED_and_the_guard_has_not_gone_deaf():
    assert value([SOUND_SILENT], "validation_error_missing") != value([UNSOUND_SILENT], "validation_error_missing")


def test_a_PRESENCE_claim_does_not_consult_it_and_that_is_deliberate():
    # An untrustworthy delta that DID show something is at worst noise, never a false accusation, so
    # filtering here would lose real evidence to guard against the harmless direction.
    assert value([UNSOUND_SPOKE], "form_change_nonempty") == 1.0
    assert value([UNSOUND_SPOKE], "validation_error_announced") == 1.0


def test_a_capture_predating_the_field_still_counts():
    # Absence read as a negative would make these features deaf on every pre-field capture — the exact
    # defect the whole revision is about, reintroduced by its own fix.
    assert value([LEGACY_SILENT], "validation_error_missing") == 1.0
    assert value([LEGACY_SILENT], "form_change_empty") == 1.0
