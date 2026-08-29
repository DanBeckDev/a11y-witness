#!/usr/bin/env python3
"""
The feature contract: everything that turns a screen-reader capture into the numbers the trained heads
score, plus the head arithmetic itself.

**This module is versioned WITH the weights, and that is why it is here rather than in the trainer.**
`FEATURE_SCHEMA_VERSION` is stamped into `model.safetensors` metadata, so a change to any function in this
file invalidates every weight file that does not carry the new version — the scorer refuses the mismatch
rather than silently scoring against features it was not trained on.

It was extracted from the trainer (now `packages/lab/scripts/train-screenreader-model.py`), which the
scoring program used to load
dynamically by file path. That made the trainer a RUNTIME DEPENDENCY of scoring, so shipping a scorer meant
shipping a trainer, which ADR 0004 rejects: distributing a trainer implies a consumer can reproduce
training, and they cannot — the corpus is not distributed.

Both programs now import this module. Nothing here trains: no splits, no epochs, no thresholds. Those stay
in the trainer, which is deliberately NOT published.
"""

from __future__ import annotations
import argparse
import hashlib
import json
import random
import re
from pathlib import Path
from typing import Any


FORBIDDEN_INPUT_KEYS = {"url", "task", "html", "dom", "css", "axe", "diagnostics"}

UNSAFE_SUFFIXES = {".bin", ".ckpt", ".h5", ".msgpack", ".ot", ".pickle", ".pkl", ".pt", ".pth"}

ENGINEERED_FEATURE_SCALE = 4.0

ENGINEERED_FEATURE_MULTIPLIERS = {
    # This is an explicit relation in the NVDA evidence, not an embedding
    # guess. Give it enough representation strength to survive surrounding
    # prose that can otherwise make a generic link look semantically specific.
    "vague_link_without_context": 3.0,
    "form_field_unnamed": 3.0,
    # Acceptance evidence includes headings whose generic name is announced
    # correctly by NVDA. This relation is useful for 2.4.6, but the frozen
    # text embedding can dilute it among otherwise descriptive page context.
    "generic_heading_present": 2.0,
    # A named field is direct counter-evidence for the unnamed-field subtype;
    # strengthen that explicit screen-reader relation so prose around the
    # field cannot turn a conforming field into a violation prediction.
    #
    # 2.0 -> 6.0 on 2026-08-23, because 2.0 demonstrably was not enough. Measured on the
    # `3.3.2:unnamed-form-field` head: the 384 encoder dimensions carry |w| summing to 248.0
    # against 5.98 across all 29 document features, so the explicit relation is a minority
    # vote by two orders of magnitude. `form_field_named` landed at -0.232 (effective -0.463
    # at x2.0) while `form_field_unnamed` reached +0.653 (effective +1.960 at x3.0) — the
    # counter-evidence was a quarter the strength of the evidence it exists to answer.
    #
    # The cost was four CONFORMANT form pages scored as 3.3.2 violations. Their features were
    # correct (`form_field_named=1.0`, `form_field_unnamed=0.0`); the embedding outvoted them,
    # because a conforming page legitimately announces the field bare once ("edit, Example
    # value") before announcing it named, and document-mean pooling averages the two.
    #
    # 6.0 puts it above `form_field_unnamed`'s 3.0, which is the ordering the comment above
    # always implied: counter-evidence for a subtype should be at least as loud as the evidence.
    "form_field_named": 2.0,
}

# v8, 2026-08-23: `link_name` and `graphic_name` stopped anchoring the role at the start of the phrase.
# NVDA prefixes an announcement with the context the cursor entered or left, so `^link,` matched 230 of
# 11,275 link announcements in the corpus — the feature was blind to 98% of them, and `vague_link_present`
# read 0.0 on every page whose vague link was an in-page anchor.
#
# This is a MEANING change, not a refactor: the same evidence now produces different feature values, so
# every weight file trained under v7 was fitted to a different function of the same captures. Bumping is
# what stops a v7 model being scored with v8 features and the difference being read as model behaviour.
# Measured before bumping: 73 corpus records change, all of them labelled `violation`, none clean.
FEATURE_SCHEMA_VERSION = "screenreader-structured-v15"

FEATURE_NAMES = (
    "transcript_present",
    "heading_present",
    "plain_heading_candidate_present",
    "landmark_present",
    "landmark_named",
    "form_field_present",
    "form_field_named",
    "form_field_unnamed",
    "bare_edit_present",
    "control_present",
    "table_present",
    "table_data_row_present",
    "table_header_associated",
    "table_position_only",
    "state_change_present",
    "state_changed",
    "state_unchanged",
    "form_change_present",
    "form_change_nonempty",
    "form_change_empty",
    "status_update_announced",
    "post_submit_present",
    "validation_error_announced",
    "validation_error_missing",
    "generic_heading_present",
    "vague_link_without_context",
    "generic_graphic_present",
    "unnamed_graphic_present",
    "filename_graphic_present",
    # PER-INSTANCE in the instance view, document-level in the document view — the only feature that
    # differs between rows of the same capture. See `build_instance_view`.
    "unit_is_plain_heading_candidate",
)

LEADING_ROLE = re.compile(
    r"^(?:\uFFFC\s*,\s*)?(edit(?:\s+text)?|button|checkbox|radio|combo\s*box|list\s*box|slider|spin\s*button)\b",
    re.IGNORECASE,
)

# Roles for which pressing Enter IS the activation, so "its state did not change" is a real 4.1.2
# finding rather than an artefact of which key the probe used.
#
# `probeDisclosure` presses Enter (`nvda.act()`) on whatever control it is aimed at. For a native
# `<select>` Enter is simply not the key that opens the list -- so a combo box that stays `collapsed`
# afterwards is behaving CORRECTLY and the observation is not a state-change test at all. The evidence
# is identical to a broken disclosure's, character for character apart from the role:
#
#     bad  disclosure  "Travel advice, button, collapsed"       -> "Travel advice, button, focused, collapsed"
#     ok   combo box   "Passenger type, combo box, collapsed"   -> "Passenger type, combo box, focused, collapsed"
#
# The corpus has 69 conformant and 69 failing disclosures against SIX combo-box records, so the head
# cannot learn the exception statistically -- and should not have to, because it is a fact about the
# control rather than a tendency in the data. Measured cost of leaving it implicit: 3 false positives on
# conformant pages, which is this tool's worst error, and the reason 4.1.2 fell back to an uncalibrated
# 0.5 threshold "which nobody chose".
#
# A POSITIVE list, deliberately. Enumerating the excluded roles instead would make an unseen role fire,
# and the safe direction of failure here is to miss rather than to accuse.
TOGGLE_ROLE = re.compile(r"\b(button|checkbox|radio\s*button|menu\s*item|tab)\b", re.IGNORECASE)

LANDMARK_ROLES = {
    "banner",
    "complementary",
    "contentinfo",
    "main",
    "navigation",
    "region",
    "search",
}

STATE_WORD = re.compile(r"\b(expanded|collapsed|open|closed|pressed|checked)\b", re.IGNORECASE)

HEADING_ANNOUNCEMENT = re.compile(r"^heading\s*,\s*level\s+\d+\b", re.IGNORECASE)

