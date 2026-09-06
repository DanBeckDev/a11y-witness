"""A `0` must not be able to mean both "the page has none" and "nothing looked".

Every structured feature is `float(bool(channel))` and `any([])` is `False`, so an empty channel reads
identically whether the page genuinely had nothing or the probe never ran. Measured on the authoritative
corpus by `corpus:observation-ambiguity`: **61.7% of empty `formChanges`, 56.1% of empty `postSubmitFields`
and 65.3% of the `formControl` sweep are the second**. A head can therefore take a large negative weight on
a CAPTURE CONDITION at no cost, which is ADR 0015's whole subject -- and `landmark_present` was DELETED for
exactly this, 16 of its 16 zeros being truncated sweeps.

Two routes were closed before this one, and the tests below are written to refuse both:

- **Masking** was refuted -- it cost a real finding (`not-working`).
- **Giving the model `observed` as its own column** was declined, because "was this asked" then becomes a
  separable signal the head can key on directly.

So the fact is CROSSED with whether it was measured. CLAUDE.md's 2.4.4 post-mortem states the constraint the
encoding has to satisfy -- *"A ZERO CANNOT VETO, so 'A and not B' must be computed, never handed over as two
features ... A linear head only ADDS"* -- and *Low-Code AI* names the construction a feature cross.

|  | `..._observed_present` | `..._observed_absent` |
|---|---|---|
| asked, page has it | 1 | 0 |
| asked, page has none | 0 | 1 |
| **never asked** | **0** | **0** |

The third row is the point: it is REPRESENTABLE, and it carries no weight of its own.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from screenreader_features import FEATURE_NAMES, structured_feature_values  # noqa: E402


# `structured_feature_values` reads `record["input"]`; `observation` is a deliberate SIBLING of it, so the
# model boundary (`assertModelBoundary`, which forbids `dom`/`html`/`css`/`axe`) is untouched by this.
def record(*, state_changes=None, form_changes=None, post_submit=None, observed=None):
    return {
        "input": {
            "transcript": ["Settings, document"],
            "structure": {"headings": [], "formFields": [], "tableCells": []},
            "interaction": {
                "controls": ["Menu, button"],
                "stateChanges": state_changes if state_changes is not None else [],
                "formChanges": form_changes if form_changes is not None else [],
                "postSubmitFields": list(post_submit or []),
            },
            "evidenceUnits": [{"channel": "transcript", "text": "Settings, document"}],
            "evidenceText": "Settings, document",
            # REQUIRED, never optional -- `parsed_units` refuses a capture without it rather than falling
            # back to regex parsing, because a silent fallback would keep producing numbers that are wrong
            # only on the pages nobody wrote.
            "parsed": {
                "transcript": [], "headings": [], "tableCells": [], "formFields": [],
                "postSubmitFields": [], "controls": [
                    {"containers": [], "leaving": [], "objects": [
                        {"name": "Menu", "role": "button", "states": []}]}],
            },
        },
        **({"observation": observed} if observed is not None else {}),
    }


CHANGED = [{"control": "Menu, button", "before": "collapsed", "after": "expanded"}]
UNCHANGED = [{"control": "Menu, button", "before": "collapsed", "after": "collapsed"}]
FORM = [{"kind": "submit", "control": "Send, button", "before": "", "after": "Error: name is required"}]

POST = ["Email, edit, Error: enter an address"]

# `stateChanges` is DELIBERATELY not here. It has no `observed` entry and needs none -- the disclosure
# probe is not gated on `probeForms`, so an empty channel means one thing. Crossing it produced two
# constant-zero columns, and `test_crossed_columns_name_a_real_channel.py` now refuses that directly.
# `postSubmitFields` is DELIBERATELY not here either, and it was withdrawn for a DIFFERENT reason from
# `stateChanges` above -- the two look alike and need opposite remedies. There the CHANNEL was missing; here
# the channel is real and one of the pair's two OUTCOMES cannot occur. `asked and absent` needs a submit
# that navigates to a fieldless confirmation, which needs a `formState`, and `CASES` declares one on ZERO
# of 1,645 cases. `test_crossed_columns_are_not_constant.py` measures that over the real captures, and
# `screenreader_features.py`'s call site carries the full record.
CROSSED = (
    ("form_change_observed_present", "form_change_observed_absent"),
)
ASKED = {"formChanges": True, "postSubmitFields": True}
NOT_ASKED = {"formChanges": False, "postSubmitFields": False}


def test_the_crossed_columns_exist_and_are_scored():
    for present, absent in CROSSED:
        assert present in FEATURE_NAMES, f"{present} is not a model input, so this test examines nothing"
        assert absent in FEATURE_NAMES, f"{absent} is not a model input, so this test examines nothing"


def test_asked_and_present_fires_only_the_present_column():
    values = structured_feature_values(
        record(form_changes=FORM, post_submit=POST, observed=ASKED)
    )
    for present, absent in CROSSED:
        assert values[present] == 1.0, present
        assert values[absent] == 0.0, absent


def test_asked_and_absent_fires_only_the_absent_column():
    # The row that carries a REAL finding: we activated a control and it announced nothing. Today this is
    # indistinguishable from the row below, and that is the defect.
    values = structured_feature_values(
        record(form_changes=[], post_submit=[], observed=ASKED)
    )
    for present, absent in CROSSED:
        assert values[present] == 0.0, present
        assert values[absent] == 1.0, absent


def test_never_asked_is_the_all_zeros_row():
    # Not a third VALUE and not a mask -- the absence of both. A linear head only adds, so a row of zeros
    # contributes nothing, which is precisely the right contribution from a capture that did not look.
    values = structured_feature_values(
        record(form_changes=[], post_submit=[], observed=NOT_ASKED)
    )
    for present, absent in CROSSED:
        assert values[present] == 0.0, present
        assert values[absent] == 0.0, absent


def test_a_record_exported_before_observation_existed_reads_as_never_asked():
    # The conservative direction, and it has to be this one. A record with no `observation` sibling
    # contributes no signal here rather than a wrong one -- so the corpus can carry both populations during
    # a migration without the older half asserting something false.
    values = structured_feature_values(record(form_changes=[], post_submit=[]))
    for present, absent in CROSSED:
        assert values[present] == 0.0, present
        assert values[absent] == 0.0, absent


def test_asked_and_absent_differs_from_never_asked():
    # The whole claim, stated as a difference. A test that could not tell these two apart would pass
    # against the very encoding it exists to replace -- which is how `landmark_present` survived to be
    # deleted rather than fixed.
    asked = structured_feature_values(
        record(form_changes=[], post_submit=[], observed=ASKED)
    )
    never = structured_feature_values(record(form_changes=[], post_submit=[]))
    assert [asked[name] for pair in CROSSED for name in pair] != [never[name] for pair in CROSSED for name in pair]
    # And the UNCROSSED features must still read identically on both, because nothing about them changed.
    # If they differ, this change was not additive and 28 consumers of those channels are affected.
    for name in ("state_change_present", "state_changed", "form_change_present", "post_submit_present"):
        assert asked[name] == never[name], f"{name} moved; the cross was supposed to be additive"


def test_the_cross_reads_the_channel_and_not_merely_the_flag():
    # `observed` must never become a separable signal. If `..._observed_present` fired on `asked` alone it
    # would BE the declined "give the model `observed`" design wearing a crossed name -- so it is asserted
    # to depend on the channel with the flag held constant.
    asked_present = structured_feature_values(record(form_changes=FORM, observed=ASKED))
    asked_empty = structured_feature_values(record(form_changes=[], observed=ASKED))
    assert asked_present["form_change_observed_present"] != asked_empty["form_change_observed_present"]


def test_a_form_change_with_an_empty_after_is_present_not_absent():
    # A submit that was REJECTED SILENTLY is the 3.3.1 finding, and it lives in a `formChanges` entry whose
    # `after` is empty -- not in an empty channel. Reading the entry as absent would file a real finding in
    # the "page has none" row, which is the inversion `probeDisclosure`'s catch was written to stop.
    silent = [{"kind": "submit", "control": "Send, button", "before": "", "after": ""}]
    values = structured_feature_values(record(form_changes=silent, observed=ASKED))
    assert values["form_change_observed_present"] == 1.0
    assert values["form_change_observed_absent"] == 0.0


def test_a_capture_that_contradicts_itself_reads_as_uninterpretable():
    """`asked: false` beside a channel that has content is INCOHERENT, and both columns stay at zero.

    This row is what the conjunction on `..._observed_present` is for, and without this test that
    conjunction is unobservable: reverting it to the old `float(bool(channel))` leaves every other
    assertion here passing. That is the shape this whole change exists to refuse -- a guard that examines
    nothing -- so it is asserted rather than reasoned about.

    Which way to resolve it is a real choice and the answer is "neither column". A capture whose two
    records of one probe disagree cannot be read as *either* "the page has it" or "the page has none", and
    the all-zeros row already means exactly "this capture cannot say". It is reachable in practice because
    `stateChanges` is written by more than one probe -- the disclosure probe runs unconditionally while
    `probeForms` is gated -- so a channel can gain content from a path `observed` did not record.
    """
    values = structured_feature_values(record(form_changes=FORM, observed={"formChanges": False}))
    assert values["form_change_observed_present"] == 0.0
    assert values["form_change_observed_absent"] == 0.0
