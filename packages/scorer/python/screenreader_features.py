#!/usr/bin/env python3
"""
The feature contract: everything that turns a screen-reader capture into the numbers the trained heads
score, plus the head arithmetic itself.

**This module is versioned WITH the weights, and that is why it is here rather than in the trainer.**
`FEATURE_SCHEMA_VERSION` is stamped into `model.safetensors` metadata, so a change to any function in this
file invalidates every weight file that does not carry the new version — the scorer refuses the mismatch
rather than silently scoring against features it was not trained on.

It was extracted from the trainer (now `packages/lab/scripts/train-screenreader-model.py`), which the
scoring program used to load
dynamically by file path. That made the trainer a RUNTIME DEPENDENCY of scoring, so shipping a scorer meant
shipping a trainer, which ADR 0004 rejects: distributing a trainer implies a consumer can reproduce
training, and they cannot — the corpus is not distributed.

Both programs now import this module. Nothing here trains: no splits, no epochs, no thresholds. Those stay
in the trainer, which is deliberately NOT published.
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

ENGINEERED_FEATURE_SCALE = 4.0

ENGINEERED_FEATURE_MULTIPLIERS = {
    # This is an explicit relation in the NVDA evidence, not an embedding
    # guess. Give it enough representation strength to survive surrounding
    # prose that can otherwise make a generic link look semantically specific.
    "vague_link_present": 2.0,
    "form_field_unnamed": 3.0,
    # Acceptance evidence includes headings whose generic name is announced
    # correctly by NVDA. This relation is useful for 2.4.6, but the frozen
    # text embedding can dilute it among otherwise descriptive page context.
    "generic_heading_present": 2.0,
    # A named field is direct counter-evidence for the unnamed-field subtype;
    # strengthen that explicit screen-reader relation so prose around the
    # field cannot turn a conforming field into a violation prediction.
    "form_field_named": 2.0,
}

FEATURE_SCHEMA_VERSION = "screenreader-structured-v4"

FEATURE_NAMES = (
    "transcript_present",
    "heading_present",
    "plain_heading_candidate_present",
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
    "status_update_announced",
    "post_submit_present",
    "validation_error_announced",
    "validation_error_missing",
    "generic_heading_present",
    "vague_link_present",
    "generic_graphic_present",
    "unnamed_graphic_present",
    "filename_graphic_present",
)

LEADING_ROLE = re.compile(
    r"^(?:\uFFFC\s*,\s*)?(edit(?:\s+text)?|button|checkbox|radio|combo\s*box|list\s*box|slider|spin\s*button)\b",
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

HEADING_ANNOUNCEMENT = re.compile(r"^heading\s*,\s*level\s+\d+\b", re.IGNORECASE)

TABLE_DATA_ROW = re.compile(r"\brow\s+(?!1\b)(?P<row>\d+)\b(?P<between>.*?)\bcolumn\b", re.IGNORECASE)

TABLE_ASSOCIATED_CELL = re.compile(r"^.+,\s*column\s+\d+\b", re.IGNORECASE)

TABLE_POSITION_ONLY_CELL = re.compile(r"^column\s+\d+\b", re.IGNORECASE)

TABLE_WORD = re.compile(r"\btable\b", re.IGNORECASE)

ROW_WORD = re.compile(r"\brow\b", re.IGNORECASE)

ERROR_WORD = re.compile(r"invalid|\berror\b", re.IGNORECASE)

STATUS_UPDATE = re.compile(r"^(?:showing|displaying|updated|loaded|filtered)\b", re.IGNORECASE)

FORM_FIELD_ROLE = re.compile(r"\b(?:edit(?:\s+text)?|combo\s*box|list\s*box|checkbox|radio|spin\s*button)\b", re.IGNORECASE)

GENERIC_HEADINGS = {"welcome", "overview", "stuff", "things", "information", "notes", "options", "updates", "more", "section", "introduction", "help", "miscellaneous", "details", "next"}

VAGUE_LINKS = {"read more", "learn more", "click here", "here", "this", "that", "details", "more", "go", "info"}

GENERIC_GRAPHICS = {"photo", "image", "graphic", "picture"}

FILENAME_GRAPHIC = re.compile(r"\b(?:jpg|jpeg|png|gif|svg|webp)\b|\bdot\s+(?:jpg|jpeg|png|gif|svg|webp)\b", re.IGNORECASE)

UNNAMED_GRAPHIC = re.compile(r"unlabeled\s+graphic|to get missing image descriptions", re.IGNORECASE)

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

def plain_heading_candidate(value: str, following_value: str) -> bool:
    """Find a likely spoken section title that has no heading announcement.

    This is intentionally a weak, screen-reader-only relation. It does not
    infer a heading from HTML or visual styling; it only notices the common
    transcript pattern of a short, punctuation-free line followed by prose.
    The model learns whether that relation is predictive for the criterion.
    """
    candidate = value.strip()
    following = following_value.strip()
    if not candidate or not following or HEADING_ANNOUNCEMENT.match(candidate):
        return False
    if candidate[-1:] in ".,;:!?" or not re.search(r"[.!?]$", following):
        return False
    words = re.findall(r"[A-Za-z0-9][A-Za-z0-9'’-]*", candidate)
    return 1 <= len(words) <= 8

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
    table_cells = [value for value in structure.get("tableCells") or [] if isinstance(value, str)]
    controls = interaction.get("controls") or []
    state_changes = interaction.get("stateChanges") or []
    form_changes = interaction.get("formChanges") or []
    post_submit_fields = interaction.get("postSubmitFields") or []

    values["transcript_present"] = float(bool(transcript))
    values["heading_present"] = float(bool(headings))
    values["plain_heading_candidate_present"] = float(
        any(
            plain_heading_candidate(value, transcript[index + 1])
            for index, value in enumerate(transcript[:-1])
        )
    )
    values["landmark_present"] = float(bool(landmarks))
    values["landmark_named"] = float(any(named_landmark(value) for value in landmarks))
    values["form_field_present"] = float(bool(form_fields))
    values["form_field_named"] = float(any(not LEADING_ROLE.match(value.strip()) for value in form_fields))
    values["form_field_unnamed"] = float(any(LEADING_ROLE.match(value.strip()) for value in form_fields))
    values["bare_edit_present"] = float(any(value.strip().lower() in {"edit", "edit text"} for value in all_evidence(record)))
    values["control_present"] = float(bool(controls))

    table_evidence = [
        value for value in all_evidence(record)
        if TABLE_WORD.search(value) or ROW_WORD.search(value)
    ] + table_cells
    data_rows = [match for value in table_evidence for match in TABLE_DATA_ROW.finditer(value)]
    associated_rows = [match for match in data_rows if match.group("between").strip(" ,")]
    position_only_rows = [match for match in data_rows if not match.group("between").strip(" ,")]
    associated_cells = [value for value in table_cells if TABLE_ASSOCIATED_CELL.search(value.strip())]
    position_only_cells = [value for value in table_cells if TABLE_POSITION_ONLY_CELL.search(value.strip())]
    values["table_present"] = float(bool(table_cells) or any(TABLE_WORD.search(value) for value in table_evidence))
    values["table_data_row_present"] = float(bool(data_rows) or bool(table_cells))
    values["table_header_associated"] = float(bool(associated_rows) or bool(associated_cells))
    values["table_position_only"] = float(bool(position_only_rows) or bool(position_only_cells))

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
    values["status_update_announced"] = float(
        any(STATUS_UPDATE.match(change.get("after", "").strip()) for change in form_changes)
    )
    values["post_submit_present"] = float(bool(post_submit_fields))
    values["validation_error_announced"] = float(
        any(ERROR_WORD.search(value) for value in post_submit_fields)
        or any(ERROR_WORD.search(change.get("after", "")) for change in form_changes)
    )
    values["validation_error_missing"] = float(
        any(FORM_FIELD_ROLE.search(value) for value in post_submit_fields)
        and any(not change.get("after", "").strip() for change in form_changes)
        and not values["validation_error_announced"]
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

    feature_tensor = torch.tensor(
        [[values[name] for name in FEATURE_NAMES] for values in map(structured_feature_values, records)],
        dtype=torch.float32,
    )
    multipliers = torch.tensor(
        [ENGINEERED_FEATURE_MULTIPLIERS.get(name, 1.0) for name in FEATURE_NAMES],
        dtype=torch.float32,
    )
    return feature_tensor * ENGINEERED_FEATURE_SCALE * multipliers

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

def head_key(subtype: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9]+", "_", subtype).strip("_")
    return "subtype_" + safe

def score_head(features: Any, weight: Any, bias: Any) -> Any:
    import torch

    return torch.sigmoid((features @ weight.t() + bias)[:, 0])

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
