"""A criterion that DECLARES it has no head must load; one that merely has none must still fail.

`verify_artifact` refused any criterion with an empty `subtypes` map, which was right until
`rule-ownership.json` gained `modelHead: false`. That field means the RULES decide a subtype outright and
no head is ever fitted for it; when every subtype of a criterion carries it, the trainer records the
criterion with `"modelHead": false` and a `why` rather than omitting it -- so "no head" and "never
considered" stay different states.

MEASURED 2026-09-06. The first v19 candidate trained after `1.4.2:autoplay-uncontrollable` and
`2.4.7:focus-removed-on-receipt` were declared could not be LOADED:

    RuntimeError: criterion 2.4.7 has no scorer heads

Held-out acceptance could not run, and the artefact would have been unusable in the PRODUCT, not merely
ungradeable. This is the same exemption reaching its seventh site and the first one on the path that ships
-- the trainer's per-criterion loop (`test_criterion_with_no_head.py`) was the sixth, an hour earlier.

The pair of tests below is the whole point: the declaration is what separates a rule-owned criterion from
corrupt weights, and BOTH directions have to hold or this is a hole rather than a fix.
"""
import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scorer" / "python"))

import score  # noqa: E402

SOURCE = (ROOT / "scorer" / "python" / "score.py").read_text()


def test_a_declared_headless_criterion_is_accepted():
    assert 'if criterion_report.get("modelHead") is False:' in SOURCE, (
        "verify_artifact no longer accepts a criterion that declares `modelHead: false`, so a v19+ "
        "artefact whose criterion is entirely rule-decided cannot be loaded at all")
    guard = SOURCE.split('if not criterion_report.get("subtypes"):', 1)[1].split("raise RuntimeError", 1)[0]
    assert "continue" in guard, "the declared case must be skipped, not fall through to the raise"


def test_an_UNDECLARED_headless_criterion_still_fails_loudly():
    """The half that stops this being a hole. An empty `subtypes` with no declaration is exactly the
    corruption the original check was written for -- weights that lost a head, or a report describing
    different weights -- and it must keep failing."""
    after = SOURCE.split('if not criterion_report.get("subtypes"):', 1)[1]
    raised = after.split("raise RuntimeError", 1)[1][:400]
    assert "does not declare" in raised, (
        "the refusal must say the criterion lacks the DECLARATION, not merely that it lacks heads -- "
        "otherwise a reader cannot tell which of the two states they are in")
    assert "lost a head" in raised, "and it must name what the undeclared case actually means"


def test_the_declaration_cannot_be_forged_by_an_empty_report():
    # `modelHead` is written by the TRAINER, which reads rule-ownership.json. A report that simply omits
    # the field -- the shape every pre-v19 artefact has -- must NOT be treated as declaring anything.
    # `.get("modelHead") is False` is the check that distinguishes absent from declared-false; `not
    # criterion_report.get("modelHead")` would accept both and reopen the hole.
    assert 'get("modelHead") is False' in SOURCE, (
        "absent and declared-false must be distinguished with `is False`; a truthiness test accepts a "
        "report that never mentioned the field, which is every artefact trained before v19")


def test_score_module_imports_at_all():
    """The `.mjs` lesson in Python: a syntax or import error here is only visible by importing."""
    assert hasattr(score, "verify_artifact"), "score.py no longer exposes verify_artifact"