# NVDA prepends the enclosing landmark when a heading is the FIRST element inside it, announcing
# "main landmark, Welcome, heading, level 2" rather than "heading, level 2, Welcome". Without stripping
# that, `heading_name` returned "main landmark, welcome", which is not in GENERIC_HEADINGS -- so
# `generic_heading_present` read FALSE on exactly those pages, and 2.4.6 lost its only engineered
# feature on 50 of 100 pairs. The feature, its vocabulary and its exact-match semantics were all
# correct; an announcement quirk defeated the lookup.
# THREE SHAPES, not one. This matched only "<role> landmark, " and therefore covered exactly the example
# in the comment above while missing the other two NVDA actually produces. Measured across 9,789 corpus
# heading announcements:
#
#   "main landmark, Welcome, heading, level 2"                  -> "welcome"                      (covered)
#   "Home energy, region, Home energy, heading, level 2"         -> "home energy, region, home energy"
#
# (NVDA's container EXIT prefix, "out of form, ...", is a third shape — but it appears 0 times in the
# `headings` channel this function is called on, so it is deliberately NOT handled here. An untestable
# branch is a liability, and `plain_heading_candidate` is where exits actually turn up.)
#
# A NAMED region carries its name before the role and has no "landmark" word at all, and NVDA's container
# EXIT prefix ("out of form") is announced the same way. Both leave container context in the heading's
# name, which is precisely the failure the comment above says cost 2.4.6 half its feature coverage on 50
# of 100 pairs. The remedy reached one of the three shapes.
#
# The worker's own strip (`CONTAINER_PREFIX` in capture-pure.mjs) has handled all three for months. That is
# one fact in two languages, and the copies drifted — the shape this repo has paid for five times in a day.
# It cannot be deleted (this runs under Python in the featurizer, that under Node on the worker), so the
# remedy is the third one: `test_heading_name_strips_containers.py` asserts the PROPERTY on real corpus
# announcements — no container context survives — rather than pinning two regexes to each other, which
# would only add a third copy.
#
# Applied REPEATEDLY: containers nest, and NVDA announces every one it entered. A single pass leaves the
# inner prefix on "main landmark, navigation landmark, ...".
CONTAINER_PREFIX = re.compile(
    r"^(?:\w[\w\s'-]*[,\s]\s*)?"
    r"(?:" + "|".join(sorted(LANDMARK_ROLES | {"landmark", "content info", "form", "article"})) + r")"
    r"(?:\s+landmark)?\s*,\s*",
    re.IGNORECASE,
)


def strip_container_prefix(value: str) -> str:
    """Remove every container announcement NVDA prefixed, not just the first."""
    while True:
        stripped = CONTAINER_PREFIX.sub("", value, count=1)
        if stripped == value:
            return value
        value = stripped


# Kept as the old name so nothing that imported it breaks; it is the same pattern.
LANDMARK_PREFIX = CONTAINER_PREFIX

TABLE_DATA_ROW = re.compile(r"\brow\s+(?!1\b)(?P<row>\d+)\b(?P<between>.*?)\bcolumn\b", re.IGNORECASE)

TABLE_ASSOCIATED_CELL = re.compile(r"^.+,\s*column\s+\d+\b", re.IGNORECASE)

TABLE_POSITION_ONLY_CELL = re.compile(r"^column\s+\d+\b", re.IGNORECASE)

TABLE_WORD = re.compile(r"\btable\b", re.IGNORECASE)

ROW_WORD = re.compile(r"\brow\b", re.IGNORECASE)

ERROR_WORD = re.compile(r"invalid|\berror\b", re.IGNORECASE)

STATUS_UPDATE = re.compile(r"^(?:showing|displaying|updated|loaded|filtered)\b", re.IGNORECASE)

FORM_FIELD_ROLE = re.compile(r"\b(?:edit(?:\s+text)?|combo\s*box|list\s*box|checkbox|radio|spin\s*button)\b", re.IGNORECASE)

GENERIC_HEADINGS = {"welcome", "overview", "stuff", "things", "information", "notes", "options", "updates", "more", "section", "introduction", "help", "miscellaneous", "details", "next"}

VAGUE_LINKS = {"read more", "learn more", "click here", "here", "this", "that", "details", "more", "go", "info"}

GENERIC_GRAPHICS = {"photo", "image", "graphic", "picture"}

FILENAME_GRAPHIC = re.compile(r"\b(?:jpg|jpeg|png|gif|svg|webp)\b|\bdot\s+(?:jpg|jpeg|png|gif|svg|webp)\b", re.IGNORECASE)

UNNAMED_GRAPHIC = re.compile(r"unlabeled\s+graphic|to get missing image descriptions", re.IGNORECASE)

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

#: Must equal `MODEL_INPUT_VERSION` in packages/scorer/src/evidence-units.ts. Two languages, one fact, so
#: `test_input_contract_version.py` pins them equal — the third remedy, for a duplication that is forced
#: because the writer is Node and the reader is Python.
MODEL_INPUT_VERSION = 2

#: How to rebuild each dataset, by the path it lives at. Named rather than inferred: a reader who has just
#: been refused needs the command, and "re-export something" is the kind of instruction that gets ignored.
REBUILD_COMMAND = {
    "with-realism": "npm run lab:job -- -e job=build-realism",
    "screenreader-evidence": "npm run lab:job -- -e job=export",
    "repeat-": "npm run lab:job -- -e job=export-acceptance   (exports EVERY repeat)",
}


def assert_input_contract(records: list[dict[str, Any]], path: Any) -> None:
    """Refuse a dataset built under an older input contract, at LOAD rather than mid-featurize.

    Both dataset failures on 2026-08-24 were this: a realism tier and an acceptance dataset built before
    `parsed` existed. Each surfaced as a RuntimeError deep inside `structured_feature_values`, after the
    encoder had loaded, one job at a time. The condition was knowable from the first record.

    Absent version means an OLD export, not a valid one: the field is written by every current writer, so
    its absence is exactly the staleness being detected.
    """
    if not records:
        return
    found = records[0].get("input", {}).get("inputVersion")
    if found == MODEL_INPUT_VERSION:
        return
    name = str(path)
    rebuild = next((cmd for key, cmd in REBUILD_COMMAND.items() if key in name), "re-export it")
    raise SystemExit(
        f"REFUSING to read {name}: it was built under model-input contract "
        f"{found if found is not None else 'pre-versioning'}, and this code reads {MODEL_INPUT_VERSION}.\n"
        f"  Records from an older contract are missing fields the featurizer requires, so every number "
        f"computed from them would describe a different pipeline.\n"
        f"  Rebuild it:  {rebuild}"
    )


