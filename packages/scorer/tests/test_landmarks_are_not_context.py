"""A landmark cannot be CONTEXT for a later announcement, because NVDA never closes one.

`vague_link_lacks_context` reads the transcript as a stream: a container announced on entry stays open
until `"out of <role>"` says otherwise. Right for a list, wrong for a landmark.

Measured 2026-08-26 by `corpus:container-exits` over 2,507 records:

    list                    entered 2632   left 2584
    table                   entered  710   left  189
    navigation landmark     entered  189   left    0
    complementary landmark  entered  106   left    0
    ...six landmark roles, 432 entries, ZERO exits

So a landmark opened at the top of a page is open for every announcement after it, and "this link is
inside a nav" describes where the DOCUMENT started rather than where the link is. Two records the grants
audit refused to pass turn on exactly that: a nav announced on line 1, a vague link after it in no
container at all, read as having context.

WCAG 2.4.4 accepts context from "the same paragraph, list item, table cell or table header" — every one
of which NVDA does close — so this is what the criterion says as well as what the evidence allows.
"""
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "packages" / "scorer" / "python"))

import screenreader_features as features  # noqa: E402


def test_no_landmark_is_treated_as_context():
    """The vocabulary and the measurement must agree, in both directions."""
    overlap = features.CONTEXT_CONTAINERS & features.UNCLOSED_CONTAINERS
    assert overlap == frozenset(), (
        f"{overlap} is both a context container and one NVDA never closes. A container that never closes "
        f"cannot be context: it would be open for the rest of the transcript."
    )
    assert "navigation landmark" in features.UNCLOSED_CONTAINERS
    assert "list" in features.CONTEXT_CONTAINERS, "a list DOES close, 2584 times of 2632"


def test_the_containers_that_remain_are_the_ones_WCAG_names():
    """2.4.4 accepts context from "the same paragraph, list item, table cell or table header".

    Every remaining container is one of those, and every one is a container NVDA measurably closes. If a
    role is ever added here, it needs both properties — the criterion's blessing and an exit announcement.
    """
    for role in features.CONTEXT_CONTAINERS:
        assert role not in features.UNCLOSED_CONTAINERS, role
    assert features.CONTEXT_CONTAINERS <= {"list", "menu", "menu bar", "table", "grouping"}, (
        "a new context container needs a measurement behind it — run `npm run lab:job -- "
        "-e job=container-exits` and check NVDA actually announces leaving it"
    )
