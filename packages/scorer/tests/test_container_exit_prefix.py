"""A container EXIT is context, not a role on what follows.

NVDA announces `"out of table, Borrowing books"` when the cursor leaves a table and reads prose. That is a
boundary marker plus prose — not an announced control — and `ANNOUNCED_ROLE` matched it anyway, because
`table` is itself a role word. So `plain_heading_candidate` rejected the line and the fake heading on that
page produced no evidence.

Measured 2026-08-25 by `corpus:grants-audit` over 2,507 records: 13 of 108 records labelled
`1.3.1:fake-heading` carried no `plain_heading_candidate_present`. Every one is a multi-defect page, where
the accompanying markup is appended AFTER the host's table, list or form — so the fake heading always
follows a container exit. On single-defect pages it never does, which is why the held-out set showed 5 of
5 and looked exact.

FIFTH instance of one shape in this file's history: a heuristic written without accounting for how NVDA
prefixes a line. `link_name` anchored the role at `^` and missed 98% of links; `graphic_name` shared it;
`plain_heading_candidate` forgot roles exist at all; `beginsWithRole` stripped landmarks but not
containers. This one handles a ROLE prefix and not an EXIT prefix.
"""
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "packages" / "scorer" / "python"))

import screenreader_features as features  # noqa: E402

SENTENCE = "Members may borrow six books at a time."


def test_a_fake_heading_after_a_container_exit_is_found():
    """The measured failure, from a real corpus transcript."""
    assert features.plain_heading_candidate("out of table, Borrowing books", SENTENCE) is True
    assert features.plain_heading_candidate("out of list, Contact and opening hours", SENTENCE) is True
    assert features.plain_heading_candidate("out of form, Where to find us", SENTENCE) is True


def test_stripping_the_exit_does_not_admit_an_ANNOUNCED_CONTROL():
    """The guard the exit marker was hiding must still work once it is removed.

    `"out of list, link, Details"` is a container exit AND an announced link. Stripping the exit must
    reveal the role rather than turn a control into prose — otherwise this fix trades 13 missed positives
    for an unknown number of false ones.
    """
    for line in ["out of list, link, Details", "out of table, button, Show red items",
                 "out of form, edit, Full name", "link, Go"]:
        assert features.plain_heading_candidate(line, SENTENCE) is False, line


def test_a_table_cell_read_after_an_exit_is_not_a_heading():
    """The shape I expected to be the risk, and it is not one.

    `"out of table, row 1, column 1, Destination"` is position-only cell content. It stays excluded
    because `row` and `column` are role words in their own right — checked rather than assumed, because
    "my change is safe" is exactly the claim that needs evidence.
    """
    assert features.plain_heading_candidate(
        "out of table, row 1, column 1, Destination", SENTENCE) is False


def test_prose_with_no_prefix_is_unaffected():
    """The common case must not move: most fake headings follow nothing at all."""
    assert features.plain_heading_candidate("Borrowing books", SENTENCE) is True
    assert features.plain_heading_candidate("Members may borrow six books.", SENTENCE) is False


def test_the_exit_pattern_is_bounded_and_does_not_eat_a_whole_line():
    """`[^,]{1,48}` stops at the first comma, so it cannot swallow the content it is meant to expose.

    An unbounded strip would turn any line beginning `out of` into whatever followed its LAST comma,
    which on a long announcement is arbitrary.
    """
    long_name = "out of " + ("x" * 60) + ", Borrowing books"
    # No comma within 48 characters, so nothing is stripped and the line is judged as it stands.
    assert features.LEAVING_PREFIX.sub("", long_name) == long_name


def test_nested_containers_announce_one_exit_each_and_all_are_stripped():
    """NVDA emits one exit per container LEFT, and containers nest.

    The single-exit form of this pattern was correct for every case that existed when it was written, and
    that is exactly how this shape recurs: the remedy fits the instance rather than the rule. `^` anchors
    it, so `sub` strips exactly one however many follow — leaving `"out of form, Where to find us"`, which
    still matches `ANNOUNCED_ROLE` on `form` and is still rejected.

    Found 2026-08-27 by `corpus:grants-audit` on the corpus's first doubly-nested container, a `<fieldset>`
    inside a `<form>`: 57 of 58 `fake-heading` records carried `plain_heading_candidate_present` and that
    one did not.
    """
    assert features.plain_heading_candidate(
        "out of grouping, out of form, Where to find us", SENTENCE) is True
    # Any depth, not just two — the point of `+` over a second hand-written alternative.
    assert features.plain_heading_candidate(
        "out of list, out of grouping, out of form, Where to find us", SENTENCE) is True


def test_a_nested_exit_still_does_not_rescue_a_line_that_announces_a_role():
    """Stripping exits must not turn a real control into a fake heading.

    The strip only removes CONTEXT about where the cursor was; whatever is left is judged exactly as
    before. A nested exit followed by an announced control is still an announced control.
    """
    assert features.plain_heading_candidate(
        "out of grouping, out of form, Search, edit", SENTENCE) is False