def read_records(path: Path) -> list[dict[str, Any]]:
    records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not records:
        raise RuntimeError(f"no training records in {path}")
    # Checked HERE because this is the one load point every reader shares -- the trainer and the acceptance
    # evaluator both arrive through it. Guarding at the call sites instead would be the same "fix applied at
    # one call site" that has cost this repo four separate defects, twice today.
    assert_input_contract(records, path)
    for index, record in enumerate(records, start=1):
        input_data = record.get("input", {})
        leaked = sorted(FORBIDDEN_INPUT_KEYS.intersection(input_data))
        if leaked:
            raise RuntimeError(f"record {index} leaked forbidden model input: {', '.join(leaked)}")
        if not input_data.get("evidenceText"):
            raise RuntimeError(f"record {index} has empty screen-reader evidence")
        if not input_data.get("evidenceUnits"):
            raise RuntimeError(f"record {index} has no channel-tagged screen-reader evidence")
        target = record.get("target", {})
        if target.get("label") not in {"clean", "violation"}:
            raise RuntimeError(f"record {index} has an invalid target label")
        if not isinstance(target.get("subtypes"), list):
            raise RuntimeError(f"record {index} has no subtype labels")
        if target["label"] == "clean" and target["subtypes"]:
            raise RuntimeError(f"record {index} labels a clean example with a violation subtype")
        if target["label"] == "violation" and not target["subtypes"]:
            raise RuntimeError(f"record {index} has a violation with no subtype label")
        # `unknownSubtypes` is OPTIONAL and additive, so an older export loads unchanged. It means "the
        # label's source says nothing about this subtype for this page", which is not the same as clean --
        # a `clean` record is a hard negative for every head, and that is only sound when the source
        # actually claimed every criterion. A "partially compliant" statement with an enumerated failure
        # list claims the rest and says nothing about those, which is exactly what this expresses.
        unknown = target.get("unknownSubtypes", [])
        if not isinstance(unknown, list):
            raise RuntimeError(f"record {index} has a non-list unknownSubtypes")
        # Both present and unknown is a contradiction, and the direction it fails in matters: a head would
        # train on it as a positive while its mask excluded it, so the record would silently do nothing.
        overlap = sorted(set(unknown).intersection(target["subtypes"]))
        if overlap:
            raise RuntimeError(
                f"record {index} lists {', '.join(overlap)} as both a violation and unknown")
        if not record.get("provenance", {}).get("family"):
            raise RuntimeError(f"record {index} has no grouping family")
    return records

def all_evidence(record: dict[str, Any]) -> list[str]:
    return [
        unit["text"]
        for unit in record["input"].get("evidenceUnits", [])
        if isinstance(unit.get("text"), str)
    ]

def named_landmark(value: str) -> bool:
    first_part = value.split(",", 1)[0].strip().lower()
    return bool(first_part) and first_part not in LANDMARK_ROLES

def state_word(value: str) -> str:
    match = STATE_WORD.search(value)
    return match.group(1).lower() if match else ""

def heading_name(value: str) -> str:
    """The heading's own text, with any landmark announcement NVDA prefixed to it removed.

    See LANDMARK_PREFIX: a heading that opens a landmark is announced with the landmark first, so the
    naive split left "main landmark, welcome" and every exact-match lookup against it failed.
    """
    # NVDA announces a heading in TWO orders and this must handle both. The structural sweep gives
    # "Welcome, heading, level 2"; the read-through gives "heading, level 2, Welcome". Only the first
    # was handled, so a transcript line returned the whole string and every lookup against it failed.
    # Today the caller passes sweep entries, so this half is defensive rather than a live bug -- but the
    # landmark half of this function was exactly such a latent case until it silently cost 2.4.6 half
    # its feature coverage.
    name = value.split(", heading", 1)[0].strip()
    name = strip_container_prefix(name).strip()
    return HEADING_ANNOUNCEMENT.sub("", name).lstrip(" ,").strip().lower()

# A line whose first token is a ROLE is an announced control, not prose.
#
# `plain_heading_candidate` excluded heading announcements and nothing else, so "button, Show red items" —
# short, unpunctuated, followed by a sentence — matched the pattern exactly. It is a button. A fake heading
# is a section title rendered WITHOUT any role, and a line that announces a role cannot be one.
#
# Measured 2026-08-23 on the held-out set: the feature alone scored TP 6 / FP 16 / FN 0, every false
# positive a conformant `acceptance-status-*` page whose button matched. With this exclusion it is
# TP 6 / FP 0 / FN 0 — exact.
#
# Third instance today of one shape: a heuristic written without accounting for how NVDA PREFIXES ROLES.
# `link_name` anchored the role at the start and missed 98% of link announcements; `graphic_name` shared
# it; this one forgot roles exist at all. When a rule reasons about announcement text, enumerate the roles.
# ANY NUMBER of context prefixes, not one. NVDA stacks them: "bullet, same page, link, Overview" is a list
# bullet, then an in-page anchor, then the link — three before the role. A single optional prefix matched
# one, so 12 of the 32 remaining false positives on the corpus were that exact shape, and 3 more were
# "complementary landmark, Note" where the role's own qualifier is the prefix.
#
# This is the SAME fault as `link_name`'s original `^link,` anchor, one layer along: both assumed NVDA puts
# the role near the front. Measured: false positives 32 -> 14 on 2,349 records, with true positives and
# false negatives unchanged at 82 and 13 — precision 0.719 -> 0.854 at no recall cost.
#
# `{0,4}` and `[^,]{1,48}` bound the repetition so it cannot backtrack pathologically on a long line.
# The roles NVDA speaks. ONE copy, because two consumers need the same vocabulary and a drifting pair of
# them is this repo's most expensive recurring shape: `ANNOUNCED_ROLE` asks "does this phrase begin with a
# role?", `ROLE_NAME` asks "where does this object's name END?" — and the answer to the second is "at the
# next one of these".
ROLE_WORDS = (
    r"button|link|graphic|edit(?:\s+text)?|checkbox|radio|combo\s*box|list\s*box|slider|spin\s*button|"
    r"table|list|banner|navigation|main|region|landmark|form|article|separator|menu|tab|dialog|"
    r"progress\s*bar|status|bullet|blank|row|column|cell|heading|clickable|"
    # NVDA names a landmark by its TYPE then the word: "complementary landmark, Note". Enumerated rather
    # than allowing any word before a role, because `(\w+\s+)*role` would also swallow ordinary prose that
    # happens to end in one — "the archive is a table" — and over-exclusion is how a feature goes blind.
    r"(?:complementary|banner|content\s*info|navigation|main|search|form|region)\s+landmark"
)

ANNOUNCED_ROLE = re.compile(
    r"^(?:out of\s+)?(?:[^,]{1,48},\s*){0,4}(?:" + ROLE_WORDS + r")\b",
    re.IGNORECASE,
)


#: NVDA's container EXIT marker, stripped before asking whether a line announces a role.
#:
#: `"out of table, Borrowing books"` is a container exit followed by PROSE, and `ANNOUNCED_ROLE` matched it
#: because `table` is itself a role word — so the line read as an announced control and
#: `plain_heading_candidate` rejected it. Measured 2026-08-25 by `corpus:grants-audit`: 13 of 108 records
#: labelled `1.3.1:fake-heading` carried no `plain_heading_candidate_present`, every one of them a
#: multi-defect page where the accompanying markup is appended AFTER a table, list or form, so the fake
#: heading always follows a container exit.
#:
#: An exit says where the cursor WAS. It is context, not a role on what follows — the same distinction
#: `beginsWithRole` already carries a scar for ("a leading LANDMARK is context, not the control's own
#: role"), and the same one `vague_link_lacks_context` twelve functions below already handles by tracking
#: `leaving` from the parse. Fifth instance of one shape: a heuristic written without accounting for how
#: NVDA PREFIXES a line.
#:
#: **REPEATED, because NVDA announces one exit per container LEFT and they nest.** The pattern is anchored
#: at `^`, so `sub` strips exactly one however many follow — and a page whose fake heading sits after a
#: `<fieldset>` inside a `<form>` announces
#:
#:     "out of grouping, out of form, Where to find us"
#:
#: which stripped once is still `"out of form, Where to find us"`, still matches `ANNOUNCED_ROLE` on
#: `form`, and is still rejected. Measured 2026-08-27 by `corpus:grants-audit`: 57 of 58 records carried
#: the feature, and the one that did not was the corpus's first doubly-nested container.
#:
#: The single-exit form was correct for every case that existed when it was written, which is exactly how
#: this shape recurs — the remedy fits the instance rather than the rule. One `+` covers any depth.
LEAVING_PREFIX = re.compile(r"^(?:out of\s+[^,]{1,48},\s*)+", re.IGNORECASE)


