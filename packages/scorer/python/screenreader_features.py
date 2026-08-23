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
    #
    # 2.0 -> 6.0 on 2026-08-23, because 2.0 demonstrably was not enough. Measured on the
    # `3.3.2:unnamed-form-field` head: the 384 encoder dimensions carry |w| summing to 248.0
    # against 5.98 across all 29 document features, so the explicit relation is a minority
    # vote by two orders of magnitude. `form_field_named` landed at -0.232 (effective -0.463
    # at x2.0) while `form_field_unnamed` reached +0.653 (effective +1.960 at x3.0) — the
    # counter-evidence was a quarter the strength of the evidence it exists to answer.
    #
    # The cost was four CONFORMANT form pages scored as 3.3.2 violations. Their features were
    # correct (`form_field_named=1.0`, `form_field_unnamed=0.0`); the embedding outvoted them,
    # because a conforming page legitimately announces the field bare once ("edit, Example
    # value") before announcing it named, and document-mean pooling averages the two.
    #
    # 6.0 puts it above `form_field_unnamed`'s 3.0, which is the ordering the comment above
    # always implied: counter-evidence for a subtype should be at least as loud as the evidence.
    "form_field_named": 6.0,
}

# v8, 2026-08-23: `link_name` and `graphic_name` stopped anchoring the role at the start of the phrase.
# NVDA prefixes an announcement with the context the cursor entered or left, so `^link,` matched 230 of
# 11,275 link announcements in the corpus — the feature was blind to 98% of them, and `vague_link_present`
# read 0.0 on every page whose vague link was an in-page anchor.
#
# This is a MEANING change, not a refactor: the same evidence now produces different feature values, so
# every weight file trained under v7 was fitted to a different function of the same captures. Bumping is
# what stops a v7 model being scored with v8 features and the difference being read as model behaviour.
# Measured before bumping: 73 corpus records change, all of them labelled `violation`, none clean.
FEATURE_SCHEMA_VERSION = "screenreader-structured-v8"

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

# Roles for which pressing Enter IS the activation, so "its state did not change" is a real 4.1.2
# finding rather than an artefact of which key the probe used.
#
# `probeDisclosure` presses Enter (`nvda.act()`) on whatever control it is aimed at. For a native
# `<select>` Enter is simply not the key that opens the list -- so a combo box that stays `collapsed`
# afterwards is behaving CORRECTLY and the observation is not a state-change test at all. The evidence
# is identical to a broken disclosure's, character for character apart from the role:
#
#     bad  disclosure  "Travel advice, button, collapsed"       -> "Travel advice, button, focused, collapsed"
#     ok   combo box   "Passenger type, combo box, collapsed"   -> "Passenger type, combo box, focused, collapsed"
#
# The corpus has 69 conformant and 69 failing disclosures against SIX combo-box records, so the head
# cannot learn the exception statistically -- and should not have to, because it is a fact about the
# control rather than a tendency in the data. Measured cost of leaving it implicit: 3 false positives on
# conformant pages, which is this tool's worst error, and the reason 4.1.2 fell back to an uncalibrated
# 0.5 threshold "which nobody chose".
#
# A POSITIVE list, deliberately. Enumerating the excluded roles instead would make an unseen role fire,
# and the safe direction of failure here is to miss rather than to accuse.
TOGGLE_ROLE = re.compile(r"\b(button|checkbox|radio\s*button|menu\s*item|tab)\b", re.IGNORECASE)

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

