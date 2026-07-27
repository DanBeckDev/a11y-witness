#!/usr/bin/env python3
"""Fetch the allowlisted screen-reader encoder without unsafe weight formats."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


REPO_ID = "sentence-transformers/all-MiniLM-L6-v2"
REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
EXPECTED_MODEL_SHA256 = "53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db"
SAFE_FILES = [
    "1_Pooling/config.json",
    "config.json",
    "config_sentence_transformers.json",
    "modules.json",
    "sentence_bert_config.json",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.txt",
    "model.safetensors",
]
UNSAFE_SUFFIXES = {".bin", ".ckpt", ".h5", ".msgpack", ".ot", ".pickle", ".pkl", ".pt", ".pth"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def assert_safe_files(root: Path) -> None:
    unsafe = sorted(
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file() and (path.is_symlink() or path.suffix.lower() in UNSAFE_SUFFIXES)
    )
    if unsafe:
        raise RuntimeError("unsafe model files downloaded: " + ", ".join(unsafe))
    model_file = root / "model.safetensors"
    if not model_file.is_file():
        raise RuntimeError("download did not contain model.safetensors")
    actual = sha256(model_file)
    if actual != EXPECTED_MODEL_SHA256:
        raise RuntimeError("model.safetensors SHA-256 mismatch: expected " + EXPECTED_MODEL_SHA256 + ", got " + actual)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("models/encoders/all-MiniLM-L6-v2"))
    args = parser.parse_args()
    from huggingface_hub import snapshot_download

    args.output.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=REPO_ID,
        revision=REVISION,
        local_dir=args.output,
        allow_patterns=SAFE_FILES,
        ignore_patterns=["*.bin", "*.ckpt", "*.h5", "*.msgpack", "*.ot", "*.pickle", "*.pkl", "*.pt", "*.pth"],
    )
    assert_safe_files(args.output)
    manifest = {
        "schema": "a11y-witness/local-encoder",
        "repository": REPO_ID,
        "revision": REVISION,
        "license": "Apache-2.0",
        "modelFile": "model.safetensors",
        "modelSha256": sha256(args.output / "model.safetensors"),
        "files": sorted(path.relative_to(args.output).as_posix() for path in args.output.rglob("*") if path.is_file()),
    }
    (args.output / "model-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
