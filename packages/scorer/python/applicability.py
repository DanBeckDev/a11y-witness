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


def _reads_as_an_unmarked_heading(record: Record) -> bool:
    """The transcript contains prose that ACTS as a section title without announcing a heading role.

    This is `plain_heading_candidate` — the same relation the featurizer computes into
    `plain_heading_candidate_present` — asked as a precondition rather than as a weight. Imported lazily
    so this module stays importable without the featurizer's dependencies; `score.py` loads both anyway.
    """
    import screenreader_features  # local, to keep this module dependency-free at import time

    transcript = record.get("input", {}).get("transcript") or []
    return any(
        screenreader_features.plain_heading_candidate(value, transcript[index + 1])
        for index, value in enumerate(transcript[:-1])
    )


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
    # BOTH 1.3.1 SUBTYPES WERE CONDITIONAL FOR ONE COMMIT, AND THE CORPUS REFUSED THEM.
    #
    # `1.3.1:fake-heading` required `plain_heading_candidate`, measured on the held-out set as an exact
    # separator: 5 of 5 labelled positives carried it, 0 of 99 clean records did. Against all 2,611
    # records it SILENCED 13 of 108 real positives. `1.3.1:unassociated-table` required `tableCells` and
    # silenced 49 of 140.
    #
    # Every silenced case is a MULTI-DEFECT page (`X+also-Y`), and that is the whole explanation: the
    # held-out set is one defect per page, so a feature measured there looks exact and is not. ADR 0015 is
    # about precisely this — "one defect per page taught the scorer to veto" — and the sample that
    # produced the 5/5 was 104 records of the easy shape.
    #
    # The deeper fault is that an empty field has TWO meanings. `probeTables` is opt-in, so no `tableCells`
    # means either "this page has no table" or "nobody asked about tables" — and this module's own
    # docstring names that rule before breaking it: a check must never reject evidence whose absence is
    # the finding. A precondition may only rule a subtype out when the subject is KNOWN absent, and the
    # record does not currently carry which probes ran.
    #
    # So they stay unconditional until the evidence can distinguish the two, and the false positive on
    # `acceptance-link-permits/bad` stays open rather than being closed by deleting 62 true positives.
    "1.3.1:fake-heading": "the relation it would require, `plain_heading_candidate`, misses 13 of 108 "
                          "real positives on multi-defect pages — it looked exact only on a held-out set "
                          "of single-defect pages",
    "1.3.1:unassociated-table": "an empty `tableCells` means EITHER no table OR that probeTables never "
                                "ran, and the record does not say which — it silenced 49 of 140",
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


def decide(subtype: str, score: float, threshold: float, record: Record) -> bool:
    """Does this subtype FIRE on this record? The one definition, called by everything that decides.

    It existed twice: `score.py` compared `value >= threshold` in its scoring loop, and
    `evaluate-screenreader-acceptance.py` did the same thing again over numpy arrays. Adding the
    applicability gate to the first left the second untouched, so the held-out gate went on judging pages
    the product would rule inapplicable -- a remedy correct, committed, and unreachable from the path that
    mattered.

    That is this repo's most-named defect (`refreshBrowseBuffer` "marked when it skips, so 'did not need
    to refresh' and 'never ran' can never again be the same silence"), and it was committed here while
    fixing something else. The result LOOKED like the fix not working, which is worse than a failure: it
    argues for abandoning a correct change.

    `decision-has-one-definition.py` forbids either file from comparing a subtype score to a threshold
    directly, so a third copy cannot be added quietly.
    """
    return bool(score >= threshold) and applicable(subtype, record)
