"""A precondition must never silence a true positive.

A subtype ruled inapplicable is never scored, so a precondition that is too strict deletes evidence
outright — strictly worse than the false positive it was added to remove, and invisible in every score,
because a finding that was never made cannot be counted as missed.

That is this repo's most expensive rule, and it has a scar attached:

    A check must never reject evidence whose absence is the finding.

`custom-control` bad pages are div-based fake buttons with no `<button>`, so NVDA finds no form controls —
and that absence IS the 4.1.2 failure. A guard that rejected captures whose probe produced nothing threw
away exactly the evidence the case existed to demonstrate, failed 44 cases in a live run, and had been
validated on six hand-picked cases first.

So this runs the real preconditions over every record on disk and fails if ANY record labelled positive
for a subtype is made inapplicable by it.
"""
import json
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "packages" / "scorer" / "python"))

import applicability  # noqa: E402
import audit_applicability  # noqa: E402


def corpora():
    """Every set of labelled records this machine has, largest first.

    The lab holds the authoritative corpus and a laptop holds a copy of whatever was last fetched, so this
    reads what is here and SKIPS HONESTLY when there is nothing — never passing quietly on an empty set,
    which is how a guard comes to report success having examined nothing.
    """
    found = []
    for path in [
        REPO / "runs" / "screenreader-dataset" / "with-realism.jsonl",
        REPO / "runs" / "screenreader-acceptance" / "repeat-1.jsonl",
        REPO / "runs" / "fetched" / "candidate.acceptance-records.json",
    ]:
        if path.exists():
            rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
            if rows:
                found.append((path.name, rows))
    return found


def test_every_shipped_subtype_is_a_decision_rather_than_an_omission():
    """A subtype absent from both tables would be silently unconditional.

    Unknown subtypes are APPLICABLE by design — a new head must not be switched off by a table that has
    not heard of it — which is exactly why the decision has to be forced here instead.
    """
    declared = set(applicability.SUBTYPE_REQUIRES) | set(applicability.UNCONDITIONAL)
    assert len(declared) >= 15, f"only {len(declared)} subtypes classified; the head list moved"
    overlap = set(applicability.SUBTYPE_REQUIRES) & set(applicability.UNCONDITIONAL)
    assert not overlap, f"{overlap} is both conditional and unconditional"
    for subtype, why in applicability.UNCONDITIONAL.items():
        assert len(why) > 30, f"{subtype} is unconditional without a reason"


def test_no_precondition_silences_a_true_positive():
    """The same sweep `audit_applicability.main()` runs on the lab — one implementation, two entry points.

    This reads `runs/`, which is gitignored, so here it sees a copy and in CI it sees nothing. The lab has
    the authoritative corpus and no pytest, which is why the sweep is a plain function that a lab job can
    call: the check that most needs the full data was the one that could not reach it.
    """
    sets = corpora()
    if not sets:
        pytest.skip("no labelled records on this machine — the lab holds the corpus. Honest skip, not a pass.")

    records = [record for _name, rows in sets for record in rows]
    report = audit_applicability.sweep(records)

    silenced = {name: counts["silenced"] for name, counts in report.items() if counts["silenced"]}
    assert silenced == {}, (
        "A precondition deleted evidence the corpus says is real:\n  " + json.dumps(silenced, indent=2)
        + "\n\nThe precondition must be the SUBJECT of the claim, never the defect — most of these "
          "subtypes are findings of ABSENCE, and requiring the defect's own feature removes exactly what "
          "they exist to catch."
    )
    # The other half: a precondition that rules nothing out is decoration, and would pass the assertion
    # above by doing nothing at all.
    assert sum(counts["ruledOut"] for counts in report.values()) > 0, "these preconditions are inert"


def test_the_measured_failure_is_ruled_out_and_the_real_defect_is_not():
    """The page that survived recalibration, and the discrimination that matters.

    `acceptance-link-permits/bad` is three announcements — a heading, a sentence, and `link, Go`. It has no
    table, and no prose that reads as an unmarked title, so NEITHER 1.3.1 subtype is a claim about it. Its
    real defect, 2.4.4, must stay judgeable: a precondition that silenced that would be hiding the model's
    correct finding along with its wrong one.

    An earlier version of this test asserted `1.3.1:fake-heading` stays APPLICABLE here, on the reasoning
    that "the absence of the heading role IS the finding". That was wrong, and the measurement below is
    what settled it.
    """
    records = [rows for name, rows in corpora() if "acceptance" in name]
    if not records:
        pytest.skip("no acceptance records on this machine")
    hit = [r for rows in records for r in rows
           if r.get("provenance", {}).get("caseId") == "acceptance-link-permits"
           and r.get("provenance", {}).get("variant") == "bad"]
    if not hit:
        pytest.skip("acceptance-link-permits/bad not in the records on this machine")

    record = hit[0]
    assert applicability.applicable("1.3.1:unassociated-table", record) is False
    assert applicability.applicable("1.3.1:fake-heading", record) is False
    assert applicability.applicable("2.4.4:regex", record) is True, (
        "the page's REAL defect must stay judgeable — it has a link, and 2.4.4 is its declared failure"
    )


def test_the_fake_heading_precondition_is_an_actual_separator():
    """The evidence for making it conditional, kept next to the decision.

    Measured on the held-out set: every record labelled `1.3.1:fake-heading` carries the relation, and no
    clean record does. A precondition drawn from a feature that did NOT separate would silence true
    positives the moment the corpus grew, so the separation is asserted rather than assumed — and if it
    ever stops holding, this fails before the preconditions start deleting evidence.
    """
    sets = corpora()
    if not sets:
        pytest.skip("no labelled records on this machine — the lab holds the corpus. Honest skip.")

    positives = missed = clean_with = clean_total = 0
    for _name, rows in sets:
        for record in rows:
            labelled = "1.3.1:fake-heading" in set((record.get("target") or {}).get("subtypes") or [])
            holds = applicability.applicable("1.3.1:fake-heading", record)
            if labelled:
                positives += 1
                missed += not holds
            else:
                clean_total += 1
                clean_with += holds

    assert positives >= 5, f"only {positives} labelled positives; too few to claim separation"
    assert missed == 0, f"{missed} of {positives} labelled positives lack the relation — it would silence them"
    # Not required to be zero: a clean page MAY contain prose that reads as a title without that being a
    # failure, and the head is what decides. What matters is that the relation is not everywhere, or the
    # precondition would rule nothing out.
    assert clean_with < clean_total, "every clean record carries the relation; the precondition is inert"