# NVDA prepends the enclosing landmark when a heading is the FIRST element inside it, announcing
# "main landmark, Welcome, heading, level 2" rather than "heading, level 2, Welcome". Without stripping
# that, `heading_name` returned "main landmark, welcome", which is not in GENERIC_HEADINGS -- so
# `generic_heading_present` read FALSE on exactly those pages, and 2.4.6 lost its only engineered
# feature on 50 of 100 pairs. The feature, its vocabulary and its exact-match semantics were all
# correct; an announcement quirk defeated the lookup.
LANDMARK_PREFIX = re.compile(
    r"^(?:" + "|".join(sorted(LANDMARK_ROLES)) + r")\s+landmark\s*,\s*",
    re.IGNORECASE,
)

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
        # `unknownSubtypes` is OPTIONAL and additive, so an older export loads unchanged. It means "the
        # label's source says nothing about this subtype for this page", which is not the same as clean --
        # a `clean` record is a hard negative for every head, and that is only sound when the source
        # actually claimed every criterion. A "partially compliant" statement with an enumerated failure
        # list claims the rest and says nothing about those, which is exactly what this expresses.
        unknown = target.get("unknownSubtypes", [])
        if not isinstance(unknown, list):
            raise RuntimeError(f"record {index} has a non-list unknownSubtypes")
        # Both present and unknown is a contradiction, and the direction it fails in matters: a head would
        # train on it as a positive while its mask excluded it, so the record would silently do nothing.
        overlap = sorted(set(unknown).intersection(target["subtypes"]))
        if overlap:
            raise RuntimeError(
                f"record {index} lists {', '.join(overlap)} as both a violation and unknown")
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
    """The heading's own text, with any landmark announcement NVDA prefixed to it removed.

    See LANDMARK_PREFIX: a heading that opens a landmark is announced with the landmark first, so the
    naive split left "main landmark, welcome" and every exact-match lookup against it failed.
    """
    # NVDA announces a heading in TWO orders and this must handle both. The structural sweep gives
    # "Welcome, heading, level 2"; the read-through gives "heading, level 2, Welcome". Only the first
    # was handled, so a transcript line returned the whole string and every lookup against it failed.
    # Today the caller passes sweep entries, so this half is defensive rather than a live bug -- but the
    # landmark half of this function was exactly such a latent case until it silently cost 2.4.6 half
    # its feature coverage.
    name = value.split(", heading", 1)[0].strip()
    name = LANDMARK_PREFIX.sub("", name).strip()
    return HEADING_ANNOUNCEMENT.sub("", name).lstrip(" ,").strip().lower()

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

# NVDA prefixes an announcement with the context the cursor just entered or left, so the ROLE is very
# rarely the first thing in the string:
#
#   "link, Read the planting guide"                                    <- the shape these used to match
#   "same page, link, Details"                                         <- an in-page anchor
#   "out of table, same page, link, Details"                           <- leaving a table, into an anchor
#   "list, with 6 items, bullet, same page, link, Opening times ..."   <- inside a list
#
# Anchoring at `^` therefore saw almost nothing. Measured across the corpus: 11,045 link announcements
# carry a prefix and 230 do not, so `link_name` was blind to **98%** of them — and `vague_link_present`,
# the highest-weighted feature on the 2.4.4 head (+1.247, ×2.0), read 0.0 on every page whose vague link
# was an in-page anchor. The head then decided from the frozen embedding alone: 0.0131 on a page that HAS
# a vague link, 0.9856 on the same page without one.
#
# This exact NVDA behaviour was found and fixed once already, in `dedupeKey`, where `CONTAINER_PREFIX`
# strips the leading container before keying a sweep. The remedy went to the sweep and never here — the
# shape CLAUDE.md calls "a fix applied at ONE call site when the behaviour reaches several".
#
# `\b` plus an explicit comma is what keeps this from matching a NAME containing the word: "out of links,
# same page, link, Details" needs `link` followed by a comma, so "links," cannot match.
ROLE_NAME = r"\b{role}\s*,\s*(.*)$"


def role_name(role: str, value: str) -> str:
    """The accessible name NVDA announced for `role`, wherever the role appears in the phrase."""
    match = re.search(ROLE_NAME.format(role=role), value.strip(), re.IGNORECASE)
    return match.group(1).strip().lower() if match else ""


def link_name(value: str) -> str:
    return role_name("link", value)

def graphic_name(value: str) -> str:
    return role_name("graphic", value)

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
        (state_word(change.get("control") or ""), state_word(change.get("after") or ""))
        for change in state_changes
    ]
    values["state_changed"] = float(any(after and before != after for before, after in state_pairs))
    # Two corrections over `any(not after or before == after)`, both of which turned a non-finding into
    # failure evidence:
    #
    # `not after` fired when the probe ERRORED and recorded no state. capture-core goes to deliberate
    # trouble to keep those distinguishable -- "a failed measurement is not silence, and must never be
    # recorded as one", written after 1 in 20 captures of a CORRECT page was made to look broken -- and
    # this line quietly converted the distinction back into a failure. Zero such entries exist in the
    # corpus today, so this is latent rather than active, which is exactly when it is cheap to fix.
    #
    # And the control must be one Enter actually activates; see TOGGLE_ROLE.
    values["state_unchanged"] = float(any(
        after and before == after and TOGGLE_ROLE.search(change.get("control") or "")
        for change, (before, after) in zip(state_changes, state_pairs)
    ))

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


