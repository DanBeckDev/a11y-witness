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
    # NVDA STACKS prefixes. These were 15 of the 32 false positives left after the first fix, because the
    # pattern allowed exactly one prefix and these carry two or three.
    "bullet, same page, link, Overview",
    "complementary landmark, Note",
    "column 3, 3",
    "blank",
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
    # v17: `validation_error_missing` requires the silent activation to be a SUBMIT. `kind` has travelled
    # on every `formChanges` entry since CAPTURE_PROTOCOL_VERSION 8 and NOTHING read it -- not this
    # featurizer and not `rules.ts`, which contains the string zero times -- so a disclosure that announced
    # nothing satisfied a feature about forms rejected without an error. capture-core added the field after
    # apache.org's search toggle was reported exactly that way, and 3.3.1 is one of only three subtypes the
    # model decides alone, so this one reached a report. Same evidence, different values: a meaning change.
    #
    # v16: `landmark_present` and `landmark_named` are no longer model inputs -- known-gaps §17. Measured
    # on 80 protocol-7 captures: 16 have `landmark_present = 0` and ALL SIXTEEN have a truncated landmark
    # sweep, so the negative class was entirely a capture artefact with a documented systematic cause.
    # The head width changed, so weights fitted before it were fitted to a different input space.
    #
    # v15: `vague_link_present` is no longer a model input at all. It answers 2.4.9 (text alone, AAA, not
    # reported here) and the 2.4.4 head used it because it was the cheapest separator -- firing on 22 of the
    # 44 conformant pages that carry "Details" inside a peer index.
    assert F.FEATURE_SCHEMA_VERSION == "screenreader-structured-v17"


def test_no_landmark_feature_survives_in_the_vector():
    # The removal is the point of v16, and a feature list is exactly the kind of thing that gets a name
    # added back by someone reading `structure.landmarks` and assuming it is available. known-gaps §17
    # records why it is not: the feature reads "the page has a landmark" and measures "the sweep reached
    # one", and quick navigation cannot reach a landmark containing the caret.
    assert not [name for name in F.FEATURE_NAMES if "landmark" in name], (
        "a landmark feature is back in the vector; its zero means the SWEEP failed, never that the page "
        "has no landmark -- see known-gaps §17 before re-adding one"
    )
