"""A disclosure that announced nothing is not a form rejected without an error.

`capture-core` attaches `kind` to every `formChanges` entry for this feature's benefit, and records what
its absence cost: *"3.3.1 is about a SUBMIT that was rejected silently; it was previously satisfied by any
non-empty formChanges, so opening a disclosure counted -- and apache.org's SEARCH toggle was reported as a
form submitted with invalid input and no error announced. Nothing was submitted and nothing was invalid."*

The field shipped in protocol 8 and NOTHING read it -- neither this featurizer nor `rules.ts`. So the
remedy reached the capture and neither consumer, which is this repo's most expensive recurring shape, and
`3.3.1:validation-error-silent` is one of only three subtypes the model decides ALONE, so the defect was
live in the path that ships.

Each case here is built to produce one verdict, and the pair is asserted to DIFFER: a test that cannot
tell the two apart would pass against the very behaviour it exists to refuse.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from screenreader_features import FEATURE_NAMES, structured_feature_values  # noqa: E402


# NO ERROR WORD in the post-submit text: this feature is "a field is still there and nothing was said",
# so a fixture whose re-read announces "invalid entry" satisfies `validation_error_announced` and
# suppresses the finding correctly. That mistake made three of these fail on their first run.
def record(changes, post_submit=("Email, edit",)):
    return {
        "input": {
            "transcript": ["Request a callback, document"],
            "structure": {"headings": [], "formFields": ["Email, edit"], "tableCells": []},
            "interaction": {
                "controls": ["Email, edit"],
                "stateChanges": [],
                "formChanges": list(changes),
                "postSubmitFields": list(post_submit),
            },
            "evidenceUnits": [{"channel": "transcript", "text": "Request a callback, document"}],
            "evidenceText": "Request a callback, document",
            # REQUIRED, never optional -- `parsed_units` refuses a capture without it rather than falling
            # back to regex, "the featurizer would keep producing numbers, and the numbers would be wrong
            # only on the pages nobody wrote".
            "parsed": {
                "transcript": [], "headings": [], "tableCells": [], "controls": [],
                "postSubmitFields": [], "formFields": [
                    {"containers": [], "leaving": [], "objects": [
                        {"name": "Email", "role": "edit", "states": []}]}],
            },
        }
    }


def missing(changes, **kw):
    return structured_feature_values(record(changes, **kw))["validation_error_missing"]


def test_a_silent_submit_is_the_finding():
    assert missing([{"control": "Send, button", "kind": "submit", "after": ""}]) == 1.0


def test_a_silent_disclosure_is_not():
    # The apache.org shape: a search toggle opened and said nothing. Nothing was submitted.
    assert missing([{"control": "Search, button", "kind": "disclosure", "after": ""}]) == 0.0


def test_the_two_are_distinguished_and_not_merely_both_quiet():
    # ANTI-VACUITY. If both read 0 the feature has gone deaf rather than become precise, which is the
    # failure mode CLAUDE.md names for any change that makes something quieter.
    submit = missing([{"control": "Send, button", "kind": "submit", "after": ""}])
    disclosure = missing([{"control": "Search, button", "kind": "disclosure", "after": ""}])
    assert submit != disclosure, "the feature cannot tell a submit from a disclosure"


def test_a_capture_predating_kind_still_counts_as_a_submit():
    # Absence read as a negative would make this feature deaf on every pre-protocol-8 capture -- the exact
    # defect this schema revision exists to correct, reintroduced by its own fix.
    assert missing([{"control": "Send, button", "after": ""}]) == 1.0


def test_a_submit_that_announced_an_error_is_not_the_finding():
    assert missing([{"control": "Send, button", "kind": "submit", "after": "Enter a valid email"}]) == 0.0
