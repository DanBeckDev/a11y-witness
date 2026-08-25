""""Does this subtype fire?" must have ONE definition, and nothing may answer it privately.

It had two. `score.py` compared `value >= threshold` in its scoring loop, and
`evaluate-screenreader-acceptance.py` did the same thing again over numpy arrays. Adding the applicability
gate to the first left the second untouched — so the gate was live in the product and absent from the
held-out measurement that judges the product, and the acceptance run went on scoring pages the product
rules inapplicable.

The failure mode is worse than a plain bug. The gate was correct, committed, tested, and produced NO
CHANGE in the number, which reads as "the fix did not work" and argues for abandoning a correct change.
That is `refreshBrowseBuffer` exactly — a remedy reachable from one path, confirmed by results it had no
part in producing — committed here while fixing something else.

So: both files must route through `applicability.decide`, and neither may compare a subtype score to a
threshold itself. Asserted on source text because the alternative is loading a model and scoring a corpus,
and a guard that costs that much is one that does not run.
"""
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]

#: Every file that decides whether a subtype fires. A new one must be added here deliberately.
DECIDERS = [
    REPO / "packages" / "scorer" / "python" / "score.py",
    REPO / "packages" / "lab" / "scripts" / "evaluate-screenreader-acceptance.py",
]

#: A subtype score compared to a threshold without going through the shared decision.
#:
#: DELIBERATELY BLUNT: any `>=` on a line that mentions a threshold. The first version tried to parse the
#: expression -- `>=\s*(float\()?NAME(\[..\])*\.?threshold` -- and its own `(\[[^\]]*\])*` greedily
#: consumed the `["threshold"]` it was hunting for, so it matched nothing and the guard passed while
#: examining nothing. It was caught by mutating the file it guards, which is the only reason it is not
#: still green and useless. A precise pattern that is wrong is worse than a broad one that is right.
BARE_COMPARISON = re.compile(r">=[^\n]*threshold", re.IGNORECASE)

#: ...but only where a SUBTYPE is being decided. Two threshold comparisons in the evaluator are
#: legitimately not decisions and are excluded by SHAPE rather than by an allowlist, because a name-based
#: exemption rots the moment a line moves:
#:
#:   - `metrics()` counts an already-decided 0/1 array against a fixed cut; it is arithmetic over a
#:     verdict somebody else reached, not the verdict.
#:   - the repeat-stability check asks whether ONE head's score crosses its cut between two captures of
#:     the same page. That is a question about determinism, not a finding about a page.
#:
#: Neither names a subtype on the line, and a subtype decision necessarily does.
SUBTYPE_ON_THE_LINE = re.compile(r"subtype", re.IGNORECASE)


def executable(path: Path) -> str:
    """Source with comments stripped — these files explain the defect at length, and a guard a correct
    comment can break is one that gets weakened rather than fixed."""
    return "\n".join(
        line for line in path.read_text(encoding="utf-8").splitlines()
        if not line.lstrip().startswith("#")
    )


def test_the_deciders_are_real_files_so_this_cannot_pass_vacuously():
    for path in DECIDERS:
        assert path.exists(), f"{path} is listed as a decider and does not exist"
        assert len(executable(path)) > 1000, f"{path} read as nearly empty"


def test_every_decider_routes_through_the_shared_decision():
    for path in DECIDERS:
        source = executable(path)
        assert "applicability.decide(" in source, (
            f"{path.name} does not call applicability.decide. Both the product path and the held-out "
            f"evaluator must make the SAME decision, or the gate that judges the product measures "
            f"something the product does not do."
        )


def test_no_decider_compares_a_subtype_score_to_a_threshold_ITSELF():
    offenders = []
    for path in DECIDERS:
        for line in executable(path).splitlines():
            if "applicability.decide" in line:
                continue
            if BARE_COMPARISON.search(line) and SUBTYPE_ON_THE_LINE.search(line):
                offenders.append(f"{path.name}: {line.strip()[:110]}")
    assert offenders == [], (
        "A subtype decision is being made without the shared definition:\n  " + "\n  ".join(offenders)
        + "\n\nUse applicability.decide(subtype, score, threshold, record). A private comparison is how "
          "the applicability gate came to be live in scoring and absent from acceptance."
    )


def test_the_shared_decision_actually_combines_BOTH_halves():
    """A `decide` that ignored either half would satisfy every assertion above."""
    import sys
    sys.path.insert(0, str(REPO / "packages" / "scorer" / "python"))
    import applicability

    with_table = {"input": {"structure": {"tableCells": ["cell"]}}}
    without = {"input": {"structure": {}}}
    subtype = "1.3.1:unassociated-table"

    assert applicability.decide(subtype, 0.9, 0.5, with_table) is True
    assert applicability.decide(subtype, 0.1, 0.5, with_table) is False, "the threshold half is missing"
    assert applicability.decide(subtype, 0.9, 0.5, without) is False, "the applicability half is missing"