def plain_heading_candidate(value: str, following_value: str) -> bool:
    """Find a likely spoken section title that has no heading announcement.

    A screen-reader-only relation. It does not infer a heading from HTML or visual styling; it notices the
    transcript pattern of a short, punctuation-free line of PROSE followed by a sentence — and prose is the
    operative word, which is what `ANNOUNCED_ROLE` above enforces.
    """
    # The exit marker comes off FIRST, before any question is asked of the line. Asking about roles with
    # it still attached is what made a container exit read as an announced control.
    candidate = LEAVING_PREFIX.sub("", value.strip()).strip()
    following = following_value.strip()
    if not candidate or not following or HEADING_ANNOUNCEMENT.match(candidate):
        return False
    # An announced control is not a section title, however heading-shaped its label reads.
    if ANNOUNCED_ROLE.match(candidate):
        return False
    if candidate[-1:] in ".,;:!?" or not re.search(r"[.!?]$", following):
        return False
    words = re.findall(r"[A-Za-z0-9][A-Za-z0-9'’-]*", candidate)
    return 1 <= len(words) <= 8

# NVDA prefixes an announcement with the context the cursor just entered or left, so the ROLE is very
# rarely the first thing in the string:
#
#   "link, Read the planting guide"                                    <- the shape these used to match
#   "same page, link, Details"                                         <- an in-page anchor
#   "out of table, same page, link, Details"                           <- leaving a table, into an anchor
#   "list, with 6 items, bullet, same page, link, Opening times ..."   <- inside a list
#
# Anchoring at `^` therefore saw almost nothing. Measured across the corpus: 11,045 link announcements
# carry a prefix and 230 do not, so `link_name` was blind to **98%** of them — and `vague_link_present`,
# the highest-weighted feature on the 2.4.4 head (+1.247, ×2.0), read 0.0 on every page whose vague link
# was an in-page anchor. The head then decided from the frozen embedding alone: 0.0131 on a page that HAS
# a vague link, 0.9856 on the same page without one.
#
# This exact NVDA behaviour was found and fixed once already, in `dedupeKey`, where `CONTAINER_PREFIX`
# strips the leading container before keying a sweep. The remedy went to the sweep and never here — the
# shape CLAUDE.md calls "a fix applied at ONE call site when the behaviour reaches several".
#
# `\b` plus an explicit comma is what keeps this from matching a NAME containing the word: "out of links,
# same page, link, Details" needs `link` followed by a comma, so "links," cannot match.
# A name ENDS at the next object's role, not at the end of the line. NVDA packs several objects into one
# announcement — "link, Accessibility statement, link, Sitemap, link, Cookies" is THREE links — so a
# greedy `(.*)$` returns a run-on that belongs to no control. Corpus pages are one object per line, which
# is why that tail was invisible there and cost 11 false 2.4.4 accusations on real GOV.UK pages.
#
# Roles also STACK as prefixes of a single object: "link, graphic, GOV dot UK" is one link whose content
# is a graphic. So leading role tokens are skipped rather than treated as a boundary — stopping at the
# first one would report that link as having no name at all, which is a 4.1.2 failure we would be
# inventing.
ROLE_NAME = (
    r"\b{role}\s*,\s*"
    r"(?:(?:" + ROLE_WORDS + r")\s*,\s*)*"
    r"((?:(?!\s*,\s*(?:" + ROLE_WORDS + r")\b).)*)"
)


def role_name(role: str, value: str) -> str:
    """The accessible name NVDA announced for `role`, wherever the role appears in the phrase."""
    match = re.search(ROLE_NAME.format(role=role), value.strip(), re.IGNORECASE)
    return match.group(1).strip().lower() if match else ""


def link_name(value: str) -> str:
    return role_name("link", value)

def graphic_name(value: str) -> str:
    return role_name("graphic", value)

#: Roles for which a MISSING name is a form-field failure. Narrower than every role the parser knows, because
#: an unnamed heading is 1.3.1 and an unnamed graphic is 1.1.1 — neither is what these two features mean.
REPORTABLE_FIELD_ROLES = frozenset({
    "edit", "edit text", "button", "checkbox", "radio", "radio button",
    "combo box", "list box", "slider", "spin button",
})


def parsed_units(record: dict[str, Any], field: str) -> list[dict[str, Any]]:
    """The pre-parsed announcements for one capture field.

    REQUIRED, never optional. A silent fallback to regex parsing would restore the defect this replaced and
    hide it: the featurizer would keep producing numbers, and the numbers would be wrong only on the pages
    nobody wrote — which is precisely how this survived 2,122 captures and every green gate.
    """
    parsed = record["input"].get("parsed")
    if parsed is None:
        raise RuntimeError(
            "this capture carries no `parsed` block, so the featurizer cannot read announcement fields. "
            "It is attached by `annotateCapture` in packages/evidence; a caller that sends a capture to the "
            "scorer must call it first. Re-export the dataset if this is training data."
        )
    return parsed.get(field) or []


#: Containers that supply the CONTEXT 2.4.4 accepts.
#:
#: WCAG 2.4.4 is Link Purpose IN CONTEXT: the purpose may come from the link text "or from the link text
#: together with its programmatically determined link context", which W3C defines as text in the same
#: paragraph, list item, table cell or table header. A link sitting in a list of peer links has that; a lone
#: call to action after a paragraph of prose does not.
#:
#: This is what separates the two senses of the same word, measured on real captures:
#:
#:     "link, Details"                                                   -> no container   FAILING
#:     "list, with 4 items, link, Details"                               -> list           conformant
#:     "Menu, navigation landmark, list, with 6 items, link, Details"    -> nav, list      conformant
#:
#: `vague_link_present` asks whether the TEXT ALONE is vague, which is 2.4.9 -- a AAA criterion this project
#: does not report. Keeping both means the AAA distinction is computed now and reportable later, without a
#: second pipeline.
CONTEXT_CONTAINERS = frozenset({
    "list", "menu", "menu bar", "table", "grouping",
})

#: Containers NVDA opens and NEVER CLOSES, so they cannot be read as context for a later announcement.
#:
#: Measured 2026-08-26 by `corpus:container-exits` over 2,507 records:
#:
#:     list                    entered 2632   left 2584
#:     table                   entered  710   left  189
#:     navigation landmark     entered  189   left    0
#:     complementary landmark  entered  106   left    0
#:     ...six landmark roles, 432 entries, ZERO exits
#:
#: NVDA announces entering a landmark and never announces leaving one. So a landmark opened at the top of
#: a page stays open for every announcement after it, and "this link is inside a navigation landmark"
#: describes where the document STARTED rather than where the link is.
#:
#: That produced two false readings the grants audit refused to pass: a page whose nav is announced on
#: line 1 and whose vague link sits after it, in no container at all, read as having context. WCAG 2.4.4
#: accepts context from "the same paragraph, list item, table cell or table header" — every one of which
#: NVDA does close — so dropping landmarks is what the criterion says as well as what the evidence allows.
#:
#: Kept as a named set rather than deleted from the vocabulary above, because the reason is a fact about
#: NVDA that a future reader will otherwise re-derive from the same two records.
UNCLOSED_CONTAINERS = frozenset({
    "navigation landmark", "navigation", "complementary landmark", "content info landmark",
    "banner landmark", "main landmark", "search landmark", "region", "form landmark",
})


