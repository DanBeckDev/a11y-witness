"""`heading_name` must return the heading's OWN text, with no container context left in it.

The knowledge "what a container prefix looks like" exists in TWO languages and cannot be deleted from
either: the worker strips it in `capture-pure.mjs` (Node, on Windows) and the featurizer strips it here
(Python, in the lab). CLAUDE.md's remedy for a fact stated twice, when neither copy can go, is to pin them
with a test — the precedent is `name-normalisation.test.ts`, which asserts `namesOf` and `comparableNames`
reduce real announcements identically.

This asserts the PROPERTY rather than pinning the two regexes to each other. Two patterns held equal are a
THIRD copy of the same fact; "no container context survives in a heading's name" is what actually matters,
it is checkable against real captures, and it stays true if either side is rewritten.

What it caught when written: `LANDMARK_PREFIX` matched only "<role> landmark, " and so covered exactly the
example in its own comment. A NAMED region carries its name before the role and has no "landmark" word at
all, so "Home energy, region, Home energy, heading, level 2" yielded "home energy, region, home energy" —
115 of 9,789 corpus heading announcements. That is the failure the comment above it describes as having
cost 2.4.6 half its feature coverage, recurring at a shape the fix did not reach.
"""
import json
import pathlib
import re
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "packages/scorer/python"))

from screenreader_features import heading_name  # noqa: E402

# A container ROLE surviving into a name. Word-bounded: a heading legitimately named "Regional plans"
# must not trip this, and one named "Supplier form" is a real corpus h1 — `form` is deliberately absent
# from this list because sweep order is name-first, so a trailing role word there IS the name.
CONTAINER_ROLE = re.compile(
    r"\b(landmark|region|banner|navigation|complementary|content ?info|article)\b", re.IGNORECASE)


def heading_announcements() -> list[str]:
    """Every heading NVDA announced, across every capture on disk."""
    captures = ROOT / "runs"
    if not captures.exists():
        return []
    out: list[str] = []
    for path in captures.rglob("captures/**/*.json"):
        try:
            capture = json.loads(path.read_text())
        except (ValueError, OSError):
            continue
        headings = (capture.get("structure") or {}).get("headings") or []
        out.extend(h for h in headings if isinstance(h, str))
    return out


def test_no_container_context_survives_in_a_heading_name():
    announcements = heading_announcements()
    if not announcements:
        pytest.skip("no corpus on disk (runs/ is gitignored; local-only gate)")

    # ANTI-VACUITY, in the shape this repo requires: without it the test passes in perfect silence if the
    # channel is ever renamed or emptied — which is exactly the regression it exists to catch.
    assert len(announcements) >= 1000, (
        f"only {len(announcements)} heading announcements found; the corpus or the channel name has "
        "changed, so nothing below is being tested")

    contaminated = sorted({a for a in announcements if CONTAINER_ROLE.search(heading_name(a))})
    assert contaminated[:5] == [], (
        f"{len(contaminated)} announcement(s) leave container context in the heading's name, so every "
        f"exact-match lookup against it fails: {contaminated[:5]}")


def test_a_heading_whose_own_name_ends_in_a_role_word_is_not_stripped():
    # "Supplier form, heading, level 1" is a real corpus h1 and its accessible name IS "Supplier form" —
    # confirmed against that capture's structureCensus. Sweep order is name-first, so a trailing role word
    # belongs to the name. Over-stripping here would turn a named heading into an unnamed one, which is
    # the CLAUDE.md case "a container role used as a NAME" arriving from the other direction.
    assert heading_name("Supplier form, heading, level 1") == "supplier form"


def test_a_named_region_prefix_is_stripped():
    # The 115-announcement case. NVDA announces the region's name, the role, then the element.
    assert heading_name("Home energy, region, Home energy, heading, level 2") == "home energy"


def test_nested_containers_are_all_stripped():
    # NVDA announces every container it entered, so one pass leaves the inner one behind.
    assert heading_name("main landmark, navigation landmark, Home, heading, level 2") == "home"
