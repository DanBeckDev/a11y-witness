"""Every role extractor must parse a name from the announcements that mention its role.

THE GENERAL FORM of the defect that cost 2026-08-23, rather than a test for the one extractor that had it.

`link_name` anchored the role at the start of the phrase. NVDA almost never puts it there, so the extractor
parsed a name from **3.5%** of the announcements that mention the link role — and `vague_link_present`, the
highest-weighted feature on the 2.4.4 head, read 0.0 on every page whose vague link was an in-page anchor.
Six held-out acceptance failures traced to it.

## Why nothing caught it, which is the part worth encoding

Two audits look at exactly this data and neither could see it:

- `corpus:starvation` computes an occurrence count per feature and uses `MIN_CORPUS_OCCURRENCES = 50` to
  EXCLUDE rare features from its report. A feature firing on 2% was filtered out as not worth mentioning —
  the audit deliberately looked away from the signal that mattered.
- `scorer:shortcuts` DID report `vague_link_present` with a large negative weight, and it was read as a
  corpus-starvation veto (ADR 0015) rather than as a broken parser. Both diagnoses fit the evidence; only
  one was true.

A fire-rate floor would not have helped either: `vague_link_present` fires on 5% of records, which is
entirely plausible for a real feature. The question is not "does this feature ever fire" but "does the
extractor UNDERSTAND the announcements it is given", and that is measurable one level down.

## The measure

For each role, take every announcement mentioning that role and ask what fraction the extractor parses a
name from. Before the fix: 45 of 1,287. After: 1,287 of 1,287.

Discovered from the corpus, so a new extractor is covered the day it is added.
"""
import json
import re
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "packages" / "scorer" / "python"))

import screenreader_features as F

# The EXPORTED records, not the raw captures. `all_evidence` reads `input.evidenceUnits`, which the
# exporter builds; a raw capture keeps its parts elsewhere. Reading captures found zero graphic
# announcements and the MIN_CANDIDATES floor caught it — the guard's own blindness, caught by the guard.
RECORDS = REPO / "runs" / "screenreader-dataset" / "screenreader-evidence.jsonl"

# An extractor that fails on more than this share of announcements naming its role is not being strict,
# it is being blind. Set well below the 100% both extractors now achieve and far above the 3.5% that
# shipped, so it is a bug detector rather than a coverage ratchet.
MIN_COVERAGE = 0.90
MIN_CANDIDATES = 50


def announcements():
    """Every phrase the feature layer actually sees, taken the way it takes them."""
    if not RECORDS.is_file():
        return []
    out = []
    with RECORDS.open(encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                out.extend(F.all_evidence(json.loads(line)))
            except (ValueError, KeyError):
                continue
    return out


PHRASES = announcements()
needs_corpus = pytest.mark.skipif(
    not PHRASES, reason="no exported corpus under runs/ (gitignored; this is a local gate, like verify.corpus.test.ts)"
)


@needs_corpus
@pytest.mark.parametrize("role,extractor", [("link", F.link_name), ("graphic", F.graphic_name)])
def test_the_extractor_understands_announcements_naming_its_role(role, extractor):
    mentions = [p for p in PHRASES if re.search(rf"\b{role}\s*,", p, re.IGNORECASE)]
    # A guard that examines nothing passes in silence, which is the shape it exists to catch.
    assert len(mentions) >= MIN_CANDIDATES, (
        f"only {len(mentions)} announcements mention the {role} role; this test is not examining the corpus"
    )

    parsed = [p for p in mentions if extractor(p)]
    coverage = len(parsed) / len(mentions)
    missed = [p for p in mentions if not extractor(p)][:3]
    assert coverage >= MIN_COVERAGE, (
        f"{role}_name parsed a name from {len(parsed)}/{len(mentions)} ({coverage:.1%}) of announcements "
        f"naming the {role} role. An extractor that cannot read most of its own role's announcements is "
        f"broken, whatever the feature built on it reports. Examples it could not read: {missed}"
    )


@needs_corpus
def test_the_corpus_actually_contains_prefixed_announcements():
    # The property that makes the test above meaningful. If NVDA stopped prefixing announcements, a
    # start-anchored extractor would pass and the guard would be measuring nothing — so pin the fact that
    # the hard case is present. Measured: 11,045 prefixed vs 230 bare across the full corpus.
    mentions = [p for p in PHRASES if re.search(r"\blink\s*,", p, re.IGNORECASE)]
    prefixed = [p for p in mentions if not re.match(r"^link\s*,", p.strip(), re.IGNORECASE)]
    assert len(prefixed) / max(len(mentions), 1) > 0.5, (
        "most link announcements are no longer prefixed, so this guard has stopped exercising the case it "
        "was written for — check whether NVDA's output shape changed before relaxing anything"
    )