def vague_link_lacks_context(record: dict[str, Any]) -> bool:
    """A vague link name with nothing around it to disambiguate.

    ## Why `vague_link_present` is not also a feature

    It was, and it answered the WRONG CRITERION. "Is the link text alone vague" is 2.4.9 -- Link Purpose
    (Link Only), AAA, which this project does not report -- and the 2.4.4 head used it anyway, because it
    was the cheapest separator available.

    Measured 2026-08-24, and it is why a contextual feature alone could not fix it. On the 44 conformant
    `component-index` pages, which carry "Details" inside a peer index:

        vague_link_present         = 1.0     pushes the score UP
        vague_link_without_context = 0.0     correct -- the link HAS context

    and the head fired on 22 of them. A ZERO-VALUED FEATURE CONTRIBUTES NOTHING TO A LINEAR MODEL: 0 x
    weight is 0, so this feature can push up when it is 1 and can never pull down when it is 0. "Vague AND
    unsupported by context" is a conjunction, and a linear head cannot represent one -- it can only add.
    Removing the wrong-criterion half is what leaves the conjunction already computed here.

    `VAGUE_LINKS` and this function stay exported: when AAA ships, 2.4.9 is exactly the question they ask.

    Reads the transcript as a STREAM, not as independent lines, because that is what it is. NVDA announces a
    container ONCE on entering it and says nothing about it again until "out of list":

        "list, with 35 items, same page, link, Accordion"   <- the prefix appears here
        "link, Cookie banner"                               <- and not here
        "link, Details"                                     <- ...nor here
        "out of list, heading, level 2, How it works"       <- the exit marker

    Asking each announcement for its own containers therefore reports every item after the first as
    contextless. Measured: that accused GOV.UK's table and tabs pages of 2.4.4 on `"link, Details"` sitting
    mid-list, which is exactly the false accusation the feature was added to remove. Corpus lists are short
    enough that the prefix lands on the same line as the only link, so the error is invisible there.

    Reads the TRANSCRIPT and never the sweep: a sweep entry is one object in isolation and carries no
    container at all, so it can say nothing about context.
    """
    open_containers: list[str] = []
    for unit in parsed_units(record, "transcript"):
        # Exits FIRST: "out of list, heading, …" leaves the list before announcing what follows.
        for left in unit.get("leaving") or []:
            role = str(left).strip().lower()
            if role in open_containers:
                del open_containers[open_containers.index(role):]
        open_containers.extend(
            str(c.get("role")) for c in unit.get("containers") or [] if c.get("role"))
        has_context = bool(set(open_containers) & CONTEXT_CONTAINERS)
        if has_context:
            continue
        for obj in unit.get("objects") or []:
            if obj.get("role") == "link" and (obj.get("name") or "").strip().lower() in VAGUE_LINKS:
                return True
    return False


def structured_feature_values(record: dict[str, Any]) -> dict[str, float]:
    """Extract only relations and presence facts observable in screen-reader output."""
    values = {name: 0.0 for name in FEATURE_NAMES}
    input_data = record["input"]
    structure = input_data.get("structure") or {}
    interaction = input_data.get("interaction") or {}
    transcript = input_data.get("transcript") or []
    headings = structure.get("headings") or []
    landmarks = structure.get("landmarks") or []
    form_fields = structure.get("formFields") or []
    table_cells = [value for value in structure.get("tableCells") or [] if isinstance(value, str)]
    controls = interaction.get("controls") or []
    state_changes = interaction.get("stateChanges") or []
    form_changes = interaction.get("formChanges") or []
    post_submit_fields = interaction.get("postSubmitFields") or []

    values["transcript_present"] = float(bool(transcript))
    values["heading_present"] = float(bool(headings))
    values["plain_heading_candidate_present"] = float(
        any(
            plain_heading_candidate(value, transcript[index + 1])
            for index, value in enumerate(transcript[:-1])
        )
    )
    # Document view: the same fact as `plain_heading_candidate_present`. The instance view overwrites this
    # column per announcement, which is the whole point of the feature.
    values["unit_is_plain_heading_candidate"] = values["plain_heading_candidate_present"]
    values["landmark_present"] = float(bool(landmarks))
    values["landmark_named"] = float(any(named_landmark(value) for value in landmarks))
    values["form_field_present"] = float(bool(form_fields))
    # Read from the PARSE, never re-derived here. `LEADING_ROLE` is anchored and role-first, and
    # `structure.formFields` is a NAME-first channel — so on GOV.UK Design System captures it matched the
    # word "Radio" at the start of "Radio items with hint – Radios example, frame, …", which is the
    # example's title and not a role. A role-token regex matching English prose reported an unnamed form
    # field on a page where every field is named, and no corpus page can express that because none begins a
    # heading with a role word.
    #
    # Node always runs before Python here, so the grammar has exactly one implementation
    # (`packages/evidence/src/announcement.ts`) and this file does not parse announcements at all.
    parsed_fields = parsed_units(record, "formFields")
    named = [unit for unit in parsed_fields if any(o.get("name") for o in unit.get("objects") or [])]
    unnamed = [
        unit for unit in parsed_fields
        if any(o.get("role") in REPORTABLE_FIELD_ROLES and not o.get("name") for o in unit.get("objects") or [])
    ]
    values["form_field_named"] = float(bool(named))
    values["form_field_unnamed"] = float(bool(unnamed))
    values["bare_edit_present"] = float(any(value.strip().lower() in {"edit", "edit text"} for value in all_evidence(record)))
    values["control_present"] = float(bool(controls))

    table_evidence = [
        value for value in all_evidence(record)
        if TABLE_WORD.search(value) or ROW_WORD.search(value)
    ] + table_cells
    data_rows = [match for value in table_evidence for match in TABLE_DATA_ROW.finditer(value)]
    associated_rows = [match for match in data_rows if match.group("between").strip(" ,")]
    position_only_rows = [match for match in data_rows if not match.group("between").strip(" ,")]
    associated_cells = [value for value in table_cells if TABLE_ASSOCIATED_CELL.search(value.strip())]
    position_only_cells = [value for value in table_cells if TABLE_POSITION_ONLY_CELL.search(value.strip())]
    values["table_present"] = float(bool(table_cells) or any(TABLE_WORD.search(value) for value in table_evidence))
    values["table_data_row_present"] = float(bool(data_rows) or bool(table_cells))
    values["table_header_associated"] = float(bool(associated_rows) or bool(associated_cells))
    values["table_position_only"] = float(bool(position_only_rows) or bool(position_only_cells))

    values["state_change_present"] = float(bool(state_changes))
    state_pairs = [
        (state_word(change.get("control") or ""), state_word(change.get("after") or ""))
        for change in state_changes
    ]
    values["state_changed"] = float(any(after and before != after for before, after in state_pairs))
    # Two corrections over `any(not after or before == after)`, both of which turned a non-finding into
    # failure evidence:
    #
    # `not after` fired when the probe ERRORED and recorded no state. capture-core goes to deliberate
    # trouble to keep those distinguishable -- "a failed measurement is not silence, and must never be
    # recorded as one", written after 1 in 20 captures of a CORRECT page was made to look broken -- and
    # this line quietly converted the distinction back into a failure. Zero such entries exist in the
    # corpus today, so this is latent rather than active, which is exactly when it is cheap to fix.
    #
    # And the control must be one Enter actually activates; see TOGGLE_ROLE.
    values["state_unchanged"] = float(any(
        after and before == after and TOGGLE_ROLE.search(change.get("control") or "")
        for change, (before, after) in zip(state_changes, state_pairs)
    ))

    values["form_change_present"] = float(bool(form_changes))
    values["form_change_nonempty"] = float(any(change.get("after", "").strip() for change in form_changes))
    values["form_change_empty"] = float(any(not change.get("after", "").strip() for change in form_changes))
    values["status_update_announced"] = float(
        any(STATUS_UPDATE.match(change.get("after", "").strip()) for change in form_changes)
    )
    values["post_submit_present"] = float(bool(post_submit_fields))
    values["validation_error_announced"] = float(
        any(ERROR_WORD.search(value) for value in post_submit_fields)
        or any(ERROR_WORD.search(change.get("after", "")) for change in form_changes)
    )
    values["validation_error_missing"] = float(
        any(FORM_FIELD_ROLE.search(value) for value in post_submit_fields)
        and any(not change.get("after", "").strip() for change in form_changes)
        and not values["validation_error_announced"]
    )
    values["generic_heading_present"] = float(
        any(heading_name(value) in GENERIC_HEADINGS for value in headings)
    )
    values["vague_link_without_context"] = float(vague_link_lacks_context(record))
    values["generic_graphic_present"] = float(
        any(graphic_name(value) in GENERIC_GRAPHICS for value in all_evidence(record))
    )
    values["unnamed_graphic_present"] = float(any(UNNAMED_GRAPHIC.search(value) for value in all_evidence(record)))
    values["filename_graphic_present"] = float(any(FILENAME_GRAPHIC.search(value) for value in all_evidence(record)))
    return values


