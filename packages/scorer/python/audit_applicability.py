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
    print("\n  PASS — no precondition silences a labelled positive.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
