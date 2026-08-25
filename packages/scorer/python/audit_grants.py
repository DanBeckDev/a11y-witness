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
    # The canonical list the pipeline actually computes, read from the module rather than hardcoded: a
    # second copy of the feature names is exactly how a declaration comes to name one that no longer
    # exists, which is the fault this distinction exists to report.
    vector = set(getattr(features, "FEATURE_NAMES", ()) or ()) or None
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
            entry = report.setdefault(defect, {
                "feature": feature,
                # A declaration naming a feature the pipeline no longer computes is a fact about the
                # DECLARATION, recorded once here so every record does not report it as absent evidence.
                "declarationStale": vector is not None and feature not in vector,
                "records": 0, "missing": [], "examples": [],
            })
            entry["records"] += 1
            if float(values.get(feature, 0.0)):
                continue
            entry["missing"].append(case_id)
            if len(entry["examples"]) < 3 and not entry["declarationStale"]:
                # The evidence, not just the count. What the page ANNOUNCED is the only thing that can say
                # why a relation did not hold, and fetching it by hand afterwards is the step this exists
                # to remove. Skipped for a stale declaration, where the transcript says nothing at all.
                entry["examples"].append({
                    "case": case_id,
                    "transcript": [str(line) for line in (record["input"].get("transcript") or [])][:14],
                    "otherFeaturesPresent": sorted(
                        name for name, value in values.items() if float(value or 0.0)
                    )[:12],
                })
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
    stale_declarations = []
    for defect, entry in sorted(report.items()):
        missing = entry["missing"]
        if entry.get("declarationStale"):
            mark = "STALE"
            stale_declarations.append(defect)
        elif missing:
            mark = "FAIL"
            broken.append(defect)
        else:
            mark = "OK"
        print(f"  {mark:5s} {defect:22s} grants {entry['feature']:32s} "
              f"{entry['records'] - len(missing):4d}/{entry['records']:4d} carry it")
        if entry.get("declarationStale"):
            print("           ^ that feature is NOT in the pipeline's feature vector. The DECLARATION is")
            print("             stale, not the corpus — these records were never examined for anything.")
            continue
        for case in missing[:6]:
            print(f"           missing: {case}")
        if len(missing) > 6:
            print(f"           ... and {len(missing) - 6} more")
        for example in entry.get("examples", []):
            print(f"\n           WHAT {example['case']} ANNOUNCED:")
            for line in example["transcript"]:
                print(f"             {line!r}")
            print(f"           features it DOES carry: {', '.join(example['otherFeaturesPresent'])}\n")

    if stale_declarations:
        print(f"\n  {len(stale_declarations)} STALE declaration(s): {', '.join(stale_declarations)}")
        print("  These name a feature the pipeline no longer computes. Fix the declaration; the corpus is")
        print("  not implicated, and reporting it as missing evidence sends the next reader to the wrong")
        print("  layer entirely.")

    # WRITTEN TO DISK, not only printed. `lab-fetch.yml` exists because "a job interface that can start a
    # 4-hour training run and cannot return its report leaves you diagnosing from log fragments" — and the
    # first real run of this audit proved the point twice over: it exited 1 and its journal read
    # `-- No entries --`, so the finding was unreadable. A report that only exists as stdout is a report
    # that a job runner can lose.
    out = REPO / "runs" / "grants-audit.json"
    out.write_text(json.dumps({"records": len(records), "defects": report}, indent=2) + "\n",
                   encoding="utf-8")
    print(f"\n  report written to {out.relative_to(REPO)}")

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
