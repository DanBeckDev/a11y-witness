"""Neyman-Pearson type-I error control: the cut promises something about pages nobody has seen.

Replaces a grid search for "the lowest cut with zero false positives on the development set". That
target is free and unfalsifiable — the threshold was chosen to make it true, so all thirteen heads
reported precision 1.000 by construction and the number measured nothing. Worse, it made the cut an
extreme order statistic on a 0.05 grid, so on 2026-08-24 one conformant record crossing 0.90 moved
`3.3.1` from 15 missed findings to 24 and read exactly like the head getting worse.

Tong, Feng & Li (Science Advances, 2018), Proposition 1: for `1(score > s_(r))` over `n` held-out
negatives, P[population type I error > alpha] <= v(r) = SUM_{j=r..n} C(n,j)(1-alpha)^j alpha^(n-j),
and control needs n >= log(delta)/log(1-alpha).

The numbers below are checked against that arithmetic directly, not against our implementation's own
output — a test that re-derives its expectations from the code it is testing is this repo's oldest
recurring defect.
"""
import importlib.util
import math
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


def test_minimum_sample_size_matches_the_published_formula():
    trainer = load()
    for alpha in (0.005, 0.01, 0.02, 0.05):
        expected = math.ceil(math.log(0.05) / math.log(1 - alpha))
        assert trainer.np_minimum_negatives(alpha, 0.05) == expected
    # The concrete consequence for this corpus, stated so a shrinking corpus trips the test: at our
    # alpha we need 598 held-out negatives per head, and today every head has more than 1,800.
    assert trainer.np_minimum_negatives(0.005, 0.05) == 598


def test_a_head_with_too_few_negatives_cannot_be_calibrated_and_says_so():
    # The failure that must never be silent. With 100 negatives, no order statistic controls 0.5% —
    # (1-0.005)^100 = 0.606, far above delta. The old code would still have returned a plausible float.
    trainer = load()
    assert trainer.np_rank(100, 0.005, 0.05) is None
    warnings = []
    cut, guarantee = trainer.np_threshold([i / 100 for i in range(100)], "1.3.1:demo", warnings)
    assert guarantee["atTarget"] is False
    assert warnings and "NOT calibrated to target" in warnings[0]
    # It must report the alpha it actually bought, not the one it was asked for.
    assert guarantee["falsePositiveRate"] > 0.005
    assert math.isclose(guarantee["falsePositiveRate"], 1 - 0.05 ** (1 / 100), rel_tol=1e-9)


def test_the_violation_rate_bound_is_the_published_sum():
    trainer = load()
    # Small enough to evaluate the binomial sum exactly, so this checks the log-space implementation
    # against arithmetic rather than against itself.
    n, alpha = 40, 0.05
    for r in (30, 35, 40):
        expected = sum(math.comb(n, j) * (1 - alpha) ** j * alpha ** (n - j) for j in range(r, n + 1))
        assert math.isclose(trainer.np_violation_rate(n, r, alpha), expected, rel_tol=1e-9)


def test_the_rank_is_the_smallest_one_that_holds_the_bound():
    trainer = load()
    n, alpha, delta = 800, 0.01, 0.05
    rank = trainer.np_rank(n, alpha, delta)
    assert trainer.np_violation_rate(n, rank, alpha) <= delta, "the chosen rank must hold the bound"
    assert trainer.np_violation_rate(n, rank - 1, alpha) > delta, "and it must be the SMALLEST that does"


def test_the_cut_excludes_the_negative_it_sits_on_IN_FLOAT32():
    """Inference compares `score >= threshold`; the proposition is stated for `score > s_(r)`.

    The first version of this test used round Python floats and passed against a cut nudged with
    `math.nextafter` — which is float64, and is rounded straight back onto the value it was meant to
    clear the moment it meets the float32 tensor the head scores actually live in. Every one of the
    seventeen heads shipped exactly one false positive more than its rank permitted, and the test saw
    nothing, because it never exercised the dtype the code runs on. A test written against a shape
    nobody verified is this repo's oldest defect.

    So: scores that are genuinely float32, and the comparison made in float32 as `metrics` makes it.
    """
    trainer = load()
    import numpy

    # Values with no exact float32 representation, so a float64 nudge cannot survive the cast.
    negatives = [float(numpy.float32(0.1 + i * 0.0007123)) for i in range(900)]
    cut, guarantee = trainer.np_threshold(negatives, "3.3.1:demo", [])
    at_rank = sorted(negatives)[guarantee["rank"] - 1]

    as_float32 = numpy.array(negatives, dtype=numpy.float32)
    admitted = int((as_float32 >= numpy.float32(cut)).sum())
    assert numpy.float32(cut) > numpy.float32(at_rank), "the cut must clear its order statistic in FLOAT32"
    assert admitted == guarantee["permittedFalsePositives"], (
        f"cut admits {admitted} negatives, rank permits {guarantee['permittedFalsePositives']}"
    )
    # And in float64, which is how `score.py` compares — one threshold must be right in both.
    assert sum(1 for s in negatives if s >= cut) == guarantee["permittedFalsePositives"]


def test_a_cut_that_admits_more_than_its_rank_permits_REFUSES_to_return():
    # The counting check, which does not share a failure mode with the arithmetic that produced the cut.
    # Verified by driving the helper to return something wrong rather than by trusting it.
    trainer = load()
    original = trainer.float32_above
    try:
        trainer.float32_above = lambda value: value  # a nudge that does not clear the value
        try:
            trainer.np_threshold([i / 1000 for i in range(900)], "3.3.1:demo", [])
        except RuntimeError as error:
            assert "do not ship these weights" in str(error)
        else:
            raise AssertionError("a cut admitting more negatives than its rank permits must refuse")
    finally:
        trainer.float32_above = original


def test_recall_is_an_outcome_and_the_positives_never_move_the_cut():
    # The property that makes the bound distribution-free: the threshold is a statistic of the NEGATIVE
    # scores alone. If positives could influence it, the guarantee would depend on how they are spread.
    trainer = load()
    negatives = [i / 1000 for i in range(1000)]
    first, _ = trainer.np_threshold(negatives, "x", [])
    second, _ = trainer.np_threshold(list(reversed(negatives)), "x", [])
    assert first == second, "the cut must not depend on the order the negatives arrive in"
