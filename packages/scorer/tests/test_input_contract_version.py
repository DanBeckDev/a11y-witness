"""One dataset contract, written in two languages, pinned equal.

`MODEL_INPUT_VERSION` is declared in `evidence-units.ts` (the writer, Node) and in
`screenreader_features.py` (the reader, Python). The duplication is forced — the record is produced by one
runtime and consumed by another — so this is the third of the repo's three remedies, and the only one
available.

The guard exists because both dataset failures on 2026-08-24 were contract staleness, not content
staleness: a realism tier and an acceptance dataset built before `parsed` existed. A source hash would have
caught neither, because the sources had not changed. Each surfaced as a RuntimeError deep inside the
featurizer, after the encoder had loaded, one job at a time.
"""

import importlib.util
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
import screenreader_features as features  # noqa: E402


def test_the_two_declarations_agree() -> None:
    source = (ROOT / "src" / "evidence-units.ts").read_text(encoding="utf-8")
    match = re.search(r"export const MODEL_INPUT_VERSION\s*=\s*(\d+)", source)
    assert match, "MODEL_INPUT_VERSION vanished from evidence-units.ts; this guard examines nothing"
    assert int(match.group(1)) == features.MODEL_INPUT_VERSION, (
        "the writer and the reader disagree about the model-input contract, so a dataset one produces is "
        "one the other will refuse — or worse, silently misread"
    )


def test_a_dataset_from_an_older_contract_is_REFUSED_by_path_and_by_command() -> None:
    stale = [{"input": {"evidenceText": "x", "evidenceUnits": [{"channel": "t", "text": "x"}]}}]
    with pytest.raises(SystemExit) as refusal:
        features.assert_input_contract(stale, Path("runs/screenreader-dataset/with-realism.jsonl"))
    message = str(refusal.value)
    assert "with-realism" in message, "the refusal must name the dataset, not just complain"
    assert "job=build-realism" in message, "and the command that rebuilds it"


def test_the_acceptance_datasets_name_the_export_that_covers_EVERY_repeat() -> None:
    # The evaluator reads repeat-1 and repeat-2. Rebuilding one and not the other is what produced a
    # held-out score computed half on current data and half on the previous day's.
    with pytest.raises(SystemExit) as refusal:
        features.assert_input_contract([{"input": {}}], Path("runs/screenreader-acceptance/repeat-2.jsonl"))
    assert "EVERY repeat" in str(refusal.value)


def test_a_current_dataset_passes() -> None:
    current = [{"input": {"inputVersion": features.MODEL_INPUT_VERSION}}]
    features.assert_input_contract(current, Path("runs/screenreader-dataset/with-realism.jsonl"))


def test_an_empty_dataset_is_not_a_contract_failure() -> None:
    # Empty has its own error, one line later, and reporting it as staleness would send the reader to
    # rebuild a dataset whose real problem is that it has no records.
    features.assert_input_contract([], Path("anything.jsonl"))
