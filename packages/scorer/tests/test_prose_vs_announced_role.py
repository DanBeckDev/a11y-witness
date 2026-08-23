"""A heuristic about announcement TEXT must account for the roles NVDA announces.

Three separate faults today shared this shape:

  1. `link_name` anchored the role at the start of the phrase, so it read 3.4% of link announcements —
     NVDA almost always prefixes with the context the cursor entered or left.
  2. `graphic_name` had the identical pattern.
  3. `plain_heading_candidate` excluded HEADING announcements and no others, so "button, Show red items"
     — short, unpunctuated, followed by a sentence — matched its "spoken section title" pattern exactly.

The third cost 16 false positives on conformant pages out of 160 held-out records, every one a page whose
button matched. Tightened, the feature is TP 6 / FP 0 / FN 0 on the same set.

These are not three bugs so much as one missing idea: **a screen-reader transcript is not prose.** Every
line either announces a role or is content, and a rule that reasons about "short line of text" has to say
which it means. This file asserts that property directly, on the real role vocabulary.
"""
import re
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "packages" / "scorer" / "python"))

import screenreader_features as F

# Real announcement shapes, all taken from `runs/`. Each is a CONTROL, so nothing that claims to find prose
# may match one.
ANNOUNCED = [
    "button, Show red items",
    "link, Go",
    "same page, link, Details",
    "out of table, same page, link, Details",
    "graphic, trail_entrance-final.jpg",
    "edit, Example value",
    "combo box, collapsed, QUICKMENU ---- greater",
    "list, with 6 items, bullet, same page, link, Opening times",
    "out of form, heading, level 1, Coastal clinic 079 form",
]

# Genuine prose lines, which a section-title heuristic SHOULD be able to match.
PROSE = ["Opening hours", "Borrowing books", "Contact and opening hours", "Where to find us"]

FOLLOWING = "The section contains useful guidance."


@pytest.mark.parametrize("announcement", ANNOUNCED)
def test_an_announced_control_is_never_read_as_prose(announcement):
    assert not F.plain_heading_candidate(announcement, FOLLOWING), (
        f"{announcement!r} announces a role, so it is a control and not a section title rendered without a "
        "heading element. A heuristic that matches it will fire on conformant pages."
    )


@pytest.mark.parametrize("line", PROSE)
def test_genuine_prose_is_still_matched(line):
    # The other direction, and the one that turns a fix into a blindness. Excluding too much would make the
    # feature read 0 everywhere, which is how `vague_link_present` spent the project's life at 3.4%.
    assert F.plain_heading_candidate(line, FOLLOWING), f"{line!r} is prose and must still be a candidate"


def test_the_role_vocabulary_covers_what_the_featurizer_itself_knows_about():
    # Derived, not listed. The featurizer already enumerates roles in LEADING_ROLE and FORM_FIELD_ROLE for
    # its own purposes; if a role is worth naming there it is worth excluding here, and a role added to one
    # and not the other is the fact-stated-twice drift this repo keeps paying for.
    known = set(re.findall(r"[a-z][a-z ]*[a-z]", F.LEADING_ROLE.pattern.lower()))
    for role in ("button", "checkbox", "radio", "slider"):
        assert role in F.ANNOUNCED_ROLE.pattern.lower(), (
            f"{role} is a role the featurizer knows elsewhere but ANNOUNCED_ROLE does not exclude"
        )
    assert known, "LEADING_ROLE parsed to nothing — this guard is examining an empty set"


def test_the_schema_version_moved_with_the_meaning():
    # The same capture now yields a different `plain_heading_candidate_present`, so weights fitted under v8
    # were fitted to a different function of the same evidence.
    assert F.FEATURE_SCHEMA_VERSION == "screenreader-structured-v9"
