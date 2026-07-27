#!/usr/bin/env python3
"""Evaluate the scorer on a capture set that is disjoint from training.

The acceptance set is never used to fit heads or thresholds. If multiple exported
files are supplied, repeated case/variant records are also used to measure whether
the same NVDA interaction crosses the model threshold between captures.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import defaultdict
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
    parser.add_argument("--data", action="append", type=Path)
    parser.add_argument("--training-data", type=Path, default=ROOT / "runs/screenreader-dataset/screenreader-evidence.jsonl")
    parser.add_argument("--encoder", type=Path, default=ROOT / "models/encoders/all-MiniLM-L6-v2")
    parser.add_argument("--model", type=Path, default=ROOT / "models/screenreader-scorer/model.safetensors")
    parser.add_argument("--training-report", type=Path, default=ROOT / "models/screenreader-scorer/training-report.json")
    parser.add_argument("--out", type=Path, default=ROOT / "runs/screenreader-acceptance/acceptance-report.json")
    parser.add_argument("--min-positive", type=int, default=3)
    parser.add_argument("--min-clean", type=int, default=3)
    parser.add_argument("--max-length", type=int, default=256)
    args = parser.parse_args()
    if not args.data:
        args.data = [ROOT / "runs/screenreader-acceptance/screenreader-evidence.jsonl"]
    return args


def load_records(training: Any, paths: list[Path]) -> list[dict[str, Any]]:
    records = []
    for path in paths:
        if not path.is_file():
            raise RuntimeError(f"acceptance data is missing: {path}")
        records.extend(training.read_records(path))
    if not records:
        raise RuntimeError("acceptance data is empty")
    return records


def score_criterion(training: Any, criterion_report: dict[str, Any], features: Any, weights: Any) -> Any:
    import torch

    subtype_scores = []
    for subtype_details in criterion_report["subtypes"].values():
        weight = weights[subtype_details["head"] + ".weight"]
        bias = weights[subtype_details["head"] + ".bias"]
        subtype_scores.append(training.score_head(features, weight, bias))
    return torch.stack(subtype_scores).amax(dim=0)


def metrics(scores: Any, labels: Any, threshold: float) -> dict[str, Any]:
    predicted = scores >= threshold
    true_positive = int((predicted & labels).sum())
    false_positive = int((predicted & ~labels).sum())
    false_negative = int((~predicted & labels).sum())
    clean = int((~labels).sum())
    return {
        "records": int(labels.numel()),
        "positive": int(labels.sum()),
        "clean": clean,
        "truePositive": true_positive,
        "falsePositive": false_positive,
        "falseNegative": false_negative,
        "precision": true_positive / max(true_positive + false_positive, 1),
        "recall": true_positive / max(true_positive + false_negative, 1),
    }


def stability(scores: Any, records: list[dict[str, Any]], threshold: float) -> dict[str, Any]:
    groups: dict[tuple[str, str], list[float]] = defaultdict(list)
    for index, record in enumerate(records):
        key = (record["provenance"]["caseId"], record["provenance"]["variant"])
        groups[key].append(float(scores[index]))
    repeated = {}
    for key, values in groups.items():
        if len(values) < 2:
            continue
        predictions = {value >= threshold for value in values}
        repeated["/".join(key)] = {
            "captures": len(values),
            "scoreMinimum": min(values),
            "scoreMaximum": max(values),
            "unstable": len(predictions) > 1,
        }
    unstable = sum(1 for result in repeated.values() if result["unstable"])
    return {
        "groups": len(groups),
        "repeatedGroups": len(repeated),
        "unstableGroups": unstable,
        "measured": bool(repeated),
        "passed": bool(repeated) and unstable == 0,
        "details": repeated,
    }


def eligible_records(criterion: str, criterion_report: dict[str, Any], records: list[dict[str, Any]]) -> tuple[list[int], int]:
    eligible_subtypes = set(criterion_report["subtypes"])
    indices = []
    excluded = 0
    for index, record in enumerate(records):
        subtypes = set(record["target"].get("subtypes", []))
        if criterion in record["target"].get("criteria", []) and not subtypes.intersection(eligible_subtypes):
            excluded += 1
            continue
        indices.append(index)
    return indices, excluded


def assert_disjoint(training: Any, acceptance: list[dict[str, Any]], training_data: Path) -> None:
    trained = training.read_records(training_data)
    trained_cases = {record["provenance"].get("caseId") for record in trained}
    trained_families = {record["provenance"].get("family") for record in trained}
    overlap_cases = sorted({record["provenance"].get("caseId") for record in acceptance} & trained_cases)
    overlap_families = sorted({record["provenance"].get("family") for record in acceptance} & trained_families)
    if overlap_cases or overlap_families:
        raise RuntimeError("acceptance data overlaps training: " + json.dumps({"cases": overlap_cases, "families": overlap_families}))


def main() -> None:
    args = parse_args()
    training = load_training_module()
    records = load_records(training, args.data)
    assert_disjoint(training, records, args.training_data)
    report = json.loads(args.training_report.read_text(encoding="utf-8"))
    features, _, _ = training.encode_records(records, args.encoder, args.max_length)
    from safetensors.torch import load_file

    weights = load_file(str(args.model))
    import torch

    result: dict[str, Any] = {
        "schema": "a11y-witness/screenreader-scorer-acceptance",
        "data": [{"path": str(path), "records": len(training.read_records(path))} for path in args.data],
        "criteria": {},
        "stability": {},
        "passed": False,
        "failureReasons": [],
    }
    scores_by_criterion = {}
    for criterion, criterion_report in report["criteria"].items():
        included_indices, excluded = eligible_records(criterion, criterion_report, records)
        labels = torch.tensor(
            [criterion in record["target"].get("criteria", []) for record in records], dtype=torch.bool
        )
        scores = score_criterion(training, criterion_report, features, weights)
        threshold = float(criterion_report["threshold"])
        included_scores = scores[included_indices]
        included_labels = labels[included_indices]
        result["criteria"][criterion] = {
            "threshold": threshold,
            "excluded": excluded,
            **metrics(included_scores, included_labels, threshold),
        }
        scores_by_criterion[criterion] = (included_scores, [records[index] for index in included_indices])
        if result["criteria"][criterion]["positive"] < args.min_positive:
            result["failureReasons"].append(f"{criterion}: fewer than {args.min_positive} acceptance positives")
        if result["criteria"][criterion]["clean"] < args.min_clean:
            result["failureReasons"].append(f"{criterion}: fewer than {args.min_clean} acceptance clean records")
        if result["criteria"][criterion]["falsePositive"]:
            result["failureReasons"].append(f"{criterion}: acceptance false positives")
        if result["criteria"][criterion]["falseNegative"]:
            result["failureReasons"].append(f"{criterion}: acceptance false negatives")

    result["stability"] = {
        criterion: stability(scores, criterion_records, float(report["criteria"][criterion]["threshold"]))
        for criterion, (scores, criterion_records) in scores_by_criterion.items()
    }
    if not all(details["passed"] for details in result["stability"].values()):
        result["failureReasons"].append("capture-to-capture stability was not measured or was unstable")
    result["passed"] = not result["failureReasons"]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": result["passed"], "failureReasons": result["failureReasons"]}, indent=2))
    if not result["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
