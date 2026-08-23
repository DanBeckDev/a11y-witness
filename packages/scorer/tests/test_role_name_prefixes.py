"""NVDA prefixes announcements with context, and the feature extractors must read through it.

`link_name` anchored the role at the start of the phrase: `^link\\s*,\\s*(.*)$`. NVDA very rarely puts it
there. Measured across the corpus: 11,045 link announcements carry a prefix and 230 do not, so the
extractor was blind to 98% of them — and `vague_link_present`, the highest-weighted feature on the 2.4.4
head (+1.247, x2.0), read 0.0 on every page whose vague link was an in-page anchor.

The cost was not a missed feature. The 2.4.4 head, denied its one correct signal, decided from the frozen
embedding instead: 0.0131 on a page that HAS a vague link, 0.9856 on the same page without one. Six held-out
acceptance failures traced to this, and fixing it removed all six with no retraining.

The same NVDA behaviour was found and fixed once already, in `dedupeKey`, where `CONTAINER_PREFIX` strips
the leading container before keying a sweep. The remedy went to the sweep and never here — the shape
CLAUDE.md calls "a fix applied at ONE call site when the behaviour reaches several".

Every string below is a real announcement from `runs/`, not a constructed one.
"""
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "packages" / "scorer" / "python"))

import screenreader_features as F


def test_a_bare_role_still_works():
    # The 2% that always matched. A fix that breaks them trades one blindness for another.
    assert F.link_name("link, Here") == "here"
    assert F.link_name("link, Read the planting for pollinators workshop guide").startswith("read the")


def test_the_role_is_found_behind_every_prefix_nvda_actually_uses():
    for phrase in (
        "same page, link, Details",
        "out of table, same page, link, Details",
        "out of form, same page, link, Details",
        "list, with 6 items, bullet, same page, link, Details",
    ):
        assert F.link_name(phrase) == "details", phrase
        assert F.link_name(phrase) in F.VAGUE_LINKS, phrase


def test_a_descriptive_link_is_still_not_vague():
    # The other direction, and the one that would turn a fix into a false-positive machine.
    name = F.link_name("list, with 6 items, bullet, same page, link, Opening times for the north entrance 01")
    assert name.startswith("opening times")
    assert name not in F.VAGUE_LINKS


def test_the_word_link_inside_a_NAME_is_not_a_role():
    # `\\b` plus an explicit comma is what separates the role from a name containing the word. Without it,
    # "Aquarium 001 links" would parse as a link whose name is whatever follows.
    assert F.link_name("heading, level 1, Aquarium 001 links") == ""
    assert F.link_name("out of links, same page, link, Details") == "details"


def test_graphic_names_read_through_prefixes_too():
    # Same extractor shape, same fault, fixed together — the point of the shared helper. Measured zero
    # corpus flips for graphics, which is why this is a guard against regression rather than a fix.
    assert F.graphic_name("graphic, logo.png") == "logo.png"
    assert F.graphic_name("out of form, graphic, logo.png") == "logo.png"


def test_the_schema_version_moved_with_the_meaning():
    # The same capture now yields different feature values, so a v7 weight file was fitted to a different
    # function of the same evidence. Scoring v7 weights with v8 features reads the difference as model
    # behaviour, which is the one thing this version exists to prevent.
    assert F.FEATURE_SCHEMA_VERSION == "screenreader-structured-v8"
