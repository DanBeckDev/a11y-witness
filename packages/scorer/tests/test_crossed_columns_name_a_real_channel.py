"""A `..._observed_*` column must name a channel the capture actually carries in `observed`.

**This guard exists because the first version of the feature cross shipped a DEAD PAIR.**
`state_change_observed_present` / `_absent` were crossed with `observed["stateChanges"]`, which no capture
has ever held -- so both read 0 on every record, and the columns looked like coverage while carrying
nothing. Only `corpus:distribution` would have caught it, after a full retrain.

The channel is not missing by oversight, and that is the lesson. `probeKindFor` returns "disclosure"
BEFORE the `probeForms` gate, so the disclosure probe runs on every capture that meets a control announced
`collapsed`; an empty `stateChanges` means one thing, and a probe that ran and threw pushes an entry
carrying `error` rather than leaving the channel empty. The capture declines to record a question it never
had to ask, and `observed`'s membership is that decision written down. **Not every empty channel shares
one ambiguity** -- crossing on that assumption is what produced the dead pair.

So this reads the CAPTURES rather than anyone's memory of them, which is the same remedy
`evidence-fields.test.ts` applies to the field lists it discovered were guesses.

It skips honestly when no capture on disk carries `observed`, and says so: a guard that passes having
examined nothing is the defect it is here to prevent, one layer out.
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT.parent / "packages" / "scorer" / "python"))

from screenreader_features import FEATURE_NAMES  # noqa: E402

CAPTURES = ROOT.parent / "runs" / "screenreader-dataset" / "captures"

# `state_change` -> `stateChanges`. The features are snake_case and singular, the channels camelCase and
# plural, so the mapping is spelled out rather than transformed -- a transform would have to guess at the
# pluralisation and would quietly "succeed" on a name that does not exist, which is this test's subject.
CHANNEL_FOR = {
    "form_change": "formChanges",
    "post_submit": "postSubmitFields",
    "state_change": "stateChanges",
    "heading": "headings",
    "link": "links",
    "graphic": "graphics",
    "landmark": "landmarks",
    "table": "tableCells",
    "form_field": "formFields",
}


def observed_channels() -> set[str]:
    channels: set[str] = set()
    if not CAPTURES.is_dir():
        return channels
    for path in CAPTURES.glob("*.json"):
        try:
            raw = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        capture = raw.get("capture", raw)
        channels.update((capture.get("observed") or {}).keys())
    return channels


def crossed_features() -> list[str]:
    return [name for name in FEATURE_NAMES if "_observed_present" in name or "_observed_absent" in name]


def test_every_crossed_column_names_a_channel_the_captures_carry():
    channels = observed_channels()
    if not channels:
        pytest.skip(
            "no capture under runs/screenreader-dataset/captures carries `observed`, so this guard has "
            "nothing to check against. It is not passing -- it did not run.")

    crossed = crossed_features()
    assert crossed, (
        "no `..._observed_*` feature is in FEATURE_NAMES, so this test examines nothing. If the cross was "
        "deliberately reverted, delete this file with the refutation recorded; do not leave it passing.")

    unbacked = []
    for name in crossed:
        stem = name.rsplit("_observed_", 1)[0]
        channel = CHANNEL_FOR.get(stem)
        if channel is None:
            unbacked.append(f"{name}: no channel is mapped for the stem `{stem}` -- add it to CHANNEL_FOR")
        elif channel not in channels:
            unbacked.append(
                f"{name}: crosses on `observed[{channel!r}]`, which NO capture carries. Both columns "
                f"would read 0 on every record -- a dead column that looks like coverage. Channels the "
                f"captures actually hold: {', '.join(sorted(channels))}")

    assert unbacked == [], "\n  ".join(["crossed columns with no observation behind them:"] + unbacked)


def test_the_channels_this_test_maps_are_real():
    """A stale entry in CHANNEL_FOR forgives nothing, but it makes this test look more thorough than it is.

    `2.4.1:skip-link-inert: ["skip_link_moves_focus"]` sat in the unclosable map naming a feature the
    pipeline has never computed, and a reader scanning it read the subtype as handled. Same shape here: a
    mapping for a channel no capture holds would silently never be exercised.
    """
    channels = observed_channels()
    if not channels:
        pytest.skip("no capture carries `observed`; nothing to compare the map against.")
    # `stateChanges` is deliberately NOT in the captures -- see the docstring. It stays in the map so that
    # re-crossing it fails LOUDLY on the channel rather than vaguely on a missing stem.
    stale = sorted(set(CHANNEL_FOR.values()) - channels - {"stateChanges"})
    assert stale == [], (
        "CHANNEL_FOR maps channels no capture carries, so those entries can never be exercised: "
        + ", ".join(stale))