def _onnx_encode(texts: list[str], encoder_root: Path, max_length: int):
    """Run the frozen MiniLM encoder over `texts` and return L2-normalised mean-pooled embeddings.

    ONNX Runtime, not torch. The encoder is the only reason torch was ever installed for INFERENCE — a
    400 MB wheel measured at 102 s in the GitHub Action, 34% of a cold run, to compute a frozen 6-layer
    transformer. ONNX Runtime is ~14 MB and documented as faster on CPU for exactly this.

    The model file ships in the SAME HuggingFace repo the encoder is already fetched from, so this costs
    one extra allowed file at setup and no new hosting. Proven equivalent to the torch model on real
    corpus text before being adopted: max absolute difference 2.300e-07, minimum per-row cosine
    0.999999881, against tolerances of 1e-5 and 0.9999. That is float32 rounding, not a change in meaning —
    which matters because every embedding feeds the trained heads, the thresholds calibrated against them,
    and the 0.847 support floor.

    Falls back to torch when the ONNX file is absent, so a checkout whose encoder was fetched before this
    change still scores rather than crashing — and the fallback is the ORIGINAL code path, so the two
    cannot disagree by construction.
    """
    import numpy as np
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(encoder_root, local_files_only=True)
    onnx_path = Path(encoder_root) / "onnx" / "model.onnx"
    if not onnx_path.exists():
        return _torch_encode(texts, encoder_root, max_length, tokenizer)

    import os

    import onnxruntime as ort

    # Set the thread count EXPLICITLY. Left unset, onnxruntime pins each worker thread to a core, and
    # `pthread_setaffinity_np` fails inside an LXC container, which restricts CPU affinity. That is one
    # `E:` line per session -- so on the lab container it would be logged on every scoring call, and an
    # error-level line that is always present is one nobody reads when it matters.
    #
    # Evidence-neutral, measured rather than assumed: the same 56 role/name phrases encode to
    # BIT-IDENTICAL float32 at 1, 2 and 4 threads (max abs diff 0.000e+00), so this changes log noise
    # and nothing that reaches the trained heads or the thresholds calibrated against them.
    options = ort.SessionOptions()
    options.intra_op_num_threads = os.cpu_count() or 1

    session = ort.InferenceSession(
        str(onnx_path), sess_options=options, providers=["CPUExecutionProvider"]
    )
    wanted = {spec.name for spec in session.get_inputs()}
    out = []
    for start in range(0, len(texts), 16):
        batch = tokenizer(
            texts[start : start + 16], padding=True, truncation=True,
            max_length=max_length, return_tensors="np",
        )
        feed = {name: batch[name] for name in wanted if name in batch}
        hidden = session.run(None, feed)[0]
        mask = batch["attention_mask"][..., None].astype(np.float32)
        pooled = (hidden * mask).sum(1) / np.clip(mask.sum(1), 1e-9, None)
        out.append(pooled / np.linalg.norm(pooled, axis=1, keepdims=True))
    return np.concatenate(out) if out else np.zeros((0, 384), dtype=np.float32)


def _torch_encode(texts: list[str], encoder_root: Path, max_length: int, tokenizer):
    """The original encoder pass, kept as the fallback for a checkout with no ONNX file."""
    import numpy as np
    import torch
    from transformers import AutoModel

    encoder = AutoModel.from_pretrained(encoder_root, local_files_only=True, use_safetensors=True)
    encoder.eval()
    out = []
    with torch.no_grad():
        for start in range(0, len(texts), 16):
            batch = tokenizer(
                texts[start : start + 16], padding=True, truncation=True,
                max_length=max_length, return_tensors="pt",
            )
            hidden = encoder(**batch).last_hidden_state
            mask = batch["attention_mask"].unsqueeze(-1).expand(hidden.size()).float()
            pooled = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
            out.append(torch.nn.functional.normalize(pooled, p=2, dim=1).numpy())
    return np.concatenate(out) if out else np.zeros((0, 384), dtype=np.float32)


def structured_features(records: list[dict[str, Any]]) -> Any:
    """The 29 engineered features, as float32 numpy.

    NUMPY rather than torch, and the whole inference path follows: torch is a 400 MB wheel that measured
    102 s to install in the GitHub Action — 34% of a cold run — to compute a frozen 6-layer encoder and
    fourteen dot products. Nothing here needs autograd; the encoder is frozen and the heads are already
    trained. The trainer, which does need autograd, converts at its own boundary.

    One featurizer still, which is the part that matters. Train and inference must not drift, and the way
    that is guaranteed is that both call THIS function rather than each keeping a copy in its own dtype.
    """
    import numpy as np

    feature_array = np.array(
        [[values[name] for name in FEATURE_NAMES] for values in map(structured_feature_values, records)],
        dtype=np.float32,
    )
    multipliers = np.array(
        [ENGINEERED_FEATURE_MULTIPLIERS.get(name, 1.0) for name in FEATURE_NAMES],
        dtype=np.float32,
    )
    return feature_array * np.float32(ENGINEERED_FEATURE_SCALE) * multipliers

def assert_encoder(root: Path) -> Path:
    unsafe = sorted(
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file() and (path.is_symlink() or path.suffix.lower() in UNSAFE_SUFFIXES)
    )
    model_file = root / "model.safetensors"
    if unsafe:
        raise RuntimeError("encoder contains unsafe files: " + ", ".join(unsafe))
    if not model_file.is_file():
        raise RuntimeError(f"encoder is missing {model_file}")
    return model_file

def head_key(subtype: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9]+", "_", subtype).strip("_")
    return "subtype_" + safe

def score_head(features: Any, weight: Any, bias: Any) -> Any:
    """Sigmoid of the head's logit, for numpy OR torch inputs.

    ONE formula, deliberately. The matmul is written once and works for both, because torch tensors and
    numpy arrays share `@` and `.T`; only the activation needs to differ, and that is two lines rather
    than a second copy of the scoring rule. Inference passes numpy so the Action needs no torch; the
    trainer passes torch tensors so autograd reaches the weights.

    Writing two functions here is the obvious alternative and is exactly the drift this module exists to
    prevent: a subtly different aggregation on each side produces plausible numbers and wrong findings.
    """
    logits = (features @ weight.T + bias)[:, 0]
    if hasattr(logits, "sigmoid"):
        return logits.sigmoid()  # torch, and it keeps the graph
    import numpy as np

    return 1.0 / (1.0 + np.exp(-logits))

