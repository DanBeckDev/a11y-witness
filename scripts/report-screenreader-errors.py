#!/usr/bin/env python3
"""Report held-out scorer errors with the underlying NVDA evidence attached.

This is deliberately an analysis tool, not a training input path.  It loads the
same safetensors encoder/head used by training, then joins each false positive
or false negative to its capture provenance and screen-reader-only evidence.
HTML, DOM, URL, and other page-source fields are never used as features.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def load_training_module() -> Any:
    path = Path(__file__).with_name("train-screenreader-model.py")
    spec = importlib.util.spec_from_file_location("screenreader_training", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load training helpers from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=ROOT / "runs/screenreader-dataset/screenreader-evidence.jsonl")
    parser.add_argument("--encoder", type=Path, default=ROOT / "models/encoders/all-MiniLM-L6-v2")
    parser.add_argument("--model", type=Path, default=ROOT / "models/screenreader-scorer/model.safetensors")
    parser.add_argument("--training-report", type=Path, default=ROOT / "models/screenreader-scorer/training-report.json")
    parser.add_argument("--out", type=Path, default=ROOT / "runs/screenreader-dataset/screenreader-error-analysis.json")
    parser.add_argument("--split", choices=("train", "validation", "test", "all"), default="test")
    parser.add_argument("--criterion", action="append", help="limit analysis to one or more criteria")
    parser.add_argument("--max-length", type=int, default=256)
    return parser.parse_args()


def evidence(record: dict[str, Any]) -> dict[str, Any]:
    input_data = record["input"]
    return {
        "transcript": input_data.get("transcript", []),
        "evidenceText": input_data.get("evidenceText", ""),
        "structure": input_data.get("structure"),
        "interaction": input_data.get("interaction"),
    }


def diagnosis(record: dict[str, Any], score: float, threshold: float, expected: str, error: str) -> dict[str, Any]:
    provenance = record["provenance"]
    return {
        "caseId": provenance.get("caseId"),
        "family": provenance.get("family"),
        "variant": provenance.get("variant"),
        "source": provenance.get("source"),
        "mutation": provenance.get("mutation"),
        "expected": expected,
        "error": error,
        "score": score,
        "threshold": threshold,
        "evidence": evidence(record),
    }


def main() -> None:
    args = parse_args()
    training = load_training_module()
    records = training.read_records(args.data)
    encoder_file = training.assert_encoder(args.encoder)
    report = json.loads(args.training_report.read_text(encoding="utf-8"))

    import torch
    from safetensors.torch import load_file

    split_for_family = training.assign_splits(records)
    features, _ = training.encode_records(records, args.encoder, args.max_length)
    weights = load_file(str(args.model))
    selected_splits = ("train", "validation", "test") if args.split == "all" else (args.split,)
    criteria = sorted(report.get("criteria", {}))
    if args.criterion:
        wanted = set(args.criterion)
        criteria = [criterion for criterion in criteria if criterion in wanted]
        missing = wanted.difference(criteria)
        if missing:
            raise RuntimeError("criteria missing from training report: " + ", ".join(sorted(missing)))

    result: dict[str, Any] = {
        "schema": "a11y-witness/screenreader-scorer-error-analysis",
        "dataset": {"path": str(args.data), "sha256": training.sha256(args.data), "records": len(records)},
        "encoder": {"path": str(args.encoder), "sha256": training.sha256(encoder_file)},
        "model": {"path": str(args.model), "sha256": training.sha256(args.model)},
        "split": args.split,
        "criteria": {},
        "summary": {"falsePositives": 0, "falseNegatives": 0, "criteriaWithErrors": 0},
    }

    for criterion in criteria:
        threshold = float(report["criteria"][criterion]["threshold"])
        weight = weights[f"{criterion}.weight"]
        bias = weights[f"{criterion}.bias"]
        logits = features @ weight.t() + bias
        scores = torch.sigmoid(logits[:, 0])
        false_positives = []
        false_negatives = []
        for index, record in enumerate(records):
            split = split_for_family[record["provenance"]["family"]]
            if split not in selected_splits:
                continue
            expected = "violation" if criterion in record["target"].get("criteria", []) else "clean"
            predicted = bool(scores[index] >= threshold)
            if predicted and expected == "clean":
                false_positives.append(diagnosis(record, float(scores[index]), threshold, expected, "falsePositive"))
            elif not predicted and expected == "violation":
                false_negatives.append(diagnosis(record, float(scores[index]), threshold, expected, "falseNegative"))
        result["criteria"][criterion] = {
            "threshold": threshold,
            "falsePositiveCount": len(false_positives),
            "falseNegativeCount": len(false_negatives),
            "falsePositives": false_positives,
            "falseNegatives": false_negatives,
        }
        result["summary"]["falsePositives"] += len(false_positives)
        result["summary"]["falseNegatives"] += len(false_negatives)
        if false_positives or false_negatives:
            result["summary"]["criteriaWithErrors"] += 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], indent=2))
    for criterion, details in result["criteria"].items():
        print(f"{criterion}: {details['falsePositiveCount']} false positives, {details['falseNegativeCount']} false negatives")


if __name__ == "__main__":
    main()
