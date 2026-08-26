"""Does NVDA ever announce LEAVING a container, and which ones does it never close?

`vague_link_lacks_context` tracks open containers as a stream: a container announced on entry stays open
until `"out of <role>"` says otherwise. That model is exactly right for a list, and it is a question for a
LANDMARK — because if NVDA never emits `out of navigation landmark`, a landmark opened at the top of the
page is open for every announcement after it, and "this link is inside a nav" stops being a fact about the
link.

Measured 2026-08-26 on two records the grants audit refused to pass:

    'navigation landmark, list, with 2 items, bullet, same page, link, Bookings'   <- opens BOTH
    'out of list, Opening times and directions for the Riverside Centre.'          <- closes the LIST only
    'same page, link, Details'                                                     <- reads as in-nav

The link sits after the nav in the markup. Whether that is a defect depends on a fact nobody had
established: does NVDA announce landmark exits at all? This answers it over the whole corpus rather than
from two records, because two records is the sample size that has been wrong twice tonight.
"""
from __future__ import annotations

import collections
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import screenreader_features as features  # noqa: E402

REPO = Path(__file__).resolve().parents[3]


def survey(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Which container roles are entered, which are left, and which are never left. PURE."""
    entered: collections.Counter[str] = collections.Counter()
    left: collections.Counter[str] = collections.Counter()
    examined = 0
    for record in records:
        try:
            units = features.parsed_units(record, "transcript")
        except (RuntimeError, KeyError):
            continue
        examined += 1
        for unit in units:
            for role in unit.get("leaving") or []:
                left[str(role).strip().lower()] += 1
            for container in unit.get("containers") or []:
                role = str(container.get("role") or "").strip().lower()
                if role:
                    entered[role] += 1
    return {
        "examined": examined,
        "entered": dict(entered),
        "left": dict(left),
        "neverLeft": sorted(role for role in entered if role not in left),
    }


def read(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> int:
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

    report = survey(records)
    if not report["examined"]:
        print("\n  NO RECORD COULD BE PARSED — refusing rather than reporting a clean survey.")
        return 2

    print(f"\n  {report['examined']} record(s) parsed\n")
    print("  ENTERED                        entered    left")
    for role, count in sorted(report["entered"].items(), key=lambda kv: -kv[1]):
        closes = report["left"].get(role, 0)
        mark = "  NEVER CLOSED" if closes == 0 else ""
        print(f"    {role:28s} {count:7d} {closes:7d}{mark}")

    out = REPO / "runs" / "container-exits.json"
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"\n  report written to {out.relative_to(REPO)}")

    if report["neverLeft"]:
        print(f"\n  {len(report['neverLeft'])} container role(s) are ENTERED and never announced as left:")
        for role in report["neverLeft"]:
            print(f"    {role}")
        print("\n  A container that never closes stays open for the rest of the transcript, so any rule")
        print("  that reads it as CONTEXT is making a claim about the top of the page rather than about")
        print("  the announcement in front of it.")
    # Reported, never blocking: this is a fact about NVDA, not a defect in the corpus. What consumes it
    # decides what to do — and `vague_link_lacks_context` is the one that must.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
