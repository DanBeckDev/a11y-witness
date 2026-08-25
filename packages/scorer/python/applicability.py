"""Is a subtype's claim even ABOUT this page?

A head scores every record it is given. `1.3.1:unassociated-table` is a claim about a table, and on a page
with no table the honest answer is not a low score — it is INAPPLICABLE, which is already a first-class
outcome this project reports (ACT/EARL `inapplicable`, alongside `passed`, `failed` and `cantTell`).

## Why a threshold cannot do this job

Measured 2026-08-25 on `acceptance-link-permits/bad`, the last failure standing after recalibration. The
whole page is three announcements::

    heading, level 1, Permits
    Permits are required for overnight stays.
    link, Go

Its only defect is 2.4.4, which the model gets right. `1.3.1` fired as well, with EVERY 1.3.1-relevant
feature at zero — no table, `plain_heading_candidate_present = 0`. Thirty structured features against 384
encoder dimensions, and the head decided from the embedding.

This repo already wrote the rule down, one criterion over, on 2026-08-24:

    A ZERO CANNOT VETO, so "A and not B" must be computed, never handed over as two features. A linear
    head only ADDS.

`table_present = 0` cannot suppress anything, however the weights are fitted. Raising the threshold
instead would cost real findings on pages that DO have tables, which is exactly why 1.3.1's cuts barely
moved when every other head's did.

## The rule for choosing a precondition, which is the part that is easy to get wrong

**The precondition is the SUBJECT of the claim, never the defect.** Most subtypes here are findings of
ABSENCE — a state change that announced nothing, a validation error never spoken, an image with no
alternative — and requiring the defect's own feature would delete precisely the evidence the subtype
exists to catch. That is this repo's most expensive rule:

    A check must never reject evidence whose absence is the finding.

So `4.1.2:state-change-silent` requires that a state change HAPPENED, not that anything was announced.
`3.3.1:validation-error-silent` requires that a form was submitted, not that an error was spoken.

## It is verified, not asserted

`test_applicability.py` runs this over every record on disk and fails if ANY record labelled positive for a
subtype is made inapplicable. A precondition that silences a true positive is strictly worse than the false
positive it was meant to remove, and nothing about it would be visible in a score.
"""
from typing import Any, Callable

Record = dict[str, Any]


def _structure(record: Record) -> dict[str, Any]:
    return record.get("input", {}).get("structure") or {}


def _interaction(record: Record) -> dict[str, Any]:
    return record.get("input", {}).get("interaction") or {}


def _has(field: str) -> Callable[[Record], bool]:
    """The page carries at least one of this structural thing."""
    def present(record: Record) -> bool:
        return bool(_structure(record).get(field))
    return present


def _interacted(field: str) -> Callable[[Record], bool]:
    """The capture actually performed the interaction this subtype reasons about."""
    def present(record: Record) -> bool:
        return bool(_interaction(record).get(field))
    return present


#: What each subtype's claim is ABOUT. Absent it, the subtype is inapplicable and is not scored.
#:
#: Subtypes deliberately absent from this table are always applicable, and that is a decision rather than
#: an omission — see `test_applicability.py`, which requires every shipped subtype to be either declared
#: here or listed as unconditional with a reason.
SUBTYPE_REQUIRES: dict[str, Callable[[Record], bool]] = {
    # A claim about an IMAGE. All three are absence findings — a missing, generic or filename alt — so the
    # precondition is that a graphic exists at all, never that its alternative is bad.
    "1.1.1:filename-alt": _has("graphics"),
    "1.1.1:generic-alt": _has("graphics"),
    "1.1.1:missing-alt": _has("graphics"),
    # A claim about a TABLE. This is the subtype that produced the failure above.
    "1.3.1:unassociated-table": _has("tableCells"),
    # A claim about a LINK.
    "2.4.4:regex": _has("links"),
    # A claim about a HEADING.
    "2.4.6:regex": _has("headings"),
    # A claim about a FORM FIELD.
    "3.3.2:unnamed-form-field": _has("formFields"),
    # A claim about a CONTROL that was activated. The finding is that nothing was announced, so the
    # precondition is that a state change occurred — not that one was spoken.
    "4.1.2:state-change-silent": _interacted("stateChanges"),
    # A claim about a form SUBMISSION. Same shape: the error being unspoken is the finding, so the
    # precondition is that the form was submitted at all.
    "3.3.1:validation-error-silent": _interacted("postSubmitFields"),
    "4.1.3:form-activation-silent": _interacted("formChanges"),
}

#: Subtypes with NO precondition, and why each is a decision rather than a gap.
#:
#: Every one of these is a claim about the page as a whole or about a probe whose absence is itself the
#: finding, so there is nothing that could be required without deleting evidence.
UNCONDITIONAL: dict[str, str] = {
    "1.3.1:fake-heading": "a claim that prose ACTS as a heading without being one — there is no structural "
                          "thing to require, since the absence of the heading role IS the finding",
    "2.1.1:control-unreachable-by-keyboard": "the finding is that a control is missing from the focus "
                                             "order; requiring focusOrder would be circular",
    "2.1.2:focus-trapped": "a property of the focus order as a whole, not of any element",
    "2.4.1:skip-link-inert": "the finding is that a skip link is absent or does nothing; requiring a link "
                             "would delete the absence case",
    "2.4.2:route-title-stale": "a claim about the document title across a navigation, not about content",
    "2.4.3:focus-order-scrambled": "a claim about the ORDER of the page, not about any one element",
    "4.1.2:unnamed-control": "a control announcing no name at all may leave nothing in `controls` to "
                             "require — the absence is the finding",
}


def applicable(subtype: str, record: Record) -> bool:
    """Is this subtype's claim about this page at all?

    Unknown subtypes are APPLICABLE. A new head must not be silently switched off by a table that has not
    heard of it; `test_applicability.py` is what forces the decision to be made explicitly.
    """
    requires = SUBTYPE_REQUIRES.get(subtype)
    return True if requires is None else bool(requires(record))


def inapplicable_subtypes(record: Record, subtypes: list[str]) -> list[str]:
    """Which of these subtypes this page cannot be judged on. PURE."""
    return [subtype for subtype in subtypes if not applicable(subtype, record)]
