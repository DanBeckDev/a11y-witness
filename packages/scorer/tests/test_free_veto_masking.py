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

    col 0 varies across positives  -> informative, must survive
    col 1 is 0 on both positives and 1 on the negative -> a free veto, must be masked
    col 2 is constant across everything -> also uninformative for this head
    """
    features = torch.tensor([
        [1.0, 0.0, 5.0],   # record 0, positive
        [0.0, 0.0, 5.0],   # record 1, positive
        [1.0, 1.0, 5.0],   # record 2, negative
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
    assert bool(mask[2]), "column 2 is constant everywhere and can only suppress"


def test_the_veto_column_ends_with_a_weight_of_exactly_zero():
    # THE POINT OF THE WHOLE CHANGE. Training-time masking alone is not enough: a constant-zero input
    # receives no gradient, so its weight keeps its RANDOM INITIALISATION -- a small nonzero number that
    # `scorer:shortcuts` still reads as a veto and `score.py` still applies. That looks fixed and is not.
    trainer = load()
    features, offsets, labels = _fixture()
    weight, _bias = trainer.train_head(features, offsets, labels, [0, 1, 2], epochs=40)
    assert weight[0, 1].item() == 0.0, "the free-veto column must carry exactly zero, not merely a small number"
    assert weight[0, 2].item() == 0.0, "and so must a column constant everywhere"
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
