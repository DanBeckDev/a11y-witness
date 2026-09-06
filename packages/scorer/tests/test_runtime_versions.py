"""The report must record the inference-runtime versions it was scored under.

`action.yml` pins onnxruntime, transformers, safetensors and numpy behind a cache key that used to name
only the four package NAMES, with no version anywhere in it and a comment claiming a protection ("a stale
cache cannot serve a different runtime than the one asked for") that no pinned set backed up -- the
`browserVersion` memo defect, in the one artifact strangers actually run. Before pinning those four
versions, they had to be OBSERVABLE at all: nothing recorded them anywhere, so a disputed finding could be
traced to the weights (`training-report.json`, safetensors metadata) but never to the runtime that produced
the scores from them.

Run by `npm run test:python`, which is part of `npm test`.
"""
from __future__ import annotations

import argparse
import importlib.metadata
import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[3]
SCORER = REPO / "packages" / "scorer" / "python" / "score.py"


def load_scorer():
    spec = importlib.util.spec_from_file_location("screenreader_scorer", SCORER)
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(SCORER.parent))
    spec.loader.exec_module(module)
    return module


class RuntimeVersionsAreObservable(unittest.TestCase):
    def setUp(self) -> None:
        self.scorer = load_scorer()

    def test_covers_exactly_the_four_packages_action_yml_pins(self) -> None:
        """Derived from the same list as the cache key, not restated -- see `RUNTIME_PACKAGES`."""
        self.assertEqual(
            sorted(self.scorer.RUNTIME_PACKAGES),
            ["numpy", "onnxruntime", "safetensors", "transformers"])
        versions = self.scorer._runtime_versions()
        self.assertEqual(set(versions), set(self.scorer.RUNTIME_PACKAGES))

    def test_reports_the_REAL_installed_version_independently_confirmed(self) -> None:
        """Not just non-null: the exact string a second, independent call to `importlib.metadata` gets."""
        versions = self.scorer._runtime_versions()
        for name in self.scorer.RUNTIME_PACKAGES:
            self.assertEqual(versions[name], importlib.metadata.version(name),
                              f"{name}'s reported version does not match what is actually installed")

    def test_an_absent_package_reports_None_rather_than_crashing(self) -> None:
        """`_torch_encode`'s fallback runs with no ONNX file in the encoder directory, so onnxruntime and
        transformers may genuinely be uninstalled -- the scorer must still report honestly, not throw."""
        real_version = importlib.metadata.version

        def missing_onnxruntime(name: str) -> str:
            if name == "onnxruntime":
                raise importlib.metadata.PackageNotFoundError(name)
            return real_version(name)

        with mock.patch("importlib.metadata.version", side_effect=missing_onnxruntime):
            versions = self.scorer._runtime_versions()
        self.assertIsNone(versions["onnxruntime"])
        self.assertIsNotNone(versions["numpy"], "a different package's absence must not affect this one")

    def test_the_report_main_emits_actually_carries_the_block(self) -> None:
        """Not just that the FUNCTION exists -- that `main()`'s own JSON includes it, which is what a
        consumer of `score.py --stdin`'s output (`local-judge.ts`'s `scoreCapture`) actually reads."""
        fake_report = {"representation": {"maxLength": 8}, "criteria": {}}
        with mock.patch.object(self.scorer, "parse_args",
                                return_value=argparse.Namespace(shadow=False, out=None,
                                                                 encoder=None, model=None,
                                                                 training_report=None,
                                                                 allow_ineligible=False, evaluating=False)), \
             mock.patch.object(self.scorer, "read_sources", return_value=[{"screenReader": "NVDA"}]), \
             mock.patch.object(self.scorer, "verify_artifact",
                                return_value=(fake_report, object(), {"schema": "test"})), \
             mock.patch.object(self.scorer, "score_records",
                                return_value={"records": [], "predictedPositiveCounts": {}}):
            with _capture_stdout() as out:
                self.scorer.main()
        result = json.loads(out.getvalue())
        self.assertIn("runtime", result, "main()'s emitted JSON has no runtime block")
        self.assertEqual(set(result["runtime"]), set(self.scorer.RUNTIME_PACKAGES))


class _capture_stdout:
    """Minimal stdout capture, so this file needs no pytest fixture and runs under bare `unittest` too --
    matching `test_release_gate_contract.py`'s own `unittest.TestCase` style in this directory."""

    def __enter__(self):
        import io
        self._original = sys.stdout
        self._buffer = io.StringIO()
        sys.stdout = self._buffer
        return self._buffer

    def __exit__(self, *exc_info) -> None:
        sys.stdout = self._original


if __name__ == "__main__":
    unittest.main()