# Which subtypes are scored per ANNOUNCEMENT rather than per capture, and why it is per subtype.
#
# Measured both ways on the same corpus. Instance-max scoring took 4.1.2's heads to precision 0.98 /
# 0.89 / 0.97 -- because "a control announced with a role and no name" is entirely contained in ONE
# announcement ("edit", with nothing after it) and needs no other line to judge.
#
# The same change took 2.4.6 from precision 0.51 to 0.30. Whether "Welcome" is a vague heading depends
# on what the page is ABOUT; scoring that announcement in isolation strips away the context that makes
# vagueness judgeable. For contextual criteria the document view is the correct representation, and
# mean-pooling was never their problem.
#
# So pooling is a property of the SIGNAL, not of the pipeline. Local findings pool by max over
# instances; contextual findings keep the whole capture. Default is document-mean: only subtypes with
# evidence that instance scoring helps are listed here.
# `4.1.2:missing-role` stays instance-max, and the alternative was MEASURED rather than reasoned about.
#
# The argument for moving it to document-mean was good and half of it was right. Instance-max cannot
# express an ABSENCE: there is no announcement carrying the evidence, because the evidence IS that no
# such announcement exists, and all 74 of this subtype's records have `formFields: []` and
# `controls: []`. Document-mean can see the whole capture, and recall duly went 0.809 -> 1.000.
#
# But precision went 1.000 -> 0.782, taking 4.1.2's grouped calibration from FP 2 / FN 13 to FP 21 /
# FN 0. That is the predicted cost: 437 of the corpus's 1,003 CONFORMANT records also announce no
# controls, because a page about images or tables has none either. The document view can represent
# "nothing was announced" and cannot tell it apart from "there was nothing to announce".
#
# So neither view is right, and the choice is between error TYPES. For this tool a false accusation on
# a conformant page is the worst error it can make, which is why the judge suppresses the model where a
# rule already decides. 14 misses at precision 1.000 beats 21 false alarms.
#
# What this subtype actually needs is a FEATURE that separates "a page that should have a control here"
# from "a page with no controls at all" -- the bad variant is a styled div announced as plain text where
# a button belongs. That is a different piece of work from choosing a pooling view, and this comment
# exists so nobody re-runs the pooling experiment expecting a different answer.
#
# ## 3.3.2:unnamed-form-field, added 2026-08-23 — the OPPOSITE direction, deliberately
#
# The paragraphs above warn against re-running the pooling experiment expecting a different answer. That
# experiment moved 4.1.2 from instance-max TO document-mean and measured the cost: precision 1.000 -> 0.782,
# FP 2 -> FP 21. This is the reverse move on a different subtype, and it is that measurement being USED
# rather than ignored: the recorded evidence is that instance-max buys precision and costs recall, and
# 3.3.2 has a precision problem — 8 false accusations on conformant pages, against 0 misses.
#
# Why the average is the wrong question here. A CONFORMING field page announces its field twice: bare when
# focus lands ("edit, Example value") and again with its label ("Company name, edit, Example value"). A mean
# over both lands between them, so which side of the cut a clean page falls on is decided by 384 encoder
# dimensions (|w| sum 248.0) rather than by the 29 document features (|w| sum 5.98) that say plainly
# `form_field_named=1`. "Is there an unnamed field on this page?" is an existence question and a mean
# answers a different one.
#
# Note what was tried first and did NOT work, so nobody repeats it: raising `form_field_named`'s multiplier
# from 2.0 to 6.0. The head simply learned a weight a third the size (-0.2316 -> -0.0717) and the effective
# contribution was unchanged (-0.4632 -> -0.4303). Scaling an input cannot strengthen a relation in a linear
# head, because gradient descent compensates. That applies to every entry in
# ENGINEERED_FEATURE_MULTIPLIERS, which is worth knowing before reaching for one again.
#
# ## 1.3.1:fake-heading, added 2026-08-23 — a rare signal averaged away by page size
#
# Measured: 88 development positives at recall 0.55 (threshold 0.95, FP 0), against 10 of 10 on the
# held-out set. The gap is not difficulty in the failure, it is difficulty in the PAGE: 63 of the 88
# positives are accompaniment-derived and sit on pages averaging 52.3 announcements, while the dedicated
# fake-heading pages average 41.6. A document mean gives one fake heading among 52 lines a 1/52 share; the
# same failure on a focused page dominates its own mean. The head is being diluted by page length.
#
# The reverse move on 4.1.2 recorded what to expect: instance-max -> document-mean cost precision
# 1.000 -> 0.782, FP 2 -> FP 21. So instance-max BUYS precision, and this head has precision to spare
# (FP 0) and recall to gain (0.55). Note this is the opposite situation to `3.3.2:unnamed-form-field`
# earlier the same day, where switching pooling changed nothing: there both views fired on a bare edit that
# was genuinely present, so there was nothing to dilute. Rare-signal dilution is the case max is for.
INSTANCE_POOLED_SUBTYPES = frozenset({
    "4.1.2:missing-role",
    "4.1.2:unnamed-control",
    "4.1.2:state-change-silent",
    "3.3.2:unnamed-form-field",
    "1.3.1:fake-heading",
})


def pooling_for(subtype: str) -> str:
    return "instance-max" if subtype in INSTANCE_POOLED_SUBTYPES else "document-mean"


def encode_documents(records: list[dict[str, Any]], encoder_root: Path, max_length: int) -> tuple[Any, list[int]]:
    """The whole-capture view: every announcement joined and encoded as ONE sequence.

    A SECOND encoder pass, deliberately, and not a mean over the per-unit embeddings — that was tried
    and left 2.4.6 at 48 false negatives against 22 for this view. The difference is cross-unit
    ATTENTION: joining the text lets the transformer relate one announcement to another, which is
    precisely what a contextual criterion needs. Whether "Welcome" is a vague heading depends on what
    the rest of the page says, and encoding units independently destroys that relationship before any
    averaging can happen. Pooling after the fact cannot restore information the encoder never saw.

    Returned with identity offsets so a document-pooled head runs through the same `score_bags` path as
    an instance-pooled one -- a capture is a bag of one. Same arithmetic, no branching.
    """
    import numpy as np

    texts = ["\n".join(unit_texts(record)) for record in records]
    text_features = _onnx_encode(texts, encoder_root, max_length)
    features = np.concatenate([text_features, structured_features(records)], axis=1)
    return features, list(range(len(records) + 1))


