"""2.4.4 is Link Purpose IN CONTEXT, and the feature must ask that question.

`vague_link_present` asks whether the link TEXT ALONE is vague. That is 2.4.9 — a AAA criterion this project
does not report — and it cannot separate the two senses of the same word. Measured consequence: the scorer
accused 11 GOV.UK Design System pages of 2.4.4 on `"link, Details"`, where Details is a component they
document; and after the corpus was taught that the word can be conformant, it stopped flagging a genuinely
vague `<a href="#note">Details</a>` on a held-out acceptance page.

Both are the same missing distinction, in opposite directions. The announcements below are verbatim from
real captures.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
import screenreader_features as features  # noqa: E402


def record_with(*announcements: str) -> dict:
    """A record carrying the parse Node attaches, in the shape `annotateCapture` produces."""
    def parse(text: str) -> dict:
        parts = [p.strip() for p in text.split(",")]
        containers, objects, containers_left = [], [], []
        index = 0
        while index < len(parts):
            token = parts[index].lower()
            nxt = parts[index + 1].lower() if index + 1 < len(parts) else ""
            if token in features.CONTEXT_CONTAINERS:
                containers.append({"name": "", "role": token})
            elif nxt in features.CONTEXT_CONTAINERS:
                containers.append({"name": parts[index], "role": nxt})
                index += 1
            elif token.startswith("out of"):
                containers_left.append(token[len("out of"):].strip())
            elif token == "link" and index + 1 < len(parts):
                objects.append({"name": parts[index + 1], "role": "link", "states": []})
                index += 1
            index += 1
        return {"containers": containers, "objects": objects, "leaving": containers_left, "raw": text}
    return {"input": {"parsed": {"transcript": [parse(a) for a in announcements]}}}


@pytest.mark.parametrize("announcement", [
    "link, Details",          # the held-out acceptance case: a lone link after prose
    "link, Click here",
    "link, More",
])
def test_a_vague_link_with_no_container_LACKS_context(announcement: str) -> None:
    assert features.vague_link_lacks_context(record_with(announcement)) is True


@pytest.mark.parametrize("announcement", [
    "list, with 4 items, link, Details",                            # a peer index
    "Menu, navigation landmark, list, with 6 items, link, Details",  # GOV.UK's own navigation
])
def test_a_vague_link_inside_a_peer_index_HAS_context(announcement: str) -> None:
    # W3C's definition of programmatically determined link context names the LIST ITEM. A link that is one
    # of a homogeneous set is disambiguated by its neighbours, which is why GOV.UK publishes these pages as
    # conformant and why accusing them was wrong.
    assert features.vague_link_lacks_context(record_with(announcement)) is False


def test_a_descriptive_link_with_no_container_is_not_vague() -> None:
    assert features.vague_link_lacks_context(record_with("link, Read the flood guidance")) is False


def test_one_contextless_vague_link_is_enough() -> None:
    # A presence claim: the page need not be uniformly bad. Requiring all of them would make a single
    # well-placed index excuse every lone "click here" on the page.
    #
    # The exit marker is REQUIRED in this fixture and its absence is why an earlier version of this test
    # failed. Without "out of list" the stream is still inside the list, and treating it as closed would be
    # inventing a boundary NVDA did not announce.
    page = record_with("list, with 4 items, link, Details", "out of list", "link, Click here")
    assert features.vague_link_lacks_context(page) is True


def test_an_unclosed_container_suppresses_later_findings_and_that_is_the_known_cost() -> None:
    # Stated rather than hidden. If a read-through truncates before its "out of list", every vague link
    # after that point reads as having context and is not reported. That is over-suppression, and it is the
    # direction chosen deliberately: a false accusation against a conformant publisher is the worst error
    # this tool can make, and a missed finding on a truncated capture is already covered by the completeness
    # gate reporting INCONCLUSIVE rather than clean.
    page = record_with("list, with 4 items, link, Details", "link, Click here")
    assert features.vague_link_lacks_context(page) is False


def test_context_PERSISTS_across_lines_until_the_exit_marker() -> None:
    """NVDA announces a container once, on entry. Every item after the first carries no prefix.

    Asking each line for its own containers reported every subsequent item as contextless, and accused
    GOV.UK's table and tabs pages of 2.4.4 on a `"link, Details"` sitting mid-list. Corpus lists are short
    enough that the prefix lands on the same line as the only link, so this was invisible there — the third
    time a real page has exposed something the corpus structurally cannot.
    """
    page = record_with(
        "list, with 35 items, link, Accordion",
        "link, Cookie banner",
        "link, Details",            # mid-list: no prefix of its own, but still inside the list
    )
    assert features.vague_link_lacks_context(page) is False


def test_context_ENDS_at_the_exit_marker() -> None:
    page = record_with(
        "list, with 3 items, link, Accordion",
        "out of list",
        "link, Details",            # after the list closed: genuinely a lone link
    )
    assert features.vague_link_lacks_context(page) is True
