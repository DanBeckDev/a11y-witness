"""An uncalibrated head must not fall back to the cut that accuses most.

`choose_threshold` takes the lowest threshold reaching zero false positives. When NOTHING on the grid
reaches zero the head cannot be calibrated, and the old code returned a fixed 0.5 — a value its own
docstring called "a value nobody chose".

Measured on the real candidate report of 2026-08-24, 0.5 was not merely arbitrary but the wrong end of
the trade this project has a stated preference about, and in one case strictly dominated:

    2.1.2:focus-trapped        36 false positives at 0.5, against 4 at 0.95
    2.4.2:route-title-stale     6 at 0.5, against 2 at 0.75 AT THE SAME RECALL
    1.3.1:unassociated-table    2 at 0.5, against 1 at 0.55

The sweeps below are those measurements, trimmed to the rows that carry the argument. A test written
against invented numbers could not have found this, and could not show it stays fixed.
"""
import importlib.util
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "packages" / "lab" / "scripts" / "train-screenreader-model.py"


def load():
    spec = importlib.util.spec_from_file_location("trainer", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["trainer"] = module
    spec.loader.exec_module(module)
    return module


def row(threshold, false_positive, recall, f1=0.0):
    return {"threshold": threshold, "falsePositive": false_positive, "recall": recall, "f1": f1}


# 2.4.2:route-title-stale, as measured. 0.75 has the SAME recall as 0.5 and a third of the accusations,
# so the old fallback was not a judgement call between recall and precision — it was simply worse.
ROUTE_TITLE_STALE = [
    row(0.05, 50, 0.571), row(0.35, 10, 0.571), row(0.40, 8, 0.429), row(0.45, 6, 0.286),
    row(0.50, 6, 0.286), row(0.55, 5, 0.286), row(0.70, 3, 0.286), row(0.75, 2, 0.286),
    row(0.80, 2, 0.143), row(0.95, 2, 0.143),
]


def test_a_dominated_fallback_is_not_chosen():
    trainer = load()
    warnings = []
    chosen = trainer.choose_threshold(ROUTE_TITLE_STALE, "2.4.2:route-title-stale", warnings)
    assert chosen == 0.75, (
        f"0.5 gave 6 false positives at recall 0.286 and 0.75 gives 2 at the same recall; chose {chosen}"
    )
    assert warnings, "an uncalibrated head must still say so — the fallback is reported, not silent"
    assert "NOT calibrated" in warnings[0]


def test_the_fallback_can_never_be_worse_than_the_old_fixed_one():
    # 0.5 is itself always among the candidates, so the minimum over the grid is bounded by it. Asserted
    # rather than reasoned, over each real sweep, because "it cannot be worse" is exactly the kind of
    # claim this repo has watched go quietly false.
    trainer = load()
    focus_trapped = [row(0.05, 118, 0.75), row(0.50, 36, 0.25), row(0.80, 9, 0.25), row(0.95, 4, 0.0)]
    unassociated = [row(0.20, 7, 1.0), row(0.50, 2, 0.975), row(0.55, 1, 0.967), row(0.95, 1, 0.877)]
    for name, sweep in [("2.4.2", ROUTE_TITLE_STALE), ("2.1.2", focus_trapped), ("1.3.1", unassociated)]:
        chosen = trainer.choose_threshold(sweep, name, [])
        at_chosen = next(r for r in sweep if r["threshold"] == chosen)
        at_half = next(r for r in sweep if r["threshold"] == 0.5)
        assert at_chosen["falsePositive"] <= at_half["falsePositive"], name


def test_ties_on_false_positives_go_to_recall_not_to_caution():
    # 1.3.1:unassociated-table: 0.55 and 0.95 both carry one false positive, and 0.55 finds 11 more
    # defects. A fallback that just took the most conservative cut would throw those away for nothing.
    trainer = load()
    unassociated = [row(0.50, 2, 0.975), row(0.55, 1, 0.967), row(0.80, 1, 0.967), row(0.95, 1, 0.877)]
    assert trainer.choose_threshold(unassociated, "1.3.1:unassociated-table", []) == 0.55


def test_a_calibrated_head_is_untouched_by_any_of_this():
    # The fallback must not reach a head that HAS a clean cut. 3.3.1's real sweep: one negative sits at
    # 0.90, so 0.95 is the only zero-false-positive cut and must still be chosen despite its lower recall.
    trainer = load()
    validation_silent = [
        row(0.50, 31, 0.917, f1=0.87), row(0.85, 5, 0.893, f1=0.90),
        row(0.90, 1, 0.868, f1=0.92), row(0.95, 0, 0.802, f1=0.89),
    ]
    assert trainer.choose_threshold(validation_silent, "3.3.1:validation-error-silent", []) == 0.95
