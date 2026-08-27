"""`corpus:applicability-audit` must refuse a precondition that SILENCES a labelled positive.

## What it guards, and why a score cannot

A precondition rules a subtype INAPPLICABLE on a page its claim is not about — `1.3.1:unassociated-table`
on a page with no table. That is a first-class outcome, not a low score.

The danger is the same mechanism pointed the wrong way. A precondition that rules out a record the corpus
has LABELLED positive deletes evidence that a real failure exists, and `applicability.py` states the
consequence plainly: *"A precondition that silences a true positive is strictly worse than the false
positive it was meant to remove, and nothing about it would be visible in a score."*

It has happened. Both 1.3.1 subtypes were made conditional for one commit and the corpus refused them:
`fake-heading` silenced 13 of 108 labelled positives, `unassociated-table` 49 of 140 — every one a
multi-defect page. The held-out set is one defect per page, so a feature measured there looked exact and
was not.

## Why this test needs no corpus

`sweep()` is pure and says so in its own docstring. The premise that this gate "needs the exported corpus"
is false for its DECISION — three hand-built records reach every branch. See `docs/proving-a-gate.md`;
that premise has now been wrong four times running.

## The second assertion is the one that would rot

`ruledOut == 0` is also a defect, of the quieter kind: a precondition that rules nothing out is decoration
and satisfies the "silences nothing" check **by doing nothing at all**. A test that only asserted the
first half would pass against every precondition being deleted.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

import audit_applicability  # noqa: E402
import applicability  # noqa: E402

#: A subtype whose precondition is a plain structural presence check, so a record can be built by hand.
SUBTYPE = "2.4.4:regex"
FEATURE = "links"


def record(*, labelled: bool, has_links: bool, case: str) -> dict:
    """A record shaped only as far as `sweep` and `applicable` read it."""
    return {
        "provenance": {"caseId": case, "variant": "bad" if labelled else "good"},
        "target": {"subtypes": [SUBTYPE] if labelled else []},
        "input": {"structure": {FEATURE: ["Click here, link"] if has_links else []}},
    }


def test_the_precondition_under_test_is_real():
    """The premise. Without it every assertion below passes against a subtype nobody gates."""
    assert SUBTYPE in applicability.SUBTYPE_REQUIRES, (
        f"{SUBTYPE} has no precondition, so this test would be measuring nothing"
    )


def test_a_labelled_positive_that_the_precondition_rules_out_is_reported_as_SILENCED():
    # A page labelled for a link failure whose evidence carries no links. Whatever produced that, the
    # precondition deleting it is the thing this audit exists to catch.
    result = audit_applicability.sweep([record(labelled=True, has_links=False, case="planted-silenced")])
    assert result[SUBTYPE]["silenced"] == ["planted-silenced/bad"], (
        f"a labelled positive ruled inapplicable must be named, got {result[SUBTYPE]}"
    )


def test_a_labelled_positive_the_precondition_admits_is_NOT_silenced():
    # The control. Without it, everything here is satisfied by a precondition that silences everything.
    result = audit_applicability.sweep([record(labelled=True, has_links=True, case="planted-ok")])
    assert result[SUBTYPE]["silenced"] == [], (
        f"a labelled positive whose subject IS present must be scored, not ruled out: {result[SUBTYPE]}"
    )
    assert result[SUBTYPE]["labelledPositives"] == 1


def test_a_precondition_that_rules_nothing_out_is_visible_as_decoration():
    # `ruledOut` is the half that catches a precondition deleted or weakened into a no-op — which would
    # satisfy "silences nothing" by doing nothing.
    admits_everything = [record(labelled=False, has_links=True, case=f"planted-{i}") for i in range(3)]
    assert audit_applicability.sweep(admits_everything)[SUBTYPE]["ruledOut"] == 0

    rules_some_out = admits_everything + [record(labelled=False, has_links=False, case="planted-out")]
    assert audit_applicability.sweep(rules_some_out)[SUBTYPE]["ruledOut"] == 1, (
        "a precondition must rule SOMETHING out on a page its claim is not about, or it is decoration"
    )


def test_every_shipped_subtype_is_declared_conditional_or_unconditional_with_a_reason():
    # The register itself, which is what stops a new head being silently switched off by a table that has
    # not heard of it. `applicable()` returns True for an unknown subtype deliberately; this is what
    # forces the decision to be made rather than defaulted.
    for subtype, reason in applicability.UNCONDITIONAL.items():
        assert subtype not in applicability.SUBTYPE_REQUIRES, (
            f"{subtype} is both conditional and unconditional — two answers to one question"
        )
        assert len(reason) >= 30, f"{subtype}: '{reason}' does not say why it cannot have a precondition"
