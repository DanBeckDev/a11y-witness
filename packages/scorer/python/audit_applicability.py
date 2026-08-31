"""Do the applicability preconditions ever silence a true positive? Answered where the corpus lives.

`test_applicability.py` asks exactly this, and on a laptop it asks it of 104 held-out records and in CI of
none at all — it reads `runs/`, which is gitignored. The lab holds the authoritative 2,403-record corpus
and has no pytest installed, so the check that most needs the full data was the one that could not see it.
Measured 2026-08-25: dispatched to the lab, `test:python` reported "SKIPPED: no .venv/bin/pytest" and
exited 0. An honest skip, and still an unverified precondition.

A precondition that silences a true positive DELETES EVIDENCE, and it is invisible in every score: a
finding never made cannot be counted as missed. This repo has paid for believing that class of guard on a
small sample once already — a capture gate validated on six hand-picked cases, which then failed 44 cases
in a live run.

So the sweep is a plain function here, with two entry points and one implementation: pytest calls `sweep`,
and `npm run lab:job -- -e job=applicability-audit` runs `main` with the interpreter the lab actually has.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import applicability  # noqa: E402
import screenreader_features as features  # noqa: E402

#: Subtypes whose free vetoes are STRUCTURAL — now ONE reason, because the other was refuted.
#:
#: ADR 0015's remedy for a free veto is the corpus: give the subtype's positives pages that carry the
#: feature, so a head cannot penalise it for nothing. One reason that remedy is limited here survives:
#:
#:   - Their pages carry their own control, so `probeForms` furniture would give the probe two things to
#:     press and change which one the case's own signal reads.
#:
#: THE SECOND REASON WAS REFUTED BY MEASURING IT, 2026-08-31. It read: "`component-index` is `notFor`
#: exactly these criteria because it adds four focusable links, and `focusOrder` truncates at 12 stops."
#: `MAX_TAB_STOPS` became 150 on 2026-08-25 and the exclusion was never re-measured. Capturing all seven
#: affected families with the piece applied returned `1469 discriminating, 0 blind, 0 CONTAMINATED` and
#: every one of the seven OK, so the exclusion is lifted in `case-matrix.mjs` and these three heads have
#: their conformant-furniture remedy back.
#:
#: THE COST OF LEAVING IT WAS NOT TIDINESS. This file cited that exclusion as why the remedy was
#: UNAVAILABLE for the exact three heads whose worst veto is `state_unchanged` — so a stale sentence here
#: was, for two days, a recorded reason not to try. "Unavailable" meant "not re-measured since the cap
#: changed", which is a weaker claim than it reads as, and this file said so itself before anyone acted.
#:
#: What remains: vetoes on features that ARE defects (`form_field_unnamed`, `state_unchanged`,
#: `validation_error_missing`), which no conformant page can carry by definition. Furniture is not the
#: answer to those, and that part was never in doubt.
STRUCTURAL_VETOES = {
    "2.1.1:control-unreachable-by-keyboard": "its page carries its own control, so probeForms furniture "
                                             "would change which one the case's signal reads",
    "2.1.2:focus-trapped": "same — the page's own controls are the evidence",
    "2.4.3:focus-order-scrambled": "same. The component-index exclusion that also covered this was "
                                   "REFUTED 2026-08-31: 0 contaminated across all seven families",
}

#: Gates somebody has proposed but not applied, reported so the cost is a measurement rather than a guess.
#:
#: `1.3.1:fake-heading` is here because gating it was tried, refused by the corpus (13 of 108 positives
#: silenced), and reverted -- and the container-exit fix has since changed the inputs. Whether it changed
#: them ENOUGH is exactly what this reports, over the full corpus, rather than from a sample small enough
#: to miss a 12% miss rate.
CANDIDATE_GATES = {"1.3.1:fake-heading": "plain_heading_candidate_present"}


def sweep(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Per subtype: how many labelled positives its precondition would silence, and how many
    non-labelled records it rules out. PURE.

    Both numbers matter and for opposite reasons. `silenced` above zero is a defect — the precondition is
    deleting evidence the corpus says is real. `ruledOut` at zero is also a defect, of the quieter kind: a
    precondition that rules nothing out is decoration and would satisfy the first check by doing nothing.
    """
    result: dict[str, Any] = {}
    for subtype in sorted(applicability.SUBTYPE_REQUIRES):
        silenced: list[str] = []
        ruled_out = 0
        positives = 0
        for record in records:
            labelled = subtype in set((record.get("target") or {}).get("subtypes") or [])
            positives += labelled
            if applicability.applicable(subtype, record):
                continue
            if labelled:
                provenance = record.get("provenance", {})
                silenced.append(f"{provenance.get('caseId')}/{provenance.get('variant')}")
            else:
                ruled_out += 1
        result[subtype] = {
            "labelledPositives": positives,
            "silenced": silenced,
            "ruledOut": ruled_out,
        }
    return result


