#!/usr/bin/env python3
"""Train a frozen-encoder, per-criterion screen-reader evidence scorer.

The encoder is never fine-tuned here. It must be a pinned local Hugging Face
checkpoint containing model.safetensors; the only newly trained weights are
the small binary heads, also written as safetensors. The heads receive a
channel-tagged text embedding plus facts derived from screen-reader evidence
such as field naming and table-header announcements. Provenance is metadata,
never a feature.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
from pathlib import Path
from typing import Any


FORBIDDEN_INPUT_KEYS = {"url", "task", "html", "dom", "css", "axe", "diagnostics"}
UNSAFE_SUFFIXES = {".bin", ".ckpt", ".h5", ".msgpack", ".ot", ".pickle", ".pkl", ".pt", ".pth"}
SEED = 20260726
TRAIN_RATIO = 0.7
VALIDATION_RATIO = 0.15
DEFAULT_EPOCHS = 250
CALIBRATION_FOLDS = 5
ENGINEERED_FEATURE_SCALE = 4.0
FEATURE_SCHEMA_VERSION = "screenreader-structured-v1"

FEATURE_NAMES = (
    "transcript_present",
    "heading_present",
    "landmark_present",
    "landmark_named",
    "form_field_present",
    "form_field_named",
    "form_field_unnamed",
    "bare_edit_present",
    "control_present",
    "table_present",
    "table_data_row_present",
    "table_header_associated",
    "table_position_only",
    "state_change_present",
    "state_changed",
    "state_unchanged",
    "form_change_present",
    "form_change_nonempty",
    "form_change_empty",
    "post_submit_present",
    "validation_error_announced",
    "generic_heading_present",
    "vague_link_present",
    "generic_graphic_present",
    "unnamed_graphic_present",
    "filename_graphic_present",
)

LEADING_ROLE = re.compile(
    r"^(edit(?:\s+text)?|button|checkbox|radio|combo\s*box|list\s*box|slider|spin\s*button)\b",
    re.IGNORECASE,
)
LANDMARK_ROLES = {
    "banner",
    "complementary",
    "contentinfo",
    "main",
    "navigation",
    "region",
    "search",
}
STATE_WORD = re.compile(r"\b(expanded|collapsed|open|closed|pressed|checked)\b", re.IGNORECASE)
TABLE_DATA_ROW = re.compile(r"\brow\s+(?!1\b)(?P<row>\d+)\b(?P<between>.*?)\bcolumn\b", re.IGNORECASE)
TABLE_WORD = re.compile(r"\btable\b", re.IGNORECASE)
ROW_WORD = re.compile(r"\brow\b", re.IGNORECASE)
ERROR_WORD = re.compile(r"invalid|\berror\b", re.IGNORECASE)
GENERIC_HEADINGS = {"welcome", "overview", "stuff", "things", "information", "notes", "options", "updates", "more", "section", "introduction", "help", "miscellaneous", "details", "next"}
VAGUE_LINKS = {"read more", "learn more", "click here", "here", "this", "that", "details", "more", "go", "info"}
GENERIC_GRAPHICS = {"photo", "image", "graphic", "picture"}
FILENAME_GRAPHIC = re.compile(r"\b(?:jpg|jpeg|png|gif|svg|webp)\b|\bdot\s+(?:jpg|jpeg|png|gif|svg|webp)\b", re.IGNORECASE)
UNNAMED_GRAPHIC = re.compile(r"unlabeled\s+graphic|to get missing image descriptions", re.IGNORECASE)


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
        if not input_data.get("evidenceUnits"):
            raise RuntimeError(f"record {index} has no channel-tagged screen-reader evidence")
        target = record.get("target", {})
        if target.get("label") not in {"clean", "violation"}:
            raise RuntimeError(f"record {index} has an invalid target label")
        if not isinstance(target.get("subtypes"), list):
            raise RuntimeError(f"record {index} has no subtype labels")
        if target["label"] == "clean" and target["subtypes"]:
            raise RuntimeError(f"record {index} labels a clean example with a violation subtype")
        if target["label"] == "violation" and not target["subtypes"]:
            raise RuntimeError(f"record {index} has a violation with no subtype label")
        if not record.get("provenance", {}).get("family"):
            raise RuntimeError(f"record {index} has no grouping family")
    return records


def all_evidence(record: dict[str, Any]) -> list[str]:
    return [
        unit["text"]
        for unit in record["input"].get("evidenceUnits", [])
        if isinstance(unit.get("text"), str)
    ]


def named_landmark(value: str) -> bool:
    first_part = value.split(",", 1)[0].strip().lower()
    return bool(first_part) and first_part not in LANDMARK_ROLES


def state_word(value: str) -> str:
    match = STATE_WORD.search(value)
    return match.group(1).lower() if match else ""


def heading_name(value: str) -> str:
    return value.split(", heading", 1)[0].strip().lower()


def link_name(value: str) -> str:
    match = re.match(r"link\s*,\s*(.*)$", value.strip(), re.IGNORECASE)
    return match.group(1).strip().lower() if match else ""


def graphic_name(value: str) -> str:
    match = re.match(r"graphic\s*,\s*(.*)$", value.strip(), re.IGNORECASE)
    return match.group(1).strip().lower() if match else ""


def structured_feature_values(record: dict[str, Any]) -> dict[str, float]:
    """Extract only relations and presence facts observable in screen-reader output."""
    values = {name: 0.0 for name in FEATURE_NAMES}
    input_data = record["input"]
    structure = input_data.get("structure") or {}
    interaction = input_data.get("interaction") or {}
    transcript = input_data.get("transcript") or []
    headings = structure.get("headings") or []
    landmarks = structure.get("landmarks") or []
    form_fields = structure.get("formFields") or []
    controls = interaction.get("controls") or []
    state_changes = interaction.get("stateChanges") or []
    form_changes = interaction.get("formChanges") or []
    post_submit_fields = interaction.get("postSubmitFields") or []

    values["transcript_present"] = float(bool(transcript))
    values["heading_present"] = float(bool(headings))
    values["landmark_present"] = float(bool(landmarks))
    values["landmark_named"] = float(any(named_landmark(value) for value in landmarks))
    values["form_field_present"] = float(bool(form_fields))
    values["form_field_named"] = float(any(not LEADING_ROLE.match(value.strip()) for value in form_fields))
    values["form_field_unnamed"] = float(any(LEADING_ROLE.match(value.strip()) for value in form_fields))
    values["bare_edit_present"] = float(any(value.strip().lower() in {"edit", "edit text"} for value in all_evidence(record)))
    values["control_present"] = float(bool(controls))

    table_evidence = [value for value in all_evidence(record) if TABLE_WORD.search(value) or ROW_WORD.search(value)]
    data_rows = [match for value in table_evidence for match in TABLE_DATA_ROW.finditer(value)]
    associated_rows = [match for match in data_rows if match.group("between").strip(" ,")]
    position_only_rows = [match for match in data_rows if not match.group("between").strip(" ,")]
    values["table_present"] = float(any(TABLE_WORD.search(value) for value in table_evidence))
    values["table_data_row_present"] = float(bool(data_rows))
    values["table_header_associated"] = float(bool(associated_rows))
    values["table_position_only"] = float(bool(position_only_rows))

    values["state_change_present"] = float(bool(state_changes))
    state_pairs = [
        (state_word(change.get("control", "")), state_word(change.get("after", "")))
        for change in state_changes
    ]
    values["state_changed"] = float(any(after and before != after for before, after in state_pairs))
    values["state_unchanged"] = float(any(not after or before == after for before, after in state_pairs))

    values["form_change_present"] = float(bool(form_changes))
    values["form_change_nonempty"] = float(any(change.get("after", "").strip() for change in form_changes))
    values["form_change_empty"] = float(any(not change.get("after", "").strip() for change in form_changes))
    values["post_submit_present"] = float(bool(post_submit_fields))
    values["validation_error_announced"] = float(
        any(ERROR_WORD.search(value) for value in post_submit_fields)
        or any(ERROR_WORD.search(change.get("after", "")) for change in form_changes)
    )
    values["generic_heading_present"] = float(
        any(heading_name(value) in GENERIC_HEADINGS for value in headings)
    )
    values["vague_link_present"] = float(
        any(link_name(value) in VAGUE_LINKS for value in all_evidence(record))
    )
    values["generic_graphic_present"] = float(
        any(graphic_name(value) in GENERIC_GRAPHICS for value in all_evidence(record))
    )
    values["unnamed_graphic_present"] = float(any(UNNAMED_GRAPHIC.search(value) for value in all_evidence(record)))
    values["filename_graphic_present"] = float(any(FILENAME_GRAPHIC.search(value) for value in all_evidence(record)))
    return values


def structured_features(records: list[dict[str, Any]]) -> Any:
    import torch

    return torch.tensor(
        [[values[name] for name in FEATURE_NAMES] for values in map(structured_feature_values, records)],
        dtype=torch.float32,
    ) * ENGINEERED_FEATURE_SCALE


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


def calibration_fold_for_family(family: str) -> int:
    digest = hashlib.sha256((family + "|threshold-calibration").encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % CALIBRATION_FOLDS


def head_key(subtype: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9]+", "_", subtype).strip("_")
    return "subtype_" + safe


def score_head(features: Any, weight: Any, bias: Any) -> Any:
    import torch

    return torch.sigmoid((features @ weight.t() + bias)[:, 0])


def out_of_fold_scores(
    features: Any,
    labels: Any,
    records: list[dict[str, Any]],
    development_indices: list[int],
    epochs: int,
) -> Any:
    import torch

    scores = torch.zeros(len(records), dtype=torch.float32)
    development_families = {records[index]["provenance"]["family"] for index in development_indices}
    folds = {
        family: calibration_fold_for_family(family)
        for family in development_families
    }
    for fold in range(CALIBRATION_FOLDS):
        held_out = [
            index for index in development_indices
            if folds[records[index]["provenance"]["family"]] == fold
        ]
        training = [
            index for index in development_indices
            if folds[records[index]["provenance"]["family"]] != fold
        ]
        if not held_out or not training:
            continue
        weight, bias = train_head(features[training], labels[training], epochs)
        scores[held_out] = score_head(features[held_out], weight, bias)
    return scores


def encode_records(records: list[dict[str, Any]], encoder_root: Path, max_length: int) -> Any:
    import torch
    from transformers import AutoModel, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(encoder_root, local_files_only=True)
    encoder = AutoModel.from_pretrained(encoder_root, local_files_only=True, use_safetensors=True)
    encoder.eval()
    texts = [
        "\n".join(
            f"{unit.get('channel', 'evidence')}: {unit['text']}"
            for unit in record["input"].get("evidenceUnits", [])
            if isinstance(unit.get("text"), str)
        )
        for record in records
    ]
    embeddings = []
    with torch.no_grad():
        for start in range(0, len(texts), 16):
            batch = tokenizer(texts[start : start + 16], padding=True, truncation=True, max_length=max_length, return_tensors="pt")
            output = encoder(**batch).last_hidden_state
            mask = batch["attention_mask"].unsqueeze(-1).expand(output.size()).float()
            pooled = (output * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
            embeddings.append(torch.nn.functional.normalize(pooled, p=2, dim=1))
    text_features = torch.cat(embeddings)
    structural = structured_features(records)
    return torch.cat([text_features, structural], dim=1), encoder.config.hidden_size, len(FEATURE_NAMES)


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
    features, dimension, structured_dimension = encode_records(records, args.encoder, args.max_length)
    import torch
    from safetensors.torch import save_file

    criteria = sorted({criterion for record in records for criterion in record["target"].get("criteria", [])})
    subtypes_by_criterion = {
        criterion: sorted({
            subtype for record in records
            if criterion in record["target"].get("criteria", [])
            for subtype in record["target"].get("subtypes", [])
            if subtype.startswith(criterion + ":")
        })
        for criterion in criteria
    }
    split_indices = {
        split: [index for index, record in enumerate(records) if split_for_family[record["provenance"]["family"]] == split]
        for split in ("train", "validation", "test")
    }
    development_indices = split_indices["train"] + split_indices["validation"]
    weights = {}
    report: dict[str, Any] = {
        "schema": "a11y-witness/screenreader-scorer-training",
        "encoder": {"path": str(args.encoder), "hiddenSize": dimension, "modelSha256": sha256(encoder_file)},
        "representation": {
            "schema": FEATURE_SCHEMA_VERSION,
            "text": "channel-tagged screen-reader evidenceUnits",
            "embeddingSize": dimension,
            "structuredFeatureSize": structured_dimension,
            "structuredFeatureScale": ENGINEERED_FEATURE_SCALE,
            "structuredFeatures": list(FEATURE_NAMES),
        },
        "dataset": {"path": str(args.data), "sha256": sha256(args.data), "records": len(records)},
        "split": {split: len(indices) for split, indices in split_indices.items()},
        "calibration": {
            "method": "grouped-out-of-fold-threshold-calibration",
            "folds": CALIBRATION_FOLDS,
            "developmentRecords": len(development_indices),
        },
        "criteria": {},
        "releaseEligible": True,
        "warnings": [],
    }
    for criterion in criteria:
        criterion_labels = torch.tensor(
            [int(criterion in record["target"].get("criteria", [])) for record in records],
            dtype=torch.float32,
        )
        subtype_oof_scores = []
        subtype_final_scores = []
        subtype_report = {}
        for subtype in subtypes_by_criterion[criterion]:
            subtype_labels = torch.tensor(
                [int(subtype in record["target"].get("subtypes", [])) for record in records],
                dtype=torch.float32,
            )
            subtype_development_labels = subtype_labels[development_indices]
            if int(subtype_development_labels.sum()) < 20:
                report["releaseEligible"] = False
                report["warnings"].append(f"{subtype}: fewer than 20 positive development records")
            oof_scores = out_of_fold_scores(
                features,
                subtype_labels,
                records,
                development_indices,
                args.epochs,
            )
            weight, bias = train_head(features[development_indices], subtype_development_labels, args.epochs)
            key = head_key(subtype)
            weights[key + ".weight"] = weight
            weights[key + ".bias"] = bias
            subtype_oof_scores.append(oof_scores)
            subtype_final_scores.append(score_head(features, weight, bias))
            subtype_report[subtype] = {
                "head": key,
                "development": metrics(oof_scores[development_indices], subtype_development_labels, 0.5),
            }

        criterion_oof_scores = torch.stack(subtype_oof_scores).amax(dim=0)
        criterion_final_scores = torch.stack(subtype_final_scores).amax(dim=0)
        threshold = choose_threshold(criterion_oof_scores[development_indices], criterion_labels[development_indices])
        criterion_report = {
            "threshold": threshold,
            "subtypes": subtype_report,
            "calibration": metrics(
                criterion_oof_scores[development_indices],
                criterion_labels[development_indices],
                threshold,
            ),
        }
        for split, indices in split_indices.items():
            criterion_report[split] = metrics(criterion_final_scores[indices], criterion_labels[indices], threshold)
            if int(criterion_labels[indices].sum()) == 0:
                report["releaseEligible"] = False
                report["warnings"].append(f"{criterion}: {split} split has no positive records")
        calibration_false_positive = criterion_report["calibration"]["falsePositive"]
        calibration_false_negative = criterion_report["calibration"]["falseNegative"]
        if calibration_false_positive or calibration_false_negative:
            report["releaseEligible"] = False
            report["warnings"].append(
                f"{criterion}: grouped calibration has {calibration_false_positive} false positives "
                f"and {calibration_false_negative} false negatives"
            )
        report["criteria"][criterion] = criterion_report

    args.output.mkdir(parents=True, exist_ok=True)
    save_file(
        weights,
        str(args.output / "model.safetensors"),
        metadata={
            "format": "pt",
            "encoder": "all-MiniLM-L6-v2",
            "representation": FEATURE_SCHEMA_VERSION,
            "structured_features": json.dumps(list(FEATURE_NAMES)),
            "structured_feature_scale": str(ENGINEERED_FEATURE_SCALE),
        },
    )
    (args.output / "training-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not report["releaseEligible"]:
        print("WARNING: this is a seed smoke-test artifact, not a release candidate")


if __name__ == "__main__":
    main()