def candidate_unit_flags(record: dict[str, Any]) -> list[float]:
    """1.0 for each evidence unit that IS the plain-heading candidate, aligned with `unit_texts`.

    ## Why a per-instance feature exists at all
    #
    Every other structured feature is document-level and `np.repeat`-ed onto all of a capture's rows, so
    under instance-max pooling it is a constant the head cannot use to tell one announcement from another.
    `plain_heading_candidate_present` therefore said "somewhere on this page a section title has no role"
    and never "THIS line is one" — and the head had to identify the line from the embedding alone.

    Measured 2026-08-24 on three structurally IDENTICAL pages — same announcements, same feature values,
    same shape, differing only in wording:

        "Opening hours"        0.9899   caught
        "Lending conditions"   0.9902   caught
        "Collection deposits"  0.6120   missed, threshold 0.90

    The head ranked the correct announcement top on all three; only its CONFIDENCE moved, and it moved with
    vocabulary. That is why doubling the positives raised development recall and left the held-out misses
    untouched: more phrases, not more structure.

    Alignment matters more than the flag. `unit_texts` emits one row per evidence unit as
    "channel: text", and the candidate relation is computed over adjacent TRANSCRIPT lines, so the flag is
    matched back by channel and text. A misalignment here would attach the flag to the wrong announcement,
    which is worse than not having it.
    """
    units = record["input"].get("evidenceUnits", [])
    transcript = record["input"].get("transcript") or []
    candidates = {
        value.strip()
        for index, value in enumerate(transcript[:-1])
        if plain_heading_candidate(value, transcript[index + 1])
    }
    flags = [
        float(unit.get("channel") == "transcript" and str(unit.get("text", "")).strip() in candidates)
        for unit in units
        if isinstance(unit.get("text"), str)
    ]
    # `unit_texts` falls back to a single empty row for a unit-less capture; match it or every bag after
    # this one is misaligned.
    return flags or [0.0]


def unit_texts(record: dict[str, Any]) -> list[str]:
    """The channel-tagged announcements of one capture — the INSTANCES of its bag.

    A capture is a bag and it fails if AT LEAST ONE announcement is bad, which is the multiple-instance
    learning setup. Kept as its own function so training and inference cannot disagree about what an
    instance is; the empty fallback keeps a unit-less capture occupying exactly one row, or every bag
    after it would be misaligned.
    """
    texts = [
        f"{unit.get('channel', 'evidence')}: {unit['text']}"
        for unit in record["input"].get("evidenceUnits", [])
        if isinstance(unit.get("text"), str)
    ]
    return texts or [""]


def bag_offsets(records: list[dict[str, Any]]) -> list[int]:
    """Row boundaries of each record's instances in the flat feature matrix.

    A PURE function of the records, deliberately: the trainer and the scorer each derive this from the
    same records rather than passing it between them, so the two cannot drift. Returns N+1 offsets, so
    record i owns rows [offsets[i], offsets[i + 1]).
    """
    offsets, total = [0], 0
    for record in records:
        total += len(unit_texts(record))
        offsets.append(total)
    return offsets


def bag_gather(offsets: list[int]) -> tuple[Any, Any]:
    """A padded [records x longest_bag] index matrix and its validity mask.

    Pooling by slicing each bag in a Python loop is correct but ruinous inside a training loop: the
    trainer runs ~21,000 epochs across its heads and folds, so 2,000 slices per epoch became ~42
    million and a two-minute train ran past forty minutes. One gather plus one max over a padded
    matrix is the same arithmetic, vectorised, and stays differentiable so the gradient still reaches
    each bag's argmax instance.

    Padded positions index row 0 and are masked to -inf before the max, so they can never win.
    """
    import numpy as np

    # Numpy, unconditionally: these are INDICES, not values, so nothing here ever needs a gradient, and
    # inference must stay torch-free. Torch indexes happily with a numpy array, but `masked_fill` requires
    # a real Tensor mask -- so the TRAINER converts both at its own boundary (`bag_gather_tensors`), the
    # same way it converts the feature matrix. Do not convert here; that would import torch into inference.
    sizes = [end - start for start, end in zip(offsets[:-1], offsets[1:])]
    widest = max(sizes) if sizes else 1
    gather = np.zeros((len(sizes), widest), dtype=np.int64)
    mask = np.zeros((len(sizes), widest), dtype=bool)
    for row, (start, size) in enumerate(zip(offsets[:-1], sizes)):
        gather[row, :size] = np.arange(start, start + size)
        mask[row, :size] = True
    return gather, mask


def score_bags(features: Any, offsets: list[int], weight: Any, bias: Any) -> Any:
    """Score every instance, then take the MAX within each bag. One score per record.

    This is the single symmetry point between training and inference: both route through it, and
    nothing else may pool. A subtly different aggregation on each side produces plausible numbers and
    wrong findings, which is the failure mode that matters here.

    Max, not mean: mean-pooling is what broke this. A good/bad pair for 2.4.6 differs by one word in
    27 announcements, and averaging drove it below the representation's resolution -- precision 0.51 at
    recall 1.0, i.e. the head could not see the signal at all. Max also encodes the semantics
    literally ("at least one") and names the announcement responsible, which this tool needs as the
    evidence it cites for a finding.

    Element-wise max over unit EMBEDDINGS was tried first and is not the same thing: it saturates into
    an envelope of the bag's variety and destroys instance identity. The max must be over SCORES.
    """
    gather, mask = bag_gather(offsets)
    unit_scores = score_head(features, weight, bias)
    # The gather and the masking rule are shared; only the reduction differs, because torch must keep the
    # graph and numpy must not import torch at all. Same arithmetic either way: padded positions are forced
    # to -inf so they can never win the max.
    if hasattr(unit_scores, "masked_fill"):
        import torch

        return unit_scores[torch.as_tensor(gather)].masked_fill(
            ~torch.as_tensor(mask), float("-inf")
        ).max(dim=1).values
    import numpy as np

    return np.where(mask, unit_scores[gather], -np.inf).max(axis=1)


def encode_records(records: list[dict[str, Any]], encoder_root: Path, max_length: int) -> Any:
    import numpy as np

    # One row per EVIDENCE UNIT, not per record. This used to join every announcement into a single
    # string and mean-pool its tokens -- two dilutions stacked -- so a one-word difference in a
    # 27-line capture was averaged away before any head saw it. `score_bags` collapses these rows back
    # to one score per record by taking the max within each bag.
    #
    # The STRUCTURED block stays document-level and is repeated across the bag. Those 29 values are
    # cross-channel facts and several are genuinely not computable from a single announcement --
    # `validation_error_announced` ORs postSubmitFields with formChanges, and
    # `plain_heading_candidate_present` needs adjacent transcript pairs. Repeating them keeps every
    # instance able to see them, keeps FEATURE_NAMES untouched, and keeps the head 413 wide, so the
    # head shape and the width assertion in score.py are unchanged. Only how OFTEN the head runs moved.
    bags = [unit_texts(record) for record in records]
    flat = [text for bag in bags for text in bag]
    text_features = _onnx_encode(flat, encoder_root, max_length)
    counts = [len(bag) for bag in bags]
    structural = np.repeat(structured_features(records), counts, axis=0)
    # The one column that is NOT the same for every row of a capture. Written after the repeat so the
    # document values are unchanged and only this is per-instance — and scaled the same way, because a
    # feature that skipped the scale would sit on a different footing from its neighbours.
    candidate_column = FEATURE_NAMES.index("unit_is_plain_heading_candidate")
    flags = np.array([flag for record in records for flag in candidate_unit_flags(record)], dtype=np.float32)
    if flags.shape[0] != structural.shape[0]:
        raise RuntimeError(
            f"candidate flags ({flags.shape[0]}) do not align with instances ({structural.shape[0]}); "
            "attaching the flag to the wrong announcement is worse than not having it"
        )
    structural[:, candidate_column] = flags * ENGINEERED_FEATURE_SCALE
    # 384 is MiniLM-L6-v2's hidden size, stated rather than read from a loaded torch model — reading it
    # from `encoder.config` was the last thing forcing the torch model to be constructed at inference.
    # `score.py` asserts the head is 413 wide, so a wrong value here fails loudly rather than silently.
    return np.concatenate([text_features, structural], axis=1), text_features.shape[1], len(FEATURE_NAMES)
