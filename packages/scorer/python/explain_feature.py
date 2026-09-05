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


def positives_for(records: list[dict[str, Any]], subtype: str) -> list[dict[str, Any]]:
    return [r for r in records if subtype in (r.get("target", {}).get("subtypes") or [])]


def negatives_for(records: list[dict[str, Any]], subtype: str) -> list[dict[str, Any]]:
    return [r for r in records if subtype not in (r.get("target", {}).get("subtypes") or [])]


def value_of(record: dict[str, Any], feature: str) -> float:
    return features.structured_feature_values(record)[feature]


def describe(record: dict[str, Any]) -> str:
    # THE UNION of every channel the RECORD carries and every channel the FEATURIZER reads.
    #
    # Printing only what the record carries (an earlier version of this function) has exactly the failure
    # this repo names repeatedly: a channel `structured_feature_values` consults but this record lacks
    # entirely never appears, so "this record has no formChanges" and "we did not print formChanges" become
    # the same silence -- reproduced on `{"input": {"interaction": {"controls": [...]}}}`, which printed
    # `controls` and said nothing about `formChanges` at all. `FEATURIZED_INTERACTION_CHANNELS` is imported
    # rather than re-listed here, because a hand-written duplicate of exactly that set is what went stale
    # in this file once already.
    #
    # Three states, printed distinguishably: a channel with entries, a channel present but empty (`[]` --
    # captured, and there was nothing), and a channel ABSENT from the record (never captured at all). The
    # last two look identical unless said in words.
    interaction = (record.get("input", {}).get("interaction") or {})
    channels = sorted(set(interaction) | set(features.FEATURIZED_INTERACTION_CHANNELS))
    lines = [f"    case: {record.get('provenance', {}).get('caseId', '(unknown)')}"]
    for channel in channels:
        if channel not in interaction:
            lines.append(f"      {channel}: (ABSENT -- not captured on this record)")
            continue
        value = interaction[channel] or []
        rendered = json.dumps(value)[:220] if value else "[]"
        lines.append(f"      {channel}: {rendered}")
    return "\n".join(lines)


def channel_composition(records: list[dict[str, Any]]) -> list[str]:
    """What the form-probe channels actually CONTAIN across these records, not just whether they are empty.

    The fields a feature does not read are where the answers keep turning out to be. `kind` decides whether
    a silent activation was a SUBMIT (schema v17 was that fix), and `baselineQuiet` says whether the delta
    was measured soundly at all -- an untrustworthy one read as "nothing was announced" is the fixed-sleep
    defect, which inverted findings rather than adding noise. Both travelled on every entry unconsulted.
    """
    kinds: dict[str, int] = {}
    state_total = state_errored = 0
    quiet = {"true": 0, "false": 0, "absent": 0}
    entries = 0
    for record in records:
        # STATE CHANGES that ERRORED. `capture-core` keeps a failed probe as `{after: null, error}` so it
        # stays distinguishable from silence; whether any exist decides whether a change to the features
        # reading them is a MEANING change or a latent one, and that decides a schema bump.
        for change in ((record.get("input", {}).get("interaction") or {}).get("stateChanges") or []):
            state_total += 1
            if change.get("error"):
                state_errored += 1
        for change in ((record.get("input", {}).get("interaction") or {}).get("formChanges") or []):
            entries += 1
            kinds[str(change.get("kind", "(absent)"))] = kinds.get(str(change.get("kind", "(absent)")), 0) + 1
            flag = change.get("baselineQuiet")
            quiet["absent" if flag is None else ("true" if flag else "false")] += 1
    state_line = (f"  stateChanges entries: {state_total}   of which ERRORED: {state_errored}"
                  + ("   <- a failed probe is not silence; the features reading it must exclude these"
                     if state_errored else ""))
    if not entries:
        return [state_line,
                "  formChanges: no entries at all across these records — nothing was ever activated"]
    by_kind = ", ".join(f"{k}={n}" for k, n in sorted(kinds.items()))
    return [
        state_line,
        f"  formChanges entries: {entries}   by kind: {by_kind}",
        f"    baselineQuiet: true={quiet['true']} false={quiet['false']} absent={quiet['absent']}"
        + ("   <- a FALSE here means the delta was not soundly measured, in either direction"
           if quiet["false"] else ""),
    ]


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
    # ALWAYS, before any verdict returns. What the channels CONTAIN is the answer to a different question
    # from "is this a free veto", and the early return withheld it from every head where the feature is
    # never 0 -- which is exactly where you ask it when you want to know whether a change can move a record.
    for line in channel_composition(positives):
        print(line)
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
