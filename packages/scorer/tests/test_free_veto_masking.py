"""A feature constant across a head's positives may not carry a weight.

ADR 0015's free veto, as a constraint rather than a report. The definition is a feature strictly one
value across a subtype's positives while varying over the negatives: the head can then give it a large
negative weight at no cost to recall, and no held-out split can punish that because the split has the
same structure. `form_field_named` at -4.33 on the shipped weights means the scorer reports an unnamed
control ONLY on a page where nothing is correctly named.

`scorer:shortcuts` has reported these for months and could only ever recommend corpus work. Measured
2026-09-01: 9 closable vetoes, and 8 of them are a head penalising a feature that answers a DIFFERENT
criterion's question -- `2.4.1:skip-link-inert` on `validation_error_missing` (3.3.1's).

The plan's proposed remedy was to split each ambiguous feature into `asked AND x` / `asked AND not-x`.
Checked against these vetoes and REFUTED before it was built: where a subtype's positives never run
`probeForms`, both conjunction columns are constant zero over those positives, so the split turns one
free veto into two. That refutation is why this file exists in this form.
"""
import importlib.util
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "packages" / "lab" / "scripts" / "train-screenreader-model.py"

torch = pytest.importorskip("torch")


def load():
    spec = importlib.util.spec_from_file_location("trainer", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["trainer"] = module
    spec.loader.exec_module(module)
    return module


def _fixture():
    """Three records, one evidence unit each. Column 1 is the free veto.

    col 0 varies across positives      -> informative, must survive
    col 1 is 0 on both positives, 1 on the negative -> THE FREE VETO, must be masked
    col 2 is 1.0 on every positive     -> the subtype's DEFINING EVIDENCE, must survive
    """
    features = torch.tensor([
        [1.0, 0.0, 1.0],   # record 0, positive
        [0.0, 0.0, 1.0],   # record 1, positive
        [1.0, 1.0, 0.0],   # record 2, negative
    ])
    offsets = [0, 1, 2, 3]
    labels = torch.tensor([1, 1, 0])
    return features, offsets, labels


def test_a_column_constant_across_positives_is_uninformative():
    trainer = load()
    features, offsets, labels = _fixture()
    mask = trainer.uninformative_columns(features, offsets, labels, [0, 1, 2])
    assert not bool(mask[0]), "column 0 varies across the positives and must be kept"
    assert bool(mask[1]), "column 1 is 0 on every positive and 1 on the negative — the free veto"
    # THE REGRESSION THIS FILE EXISTS TO PREVENT. The first version masked any column CONSTANT across
    # the positives, which includes one constant at 1.0 — a subtype's defining evidence. Held-out
    # acceptance caught it at once: 2.4.4 lost 20 findings, 1.3.1 lost 16, 2.4.6 gained 10 false
    # positives. Gradient is proportional to the input, so only a ZERO column is fitted by negatives
    # alone; a ones column is fitted by both and is what separates them.
    assert not bool(mask[2]), "column 2 is 1.0 on every positive — that is the evidence, not a veto"


def test_the_veto_column_ends_with_a_weight_of_exactly_zero():
    # THE POINT OF THE WHOLE CHANGE. Training-time masking alone is not enough: a constant-zero input
    # receives no gradient, so its weight keeps its RANDOM INITIALISATION -- a small nonzero number that
    # `scorer:shortcuts` still reads as a veto and `score.py` still applies. That looks fixed and is not.
    trainer = load()
    features, offsets, labels = _fixture()
    weight, _bias = trainer.train_head(features, offsets, labels, [0, 1, 2], epochs=40)
    assert weight[0, 1].item() == 0.0, "the free-veto column must carry exactly zero, not merely a small number"
    assert weight[0, 2].item() != 0.0, "the defining-evidence column must still be learned"
    assert weight[0, 0].item() != 0.0, "the informative column must still be learned"


def test_training_does_not_mutate_the_caller_s_feature_matrix():
    # `train_head` is called once per fold AND once for the final fit, over the SAME matrix. Zeroing it
    # in place would mean each head silently trained on the columns every previous head had masked --
    # an order-dependent model, and the kind of defect that produces plausible numbers.
    trainer = load()
    features, offsets, labels = _fixture()
    before = features.clone()
    trainer.train_head(features, offsets, labels, [0, 1, 2], epochs=5)
    assert torch.equal(features, before), "train_head must not modify the shared feature matrix"


def test_a_split_with_no_positives_masks_nothing():
    # "Constant across an empty set" is vacuously true, and reading it as `mask everything` would silence
    # every feature on a fold that happens to hold no positives. The caller guards that case; this must
    # not pre-empt it by returning an all-true mask.
    trainer = load()
    features, offsets, labels = _fixture()
    mask = trainer.uninformative_columns(features, offsets, labels, [2])
    assert not bool(mask.any()), "no positives means nothing is known to be uninformative"


def test_a_by_definition_complement_is_exempt():
    """A feature the subtype CANNOT carry keeps its weight — the distinction the gate insisted on.

    `3.3.1:validation-error-silent` IS the absence of an announced error, so `validation_error_announced`
    is 0 on every one of its positives by MEANING. A head weighing that negatively has learned
    "announced, therefore not silent" — correct, and it generalises. Masking it cost two held-out
    findings on `acceptance-b2-error-vessel/bad` and removed no shortcut, because there was none there.

    Built at the FULL engineered width rather than the 3-column fixture above, because the exemption is
    resolved by POSITION — the engineered block is the last `len(FEATURE_NAMES)` columns — and a narrow
    fixture would skip, which proves nothing.
    """
    trainer = load()
    width = len(trainer.FEATURE_NAMES)
    name = "validation_error_announced"
    assert name in trainer.FEATURE_NAMES, "the real feature this exemption exists for must still exist"
    column = trainer.FEATURE_NAMES.index(name)

    # Two positives with the feature at 0 (definitionally), one negative carrying it: a textbook free
    # veto, and the one case where the negative weight is CORRECT.
    features = torch.zeros((3, width))
    features[2, column] = 1.0
    offsets = [0, 1, 2, 3]
    labels = torch.tensor([1, 1, 0])

    assert bool(trainer.uninformative_columns(features, offsets, labels, [0, 1, 2])[column]), \
        "unexempted it must be masked, or the assertion below proves nothing"
    exempt = trainer.uninformative_columns(features, offsets, labels, [0, 1, 2], {name})
    assert not bool(exempt[column]), f"{name} is named by-definition and must keep its weight"

    # And the real map must actually name it, or the wiring is decorative.
    named = trainer.by_definition_exemptions("3.3.1:validation-error-silent")
    assert name in named, (
        "runs/unclosable-vetoes.json must list it for 3.3.1:validation-error-silent — that entry is why "
        "the held-out gate refused the unexempted version")


def test_an_absent_unclosable_map_REFUSES_rather_than_masking_everything():
    """An absent map is not an empty one.

    Without it the mask cannot tell a shortcut from a true implication and silences both — which the
    held-out gate has already measured as a real loss of findings. `audit-scorer-shortcuts.py` treats
    absence as "forgive nothing" and says so on its report; here the safe direction is the opposite, so
    it refuses instead of guessing. Both are the same rule: never let a missing input read as a value.
    """
    trainer = load()
    missing = trainer.UNCLOSABLE_MAP.with_name("definitely-not-here.json")
    original, trainer.UNCLOSABLE_MAP = trainer.UNCLOSABLE_MAP, missing
    try:
        with pytest.raises(SystemExit) as refusal:
            trainer.by_definition_exemptions("3.3.1:validation-error-silent")
        assert "corpus:unclosable-map" in str(refusal.value), "the refusal must name the command that fixes it"
    finally:
        trainer.UNCLOSABLE_MAP = original


def test_perturbs_measurement_is_NOT_exempt():
    """The two unclosable groups need OPPOSITE treatment, which is why the emitter keeps them apart.

    `by-definition` means no page can carry the subtype and the feature at once, so a negative weight is
    a true implication. `perturbs-measurement` means the page COULD carry it and capturing it would
    destroy the evidence — the three focus subtypes read `state_unchanged = 0` on every positive only
    because a focus case activates no control. On a real page that feature may be 1 while the failure is
    present, so a negative weight suppresses a TRUE finding. That is a shortcut and must stay masked.

    Without this, exempting both groups passes every other assertion in this file — verified by mutation.
    """
    trainer = load()
    exempt = trainer.by_definition_exemptions("2.1.1:control-unreachable-by-keyboard")
    assert exempt == set(), (
        "2.1.1:control-unreachable-by-keyboard has only `perturbs-measurement` entries; exempting them "
        f"would leave a real veto in place. Got: {sorted(exempt)}")
    # And the group is genuinely non-empty in the map, so the assertion above is not vacuous.
    import json
    raw = json.loads(trainer.UNCLOSABLE_MAP.read_text(encoding="utf-8"))
    assert raw["perturbs-measurement"].get("2.1.1:control-unreachable-by-keyboard"), \
        "the map no longer carries that subtype under perturbs-measurement; this test now proves nothing"


def test_the_trainer_is_given_the_map_it_now_requires():
    """`training:train` must emit the unclosable map, because `train` runs BEFORE `shortcuts`.

    `scorer:shortcuts` chains `corpus:unclosable-map` and is the only thing that did. The trainer now
    reads the same file, and in the `everything` chain `train` is stage five while `shortcuts` is stage
    six — so without this the trainer either refuses, or silently reads a map left behind by a PREVIOUS
    run. `lab-job.test.ts` states the rule for the Ansible side: no job may reach a derived-input script
    without its chain. This is the npm-script side of it.
    """
    import json as _json
    scripts = _json.loads((REPO / "package.json").read_text(encoding="utf-8"))["scripts"]
    for name in ("training:train", "scorer:shortcuts"):
        assert "corpus:unclosable-map" in scripts[name], (
            f"`{name}` reads runs/unclosable-vetoes.json and must emit it first; a stale map is the "
            "artefact-freshness defect this repo has hit four times")
