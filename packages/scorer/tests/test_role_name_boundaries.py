"""A name ends at the next object's role.

Every announcement here is VERBATIM from a real capture in `runs/real-page-corpus` — the GOV.UK Design
System component pages, which a publisher declares conformant. They are fixtures rather than invented
strings because the fault this guards was invisible on corpus pages: those announce one object per line,
so a greedy `(.*)$` tail happens to be exactly the name there and is a run-on only on real pages.

The cost of not having this: `link_name` returned "accessibility statement, link, sitemap, link, cookies"
as ONE link's accessible name, and the 2.4.4 head — which keys on link text looking unlike a purpose —
fired on 11 of 18 conformant real pages.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

import pytest

from screenreader_features import ANNOUNCED_ROLE, graphic_name, link_name


@pytest.mark.parametrize(
    "announcement,expected",
    [
        # Several links in one announcement. The name is the FIRST one, not all three.
        ("link, Accessibility statement, link, Sitemap, link, Cookies, link, Contact", "accessibility statement"),
        # Roles STACK as prefixes of one object: a link whose content is a graphic. Stopping at the first
        # role token would report this link as unnamed, inventing a 4.1.2 failure.
        ("banner landmark, link, graphic, GOV dot UK", "gov dot uk"),
        # A leading prefix run, which is why the pattern searches rather than anchors.
        ("out of region, same page, link, Skip to main content", "skip to main content"),
        ("Menu, navigation landmark, list, with 6 items, link, Get started", "get started"),
        ("out of list, Breadcrumb, navigation landmark, list, with 2 items, link, Home", "home"),
        # Trailing prose belonging to the link's own context stays; the SECOND link does not.
        (
            "link, propose a change on Git Hub, – read more about, link, how to contribute",
            "propose a change on git hub, – read more about",
        ),
        ("link, Details", "details"),
    ],
)
def test_link_name_stops_at_the_next_role(announcement: str, expected: str) -> None:
    assert link_name(announcement) == expected


def test_graphic_name_shares_the_boundary() -> None:
    assert graphic_name("graphic, Crest, link, Home") == "crest"


def test_a_stacked_prefix_is_not_mistaken_for_an_absent_name() -> None:
    """The regression this guards is silent: an empty name reads as a real unnamed-control finding."""
    assert link_name("link, graphic, GOV dot UK") != ""


@pytest.mark.parametrize(
    "announcement",
    [
        "link, Details",
        "banner landmark, link, graphic, GOV dot UK",
        "out of table, same page, link, Details",
        "combo box, collapsed, QUICKMENU",
    ],
)
def test_announced_role_still_recognises_a_control(announcement: str) -> None:
    """ROLE_WORDS is now shared with ROLE_NAME; this pins that the sharing did not move this boundary."""
    assert ANNOUNCED_ROLE.match(announcement)


def test_announced_role_still_rejects_prose_ending_in_a_role_word() -> None:
    assert not ANNOUNCED_ROLE.match("The archive is a table")
