// command: (not a command) the ONE parser for a review verdict comment; imported, never retyped.

/**
 * #1245: READ A REVIEW VERDICT, IN ONE PLACE.
 *
 * `git grep -ln convinced` returned six files before this one and all six were PROSE. Every session that
 * needed to know whether a PR carried a verdict retyped a matcher inside its own prompt, and **two of them
 * already disagreed**: `ceo`'s heartbeat matched `(un)?convinced`, the clock matched a bare `convinced`.
 * Both matched the same comment; one classified it correctly and one read a REFUSAL AS AN APPROVAL.
 *
 * THAT IS THE FAILURE DIRECTION THAT MATTERS. A refusal read as an approval merges; an approval read as
 * absent stalls. Nothing happening is visible and the wrong thing happening silently is not -- so the
 * boundary below is not tidiness, it is the difference between the two.
 *
 * AND IT HAS BITTEN IN BOTH DIRECTIONS IN ONE MORNING. `worker-judge` wrote `UNCONVINCED`, which a
 * case-insensitive substring read as an approval; their own `[Cc]onvinced` check then failed to see a
 * real `CONVINCED` and reported a verdict that had stood for thirty minutes as absent. One convention,
 * two ad-hoc readers, two opposite wrong answers.
 */

/**
 * Verdict words this parser knows, longest first so `unconvinced` is never read as `convinced`.
 *
 * THE ADVERB GAP, found by `worker-capture` on review: `not\s+convinced` requires ADJACENCY, so
 * "not yet convinced" and "I am not entirely convinced" matched the bare word and read as APPROVALS —
 * the exact direction this file exists to stop. My own fixture put the adverb AFTER ("not convinced
 * yet"), which is the phrasing that survives adjacency; the one that breaks it is the adverb BEFORE.
 *
 * LATENT RATHER THAN LIVE, measured: across the 40 most recent PRs and 64 comments, `not <word>
 * convinced` appears 0 times. **That is exactly what was true of `UNCONVINCED` until yesterday.**
 *
 * THE THREE-WORD BOUND IS A CHOICE, NOT AN OVERSIGHT. Unbounded `.*?` swings the failure the other way:
 * it would read "I am not going to pretend I am convinced by the first draft, but at this head:
 * convinced" as a refusal. Three words covers the adverbs people write and leaves "this does not mean
 * the reviewer was convinced" reading as `convinced`, which is right.
 */
const WORDS = /\b(un-?convinced|not\s+(?:\w+\s+){0,3}convinced|convinced)\b/i;

/** An opener that says a comment is a VERDICT at all. Three are in use; the fourth is already coming. */
const OPENER = /\b(?:Review|Re-read)\s+(?:of|at)\b/i;

/**
 * #1259: THE HEAD AND THE AUTHOR, READ FROM THE VERDICT'S OWN OPENER LINE AND NOWHERE ELSE.
 *
 * A clock does not ask "is there a verdict" but "is there a verdict AT THIS HEAD, FROM A REVIEWER WHO IS NOT
 * ME". The word had one parser (#1245); the other two fields were still retyped per session, and on #1244 a
 * genuine `Re-read of \`94d6e948\` — **convinced**.` stalled a PR for thirty minutes because it named no
 * author and a hand-typed matcher required one.
 *
 * ONLY THE OPENER LINE, because a verdict's body routinely quotes other shas and other people ("my first
 * not-convinced at `84aa8c0f`", "found by worker-capture"), and a field read from the body would be a
 * confident wrong answer where the absent one is at least visible.
 *
 * ABSENT IS `null`, AND IT IS RETURNED, NEVER DEFAULTED. A clock that read a missing author as "someone else"
 * would mark a PR ready on its author's own comment; `null` makes that caller decide.
 */
const HEAD = /`([0-9a-f]{7,40})`/i;
const AUTHOR = /\bby\s+`?([A-Za-z][\w-]*)`?/;

/**
 * #1324: EACH FIELD PREFERS THE CONVENTION'S OWN SPELLING, AND FALLS BACK TO THE FIRST MATCH ABOVE.
 *
 * `**Review of #1301 (ci run \`34764381448\`) at \`b2fa1fa6\`, prompted by ceo, by worker-x: convinced.**`
 * read as head `34764381448` and author `ceo`. The run id fails closed (no such head); the author fails OPEN,
 * because a clock asking "is this verdict from someone other than the PR's author" sees `ceo` on worker-x's
 * own verdict. So the head is the sha after `at`/`of`, and the author is the `by <name>` a colon closes.
 * The fallbacks keep a line written outside the convention readable, and absent still returns `null`.
 */
const HEAD_AFTER_AT = /\b(?:at|of)\s+`([0-9a-f]{7,40})`/i;
const AUTHOR_IN_CONVENTION = /,\s*by\s+`?([A-Za-z][\w-]*)`?:/;

/** @param {string} line @param {RegExp[]} patterns @returns {string | null} the first pattern's capture that matches */
function firstCapture(line, patterns) {
  for (const pattern of patterns) {
    const m = pattern.exec(line);
    if (m) return m[1];
  }
  return null;
}

/** @param {string} text @returns {string | null} the first line that opens like a verdict */
function openerLine(text) {
  return text.split("\n").find((line) => OPENER.test(line)) ?? null;
}

/**
 * The verdict a comment carries.
 *
 * `unrecognised` is a RETURNED VALUE, never a silent null: a comment that opens like a verdict and whose
 * word matches nothing known is the next drift arriving, and a parser that answers `null` for it says the
 * same thing it says for a comment that is not a verdict at all. Those are different facts.
 *
 * THIS ANSWERS "WHAT VERDICT DOES THIS COMMENT CARRY", NEVER "IS THIS COMMENT A VERDICT". `OPENER` is
 * consulted only when no word matched, so it can RESCUE an unknown word and can never REJECT a mention:
 * over the same 64-comment corpus the parser calls 4 non-verdicts `convinced`. Gating on the opener would
 * fail worse -- a verdict written without a header would go invisible -- so the limit is stated here
 * rather than closed.
 *
 * `head` and `author` come from the opener line only (#1259) and are `null` when that line does not carry them.
 *
 * @param {string} body
 * @returns {{ verdict: "convinced" | "not-convinced" | "unrecognised" | "none", word: string | null,
 *             head: string | null, author: string | null }}
 */
export function reviewVerdict(body) {
  const text = typeof body === "string" ? body : "";
  const opener = openerLine(text);
  const head = opener ? firstCapture(opener, [HEAD_AFTER_AT, HEAD]) : null;
  const author = opener ? firstCapture(opener, [AUTHOR_IN_CONVENTION, AUTHOR]) : null;
  const m = WORDS.exec(text);
  if (m) {
    const word = m[0].toLowerCase().replace(/\s+/g, " ");
    // NEGATION IS A SEPARATE MECHANISM FROM THE BOUNDARY, and conflating them is how one gets fixed by
    // breaking the other. `\bconvinced\b` is TRUE for "not convinced yet" and correctly so -- the word IS
    // present. What decides the verdict is which of the three alternatives above matched.
    return { verdict: word === "convinced" ? "convinced" : "not-convinced", word: m[0], head, author };
  }
  return OPENER.test(text)
    ? { verdict: "unrecognised", word: null, head, author }
    : { verdict: "none", word: null, head, author };
}
