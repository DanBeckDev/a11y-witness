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
        containers, objects = [], []
        index = 0
        while index < len(parts):
            token = parts[index].lower()
            nxt = parts[index + 1].lower() if index + 1 < len(parts) else ""
            if token in features.CONTEXT_CONTAINERS:
                containers.append({"name": "", "role": token})
            elif nxt in features.CONTEXT_CONTAINERS:
                containers.append({"name": parts[index], "role": nxt})
                index += 1
            elif token == "link" and index + 1 < len(parts):
                objects.append({"name": parts[index + 1], "role": "link", "states": []})
                index += 1
            index += 1
        return {"containers": containers, "objects": objects, "leaving": [], "raw": text}
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
    page = record_with("list, with 4 items, link, Details", "link, Click here")
    assert features.vague_link_lacks_context(page) is True
