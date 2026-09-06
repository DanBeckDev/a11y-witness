"""#81: a shipped-artefact/runtime-schema mismatch must be a NAMED fault, not a caught stack trace.

`verify_artifact` has seven near-identical `RuntimeError`s for this one fault class -- the safetensors
metadata or the training report disagreeing with the running code about schema version, encoder hash,
feature order, feature scale, or feature multipliers. `action-smoke.yml` has failed with exactly this
class 161 consecutive times (since the v18/v19 migration opened), reported as a bare traceback.

`ArtifactSchemaMismatch` (a `RuntimeError` subclass carrying `.FAULT = "artifact-schema-mismatch"`) is
what `local-judge.ts` reads on the TypeScript side, and `fault-remediation.ts` gives it a WHAT/TRY/WHERE
entry the same shape as the four existing worker faults. This file proves three things: the Python
exception type is used specifically (not a blanket catch), `__main__` prints it as one parseable fault
line and exits a DISTINCT code, and a DIFFERENT kind of failure (a missing model file) still takes the
generic path -- proving the distinction discriminates rather than swallowing everything.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest
from safetensors.numpy import save_file

_spec = importlib.util.spec_from_file_location(
    "score", Path(__file__).resolve().parents[2] / "scorer" / "python" / "score.py",
)
score = importlib.util.module_from_spec(_spec)
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scorer" / "python"))
_spec.loader.exec_module(score)

SCORE_SCRIPT = Path(__file__).resolve().parents[2] / "scorer" / "python" / "score.py"

FEATURES = score.feature_pipeline
EXPECTED_FEATURES = list(FEATURES.FEATURE_NAMES)


def _build_fixture(tmp_path: Path, *, metadata_overrides: dict | None = None) -> tuple[Path, Path]:
    """A minimal-but-complete encoder + model + training-report triple that reaches verify_artifact's
    schema checks. Returns (model_dir, encoder_dir). `metadata_overrides` corrupts specific safetensors
    metadata fields to trigger a specific one of the seven checks; an empty dict reaches them all
    correctly and verify_artifact would proceed past this fixture's scope (it has no scorer heads, so a
    real run would fail later, at the per-criterion loop -- irrelevant to what this fixture tests)."""
    encoder_dir = tmp_path / "encoder"
    encoder_dir.mkdir()
    encoder_model = encoder_dir / "model.safetensors"
    encoder_model.write_bytes(b"fake-encoder-weights-not-a-real-model")
    encoder_hash = hashlib.sha256(encoder_model.read_bytes()).hexdigest()

    model_dir = tmp_path / "model"
    model_dir.mkdir()
    metadata = {
        "representation": FEATURES.FEATURE_SCHEMA_VERSION,
        "encoder_sha256": encoder_hash,
        "structured_features": json.dumps(EXPECTED_FEATURES),
        "structured_feature_scale": str(FEATURES.ENGINEERED_FEATURE_SCALE),
        "structured_feature_multipliers": json.dumps(FEATURES.ENGINEERED_FEATURE_MULTIPLIERS),
        "max_length": "64",
        **(metadata_overrides or {}),
    }
    save_file({}, str(model_dir / "model.safetensors"), metadata=metadata)

    report = {
        "criteria": {"1.1.1": {"modelHead": False, "why": "fixture has no heads"}},
        "releaseEligible": True,
        "encoder": {"modelSha256": encoder_hash},
        "representation": {
            "schema": FEATURES.FEATURE_SCHEMA_VERSION,
            "structuredFeatures": EXPECTED_FEATURES,
            "embeddingSize": 384,
            "maxLength": 64,
        },
    }
    (model_dir / "training-report.json").write_text(json.dumps(report), encoding="utf-8")
    return model_dir, encoder_dir


def _data_file(tmp_path: Path) -> Path:
    record = {
        "input": {
            "screenReader": "NVDA",
            "inputVersion": FEATURES.MODEL_INPUT_VERSION,
            "evidenceText": "heading, level 1, Example",
            "evidenceUnits": [{"channel": "transcript", "text": "heading, level 1, Example"}],
        },
        "target": {"label": "clean", "subtypes": []},
        "provenance": {"family": "fixture"},
    }
    path = tmp_path / "data.jsonl"
    path.write_text(json.dumps(record) + "\n", encoding="utf-8")
    return path


class _Args:
    def __init__(self, model_dir: Path, encoder_dir: Path):
        self.model = model_dir
        self.training_report = None
        self.encoder = encoder_dir
        self.evaluating = False
        self.allow_ineligible = False


def test_a_correct_fixture_passes_all_seven_schema_checks(tmp_path):
    """Baseline: proves the fixture itself is right before any test corrupts it."""
    model_dir, encoder_dir = _build_fixture(tmp_path)
    report, weights, artifact = score.verify_artifact(_Args(model_dir, encoder_dir), FEATURES)
    assert report["criteria"]["1.1.1"]["modelHead"] is False
    assert artifact["encoderSha256"]


@pytest.mark.parametrize("field,bad_value", [
    ("representation", "wrong-schema-version"),
    ("encoder_sha256", "0" * 64),
    ("structured_features", json.dumps(["not", "the", "right", "list"])),
    ("structured_feature_scale", "999.0"),
    ("structured_feature_multipliers", json.dumps({"nonsense": 1.0})),
])
def test_each_safetensors_side_mismatch_raises_ArtifactSchemaMismatch(tmp_path, field, bad_value):
    model_dir, encoder_dir = _build_fixture(tmp_path, metadata_overrides={field: bad_value})
    with pytest.raises(score.ArtifactSchemaMismatch):
        score.verify_artifact(_Args(model_dir, encoder_dir), FEATURES)


def test_training_report_side_schema_mismatch_raises_ArtifactSchemaMismatch(tmp_path):
    model_dir, encoder_dir = _build_fixture(tmp_path)
    report_path = model_dir / "training-report.json"
    report = json.loads(report_path.read_text())
    report["representation"]["schema"] = "wrong-schema-version"
    report_path.write_text(json.dumps(report), encoding="utf-8")
    with pytest.raises(score.ArtifactSchemaMismatch):
        score.verify_artifact(_Args(model_dir, encoder_dir), FEATURES)


def test_training_report_side_feature_order_mismatch_raises_ArtifactSchemaMismatch(tmp_path):
    model_dir, encoder_dir = _build_fixture(tmp_path)
    report_path = model_dir / "training-report.json"
    report = json.loads(report_path.read_text())
    report["representation"]["structuredFeatures"] = ["wrong", "order"]
    report_path.write_text(json.dumps(report), encoding="utf-8")
    with pytest.raises(score.ArtifactSchemaMismatch):
        score.verify_artifact(_Args(model_dir, encoder_dir), FEATURES)


def test_a_DIFFERENT_failure_class_stays_a_plain_RuntimeError(tmp_path):
    """CONTROL: a missing model file is a different fault entirely (this caller's own mistake, not an
    artefact/runtime disagreement) and must NOT be swallowed into the schema-mismatch class -- proving
    ArtifactSchemaMismatch discriminates rather than being a blanket catch for everything verify_artifact
    can raise."""
    model_dir, encoder_dir = _build_fixture(tmp_path)
    (model_dir / "model.safetensors").unlink()
    with pytest.raises(RuntimeError) as excinfo:
        score.verify_artifact(_Args(model_dir, encoder_dir), FEATURES)
    assert not isinstance(excinfo.value, score.ArtifactSchemaMismatch)


def test_subprocess_prints_the_fault_as_parseable_json_and_exits_3(tmp_path):
    """The acceptance shape: run score.py as a REAL subprocess, exactly as local-judge.ts's scoreCapture
    does, and read what an operator actually sees -- not just what the pure function returns."""
    model_dir, encoder_dir = _build_fixture(tmp_path, metadata_overrides={"representation": "wrong-version"})
    data_path = _data_file(tmp_path)
    result = subprocess.run(
        [sys.executable, str(SCORE_SCRIPT), "--data", str(data_path),
         "--model", str(model_dir), "--encoder", str(encoder_dir)],
        capture_output=True, text=True,
    )
    assert result.returncode == 3, f"expected fault exit 3, got {result.returncode}: {result.stdout}{result.stderr}"
    fault_line = next((line for line in result.stdout.splitlines() if line.strip().startswith("{")), None)
    assert fault_line is not None, f"no JSON line on stdout: {result.stdout!r}"
    parsed = json.loads(fault_line)
    assert parsed["fault"] == "artifact-schema-mismatch"
    assert "schema" in parsed["error"]


def test_subprocess_on_a_DIFFERENT_failure_does_not_print_a_fault_line(tmp_path):
    """CONTROL at the subprocess level: a missing model file exits with the generic path (no fault JSON,
    exit code other than 3) -- the same discrimination proven above, seen from outside the process."""
    model_dir, encoder_dir = _build_fixture(tmp_path)
    (model_dir / "model.safetensors").unlink()
    data_path = _data_file(tmp_path)
    result = subprocess.run(
        [sys.executable, str(SCORE_SCRIPT), "--data", str(data_path),
         "--model", str(model_dir), "--encoder", str(encoder_dir)],
        capture_output=True, text=True,
    )
    assert result.returncode != 3
    assert not any(line.strip().startswith('{"fault"') for line in result.stdout.splitlines())