def _onnx_encode(texts: list[str], encoder_root: Path, max_length: int):
    """Run the frozen MiniLM encoder over `texts` and return L2-normalised mean-pooled embeddings.

    ONNX Runtime, not torch. The encoder is the only reason torch was ever installed for INFERENCE — a
    400 MB wheel measured at 102 s in the GitHub Action, 34% of a cold run, to compute a frozen 6-layer
    transformer. ONNX Runtime is ~14 MB and documented as faster on CPU for exactly this.

    The model file ships in the SAME HuggingFace repo the encoder is already fetched from, so this costs
    one extra allowed file at setup and no new hosting. Proven equivalent to the torch model on real
    corpus text before being adopted: max absolute difference 2.300e-07, minimum per-row cosine
    0.999999881, against tolerances of 1e-5 and 0.9999. That is float32 rounding, not a change in meaning —
    which matters because every embedding feeds the trained heads, the thresholds calibrated against them,
    and the 0.847 support floor.

    Falls back to torch when the ONNX file is absent, so a checkout whose encoder was fetched before this
    change still scores rather than crashing — and the fallback is the ORIGINAL code path, so the two
    cannot disagree by construction.
    """
    import numpy as np
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(encoder_root, local_files_only=True)
    onnx_path = Path(encoder_root) / "onnx" / "model.onnx"
    if not onnx_path.exists():
        return _torch_encode(texts, encoder_root, max_length, tokenizer)

    import os

    import onnxruntime as ort

    # Set the thread count EXPLICITLY. Left unset, onnxruntime pins each worker thread to a core, and
    # `pthread_setaffinity_np` fails inside an LXC container, which restricts CPU affinity. That is one
    # `E:` line per session -- so on the lab container it would be logged on every scoring call, and an
    # error-level line that is always present is one nobody reads when it matters.
    #
    # Evidence-neutral, measured rather than assumed: the same 56 role/name phrases encode to
    # BIT-IDENTICAL float32 at 1, 2 and 4 threads (max abs diff 0.000e+00), so this changes log noise
    # and nothing that reaches the trained heads or the thresholds calibrated against them.
    options = ort.SessionOptions()
    options.intra_op_num_threads = os.cpu_count() or 1

    session = ort.InferenceSession(
        str(onnx_path), sess_options=options, providers=["CPUExecutionProvider"]
    )
    wanted = {spec.name for spec in session.get_inputs()}
    out = []
    for start in range(0, len(texts), 16):
        batch = tokenizer(
            texts[start : start + 16], padding=True, truncation=True,
            max_length=max_length, return_tensors="np",
        )
        feed = {name: batch[name] for name in wanted if name in batch}
        hidden = session.run(None, feed)[0]
        mask = batch["attention_mask"][..., None].astype(np.float32)
        pooled = (hidden * mask).sum(1) / np.clip(mask.sum(1), 1e-9, None)
        out.append(pooled / np.linalg.norm(pooled, axis=1, keepdims=True))
    return np.concatenate(out) if out else np.zeros((0, 384), dtype=np.float32)


def _torch_encode(texts: list[str], encoder_root: Path, max_length: int, tokenizer):
    """The original encoder pass, kept as the fallback for a checkout with no ONNX file."""
    import numpy as np
    import torch
    from transformers import AutoModel

    encoder = AutoModel.from_pretrained(encoder_root, local_files_only=True, use_safetensors=True)
    encoder.eval()
    out = []
    with torch.no_grad():
        for start in range(0, len(texts), 16):
            batch = tokenizer(
                texts[start : start + 16], padding=True, truncation=True,
                max_length=max_length, return_tensors="pt",
            )
            hidden = encoder(**batch).last_hidden_state
            mask = batch["attention_mask"].unsqueeze(-1).expand(hidden.size()).float()
            pooled = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
            out.append(torch.nn.functional.normalize(pooled, p=2, dim=1).numpy())
    return np.concatenate(out) if out else np.zeros((0, 384), dtype=np.float32)


