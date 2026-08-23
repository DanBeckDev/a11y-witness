"""An acceptance failure must name the cases that failed, not just count them.

Measured 2026-08-23 against the shipped model on a fresh held-out set: `1.3.1: acceptance false negatives`
and `2.4.6: acceptance false positives`, two of each. From the report it was impossible to tell whether
that was one subtype systematically missed or two unlucky pages — and those need completely different
responses. Answering it meant re-running the evaluator by hand with print statements.

The repo already states the rule, in `capture-real-pages`: "Named, not counted. '3 failed' tells you
nothing about whether the corpus is usable."
"""
import importlib.util
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "packages" / "lab" / "scripts" / "evaluate-screenreader-acceptance.py"


def load():
    spec = importlib.util.spec_from_file_location("acceptance_evaluator", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["acceptance_evaluator"] = module
    spec.loader.exec_module(module)
    return module


def test_names_both_kinds_of_failure():
    ev = load()
    # index:      0     1     2     3
    # label:      T     T     F     F
    # score:    0.9   0.1   0.8   0.1   threshold 0.5
    # so: 0 TP, 1 FN, 2 FP, 3 TN
    block = ev.metrics(
        np.array([0.9, 0.1, 0.8, 0.1]),
        np.array([True, True, False, False]),
        0.5,
        identities=["good-case/bad", "missed-case/bad", "flagged-case/good", "clean-case/good"],
    )
    assert block["truePositive"] == 1 and block["falseNegative"] == 1 and block["falsePositive"] == 1
    assert block["falseNegativeCases"] == ["missed-case/bad"]
    assert block["falsePositiveCases"] == ["flagged-case/good"]


def test_a_clean_criterion_names_nothing_rather_than_omitting_the_keys():
    # Absent and empty must not look alike: an empty list says "we looked and there were none", a missing
    # key says nothing at all, and a consumer cannot tell the second from an older report.
    ev = load()
    block = ev.metrics(np.array([0.9, 0.1]), np.array([True, False]), 0.5, identities=["a/bad", "b/good"])
    assert block["falsePositiveCases"] == []
    assert block["falseNegativeCases"] == []


def test_without_identities_the_report_keeps_its_old_shape():
    # The parameter is optional so every other caller is unchanged; a naming feature must not become a
    # required argument that breaks the callers it was meant to help.
    ev = load()
    block = ev.metrics(np.array([0.9]), np.array([True]), 0.5)
    assert "falsePositiveCases" not in block
    assert block["truePositive"] == 1


def test_the_list_is_bounded_and_says_when_it_truncated():
    # A report nobody can read is its own kind of silence. Truncation must be visible, or 12 of 400 reads
    # as 12 of 12.
    ev = load()
    n = ev.MAX_NAMED_FAILURES + 5
    block = ev.metrics(
        np.zeros(n), np.ones(n, dtype=bool), 0.5, identities=[f"case-{i:03d}/bad" for i in range(n)]
    )
    assert len(block["falseNegativeCases"]) == ev.MAX_NAMED_FAILURES
    assert block["falseNegativeCasesTruncated"] == 5


def test_case_identity_is_the_same_key_the_stability_grouping_uses():
    ev = load()
    assert ev.case_identity({"provenance": {"caseId": "form-error", "variant": "bad"}}) == "form-error/bad"
    # A record missing provenance must not crash a report that exists to explain a failure.
    assert ev.case_identity({}) == "?/?"
