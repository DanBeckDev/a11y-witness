"""A live capture reaches the featurizer with its parse, or the sweep dies.

`raw_capture_record` builds the model's input for a capture arriving on stdin — a fifth copy of a contract
that had just been consolidated to one in TypeScript. It selected keys by name, so the `parsed` block the
caller attached was silently dropped, and every real-page score failed at the featurizer.

The failure was loud, which is the only reason it took minutes rather than a corpus. That is a property of
`parsed_units` refusing rather than falling back, not of the contract being safe.
"""

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

_spec = importlib.util.spec_from_file_location("scorer_score", ROOT / "python" / "score.py")
score = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(score)

CAPTURE = {
    "screenReader": "NVDA",
    "transcript": ["heading, level 1, Booking", "link, Check availability"],
    "structure": {"headings": ["Booking, heading, level 1"], "formFields": ["Departure date, edit"]},
    "interaction": {},
    "parsed": {"formFields": [{"containers": [], "leaving": [], "objects": [
        {"name": "Departure date", "role": "edit", "states": []}], "raw": "Departure date, edit"}]},
}


def test_the_parse_survives_record_construction() -> None:
    record = score.raw_capture_record(CAPTURE, "probe")
    assert record["input"].get("parsed"), "the caller's parse was dropped; the featurizer will refuse this"
    assert record["input"]["parsed"]["formFields"][0]["objects"][0]["name"] == "Departure date"


def test_an_unannotated_capture_stays_unannotated_rather_than_becoming_empty() -> None:
    # `parsed_units` must be able to tell "the caller did not annotate" from "this page has no form fields".
    # Defaulting to {} here would make those identical and turn a wiring bug into a silent wrong answer.
    bare = {k: v for k, v in CAPTURE.items() if k != "parsed"}
    record = score.raw_capture_record(bare, "probe")
    assert record["input"]["parsed"] is None
