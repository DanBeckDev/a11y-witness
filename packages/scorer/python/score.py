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


def verify_artifact(
    args: argparse.Namespace,
    training: Any,
    *,
    require_release_eligible: bool = True,
) -> tuple[dict[str, Any], Any, dict[str, Any]]:
    """Load and check a scorer artifact.

    `require_release_eligible` exists because THREE callers need opposite things from the same guard, and
    treating them alike produced a circular deadlock that made a candidate impossible to evaluate:

      - INFERENCE must refuse an ineligible model. Scoring somebody's page with unvetted weights is the
        error this whole guard is for, and it stays the default.
      - THE ACCEPTANCE EVALUATOR must accept one. It exists to produce the evidence that DECIDES
        eligibility, and the trainer marks every fresh candidate ineligible precisely because acceptance
        has not run yet. So the gate that would qualify a candidate refused to run on an unqualified one,
        and no candidate could ever pass. Measured 2026-08-23 on the first candidate anyone evaluated
        through the lab interface; the shipped model predates it and was made by hand.
      - THE HARDENING CHECK is the same case: examining a candidate is not shipping it.

    Declared by the CALLER at the call site rather than passed as a flag at the command line. A job that
    must always pass `--allow-ineligible` is a guard nobody has — the same reasoning that kept `train` from
    always passing `--allow-overwrite`.
    """
    # numpy, not torch: safetensors ships a numpy loader, and inference has nothing to differentiate. The
    # frozen encoder now runs under ONNX Runtime, so dropping this import is what actually removes a 400 MB
    # torch wheel from the GitHub Action rather than merely making it smaller.
    import numpy as np
    from safetensors import safe_open
    from safetensors.numpy import load_file

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
    ineligible = report.get("releaseEligible") is not True
    if require_release_eligible and ineligible and not getattr(args, "allow_ineligible", False):
        raise RuntimeError("scorer report is not releaseEligible, so it must not score a real page. "
                           "If you are EVALUATING this candidate rather than using it, the caller should "
                           "pass require_release_eligible=False; --allow-ineligible is the escape hatch "
                           "for inference only.")

    encoder_file = feature_pipeline.assert_encoder(args.encoder)
    actual_encoder_hash = feature_pipeline.sha256(encoder_file)
    expected_encoder_hash = report.get("encoder", {}).get("modelSha256")
    if actual_encoder_hash != expected_encoder_hash:
        raise RuntimeError("encoder SHA-256 does not match the training report")

    # `framework="np"`, not "pt". This reads METADATA and key names only — no tensor is materialised — but
    # "pt" makes safetensors import torch anyway, which was the last thing forcing a 400 MB wheel into the
    # Action after the encoder moved to ONNX. Caught by running the scorer with torch made unimportable;
    # every other check passed happily with it still installed.
    with safe_open(str(model_file), framework="np") as handle:
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
        # Thresholds are per SUBTYPE. A criterion-level threshold was a single cut applied to a maximum
        # over heads on different scales; refusing a report that still carries one is deliberate, because
        # silently ignoring it would let old weights score under new aggregation and nothing would say so.
        if "threshold" in criterion_report:
            raise RuntimeError(
                f"{criterion}: report carries a criterion-level threshold. These weights predate "
                "per-subtype calibration and must be retrained before they can be scored."
            )
        if not criterion_report.get("subtypes"):
            raise RuntimeError(f"criterion {criterion} has no scorer heads")
        for subtype, subtype_report in criterion_report.get("subtypes", {}).items():
            head = subtype_report.get("head")
            if not isinstance(head, str) or not head:
                raise RuntimeError(f"missing head name for {subtype}")
            try:
                subtype_threshold = float(subtype_report["threshold"])
            except (KeyError, TypeError, ValueError) as error:
                raise RuntimeError(f"invalid threshold for {subtype}") from error
            if not 0.0 <= subtype_threshold <= 1.0:
                raise RuntimeError(f"threshold for {subtype} is outside [0, 1]")
            if head in head_dimensions:
                raise RuntimeError(f"scorer head {head} is referenced more than once")
            weight_key = head + ".weight"
            bias_key = head + ".bias"
            expected_keys.update({weight_key, bias_key})
            if weight_key not in keys or bias_key not in keys:
                raise RuntimeError(f"missing head weights for {subtype}")
            head_dimensions[head] = (1, embedding_size + len(expected_features))
    # The out-of-distribution reference is an expected tensor, NAMED here rather than the check being
    # loosened: this guard exists so an artifact cannot smuggle in weights nobody verified, and the way
    # to add a tensor is to declare it. Only when the report says it should be there.
    reference_key = (report.get("outOfDistribution") or {}).get("reference")
    if reference_key:
        expected_keys.add(reference_key)
        if reference_key not in keys:
            raise RuntimeError(
                f"report declares an out-of-distribution reference '{reference_key}' that the weights "
                "do not contain, so novelty could not be measured and every page would read as in-support"
            )
    unexpected = sorted(keys - expected_keys)
    if unexpected:
        raise RuntimeError("scorer artifact contains unexpected tensors: " + ", ".join(unexpected))
    weights = load_file(str(model_file))
    for head, (rows, columns) in head_dimensions.items():
        weight = weights[head + ".weight"]
        bias = weights[head + ".bias"]
        if tuple(weight.shape) != (rows, columns) or tuple(bias.shape) != (rows,):
            raise RuntimeError(f"head dimension mismatch for {head}")
        if not np.isfinite(weight).all() or not np.isfinite(bias).all():
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


