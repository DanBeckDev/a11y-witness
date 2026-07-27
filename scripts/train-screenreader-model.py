#!/usr/bin/env python3
"""Train a frozen-encoder, per-criterion screen-reader evidence scorer.

The encoder is never fine-tuned here. It must be a pinned local Hugging Face
checkpoint containing model.safetensors; the only newly trained weights are
the small binary heads, also written as safetensors. Provenance is metadata,
never a feature.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path
from typing import Any


FORBIDDEN_INPUT_KEYS = {"url", "task", "html", "dom", "css", "axe", "diagnostics"}
UNSAFE_SUFFIXES = {".bin", ".ckpt", ".h5", ".msgpack", ".ot", ".pickle", ".pkl", ".pt", ".pth"}
SEED = 20260726
TRAIN_RATIO = 0.7
VALIDATION_RATIO = 0.15
DEFAULT_EPOCHS = 250


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=Path("runs/screenreader-dataset/screenreader-evidence.jsonl"))
    parser.add_argument("--encoder", type=Path, default=Path("models/encoders/all-MiniLM-L6-v2"))
    parser.add_argument("--output", type=Path, default=Path("models/screenreader-scorer"))
    parser.add_argument("--epochs", type=int, default=DEFAULT_EPOCHS)
    parser.add_argument("--max-length", type=int, default=256)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_records(path: Path) -> list[dict[str, Any]]:
    records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not records:
        raise RuntimeError(f"no training records in {path}")
    for index, record in enumerate(records, start=1):
        input_data = record.get("input", {})
        leaked = sorted(FORBIDDEN_INPUT_KEYS.intersection(input_data))
        if leaked:
            raise RuntimeError(f"record {index} leaked forbidden model input: {', '.join(leaked)}")
        if not input_data.get("evidenceText"):
            raise RuntimeError(f"record {index} has empty screen-reader evidence")
        if record.get("target", {}).get("label") not in {"clean", "violation"}:
            raise RuntimeError(f"record {index} has an invalid target label")
        if not record.get("provenance", {}).get("family"):
            raise RuntimeError(f"record {index} has no grouping family")
    return records


def assert_encoder(root: Path) -> Path:
    unsafe = sorted(
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file() and (path.is_symlink() or path.suffix.lower() in UNSAFE_SUFFIXES)
    )
    model_file = root / "model.safetensors"
    if unsafe:
        raise RuntimeError("encoder contains unsafe files: " + ", ".join(unsafe))
    if not model_file.is_file():
        raise RuntimeError(f"encoder is missing {model_file}")
    return model_file


def assign_splits(records: list[dict[str, Any]]) -> dict[str, str]:
    families = sorted({record["provenance"]["family"] for record in records})
    assignment = {}
    for family in families:
        bucket = int(hashlib.sha256(family.encode("utf-8")).hexdigest()[:8], 16) / 0xFFFFFFFF
        if bucket < TRAIN_RATIO:
            assignment[family] = "train"
        elif bucket < TRAIN_RATIO + VALIDATION_RATIO:
            assignment[family] = "validation"
        else:
            assignment[family] = "test"
    return assignment


def encode_records(records: list[dict[str, Any]], encoder_root: Path, max_length: int) -> Any:
    import torch
    from transformers import AutoModel, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(encoder_root, local_files_only=True)
    encoder = AutoModel.from_pretrained(encoder_root, local_files_only=True, use_safetensors=True)
    encoder.eval()
    texts = [record["input"]["evidenceText"] for record in records]
    embeddings = []
    with torch.no_grad():
        for start in range(0, len(texts), 16):
            batch = tokenizer(texts[start : start + 16], padding=True, truncation=True, max_length=max_length, return_tensors="pt")
            output = encoder(**batch).last_hidden_state
            mask = batch["attention_mask"].unsqueeze(-1).expand(output.size()).float()
            pooled = (output * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
            embeddings.append(torch.nn.functional.normalize(pooled, p=2, dim=1))
    return torch.cat(embeddings), encoder.config.hidden_size


def metrics(scores: Any, labels: Any, threshold: float) -> dict[str, float | int]:
    import torch

    labels_bool = labels == 1
    predicted = scores >= threshold
    true_positive = int(torch.logical_and(predicted, labels_bool).sum())
    false_positive = int(torch.logical_and(predicted, ~labels_bool).sum())
    false_negative = int(torch.logical_and(~predicted, labels_bool).sum())
    clean = int((labels == 0).sum())
    precision = true_positive / max(true_positive + false_positive, 1)
    recall = true_positive / max(true_positive + false_negative, 1)
    return {
        "records": int(labels.numel()),
        "positive": int(labels.sum()),
        "clean": clean,
        "truePositive": true_positive,
        "falsePositive": false_positive,
        "falseNegative": false_negative,
        "precision": precision,
        "recall": recall,
        "f1": 2 * precision * recall / max(precision + recall, 1e-9),
    }


def choose_threshold(scores: Any, labels: Any) -> float:
    candidates = [i / 100 for i in range(5, 100, 5)]
    valid = []
    for threshold in candidates:
        result = metrics(scores, labels, threshold)
        if result["falsePositive"] == 0:
            valid.append((result["f1"], threshold))
    return max(valid)[1] if valid else 0.5


def train_head(features: Any, labels: Any, epochs: int) -> tuple[Any, Any]:
    import torch

    torch.manual_seed(SEED)
    head = torch.nn.Linear(features.shape[1], 1)
    positives = labels.sum().item()
    negatives = labels.numel() - positives
    positive_weight = max(negatives / max(positives, 1), 1.0)
    loss_fn = torch.nn.BCEWithLogitsLoss(pos_weight=torch.tensor([positive_weight]))
    optimizer = torch.optim.AdamW(head.parameters(), lr=0.02, weight_decay=0.01)
    for _ in range(epochs):
        optimizer.zero_grad()
        loss = loss_fn(head(features).squeeze(1), labels.float())
        loss.backward()
        optimizer.step()
    return head.weight.detach().clone(), head.bias.detach().clone()


def main() -> None:
    args = parse_args()
    random.seed(SEED)
    encoder_file = assert_encoder(args.encoder)
    records = read_records(args.data)
    split_for_family = assign_splits(records)
    features, dimension = encode_records(records, args.encoder, args.max_length)
    import torch
    from safetensors.torch import save_file

    criteria = sorted({criterion for record in records for criterion in record["target"].get("criteria", [])})
    split_indices = {
        split: [index for index, record in enumerate(records) if split_for_family[record["provenance"]["family"]] == split]
        for split in ("train", "validation", "test")
    }
    weights = {}
    report: dict[str, Any] = {
        "schema": "a11y-witness/screenreader-scorer-training",
        "encoder": {"path": str(args.encoder), "hiddenSize": dimension, "modelSha256": sha256(encoder_file)},
        "dataset": {"path": str(args.data), "sha256": sha256(args.data), "records": len(records)},
        "split": {split: len(indices) for split, indices in split_indices.items()},
        "criteria": {},
        "releaseEligible": True,
        "warnings": [],
    }
    for criterion in criteria:
        labels = torch.tensor([int(criterion in record["target"].get("criteria", [])) for record in records], dtype=torch.float32)
        train_indices = split_indices["train"]
        train_labels = labels[train_indices]
        if int(train_labels.sum()) < 20:
            report["releaseEligible"] = False
            report["warnings"].append(f"{criterion}: fewer than 20 positive training records")
        weight, bias = train_head(features[train_indices], train_labels, args.epochs)
        weights[f"{criterion}.weight"] = weight
        weights[f"{criterion}.bias"] = bias
        logits = features @ weight.t() + bias
        validation_indices = split_indices["validation"]
        validation_labels = labels[validation_indices]
        threshold = choose_threshold(torch.sigmoid(logits[validation_indices, 0]), validation_labels)
        criterion_report = {"threshold": threshold}
        for split, indices in split_indices.items():
            criterion_report[split] = metrics(torch.sigmoid(logits[indices, 0]), labels[indices], threshold)
            if int(labels[indices].sum()) == 0:
                report["releaseEligible"] = False
                report["warnings"].append(f"{criterion}: {split} split has no positive records")
        report["criteria"][criterion] = criterion_report

    args.output.mkdir(parents=True, exist_ok=True)
    save_file(weights, str(args.output / "model.safetensors"), metadata={"format": "pt", "encoder": "all-MiniLM-L6-v2"})
    (args.output / "training-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not report["releaseEligible"]:
        print("WARNING: this is a seed smoke-test artifact, not a release candidate")


if __name__ == "__main__":
    main()
