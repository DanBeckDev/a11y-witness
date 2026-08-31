"""WHY does this feature read what it reads on this subtype's positives?

A count is where an investigation stops. `scorer:shortcuts` says a head vetoed a feature; `corpus:starvation`
says a feature will be constant across a subtype's positives; **neither says WHY**, and the difference
decides the remedy entirely: a feature that is 0 because no page could carry it is `IMPOSSIBLE_BY_DEFINITION`,
one that is 0 because a probe never ran is a capture question, and one that is 0 because the corpus is thin
is the only kind ADR 0015's corpus remedy applies to. Those three need opposite work.

The question was asked three times in one session on 2026-08-30 and answered by guessing each time -- once
wrongly enough to be recorded and withdrawn (`not-working.md` §2, "I priced form_change_nonempty wrong").
This asks it properly: compute the feature with the REAL featurizer, group by label, and print the raw
channels the feature reads for a sample of the records that surprised you.

    npm run scorer:explain-feature -- --subtype 3.3.1:validation-error-silent --feature form_change_nonempty

IT SHOWS RECORDS, NOT ONLY NUMBERS, for the reason `audit_grants.py` learned: "13 records lack it" sent an
investigation theorising twice, and the answer was visible in one line of the transcript once it was
printed. Three records is the default because that is what fits in a report somebody will read.

It computes through `structured_feature_values` rather than restating the feature's logic -- a second
implementation of the thing under test is this repo's most expensive recurring shape, and here it would
report confidently about a function that no longer exists.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import screenreader_features as features  # noqa: E402

#: The channels a form-probe feature reads. Printed raw for a sampled record, because the interesting part
#: is usually a field the feature does NOT read -- `kind` and `baselineQuiet` both travelled on every entry
#: for weeks while nothing consulted them.
INTERACTION_CHANNELS = ("stateChanges", "formChanges", "postSubmitFields", "controls")


def positives_for(records: list[dict[str, Any]], subtype: str) -> list[dict[str, Any]]:
    return [r for r in records if subtype in (r.get("target", {}).get("subtypes") or [])]


def negatives_for(records: list[dict[str, Any]], subtype: str) -> list[dict[str, Any]]:
    return [r for r in records if subtype not in (r.get("target", {}).get("subtypes") or [])]


def value_of(record: dict[str, Any], feature: str) -> float:
    return features.structured_feature_values(record)[feature]


def describe(record: dict[str, Any]) -> str:
    interaction = (record.get("input", {}).get("interaction") or {})
    lines = [f"    case: {record.get('provenance', {}).get('caseId', '(unknown)')}"]
    for channel in INTERACTION_CHANNELS:
        value = interaction.get(channel) or []
        rendered = json.dumps(value)[:220] if value else "[]"
        lines.append(f"      {channel}: {rendered}")
    return "\n".join(lines)


def report(records: list[dict[str, Any]], subtype: str, feature: str, samples: int) -> int:
    if feature not in features.FEATURE_NAMES:
        print(f"no such feature: {feature}\n  it takes one of: {', '.join(features.FEATURE_NAMES)}")
        return 2
    positives = positives_for(records, subtype)
    if not positives:
        # EXAMINED NOTHING is not a clean result, and a mistyped subtype looks exactly like a clean one.
        print(f"no record carries subtype {subtype}. Nothing was examined, which is not the same as 0.")
        return 2

    on = [r for r in positives if value_of(r, feature) > 0]
    off = [r for r in positives if value_of(r, feature) == 0]
    negatives = negatives_for(records, subtype)
    negative_on = sum(1 for r in negatives if value_of(r, feature) > 0)

    print(f"{feature} on {subtype}")
    print(f"  positives      : {len(positives)}")
    print(f"    reads 1      : {len(on)}")
    print(f"    reads 0      : {len(off)}")
    print(f"  elsewhere      : {negative_on} of {len(negatives)} non-positive record(s) read 1")
    print("")
    if not off:
        print("  Never 0 on a positive, so it cannot be a free veto for this head.")
        return 0
    if not on and negative_on:
        print("  CONSTANT 0 across every positive while other records carry it — the free-veto shape.")
        print("  Whether that is definitional, a probe that never ran, or a thin corpus is what the")
        print("  channels below are for. Those three need opposite remedies.")
    elif not on:
        print("  0 everywhere, positives and negatives alike. A feature no record carries predicts")
        print("  nothing and vetoes nothing; check it is still computed at all.")
    print("")
    print(f"  the channels this feature reads, on {min(samples, len(off))} record(s) that read 0:")
    for record in off[:samples]:
        print(describe(record))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default="runs/screenreader-dataset/with-realism.jsonl")
    parser.add_argument("--subtype", required=True)
    parser.add_argument("--feature", required=True)
    parser.add_argument("--samples", type=int, default=3)
    args = parser.parse_args()

    path = Path(args.data)
    if not path.exists():
        print(f"no exported dataset at {path} — run `npm run training:export` first.")
        return 2
    return report(features.read_records(path), args.subtype, args.feature, args.samples)


if __name__ == "__main__":
    raise SystemExit(main())
