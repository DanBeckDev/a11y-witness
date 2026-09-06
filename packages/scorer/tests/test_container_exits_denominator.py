"""`survey()`'s `examined` count used to have no denominator.

A record predating the `parsed` block raises inside `parsed_units` and `survey()` silently `continue`s
past it -- correctly, since a stale copy of `runs/` is a fact about the COPY rather than about the corpus,
the same reasoning `audit_grants.py` and `audit-scorer-shortcuts.py`'s `read_records()` already state. What
was missing here is the comparison: `examined` was printed alone, so a run that silently parsed 3 of 3,000
records looked identical to a full survey -- both are just a bare number. `vague_link_lacks_context`
(rules.ts) is this report's own stated reader, so an unlabelled partial reaches a real correctness decision
the same way `evidence-check`'s founding incident did on the JS side.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

_spec = importlib.util.spec_from_file_location(
    "audit_container_exits", Path(__file__).resolve().parents[1] / "python" / "audit_container_exits.py")
audit_container_exits = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit_container_exits)


def parsed_record(units: list[dict]) -> dict:
    return {"input": {"parsed": {"transcript": units}}}


UNIT_WITH_UNCLOSED_NAV = {"containers": [{"role": "navigation"}], "leaving": []}
UNIT_LEAVING_LIST = {"containers": [], "leaving": ["list"]}


def test_of_reports_the_full_population_the_function_was_handed():
    records = [parsed_record([UNIT_WITH_UNCLOSED_NAV]), {"input": {}}, {"input": {}}]
    report = audit_container_exits.survey(records)
    assert report["examined"] == 1, "two of the three cannot be parsed and must not count as examined"
    assert report["of"] == 3, "the denominator is the population HANDED to survey(), not the examined count"


def test_a_stale_record_does_not_crash_and_is_silently_excluded_from_examined():
    # `{"input": {}}` has no `parsed` key -> RuntimeError from parsed_units(); a bare `{}` has no `input`
    # key at all -> KeyError. Both are the "predates the parse" shape and must both be excluded the same
    # way, not treated as two different faults.
    records = [{"input": {}}, {}]
    report = audit_container_exits.survey(records)
    assert report["examined"] == 0
    assert report["of"] == 2


def test_examined_equals_of_when_every_record_parses():
    records = [parsed_record([UNIT_WITH_UNCLOSED_NAV]), parsed_record([UNIT_LEAVING_LIST])]
    report = audit_container_exits.survey(records)
    assert report["examined"] == report["of"] == 2, "a full survey must read as full, not merely non-zero"


def test_never_left_and_left_still_compute_correctly_alongside_the_new_field():
    records = [parsed_record([UNIT_WITH_UNCLOSED_NAV, UNIT_LEAVING_LIST])]
    report = audit_container_exits.survey(records)
    assert report["neverLeft"] == ["navigation"], "list was entered nowhere but IS in `left`, so it must " \
        "not be reported as a container that was entered and never closed"
    assert report["left"] == {"list": 1}
