"""A probe that ERRORED is not a state change, and the two consumers must agree that it isn't.

`capture-core` stores a failed disclosure probe as `{control, after: null, error}` rather than dropping
it, under a comment that states why: *"a failed measurement is not silence, and must never be recorded as
one"* — written after 1 in 20 captures of a CORRECTLY implemented page recorded nothing and so became
indistinguishable from a broken one. An empty `stateChanges` is precisely the signature of the failing
variant, so losing the entry does not add noise, it INVERTS the finding.

`state_changed` and `state_unchanged` honoured that by requiring a truthy `after`. Two consumers did not:

  * `state_change_present` was `bool(state_changes)`, so a capture whose only interaction THREW reported
    that a state change was present;
  * `applicability.py` gated `4.1.2:state-change-silent` on the same unfiltered list, so the subtype was
    scored on a page nobody successfully interacted with — the inverse of that module's own rule.

The filter is written twice, because `applicability.py` deliberately imports nothing but `typing` and
pulling the feature pipeline into it to share one comprehension would end that. Forced duplication is
pinned equal by a test rather than trusted, which is the third of this repo's three remedies for a fact
stated twice. This is that test, and it drives BOTH.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

import applicability  # noqa: E402
import screenreader_features as features  # noqa: E402

ERRORED = {"control": "Show details, button, collapsed", "after": None, "error": "reportFocus timed out"}
REAL = {"control": "Show details, button, collapsed", "after": "Show details, button, expanded"}
#: A silent-but-successful probe: it ran, the control did not change, and THAT is 4.1.2's finding.
SILENT = {"control": "Show details, button, collapsed", "after": "Show details, button, collapsed"}

applicable = applicability.SUBTYPE_REQUIRES["4.1.2:state-change-silent"]


def record(changes):
    return {"input": {"interaction": {"stateChanges": list(changes)}}}


def test_the_feature_does_not_count_an_errored_probe():
    assert features.measured_state_changes([ERRORED]) == []
    assert len(features.measured_state_changes([REAL, ERRORED])) == 1


def test_the_precondition_does_not_admit_an_errored_probe():
    assert applicable(record([ERRORED])) is False
    assert applicable(record([REAL])) is True


def test_a_silent_probe_still_counts_and_that_is_the_whole_point():
    # The distinction that matters: a probe that RAN and heard no change is 4.1.2's actual finding, and
    # filtering it out would make the fix deafer than the defect. Only `error` is excluded.
    assert len(features.measured_state_changes([SILENT])) == 1
    assert applicable(record([SILENT])) is True


def test_the_two_filters_agree_on_every_shape():
    # The pinning. If either side changes its mind about what counts, these disagree and this fails.
    for changes in ([], [ERRORED], [REAL], [SILENT], [ERRORED, ERRORED], [ERRORED, REAL], [SILENT, ERRORED]):
        assert bool(features.measured_state_changes(changes)) == applicable(record(changes)), changes
