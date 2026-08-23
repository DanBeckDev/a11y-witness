"""The eligibility guard must not refuse the tools whose job is to DECIDE eligibility.

This is the test for the most expensive class of defect found on 2026-08-23: a CIRCULAR DEADLOCK. The
trainer marks a fresh candidate `releaseEligible: false` with the blocker "held-out acceptance has not been
evaluated for these weights". `verify_artifact` then refused any model that was not releaseEligible. So the
gate that would qualify a candidate declined to run on an unqualified one, and no candidate could ever
pass.

It went unnoticed for months because the shipped model was made by hand, outside the pipeline — and it was
found by running a 4-hour capture and then discovering the evaluation could not start. These assertions
take milliseconds and need no weights, no corpus and no worker.

Run by `npm run test:python`, which is part of `npm test`.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCORER = REPO / "packages" / "scorer" / "python" / "score.py"


def load_scorer():
    spec = importlib.util.spec_from_file_location("screenreader_scorer", SCORER)
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(SCORER.parent))
    spec.loader.exec_module(module)
    return module


def fresh_candidate(directory: Path) -> argparse.Namespace:
    """A candidate exactly as the trainer leaves it: calibrated, and not yet accepted."""
    (directory / "model.safetensors").write_bytes(b"not really weights")
    (directory / "training-report.json").write_text(json.dumps({
        "criteria": {"3.3.2": {"subtypes": {"3.3.2:unnamed-form-field": {
            "head": "subtype_3_3_2_unnamed_form_field", "threshold": 0.8}}}},
        "representation": {"maxLength": 256},
        "releaseEligible": False,
        "releaseBlockedBy": ["held-out acceptance has not been evaluated for these weights"],
    }))
    return argparse.Namespace(
        model=directory, training_report=None, encoder=None, allow_ineligible=False)


class ReleaseGateContract(unittest.TestCase):
    def setUp(self) -> None:
        self.scorer = load_scorer()

    def test_evaluation_can_run_on_a_candidate_that_is_not_yet_eligible(self) -> None:
        """THE DEADLOCK. A caller that DECIDES eligibility must be able to load an ineligible model."""
        with tempfile.TemporaryDirectory() as tmp:
            args = fresh_candidate(Path(tmp))
            try:
                self.scorer.verify_artifact(args, None, require_release_eligible=False)
            except RuntimeError as error:
                self.assertNotIn("releaseEligible", str(error),
                                 "the eligibility guard fired on a caller that opted out of it — the gate "
                                 "that qualifies a candidate cannot require it to be already qualified")
            except Exception:
                pass  # weights are a stub, so loading them fails later; only the guard is under test

    def test_inference_still_REFUSES_an_ineligible_model(self) -> None:
        """The other half. Scoring somebody's page with unvetted weights is what the guard is for."""
        with tempfile.TemporaryDirectory() as tmp:
            args = fresh_candidate(Path(tmp))
            with self.assertRaises(RuntimeError) as caught:
                self.scorer.verify_artifact(args, None)  # default: eligibility required
            self.assertIn("releaseEligible", str(caught.exception))

    def test_the_evaluator_opts_out_at_its_call_site_not_by_a_flag(self) -> None:
        """A job that must always pass `--allow-ineligible` is a guard nobody has.

        Asserted on the SIGNATURE rather than by matching source text: the parameter must exist and default
        to requiring eligibility, so a caller has to opt out deliberately and visibly.
        """
        import inspect
        signature = inspect.signature(self.scorer.verify_artifact)
        parameter = signature.parameters.get("require_release_eligible")
        self.assertIsNotNone(parameter, "verify_artifact must let a caller declare it is EVALUATING")
        self.assertIs(parameter.default, True, "requiring eligibility must be the default")
        self.assertIs(parameter.kind, inspect.Parameter.KEYWORD_ONLY,
                      "keyword-only, so a call site reads as a declaration rather than a positional flag")


if __name__ == "__main__":
    unittest.main()