def structured_features(records: list[dict[str, Any]]) -> Any:
    """The 29 engineered features, as float32 numpy.

    NUMPY rather than torch, and the whole inference path follows: torch is a 400 MB wheel that measured
    102 s to install in the GitHub Action — 34% of a cold run — to compute a frozen 6-layer encoder and
    fourteen dot products. Nothing here needs autograd; the encoder is frozen and the heads are already
    trained. The trainer, which does need autograd, converts at its own boundary.

    One featurizer still, which is the part that matters. Train and inference must not drift, and the way
    that is guaranteed is that both call THIS function rather than each keeping a copy in its own dtype.
    """
    import numpy as np

    feature_array = np.array(
        [[values[name] for name in FEATURE_NAMES] for values in map(structured_feature_values, records)],
        dtype=np.float32,
    )
    multipliers = np.array(
        [ENGINEERED_FEATURE_MULTIPLIERS.get(name, 1.0) for name in FEATURE_NAMES],
        dtype=np.float32,
    )
    return feature_array * np.float32(ENGINEERED_FEATURE_SCALE) * multipliers

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
    """Sigmoid of the head's logit, for numpy OR torch inputs.

    ONE formula, deliberately. The matmul is written once and works for both, because torch tensors and
    numpy arrays share `@` and `.T`; only the activation needs to differ, and that is two lines rather
    than a second copy of the scoring rule. Inference passes numpy so the Action needs no torch; the
    trainer passes torch tensors so autograd reaches the weights.

    Writing two functions here is the obvious alternative and is exactly the drift this module exists to
    prevent: a subtly different aggregation on each side produces plausible numbers and wrong findings.
    """
    logits = (features @ weight.T + bias)[:, 0]
    if hasattr(logits, "sigmoid"):
        return logits.sigmoid()  # torch, and it keeps the graph
    import numpy as np

    return 1.0 / (1.0 + np.exp(-logits))

# Which subtypes are scored per ANNOUNCEMENT rather than per capture, and why it is per subtype.
#
# Measured both ways on the same corpus. Instance-max scoring took 4.1.2's heads to precision 0.98 /
# 0.89 / 0.97 -- because "a control announced with a role and no name" is entirely contained in ONE
# announcement ("edit", with nothing after it) and needs no other line to judge.
#
# The same change took 2.4.6 from precision 0.51 to 0.30. Whether "Welcome" is a vague heading depends
# on what the page is ABOUT; scoring that announcement in isolation strips away the context that makes
# vagueness judgeable. For contextual criteria the document view is the correct representation, and
# mean-pooling was never their problem.
#
# So pooling is a property of the SIGNAL, not of the pipeline. Local findings pool by max over
# instances; contextual findings keep the whole capture. Default is document-mean: only subtypes with
# evidence that instance scoring helps are listed here.
# `4.1.2:missing-role` stays instance-max, and the alternative was MEASURED rather than reasoned about.
#
# The argument for moving it to document-mean was good and half of it was right. Instance-max cannot
# express an ABSENCE: there is no announcement carrying the evidence, because the evidence IS that no
# such announcement exists, and all 74 of this subtype's records have `formFields: []` and
# `controls: []`. Document-mean can see the whole capture, and recall duly went 0.809 -> 1.000.
#
# But precision went 1.000 -> 0.782, taking 4.1.2's grouped calibration from FP 2 / FN 13 to FP 21 /
# FN 0. That is the predicted cost: 437 of the corpus's 1,003 CONFORMANT records also announce no
# controls, because a page about images or tables has none either. The document view can represent
# "nothing was announced" and cannot tell it apart from "there was nothing to announce".
#
# So neither view is right, and the choice is between error TYPES. For this tool a false accusation on
# a conformant page is the worst error it can make, which is why the judge suppresses the model where a
# rule already decides. 14 misses at precision 1.000 beats 21 false alarms.
#
# What this subtype actually needs is a FEATURE that separates "a page that should have a control here"
# from "a page with no controls at all" -- the bad variant is a styled div announced as plain text where
# a button belongs. That is a different piece of work from choosing a pooling view, and this comment
# exists so nobody re-runs the pooling experiment expecting a different answer.
#
# ## 3.3.2:unnamed-form-field, added 2026-08-23 — the OPPOSITE direction, deliberately
#
# The paragraphs above warn against re-running the pooling experiment expecting a different answer. That
# experiment moved 4.1.2 from instance-max TO document-mean and measured the cost: precision 1.000 -> 0.782,
# FP 2 -> FP 21. This is the reverse move on a different subtype, and it is that measurement being USED
# rather than ignored: the recorded evidence is that instance-max buys precision and costs recall, and
# 3.3.2 has a precision problem — 8 false accusations on conformant pages, against 0 misses.
#
# Why the average is the wrong question here. A CONFORMING field page announces its field twice: bare when
# focus lands ("edit, Example value") and again with its label ("Company name, edit, Example value"). A mean
# over both lands between them, so which side of the cut a clean page falls on is decided by 384 encoder
# dimensions (|w| sum 248.0) rather than by the 29 document features (|w| sum 5.98) that say plainly
# `form_field_named=1`. "Is there an unnamed field on this page?" is an existence question and a mean
# answers a different one.
#
# Note what was tried first and did NOT work, so nobody repeats it: raising `form_field_named`'s multiplier
# from 2.0 to 6.0. The head simply learned a weight a third the size (-0.2316 -> -0.0717) and the effective
# contribution was unchanged (-0.4632 -> -0.4303). Scaling an input cannot strengthen a relation in a linear
# head, because gradient descent compensates. That applies to every entry in
# ENGINEERED_FEATURE_MULTIPLIERS, which is worth knowing before reaching for one again.
INSTANCE_POOLED_SUBTYPES = frozenset({
    "4.1.2:missing-role",
    "4.1.2:unnamed-control",
    "4.1.2:state-change-silent",
    "3.3.2:unnamed-form-field",
})


