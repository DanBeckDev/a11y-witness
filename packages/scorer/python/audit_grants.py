"""Does a multi-defect page actually CARRY the evidence its labels claim?

Every accompanying defect in `case-matrix.mjs` declares a `grants` field — the feature its markup is
supposed to produce in the captured evidence::

    "position-only-table": { markup: [...], subtypes: ["1.3.1:unassociated-table"],
                             grants: "table_position_only" }
    "fake-heading":        { markup: [...], subtypes: ["1.3.1:fake-heading"],
                             grants: "plain_heading_candidate_present" }

**It is declared eight times and was read nowhere.** An expectation the corpus states about itself and
never checks, which is a comment in data form.

## What that let through

`alsoFails` adds a LABEL and no signal, so `check-signals` — which proves every `badSignal` fires on the
bad page and stays silent on the good one — never looks at it. `alsofails-roundtrip.test.ts` proves the
label survives the trip from case definition to exported record, which is a different claim: that the
label travels, not that the page supports it. Its own docstring states the mirror image of this defect:

    A label that omits a defect the page has does not measure the model — it measures the label.

The inverse costs the same: a label for a defect whose evidence was never captured measures the label.

Measured 2026-08-25, two symptoms of this one gap:

  - 62 of 62 multi-defect cases carrying `position-only-table` request `probeTables: false`, and
    `capture-core.mjs:1738` populates `tableCells` only `if (probeTables)`. The page gains a table, gets
    labelled `1.3.1:unassociated-table`, and the table is never looked at.
  - 13 records labelled `1.3.1:fake-heading` do not carry `plain_heading_candidate_present`, by a
    mechanism nobody has identified. This audit is how that gets localised rather than theorised about.

Both are the same violated invariant, and a fix aimed at probes alone would have closed the first and
left the second — while making the corpus look honest.

## Why the map is duplicated, and how it is kept honest

`ACCOMPANYING_DEFECTS` is JavaScript and the features are Python, so neither can import the other. The map
is emitted to `runs/accompanying-grants.json` by `npm run corpus:grants-map` and read here, with
`test_grants_map_is_current.py` asserting the file matches the source. Deleting a copy is unavailable;
CLAUDE.md's remedy for a forced duplication is to pin the copies equal with a test.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import screenreader_features as features  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
GRANTS_MAP = REPO / "runs" / "accompanying-grants.json"


def defects_in(case_id: str, known: list[str]) -> list[str]:
    """Which accompanying defects a `X+also-a-b-c` id names.

    Matched LONGEST FIRST against the known names, never split on "-": the names contain hyphens, so
    `+also-position-only-table-bare-edit` splits into `position-only-table` and `bare-edit` only if the
    matching is greedy. Splitting naively yields six fragments and matches nothing, which would make this
    audit report a clean corpus by examining an empty set.
    """
    if "+also-" not in case_id:
        return []
    suffix = case_id.split("+also-", 1)[1]
    found: list[str] = []
    for name in sorted(known, key=len, reverse=True):
        if name in suffix:
            found.append(name)
            suffix = suffix.replace(name, "")
    return found


def audit(records: list[dict[str, Any]], grants: dict[str, str]) -> dict[str, Any]:
    """Per accompanying defect: which records fail to carry the feature it declares. PURE."""
    known = list(grants)
    report: dict[str, Any] = {}
    for record in records:
        provenance = record.get("provenance", {})
        case_id = str(provenance.get("caseId", ""))
        if provenance.get("variant") != "bad":
            # Only the failing variant carries the accompanying defect's markup.
            continue
        try:
            values = features.structured_feature_values(record)
        except RuntimeError as error:
            # A record predating the `parsed` block cannot be featurized, which is a fact about the COPY
            # rather than about the corpus. Counted and reported as a refusal at the end, never crashed
            # on and never silently skipped: skipping would let a stale export read as a clean audit.
            report.setdefault("__unfeaturizable__", {"feature": "-", "records": 0, "missing": [],
                                                     "why": str(error).split(".")[0]})["records"] += 1
            continue
        for defect in defects_in(case_id, known):
            feature = grants[defect]
            entry = report.setdefault(defect, {"feature": feature, "records": 0, "missing": []})
            entry["records"] += 1
            if not float(values.get(feature, 0.0)):
                entry["missing"].append(case_id)
    return report


def read(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> int:
    if not GRANTS_MAP.exists():
        print(f"  NO GRANTS MAP at {GRANTS_MAP.relative_to(REPO)} — run `npm run corpus:grants-map`.")
        print("  This is a REFUSAL, not a pass: with no map this audit would examine nothing.")
        return 2
    grants = json.loads(GRANTS_MAP.read_text(encoding="utf-8"))

    records: list[dict[str, Any]] = []
    for path in [REPO / "runs" / "screenreader-dataset" / "with-realism.jsonl",
                 REPO / "runs" / "screenreader-acceptance" / "repeat-1.jsonl"]:
        if path.exists():
            rows = read(path)
            records.extend(rows)
            print(f"  {path.relative_to(REPO)}: {len(rows)} record(s)")
    if not records:
        print("\n  NOTHING TO AUDIT — no corpus under runs/. A REFUSAL, not a pass.")
        return 2

    report = audit(records, grants)
    stale = report.pop("__unfeaturizable__", None)
    if stale:
        print(f"\n  {stale['records']} record(s) carry no `parsed` block and cannot be featurized.")
        print(f"  {stale['why']}.")
        print("  This copy of runs/ predates the parse. Re-export, or ask the lab:")
        print("    npm run lab:job -- -e job=grants-audit")
        if not report:
            print("\n  REFUSING — nothing here could be examined.")
            return 2
        print("  Continuing over the records that CAN be read; the counts below are of those only.")
    if not report:
        # The corpus has no multi-defect pages, or the id matching found none. Either way this examined
        # nothing and must not report success — the defect this file exists to catch, in itself.
        print("\n  NO MULTI-DEFECT RECORDS MATCHED. Refusing: this audit examined nothing.")
        return 2

    print(f"\n  {len(records)} record(s), {len(report)} accompanying defect(s) present\n")
    broken = []
    for defect, entry in sorted(report.items()):
        missing = entry["missing"]
        mark = "FAIL" if missing else "OK  "
        if missing:
            broken.append(defect)
        print(f"  {mark} {defect:24s} grants {entry['feature']:32s} "
              f"{entry['records'] - len(missing):4d}/{entry['records']:4d} carry it")
        for case in missing[:6]:
            print(f"         missing: {case}")
        if len(missing) > 6:
            print(f"         ... and {len(missing) - 6} more")

    if broken:
        print(f"\n  {len(broken)} defect(s) declare evidence the corpus does not contain: "
              f"{', '.join(broken)}")
        print("  These records are LABELLED for a failure nothing captured. A model trained on them "
              "learns to predict the label from something other than the defect.")
        return 1
    print("\n  PASS — every accompanying defect grants the feature it declares.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
