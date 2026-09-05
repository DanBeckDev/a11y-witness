"""FEATURIZED_INTERACTION_CHANNELS is a hand-written tuple sitting three lines above the four
`interaction.get("...")` reads it documents, and proximity is not a guard.

It was added beside `structured_feature_values` specifically to end a duplicate: `scorer:explain-feature`
used to carry its own copy of "the" interaction channels, which went stale the moment a channel the rule
layer reads (but the featurizer does not) was added to the union it was copied from. Naming the four
channels once, next to the reads, was the fix -- but "next to" is a comment's promise, not a compiler's.
Add a fifth `interaction.get(...)` to `structured_feature_values` and this tuple goes silently stale one
function away, which is the exact bug just fixed, one level down, inside the fix for it. This repo's own
rule: a rule that asks a human to remember something is a rule that gets broken.

So: read `structured_feature_values`'s own body -- via `inspect.getsource`, bounded to that ONE function,
not a file-wide scrape that would also catch `interaction.get(...)` calls elsewhere in the module -- and
assert the set of keys it reads off `interaction` equals `FEATURIZED_INTERACTION_CHANNELS`, in both
directions.
"""
from __future__ import annotations

import inspect
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

import screenreader_features as features  # noqa: E402

INTERACTION_GET = re.compile(r'interaction\.get\("([^"]+)"\)')


def channels_read_in_body(body: str) -> list[str]:
    return INTERACTION_GET.findall(body)


def test_the_tuple_names_exactly_what_the_function_reads():
    body = inspect.getsource(features.structured_feature_values)
    # ANTI-VACUITY. A renamed function, or one that stopped reading `interaction` this way, must fail here
    # rather than pass having examined an empty extraction.
    assert "def structured_feature_values" in body, \
        "inspect.getsource did not return the function's own body -- this test examines nothing"
    read = channels_read_in_body(body)
    assert len(read) >= 4, \
        f"only {len(read)} interaction.get(...) read(s) found in structured_feature_values's body -- " \
        "either the function no longer reads `interaction` this way, or the extraction regex no longer " \
        "matches its real shape; either way this test is not examining what it claims to"

    declared = set(features.FEATURIZED_INTERACTION_CHANNELS)
    actually_read = set(read)

    undeclared = sorted(actually_read - declared)
    assert undeclared == [], \
        f"structured_feature_values reads {undeclared} off `interaction` and FEATURIZED_INTERACTION_" \
        "CHANNELS does not list it -- scorer:explain-feature will silently not print this channel for " \
        "any record that lacks it, which is the bug this tuple exists to prevent"

    unread = sorted(declared - actually_read)
    assert unread == [], \
        f"FEATURIZED_INTERACTION_CHANNELS declares {unread} but structured_feature_values no longer reads " \
        "it -- the declaration is now a phantom, contributing nothing, and should be removed or the read " \
        "restored"
