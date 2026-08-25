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


def test_the_1_3_1_subtypes_stay_JUDGEABLE_because_absence_is_ambiguous():
    """The false positive is NOT closed here, and pretending otherwise would cost 62 true positives.

    Both 1.3.1 subtypes were conditional for one commit. Against the full corpus the preconditions
    silenced 13 of 108 `fake-heading` positives and 49 of 140 `unassociated-table` positives, every one a
    multi-defect page. An empty `tableCells` means EITHER no table OR that `probeTables` never ran, and the
    record does not say which.

    So they are unconditional, and `acceptance-link-permits/bad` is still judged on 1.3.1. That is the
    honest state: a precondition may only rule a subtype out when its subject is KNOWN absent.
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
    assert applicability.applicable("1.3.1:unassociated-table", record) is True
    assert applicability.applicable("1.3.1:fake-heading", record) is True
    assert applicability.applicable("2.4.4:regex", record) is True, (
        "the page's REAL defect must stay judgeable — it has a link, and 2.4.4 is its declared failure"
    )
    assert "1.3.1:fake-heading" in applicability.UNCONDITIONAL, (
        "if this becomes conditional again, `lab:job -e job=applicability-audit` must pass on the FULL "
        "corpus first — the held-out set is single-defect pages and made it look exact"
    )


def test_the_held_out_set_is_NOT_enough_to_qualify_a_precondition():
    """The measurement that misled me — and it took three tries to state correctly.

    On the held-out set `plain_heading_candidate` separates `1.3.1:fake-heading` perfectly: 5 of 5 labelled
    positives carry it, 0 of 99 clean records do. Against all 2,611 records the same relation misses 13 of
    108 real positives — a 12% miss rate.

    My first explanation was "the held-out set is one defect per page". Wrong: it holds 6 multi-defect
    records. My second was "none of them carries this subtype". Also wrong: one does, and it passes.

    The true reason is arithmetic and duller than either. FIVE positives cannot see a 12% miss rate — the
    expected number of misses in a sample that size is 0.6, so observing zero is the likeliest outcome
    even when the relation is unsafe. The sample was not unrepresentative in SHAPE; it was too small to
    carry the claim, and 5/5 looked exactly like proof.

    So the bar is on the count, where it belongs: a precondition needs enough positives here to detect a
    miss rate worth caring about, or it must be qualified against the full corpus with
    `lab:job -e job=applicability-audit`.
    """
    sets = [(n, r) for n, r in corpora() if "acceptance" in n]
    if not sets:
        pytest.skip("no acceptance records on this machine")
    records = [record for _n, rows in sets for record in rows]

    positives = [r for r in records
                 if "1.3.1:fake-heading" in ((r.get("target") or {}).get("subtypes") or [])]
    # The number that matters. At 12% a sample needs roughly 25 positives before a single miss is more
    # likely than not; five is nowhere near, which is why this subtype must be qualified on the lab.
    assert len(positives) < 25, (
        f"the held-out set now carries {len(positives)} `1.3.1:fake-heading` positives, which is enough to "
        f"start detecting a miss rate around 12%. Re-run `lab:job -e job=applicability-audit` and "
        f"re-decide whether the precondition is safe, rather than inheriting this test's conclusion."
    )