def read(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def would_gating(subtype: str, feature: str, records: list[dict[str, Any]]) -> dict[str, Any]:
    """If `subtype` were gated on `feature`, what would it cost? Measured, never assumed.

    Added because the same question was answered wrongly twice on 2026-08-25 — once from a 5-positive
    held-out sample that could not see a 12% miss rate, and once from a theory about which probe ran. The
    only trustworthy answer is a count over the whole corpus, so it is a function rather than an argument.
    """
    silenced: list[str] = []
    positives = clean = clean_with = 0
    for record in records:
        labelled = subtype in set((record.get("target") or {}).get("subtypes") or [])
        try:
            values = features.structured_feature_values(record)
        except RuntimeError:
            continue
        present = float(values.get(feature, 0.0)) > 0
        if labelled:
            positives += 1
            if not present:
                provenance = record.get("provenance", {})
                silenced.append(f"{provenance.get('caseId')}/{provenance.get('variant')}")
        else:
            clean += 1
            clean_with += present
    return {"subtype": subtype, "feature": feature, "positives": positives,
            "wouldSilence": silenced, "cleanRecords": clean, "cleanCarryingFeature": clean_with}


def main() -> int:
    repo = Path(__file__).resolve().parents[3]
    corpora = [
        repo / "runs" / "screenreader-dataset" / "with-realism.jsonl",
        repo / "runs" / "screenreader-acceptance" / "repeat-1.jsonl",
        repo / "runs" / "screenreader-acceptance" / "repeat-2.jsonl",
    ]
    records: list[dict[str, Any]] = []
    for path in corpora:
        if path.exists():
            rows = read(path)
            records.extend(rows)
            print(f"  {path.relative_to(repo)}: {len(rows)} record(s)")
    if not records:
        # Never a silent pass. The whole reason this file exists is that a skip once read as a verdict.
        print("\n  NOTHING TO AUDIT — no corpus under runs/. This is a REFUSAL, not a pass.")
        return 2

    report = sweep(records)
    print(f"\n  {len(records)} record(s), {len(report)} conditional subtype(s)\n")
    bad = []
    inert = []
    for subtype, counts in report.items():
        mark = "OK  "
        if counts["silenced"]:
            mark = "FAIL"
            bad.append(subtype)
        elif counts["ruledOut"] == 0:
            mark = "INERT"
            inert.append(subtype)
        print(f"  {mark:5s} {subtype:40s} positives {counts['labelledPositives']:4d}  "
              f"silenced {len(counts['silenced']):3d}  ruled out {counts['ruledOut']:5d}")
        for case in counts["silenced"][:5]:
            print(f"          silenced: {case}")

    if bad:
        print(f"\n  {len(bad)} precondition(s) DELETE EVIDENCE the corpus says is real: {', '.join(bad)}")
        print("  The precondition must be the SUBJECT of the claim, never the defect.")
        return 1
    if inert:
        # Not fatal: a subtype may legitimately apply to every record in this corpus. Said aloud because a
        # precondition that never fires is one nobody would notice was wrong.
        print(f"\n  NOTE: ruled nothing out, so unverified here: {', '.join(inert)}")
    # WHAT A PROPOSED GATE WOULD COST, for the subtypes not currently gated. This is the question that was
    # answered wrongly twice from small samples; answering it here, over the full corpus, is the whole
    # point of the audit having a home on the lab.
    print("\n  IF THESE WERE GATED ON THEIR OWN FEATURE (not currently, reported so the cost is known):")
    for subtype, feature in CANDIDATE_GATES.items():
        cost = would_gating(subtype, feature, records)
        verdict = "SAFE" if not cost["wouldSilence"] else f"COSTS {len(cost['wouldSilence'])}"
        print(f"    {verdict:12s} {subtype:32s} on {feature}")
        print(f"                 {cost['positives']} positive(s); "
              f"{cost['cleanCarryingFeature']} of {cost['cleanRecords']} clean records also carry it")
        for case in cost["wouldSilence"][:5]:
            print(f"                 would silence: {case}")

    print("\n  PASS — no precondition silences a labelled positive.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
