"""A crossed pair whose "asked and absent" row cannot OCCUR is a dead column that looks like coverage.

`test_crossed_columns_name_a_real_channel.py` is the sibling of this guard and asks a narrower question:
does any capture carry `observed[<channel>]` at all? That catches the first dead pair this project shipped
-- `state_change_observed_*`, crossed on a channel no capture has -- and it is structurally blind to the
second. `postSubmitFields` IS in `observed`; what could not occur was one of the pair's two OUTCOMES.

Reaching `post_submit_observed_absent` needs a submit that navigates to a fieldless confirmation, which
needs a `formState`, and `CASES` declares one on ZERO of 1,645 cases. So the column read a single value
across the whole corpus with certainty, and every check that could see it runs LATER than the money:

- `corpus:starvation` asks whether a feature is constant on a SUBTYPE's positives, so a corpus-wide
  constant arrives once per subtype as work nobody can complete, never once as the fact behind them all.
- `scorer:shortcuts`' constant-column report -- the gate `schema-migration.json` names for exactly this --
  reads TRAINED WEIGHTS, so it cannot speak until a train has been paid for.
- `corpus:distribution` asks whether an ARRAY FIELD is empty on every record. A computed feature is not a
  field and is not in the export, so it is blind to this by construction.

This one computes the columns through the REAL featurizer over the captures on disk, before any train.
That is the whole point: it moves the answer from after a retrain to before one.

It SKIPS honestly, naming what it did not examine, when there is no corpus here -- `runs/` is gitignored,
so CI and a fresh worktree both have none, and a guard that passes having read nothing is the defect it
exists to prevent one layer out.
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scorer" / "python"))

from screenreader_features import FEATURE_NAMES, structured_feature_values  # noqa: E402

CAPTURES = ROOT.parent / "runs" / "screenreader-dataset" / "captures"

# Enough captures for "constant" to mean something. A handful of records can be genuinely uniform by
# chance; a corpus-wide constant over hundreds is a property of the definition.
ENOUGH = 200


def crossed_columns() -> list[str]:
    return [name for name in FEATURE_NAMES if "_observed_present" in name or "_observed_absent" in name]


def captures():
    if not CAPTURES.is_dir():
        return
    for path in sorted(CAPTURES.glob("*.json")):
        try:
            raw = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        yield path.name, raw.get("capture", raw)


def test_no_crossed_column_reads_one_value_across_the_whole_corpus():
    columns = crossed_columns()
    # Vacuity guard. If the cross were reverted entirely this test would pass having compared nothing, so
    # say so instead: delete the file with the refutation recorded rather than leave it green.
    assert columns, (
        "no `..._observed_*` column is in FEATURE_NAMES, so this test examines nothing. If the feature "
        "cross was reverted, delete this file and record the refutation.")

    seen: dict[str, set[float]] = {name: set() for name in columns}
    total = 0
    for _name, capture in captures():
        try:
            values = structured_feature_values(capture)
        except Exception:  # noqa: BLE001 -- a capture the featurizer cannot read is not this test's subject
            continue
        total += 1
        for name in columns:
            seen[name].add(values[name])

    if total < ENOUGH:
        pytest.skip(
            f"only {total} usable capture(s) under {CAPTURES} (need {ENOUGH}); this guard did NOT run. "
            "The authoritative answer is on the box that owns the corpus.")

    constant = sorted(
        f"{name} = {next(iter(values))} on all {total} captures" for name, values in seen.items()
        if len(values) == 1)
    assert constant == [], (
        "these crossed columns read ONE value across the whole corpus, so they carry no information and "
        "a head can take a free weight on them -- a dead column that looks like coverage:\n  "
        + "\n  ".join(constant)
        + "\nEither the channel's `asked and absent` row is unreachable in the corpus (add the case that "
          "makes it occur), or the pair should be withdrawn. `post_submit_observed_absent` was withdrawn "
          "for exactly this: no case declares a `formState`, so a fieldless confirmation cannot happen.")
