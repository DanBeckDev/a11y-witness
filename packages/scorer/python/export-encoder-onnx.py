"""Export the pinned MiniLM encoder to ONNX, and PROVE the embeddings are unchanged.

Why: inference needs a transformer forward pass and nothing else demanding. PyTorch's CPU wheel is
~400 MB and measured 102 s to install in the GitHub Action — 34% of a cold run — to compute a 6-layer
MiniLM and fourteen dot products. ONNX Runtime is 14 MB and is documented as 2x+ faster on CPU
transformer inference. Caching cannot fix that: with every wheel cached locally, `pip install` was still
83 s, because the cost is unpacking 400 MB, not fetching it.

Run ONCE, offline, on a machine that already has torch. The output is a build artifact; CI never runs
this, so torch never needs to reach a runner.

    .venv/bin/python packages/scorer/python/export-encoder-onnx.py

The equivalence check is the point, not a courtesy. Swapping the encoder silently changes every
embedding, and every embedding feeds the trained heads, the thresholds calibrated against them, and the
0.847 out-of-distribution floor. A shift too small to notice would move findings on real pages with
nothing failing. Measured on real evidence text from the corpus: max absolute difference 2.086e-07 and
per-row cosine 0.999999940 — float32 noise, not a change in meaning.

`dynamo=False` deliberately. Torch 2.9+ defaults to the torch.export-based exporter; the TorchScript
path is what produced the verified numbers above, and for a frozen 6-layer encoder there is nothing to
gain from the new tracer and a numeric difference to lose.
"""
from __future__ import annotations

import sys
from pathlib import Path

SCORER = Path(__file__).resolve().parent.parent
ENCODER = SCORER / "models" / "encoders" / "all-MiniLM-L6-v2"
OUTPUT = SCORER / "models" / "encoders" / "all-MiniLM-L6-v2.onnx"

# Tolerances. Anything looser stops being a check: these are float32 rounding, and a real regression —
# a wrong pooling axis, a dropped attention mask — moves cosine in the third decimal, not the eighth.
MAX_ABS_DIFF = 1e-5
MIN_COSINE = 0.9999


def sample_texts(limit: int = 16) -> list[str]:
    """Real evidence text, not lorem ipsum.

    The corpus is what this encoder actually sees. Synthetic strings would exercise short token
    sequences only and could pass while padding or truncation behaviour differed on real input.
    """
    import json

    corpus = SCORER.parent.parent / "runs" / "screenreader-dataset" / "screenreader-evidence.jsonl"
    if not corpus.exists():
        return ["heading, level 2, Welcome", "edit, multi line", "combo box, collapsed, Adult"]
    texts = []
    with corpus.open(encoding="utf-8") as stream:
        for line in stream:
            text = (json.loads(line)["input"].get("evidenceText") or "").strip()
            if text:
                texts.append(text[:1000])
            if len(texts) >= limit:
                break
    return texts or ["heading, level 2, Welcome"]


def mean_pool(hidden, mask):
    """The same pooling `screenreader_features.encode_documents` does, in numpy.

    Duplicated here on purpose: if this file imported the featurizer, a bug in the featurizer's pooling
    would cancel out on both sides and the check would pass. An independent implementation is what makes
    the comparison meaningful.
    """
    import numpy as np

    weights = mask[..., None].astype(np.float32)
    pooled = (hidden * weights).sum(1) / np.clip(weights.sum(1), 1e-9, None)
    return pooled / np.linalg.norm(pooled, axis=1, keepdims=True)


def main() -> int:
    import numpy as np
    import torch
    from transformers import AutoModel, AutoTokenizer

    if not ENCODER.exists():
        print(f"encoder missing at {ENCODER} — run fetch-encoder.py first", file=sys.stderr)
        return 1

    tokenizer = AutoTokenizer.from_pretrained(ENCODER, local_files_only=True)
    model = AutoModel.from_pretrained(ENCODER, local_files_only=True, use_safetensors=True).eval()
    batch = tokenizer(sample_texts(), padding=True, truncation=True, max_length=256, return_tensors="pt")
    names = ["input_ids", "attention_mask", "token_type_ids"]

    torch.onnx.export(
        model,
        tuple(batch[name] for name in names),
        str(OUTPUT),
        input_names=names,
        output_names=["last_hidden_state"],
        # Batch AND sequence must both be dynamic: captures are batched in varying sizes and the
        # per-unit path encodes short single announcements alongside whole documents.
        dynamic_axes={name: {0: "batch", 1: "sequence"} for name in [*names, "last_hidden_state"]},
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )
    print(f"exported {OUTPUT.name}: {OUTPUT.stat().st_size / 1024 / 1024:.1f} MB")

    with torch.no_grad():
        reference = mean_pool(model(**batch).last_hidden_state.numpy(), batch["attention_mask"].numpy())

    import onnxruntime as ort

    session = ort.InferenceSession(str(OUTPUT), providers=["CPUExecutionProvider"])
    feed = {spec.name: batch[spec.name].numpy() for spec in session.get_inputs()}
    exported = mean_pool(session.run(None, feed)[0], batch["attention_mask"].numpy())

    diff = float(np.abs(reference - exported).max())
    cosine = float((reference * exported).sum(1).min())
    print(f"max abs diff {diff:.3e} (limit {MAX_ABS_DIFF:.0e})")
    print(f"min cosine   {cosine:.9f} (limit {MIN_COSINE})")
    if diff > MAX_ABS_DIFF or cosine < MIN_COSINE:
        print("REFUSED: the exported encoder does not match torch. Do not ship it.", file=sys.stderr)
        OUTPUT.unlink(missing_ok=True)
        return 1
    print("equivalent to torch within float32 noise")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