def pooling_for(subtype: str) -> str:
    return "instance-max" if subtype in INSTANCE_POOLED_SUBTYPES else "document-mean"


def encode_documents(records: list[dict[str, Any]], encoder_root: Path, max_length: int) -> tuple[Any, list[int]]:
    """The whole-capture view: every announcement joined and encoded as ONE sequence.

    A SECOND encoder pass, deliberately, and not a mean over the per-unit embeddings — that was tried
    and left 2.4.6 at 48 false negatives against 22 for this view. The difference is cross-unit
    ATTENTION: joining the text lets the transformer relate one announcement to another, which is
    precisely what a contextual criterion needs. Whether "Welcome" is a vague heading depends on what
    the rest of the page says, and encoding units independently destroys that relationship before any
    averaging can happen. Pooling after the fact cannot restore information the encoder never saw.

    Returned with identity offsets so a document-pooled head runs through the same `score_bags` path as
    an instance-pooled one -- a capture is a bag of one. Same arithmetic, no branching.
    """
    import numpy as np

    texts = ["\n".join(unit_texts(record)) for record in records]
    text_features = _onnx_encode(texts, encoder_root, max_length)
    features = np.concatenate([text_features, structured_features(records)], axis=1)
    return features, list(range(len(records) + 1))


def unit_texts(record: dict[str, Any]) -> list[str]:
    """The channel-tagged announcements of one capture — the INSTANCES of its bag.

    A capture is a bag and it fails if AT LEAST ONE announcement is bad, which is the multiple-instance
    learning setup. Kept as its own function so training and inference cannot disagree about what an
    instance is; the empty fallback keeps a unit-less capture occupying exactly one row, or every bag
    after it would be misaligned.
    """
    texts = [
        f"{unit.get('channel', 'evidence')}: {unit['text']}"
        for unit in record["input"].get("evidenceUnits", [])
        if isinstance(unit.get("text"), str)
    ]
    return texts or [""]


def bag_offsets(records: list[dict[str, Any]]) -> list[int]:
    """Row boundaries of each record's instances in the flat feature matrix.

    A PURE function of the records, deliberately: the trainer and the scorer each derive this from the
    same records rather than passing it between them, so the two cannot drift. Returns N+1 offsets, so
    record i owns rows [offsets[i], offsets[i + 1]).
    """
    offsets, total = [0], 0
    for record in records:
        total += len(unit_texts(record))
        offsets.append(total)
    return offsets


