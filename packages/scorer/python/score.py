#!/usr/bin/env python3
"""Score screen-reader evidence with a verified local scorer artifact.

This is deliberately a score-only boundary. It never accepts HTML, DOM, CSS,
axe output, URL, task text, or provenance as model input. With --shadow it is
also explicitly log-only: callers must not use its result to replace the
existing judge or deterministic rules until a separate integration decision.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SUPPORTED_SCREEN_READER = "NVDA"

# The feature pipeline is a SIBLING module, not the trainer.
#
# This program used to load the trainer (now `packages/lab/scripts/train-screenreader-model.py`)
# dynamically by file path and call into it,
# which made the trainer a runtime dependency of scoring — so shipping a scorer meant shipping a trainer.
# ADR 0004 rejects that: distributing a trainer implies a consumer can reproduce training, and they cannot,
# because the corpus is not distributed. The shared half is the FEATURE CONTRACT, and it belongs with the
# weights it describes — `FEATURE_SCHEMA_VERSION` is stamped into the safetensors metadata, so the two are
# checked against each other at load time.
#
# Named `feature_pipeline`, not `features`: `score_records` has a LOCAL variable called `features` (the
# encoded tensor), and aliasing the module to that name shadows it — `UnboundLocalError` on every capture,
# which is how this was found.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import screenreader_features as feature_pipeline  # noqa: E402  (path shim must precede the import)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    sources = parser.add_mutually_exclusive_group(required=True)
    sources.add_argument("--data", action="append", type=Path, help="exported screen-reader JSONL; repeat for multiple files")
    sources.add_argument("--capture-json", type=Path, help="one raw witness --json capture, converted at the screen-reader boundary")
    sources.add_argument("--stdin", action="store_true", help="read one raw witness --json capture from stdin")
    parser.add_argument("--encoder", type=Path, default=ROOT / "models/encoders/all-MiniLM-L6-v2")
    parser.add_argument("--model", type=Path, default=ROOT / "models/screenreader-scorer")
    parser.add_argument("--training-report", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--shadow", action="store_true", help="mark output log-only; never mutate findings")
    parser.add_argument("--allow-ineligible", action="store_true", help="diagnostic override for a report not marked releaseEligible")
    return parser.parse_args()


def append_units(units: list[dict[str, str]], channel: str, values: Any) -> None:
    for value in values or []:
        if isinstance(value, str) and value:
            units.append({"channel": channel, "text": value})


def append_changes(units: list[dict[str, str]], channel: str, changes: Any) -> None:
    for change in changes or []:
        if not isinstance(change, dict):
            continue
        control = change.get("control", "")
        after = change.get("after", "")
        if isinstance(control, str) and isinstance(after, str) and control + after:
            units.append({"channel": channel, "text": control + " -> " + after})


def evidence_units(capture: dict[str, Any]) -> list[dict[str, str]]:
    structure = capture.get("structure") or {}
    interaction = capture.get("interaction") or {}
    units: list[dict[str, str]] = []
    append_units(units, "transcript", capture.get("transcript"))
    append_units(units, "heading-navigation", structure.get("headings"))
    append_units(units, "landmark-navigation", structure.get("landmarks"))
    append_units(units, "form-navigation", structure.get("formFields"))
    append_units(units, "table-cell-navigation", structure.get("tableCells"))
    append_units(units, "control-navigation", interaction.get("controls"))
    append_changes(units, "state-change", interaction.get("stateChanges"))
    append_changes(units, "form-change", interaction.get("formChanges"))
    append_units(units, "post-submit-navigation", interaction.get("postSubmitFields"))
    return units


def raw_capture_record(capture: dict[str, Any], source_id: str) -> dict[str, Any]:
    if not isinstance(capture, dict):
        raise RuntimeError("capture JSON must contain one object")
    screen_reader = capture.get("screenReader", "unknown")
    if screen_reader != SUPPORTED_SCREEN_READER:
        raise RuntimeError(
            f"scorer artifact supports {SUPPORTED_SCREEN_READER} captures only, got {screen_reader!r}"
        )
    units = evidence_units(capture)
    if not units:
        raise RuntimeError("capture contains no screen-reader evidence units")
    input_data = {
        "screenReader": capture.get("screenReader", "unknown"),
        "transcript": capture.get("transcript") or [],
        "structure": capture.get("structure") or {},
        "interaction": capture.get("interaction") or {},
        "evidenceUnits": units,
        "evidenceText": "\n".join(unit["text"] for unit in units),
    }
    return {
        "input": input_data,
        "target": {"label": "clean", "criteria": [], "subtypes": []},
        "provenance": {
            "caseId": source_id,
            "family": source_id,
            "variant": "live",
            "source": "live shadow capture",
            "mutation": "not used for scoring",
            "capturedAt": capture.get("capturedAt"),
        },
    }


def read_sources(args: argparse.Namespace, training: Any) -> list[dict[str, Any]]:
    if args.data:
        records: list[dict[str, Any]] = []
        for path in args.data:
            records.extend(feature_pipeline.read_records(path))
        unsupported = sorted({
            record["input"].get("screenReader", "unknown")
            for record in records
            if record["input"].get("screenReader", "unknown") != SUPPORTED_SCREEN_READER
        })
        if unsupported:
            raise RuntimeError(
                f"scorer artifact supports {SUPPORTED_SCREEN_READER} captures only, got {unsupported}"
            )
        return records
    if args.capture_json:
        return [raw_capture_record(json.loads(args.capture_json.read_text(encoding="utf-8")), args.capture_json.stem)]
    if args.stdin:
        return [raw_capture_record(json.load(sys.stdin), "stdin-shadow-capture")]
    raise RuntimeError("no scoring source supplied")


def json_metadata(value: str | None, name: str) -> Any:
    if value is None:
        raise RuntimeError(f"model metadata is missing {name}")
    try:
        return json.loads(value)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"model metadata {name} is not JSON") from error


def verify_artifact(args: argparse.Namespace, training: Any) -> tuple[dict[str, Any], Any, dict[str, Any]]:
    import torch
    from safetensors import safe_open
    from safetensors.torch import load_file

    model_root = args.model
    model_file = model_root / "model.safetensors"
    report_path = args.training_report or model_root / "training-report.json"
    if not model_file.is_file():
        raise RuntimeError(f"missing scorer weights: {model_file}")
    if not report_path.is_file():
        raise RuntimeError(f"missing scorer report: {report_path}")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    criteria = report.get("criteria")
    if not isinstance(criteria, dict) or not criteria:
        raise RuntimeError("scorer report has no criteria")
    if report.get("releaseEligible") is not True and not args.allow_ineligible:
        raise RuntimeError("scorer report is not releaseEligible; use --allow-ineligible only for diagnostics")

    encoder_file = feature_pipeline.assert_encoder(args.encoder)
    actual_encoder_hash = feature_pipeline.sha256(encoder_file)
    expected_encoder_hash = report.get("encoder", {}).get("modelSha256")
    if actual_encoder_hash != expected_encoder_hash:
        raise RuntimeError("encoder SHA-256 does not match the training report")

    with safe_open(str(model_file), framework="pt", device="cpu") as handle:
        metadata = handle.metadata() or {}
        keys = set(handle.keys())
    expected_features = list(feature_pipeline.FEATURE_NAMES)
    if metadata.get("representation") != feature_pipeline.FEATURE_SCHEMA_VERSION:
        raise RuntimeError("scorer representation schema does not match the runtime")
    if metadata.get("encoder_sha256") != actual_encoder_hash:
        raise RuntimeError("scorer encoder SHA-256 metadata does not match the encoder")
    if json_metadata(metadata.get("structured_features"), "structured_features") != expected_features:
        raise RuntimeError("scorer structured feature order does not match the runtime")
    if float(metadata.get("structured_feature_scale", "nan")) != feature_pipeline.ENGINEERED_FEATURE_SCALE:
        raise RuntimeError("scorer structured feature scale does not match the runtime")
    if json_metadata(metadata.get("structured_feature_multipliers"), "structured_feature_multipliers") != feature_pipeline.ENGINEERED_FEATURE_MULTIPLIERS:
        raise RuntimeError("scorer structured feature multipliers do not match the runtime")

    representation = report.get("representation", {})
    if representation.get("schema") != feature_pipeline.FEATURE_SCHEMA_VERSION:
        raise RuntimeError("training report representation schema does not match the runtime")
    if representation.get("structuredFeatures") != expected_features:
        raise RuntimeError("training report feature order does not match the runtime")
    try:
        embedding_size = int(representation["embeddingSize"])
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError("training report embedding size is missing or invalid") from error
    if embedding_size <= 0:
        raise RuntimeError("training report embedding size must be positive")
    try:
        max_length = int(representation["maxLength"])
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError("training report max length is missing or invalid") from error
    if max_length <= 0:
        raise RuntimeError("training report max length must be positive")
    if metadata.get("max_length") != str(max_length):
        raise RuntimeError("scorer max length metadata does not match the training report")
    expected_keys: set[str] = set()
    head_dimensions: dict[str, tuple[int, int]] = {}
    for criterion, criterion_report in criteria.items():
        if not isinstance(criterion_report, dict):
            raise RuntimeError(f"invalid report for criterion {criterion}")
        try:
            threshold = float(criterion_report["threshold"])
        except (KeyError, TypeError, ValueError) as error:
            raise RuntimeError(f"invalid threshold for {criterion}") from error
        if not 0.0 <= threshold <= 1.0:
            raise RuntimeError(f"threshold for {criterion} is outside [0, 1]")
        if not criterion_report.get("subtypes"):
            raise RuntimeError(f"criterion {criterion} has no scorer heads")
        for subtype, subtype_report in criterion_report.get("subtypes", {}).items():
            head = subtype_report.get("head")
            if not isinstance(head, str) or not head:
                raise RuntimeError(f"missing head name for {subtype}")
            if head in head_dimensions:
                raise RuntimeError(f"scorer head {head} is referenced more than once")
            weight_key = head + ".weight"
            bias_key = head + ".bias"
            expected_keys.update({weight_key, bias_key})
            if weight_key not in keys or bias_key not in keys:
                raise RuntimeError(f"missing head weights for {subtype}")
            head_dimensions[head] = (1, embedding_size + len(expected_features))
    unexpected = sorted(keys - expected_keys)
    if unexpected:
        raise RuntimeError("scorer artifact contains unexpected tensors: " + ", ".join(unexpected))
    weights = load_file(str(model_file))
    for head, (rows, columns) in head_dimensions.items():
        weight = weights[head + ".weight"]
        bias = weights[head + ".bias"]
        if tuple(weight.shape) != (rows, columns) or tuple(bias.shape) != (rows,):
            raise RuntimeError(f"head dimension mismatch for {head}")
        if not torch.isfinite(weight).all() or not torch.isfinite(bias).all():
            raise RuntimeError(f"non-finite weights for {head}")
    artifact = {
        "screenReader": SUPPORTED_SCREEN_READER,
        "encoderSha256": actual_encoder_hash,
        "modelSha256": feature_pipeline.sha256(model_file),
        "reportSha256": feature_pipeline.sha256(report_path),
        "trainingDatasetSha256": report.get("dataset", {}).get("sha256"),
        "modelPath": str(model_file),
        "reportPath": str(report_path),
    }
    return report, weights, artifact


def score_records(records: list[dict[str, Any]], report: dict[str, Any], weights: Any, training: Any, args: argparse.Namespace) -> dict[str, Any]:
    import torch

    max_length = int(report["representation"]["maxLength"])
    features, _, _ = feature_pipeline.encode_records(records, args.encoder, max_length)
    # Features are per evidence unit now, so a head is applied to every instance and the bag takes the
    # MAX -- the same aggregation the trainer uses inside its loss. `bag_offsets` is derived from the
    # records here exactly as it is there, rather than read from the artifact, so the two cannot drift.
    #
    # Scored once per head for the whole batch rather than per record inside the loop below: the old
    # shape sliced one row per record, which no longer identifies a bag.
    offsets = feature_pipeline.bag_offsets(records)
    criteria = report["criteria"]
    # Each head is scored on the view it was TRAINED on, read from the report rather than assumed.
    # Local signals ("a control with a role and no name") are scored per announcement; contextual ones
    # ("is this heading vague?") need the whole capture, because the encoder's cross-unit attention is
    # where that context lives. Using the wrong view yields confident scores from the wrong
    # representation, and no downstream check would catch it.
    #
    # The document view is a bag of one, so both run through the same `score_bags` path.
    views: dict[str, Any] = {"instance-max": (features, offsets)}
    if any(
        subtype_report.get("pooling", "document-mean") == "document-mean"
        for criterion_report in criteria.values()
        for subtype_report in criterion_report["subtypes"].values()
    ):
        views["document-mean"] = feature_pipeline.encode_documents(records, args.encoder, max_length)
    head_scores: dict[str, Any] = {}
    for criterion_report in criteria.values():
        for subtype_report in criterion_report["subtypes"].values():
            head = subtype_report["head"]
            if head not in head_scores:
                view_features, view_offsets = views[subtype_report.get("pooling", "document-mean")]
                head_scores[head] = feature_pipeline.score_bags(
                    view_features, view_offsets, weights[head + ".weight"], weights[head + ".bias"]
                )
    scored: list[dict[str, Any]] = []
    for index, record in enumerate(records):
        scores: dict[str, float] = {}
        predictions: dict[str, bool] = {}
        for criterion, criterion_report in criteria.items():
            subtype_scores = []
            for subtype_report in criterion_report["subtypes"].values():
                head = subtype_report["head"]
                subtype_scores.append(head_scores[head][index])
            score = float(torch.stack(subtype_scores).amax())
            scores[criterion] = score
            predictions[criterion] = score >= float(criterion_report["threshold"])
        provenance = record.get("provenance", {})
        scored.append({
            "caseId": provenance.get("caseId"),
            "family": provenance.get("family"),
            "variant": provenance.get("variant"),
            "scores": scores,
            "predictions": predictions,
            # Which criteria a deterministic rule decides. Carried across because the judge appends the
            # rule layer's findings AFTER the model's and had no way to know the two overlap: on a
            # conformant page the rule correctly found nothing and the model's prediction survived as a
            # false positive. The report has always known this; nothing passed it on.
            "ruleOwned": sorted(
                c for c, r in criteria.items()
                if r.get("decisionOwner", "learned-screenreader-scorer") != "learned-screenreader-scorer"
            ),
        })
    positives = {
        criterion: sum(item["predictions"][criterion] for item in scored)
        for criterion in criteria
    }
    return {"records": scored, "predictedPositiveCounts": positives}


def main() -> None:
    args = parse_args()
    training = feature_pipeline
    records = read_sources(args, training)
    if not records:
        raise RuntimeError("no screen-reader evidence supplied")
    report, weights, artifact = verify_artifact(args, training)
    result = {
        "schema": "a11y-witness/screenreader-scorer-shadow",
        "mode": "shadow" if args.shadow else "score-only",
        "decisionAction": "log-only" if args.shadow else "scores-only",
        "artifact": artifact,
        "representation": report["representation"],
        "dataRecords": len(records),
    }
    result.update(score_records(records, report, weights, training, args))
    encoded = json.dumps(result, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(encoded, encoding="utf-8")
    print(encoded, end="")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"screen-reader scorer failed: {error}", file=sys.stderr)
        raise