def out_of_distribution_scores(records, report, weights, args, max_length):
    """For each record, its similarity to the nearest training embedding, and whether that is in support.

    k-nearest-neighbour distance in feature space (Sun et al., ICML 2022): non-parametric, no
    distributional assumption, and stronger than the Mahalanobis alternative. The reference sample and
    the floor are both shipped by the trainer, so this makes no judgement of its own.

    Why it exists: every training record sits at cosine 0.847-0.99 from its nearest neighbour, while 28
    of 32 real eval pages sit at 0.50-0.84 — outside the support. A linear head on a frozen embedding
    cannot tell it is extrapolating, and returned 0.97 and 0.99 on two CONFORMANT W3C pages. For an
    accessibility tool a false positive is an accusation, so it must be able to decline.

    Absent reference (an older artifact) reports `inSupport: None` rather than True. Unknown must not
    read as safe.
    """
    import numpy as np

    settings = report.get("outOfDistribution") or {}
    reference = weights.get(settings.get("reference", "ood_reference"))
    floor = settings.get("inDistributionFloor")
    if reference is None or floor is None:
        return [{"nearestTrainingCosine": None, "inSupport": None,
                 "reason": "this artifact ships no out-of-distribution reference"} for _ in records]
    embedded, _ = feature_pipeline.encode_documents(records, args.encoder, max_length)
    vectors = embedded[:, : reference.shape[1]]
    nearest = (vectors @ reference.T).max(axis=1)
    return [
        {
            "nearestTrainingCosine": round(float(value), 4),
            "inSupport": bool(float(value) >= float(floor)),
            "floor": float(floor),
        }
        for value in nearest
    ]


def score_records(records: list[dict[str, Any]], report: dict[str, Any], weights: Any, training: Any, args: argparse.Namespace) -> dict[str, Any]:
    import numpy as np

    max_length = int(report["representation"]["maxLength"])
    features, _, _ = feature_pipeline.encode_records(records, args.encoder, max_length)
    # Features are per evidence unit now, so a head is applied to every instance and the bag takes the
    # MAX -- the same aggregation the trainer uses inside its loss. `bag_offsets` is derived from the
    # records here exactly as it is there, rather than read from the artifact, so the two cannot drift.
    #
    # Scored once per head for the whole batch rather than per record inside the loop below: the old
    # shape sliced one row per record, which no longer identifies a bag.
    offsets = feature_pipeline.bag_offsets(records)
    novelty = out_of_distribution_scores(records, report, weights, args, max_length)
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
        subtype_predictions: dict[str, bool] = {}
        subtype_scores_out: dict[str, float] = {}
        for criterion, criterion_report in criteria.items():
            # Each subtype is decided on its OWN threshold, and the criterion is the OR of those
            # decisions. It used to be max-over-heads against one criterion threshold, which cannot be
            # calibrated: the heads are on different scales, so the highest-scoring subtype set the cut
            # for all of them and 4.1.2 fell back to an uncalibrated 0.5.
            decided = False
            highest = 0.0
            for subtype, subtype_report in criterion_report["subtypes"].items():
                value = float(head_scores[subtype_report["head"]][index])
                predicted = value >= float(subtype_report["threshold"])
                subtype_scores_out[subtype] = value
                subtype_predictions[subtype] = predicted
                decided = decided or predicted
                highest = max(highest, value)
            # Reported so a finding can still be ranked, but it is no longer what decides anything.
            scores[criterion] = highest
            predictions[criterion] = decided
        provenance = record.get("provenance", {})
        scored.append({
            "caseId": provenance.get("caseId"),
            "family": provenance.get("family"),
            "variant": provenance.get("variant"),
            "scores": scores,
            "predictions": predictions,
            # How far this page sits from anything the scorer was trained on, and whether that is
            # outside the training set's own support. `unchecked` is NOT `clean`: it means we declined.
            "novelty": novelty[index],
            # Which criteria a deterministic rule decides. Carried across because the judge appends the
            # rule layer's findings AFTER the model's and had no way to know the two overlap: on a
            # conformant page the rule correctly found nothing and the model's prediction survived as a
            # false positive. The report has always known this; nothing passed it on.
            "subtypeScores": subtype_scores_out,
            "subtypePredictions": subtype_predictions,
            # Which SUBTYPES a deterministic rule decides. This was per criterion, which suppressed the
            # model on every subtype of 1.1.1 and 4.1.2 -- including the 174 records `rules:score` shows
            # the rules never look at, leaving them decided by neither layer.
            #
            # Read straight off `decisionOwner`, which the TRAINER computes from one condition: the rules
            # own a subtype here only when their finding SUBSTITUTES for the head's, meaning they report
            # it under the head's own criterion. `3.3.2:unnamed-form-field` is decided by the rules and
            # reported as 4.1.2, so it is NOT owned here -- suppressing it would silence the model's
            # 3.3.2 while nothing supplies one, a criterion decided by neither layer.
            #
            # That test deliberately does NOT get re-derived here from `ruleReportsAs`. It was, briefly,
            # and that is a second encoding of the same rule in a second language -- the exact defect
            # `rule-ownership.json` exists to remove. One place decides; this reads the decision.
            "ruleOwned": sorted(
                subtype
                for r in criteria.values()
                for subtype, sr in (r.get("subtypes") or {}).items()
                if sr.get("decisionOwner", "learned-screenreader-scorer") != "learned-screenreader-scorer"
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
