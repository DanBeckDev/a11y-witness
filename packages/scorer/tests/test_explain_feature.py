"""The three verdicts need OPPOSITE remedies, so the tool must not conflate them.

A feature that is 0 on every positive is definitional, or a probe that never ran, or a thin corpus. The
first is `IMPOSSIBLE_BY_DEFINITION`, the second is a capture change, the third is the only one ADR 0015's
corpus remedy applies to. A report that says "0 on all positives" and stops has sent the reader nowhere.

So these assert the tool SEPARATES its cases rather than that it runs — the anti-vacuity rule this repo
learned when a guard read a field that does not exist and passed against the corpus carrying 604 crashes.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

import explain_feature as ef  # noqa: E402

PARSED = {
    "transcript": [], "headings": [], "tableCells": [], "controls": [], "postSubmitFields": [],
    "formFields": [{"containers": [], "leaving": [], "objects": [
        {"name": "Email", "role": "edit", "states": []}]}],
}


def record(subtypes, form_changes, case="c"):
    return {
        "input": {
            "transcript": ["Page, document"],
            "structure": {"headings": [], "formFields": ["Email, edit"], "tableCells": []},
            "interaction": {"controls": [], "stateChanges": [], "formChanges": list(form_changes),
                            "postSubmitFields": []},
            "evidenceUnits": [{"channel": "transcript", "text": "Page, document"}],
            "evidenceText": "Page, document",
            "parsed": PARSED,
        },
        "target": {"label": "violation" if subtypes else "clean", "criteria": [], "subtypes": list(subtypes),
                   "unknownSubtypes": []},
        "provenance": {"caseId": case},
    }


SPOKE = [{"control": "Show, button", "kind": "disclosure", "after": "Showing 2 of 4"}]
SILENT = [{"control": "Show, button", "kind": "disclosure", "after": ""}]
SUB = "4.1.3:form-activation-silent"


def test_a_feature_some_positives_carry_is_not_a_veto(capsys):
    records = [record([SUB], SPOKE), record([SUB], SILENT)]
    assert ef.report(records, SUB, "form_change_nonempty", 3) == 0
    out = capsys.readouterr().out
    assert "Never 0 on a positive" not in out, "one positive reads 0, so that claim would be false"
    assert "reads 1      : 1" in out and "reads 0      : 1" in out


def test_constant_on_positives_while_others_carry_it_is_named_as_the_veto_shape(capsys):
    records = [record([SUB], SILENT), record([SUB], SILENT), record([], SPOKE)]
    assert ef.report(records, SUB, "form_change_nonempty", 3) == 0
    out = capsys.readouterr().out
    assert "CONSTANT 0 across every positive" in out
    assert "1 of 1 non-positive record(s) read 1" in out


def test_zero_everywhere_is_a_DIFFERENT_message_and_not_the_veto_one(capsys):
    # A feature no record carries predicts nothing and vetoes nothing. Reporting it as a free veto would
    # put an item on a work list nobody can complete — the harm IMPOSSIBLE_BY_DEFINITION exists to prevent.
    records = [record([SUB], SILENT), record([], SILENT)]
    assert ef.report(records, SUB, "form_change_nonempty", 3) == 0
    out = capsys.readouterr().out
    assert "0 everywhere, positives and negatives alike" in out
    assert "CONSTANT 0 across every positive" not in out


def test_it_prints_the_channels_and_not_only_a_count(capsys):
    # "A count is where an investigation stops." The unread fields are the point: `kind` and
    # `baselineQuiet` both travelled on every entry for weeks while nothing consulted them.
    records = [record([SUB], [{"control": "Show, button", "kind": "disclosure", "after": "",
                               "baselineQuiet": False}], case="filter-status-silent")]
    ef.report(records, SUB, "form_change_nonempty", 3)
    out = capsys.readouterr().out
    assert "filter-status-silent" in out
    assert "baselineQuiet" in out, "the fields the feature does NOT read are why this prints records"
    assert "formChanges" in out


def test_an_unknown_subtype_examines_nothing_and_says_so(capsys):
    assert ef.report([record([SUB], SPOKE)], "9.9.9:invented", "form_change_nonempty", 3) == 2
    assert "Nothing was examined" in capsys.readouterr().out


def test_an_unknown_feature_names_what_it_takes(capsys):
    assert ef.report([record([SUB], SPOKE)], SUB, "not_a_feature", 3) == 2
    assert "no such feature" in capsys.readouterr().out