def bag_gather(offsets: list[int]) -> tuple[Any, Any]:
    """A padded [records x longest_bag] index matrix and its validity mask.

    Pooling by slicing each bag in a Python loop is correct but ruinous inside a training loop: the
    trainer runs ~21,000 epochs across its heads and folds, so 2,000 slices per epoch became ~42
    million and a two-minute train ran past forty minutes. One gather plus one max over a padded
    matrix is the same arithmetic, vectorised, and stays differentiable so the gradient still reaches
    each bag's argmax instance.

    Padded positions index row 0 and are masked to -inf before the max, so they can never win.
    """
    import numpy as np

    # Numpy, unconditionally: these are INDICES, not values, so nothing here ever needs a gradient, and
    # inference must stay torch-free. Torch indexes happily with a numpy array, but `masked_fill` requires
    # a real Tensor mask -- so the TRAINER converts both at its own boundary (`bag_gather_tensors`), the
    # same way it converts the feature matrix. Do not convert here; that would import torch into inference.
    sizes = [end - start for start, end in zip(offsets[:-1], offsets[1:])]
    widest = max(sizes) if sizes else 1
    gather = np.zeros((len(sizes), widest), dtype=np.int64)
    mask = np.zeros((len(sizes), widest), dtype=bool)
    for row, (start, size) in enumerate(zip(offsets[:-1], sizes)):
        gather[row, :size] = np.arange(start, start + size)
        mask[row, :size] = True
    return gather, mask


def score_bags(features: Any, offsets: list[int], weight: Any, bias: Any) -> Any:
    """Score every instance, then take the MAX within each bag. One score per record.

    This is the single symmetry point between training and inference: both route through it, and
    nothing else may pool. A subtly different aggregation on each side produces plausible numbers and
    wrong findings, which is the failure mode that matters here.

    Max, not mean: mean-pooling is what broke this. A good/bad pair for 2.4.6 differs by one word in
    27 announcements, and averaging drove it below the representation's resolution -- precision 0.51 at
    recall 1.0, i.e. the head could not see the signal at all. Max also encodes the semantics
    literally ("at least one") and names the announcement responsible, which this tool needs as the
    evidence it cites for a finding.

    Element-wise max over unit EMBEDDINGS was tried first and is not the same thing: it saturates into
    an envelope of the bag's variety and destroys instance identity. The max must be over SCORES.
    """
    gather, mask = bag_gather(offsets)
    unit_scores = score_head(features, weight, bias)
    # The gather and the masking rule are shared; only the reduction differs, because torch must keep the
    # graph and numpy must not import torch at all. Same arithmetic either way: padded positions are forced
    # to -inf so they can never win the max.
    if hasattr(unit_scores, "masked_fill"):
        import torch

        return unit_scores[torch.as_tensor(gather)].masked_fill(
            ~torch.as_tensor(mask), float("-inf")
        ).max(dim=1).values
    import numpy as np

    return np.where(mask, unit_scores[gather], -np.inf).max(axis=1)


def encode_records(records: list[dict[str, Any]], encoder_root: Path, max_length: int) -> Any:
    import numpy as np

    # One row per EVIDENCE UNIT, not per record. This used to join every announcement into a single
    # string and mean-pool its tokens -- two dilutions stacked -- so a one-word difference in a
    # 27-line capture was averaged away before any head saw it. `score_bags` collapses these rows back
    # to one score per record by taking the max within each bag.
    #
    # The STRUCTURED block stays document-level and is repeated across the bag. Those 29 values are
    # cross-channel facts and several are genuinely not computable from a single announcement --
    # `validation_error_announced` ORs postSubmitFields with formChanges, and
    # `plain_heading_candidate_present` needs adjacent transcript pairs. Repeating them keeps every
    # instance able to see them, keeps FEATURE_NAMES untouched, and keeps the head 413 wide, so the
    # head shape and the width assertion in score.py are unchanged. Only how OFTEN the head runs moved.
    bags = [unit_texts(record) for record in records]
    flat = [text for bag in bags for text in bag]
    text_features = _onnx_encode(flat, encoder_root, max_length)
    counts = [len(bag) for bag in bags]
    structural = np.repeat(structured_features(records), counts, axis=0)
    # 384 is MiniLM-L6-v2's hidden size, stated rather than read from a loaded torch model — reading it
    # from `encoder.config` was the last thing forcing the torch model to be constructed at inference.
    # `score.py` asserts the head is 413 wide, so a wrong value here fails loudly rather than silently.
    return np.concatenate([text_features, structural], axis=1), text_features.shape[1], len(FEATURE_NAMES)
