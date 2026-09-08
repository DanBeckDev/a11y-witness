/**
 * Strip JS/TS comments from source text, WITHOUT mangling a string literal that happens to contain `//`.
 *
 * ## Why this exists
 *
 * Several guards across this repo cannot import the thing they check — a Python function, a call site
 * rather than a value, a function with no local harness — so they read the SOURCE FILE and match a regex
 * against it instead. Doing that against raw text is unsound: a comment can contain the exact words the
 * regex is hunting for, so the guard matches its own PROSE rather than the code it is meant to police.
 * Measured three times in one day, on three different guards, each with its own hand-rolled strip:
 *
 *   - `mapping-parity.test.ts` matched `add(..., "conformance")` call sites in `rules.ts`. Every one of
 *     those call sites now sits under a paragraph EXPLAINING why it is `secondary`, and those paragraphs
 *     contain the word "conformance" — so the unstripped source invented call sites that do not exist.
 *   - `probe-results-reach-the-channel.test.ts` sliced `interactionEvidence`'s return body and matched
 *     field names in it. Every field there is commented with why it is conditional, and the comment NAMES
 *     the field — so the guard passed with the real `focusReveal` spread deleted, because the comment
 *     above where it used to be still contained the word.
 *   - A third, caught before it shipped: an extraction anchor matched a SIBLING function's identical
 *     comment, which would have sliced 320 lines across two functions instead of one.
 *
 * Each was found by mutation — deleting the code the guard exists to protect and watching it stay green —
 * never by review, because the guard reads as correct until you ask what it actually saw.
 *
 * ## What this does and does not handle
 *
 * DELIBERATELY NOT A TOKENISER. A guard here is a classifier reading one repo's own source, not a
 * general-purpose JS parser, and the failure mode a full parser would prevent (a comment-shaped sequence
 * inside a REGEX LITERAL, e.g. `/\/\/ not a comment/`) has not been observed in any guard this function
 * replaces. Building one to close a gap nobody has hit is the over-engineering this exists to avoid — but
 * the two gaps that WOULD recur without care are handled properly, because both were the reason each
 * hand-rolled version above existed in the first place:
 *
 *   - `//` and `/* ... *\/` sequences INSIDE a string literal (`'`, `"`, or a template literal) are left
 *     alone. `"https://example.com"` survives whole; a naive `source.replace(/\/\/.*$/gm, "")` would cut
 *     it to `"https:` and corrupt everything the regex reads after it on that line.
 *   - An ESCAPED quote inside a string (`"say \\"hi\\""`) does not end the string early, so a comment
 *     marker appearing later on the same source line, genuinely outside the string, is still stripped.
 *
 * WHAT IS NOT HANDLED, stated rather than left to be discovered by a future mutation: a comment INSIDE an
 * interpolated expression (`` `${/* oops *\/ x}` ``) is not stripped — the interpolation's CONTENT is
 * copied through verbatim, comments included, same as any other string content. And a regex literal is
 * not distinguished from a division operator — telling them apart needs knowing whether the previous
 * token expects a value, which is real parsing — so `/\/\// ` read as a regex literal containing two
 * slashes would be misread as comment syntax.
 *
 * WHAT IS NOW HANDLED, having stopped being hypothetical: a NESTED template literal inside an
 * interpolation (`` `${cond ? `a` : `b`}` ``) used to corrupt the OUTER literal's own end — the scan for
 * its closing backtick stopped at the inner literal's opening one instead, silently swallowing every real
 * line of code after it into what the scanner believed was still string content. Measured for real on
 * `scripts/select-changed-tests.mjs`'s `console.log`, whose interpolation was a ternary between two
 * template literals: the rest of `main()`, including a real `refuseUnknownFlags(` call, vanished from the
 * stripped output, and a census reading it reported an already-guarded file as unguarded. `skipInterpolation`
 * now walks an interpolation as real code — strings, nested templates and comments included — so brace
 * depth is counted only where it is genuinely code, and the outer literal's true end is found regardless
 * of what its interpolation contains. This is exactly the shape a guard's own anti-vacuity assertion
 * exists to catch, and it did: on the first real file shaped this way, not by review.
 *
 * Line comments are recognised only where `//` is not inside a string, matching what every guard that used
 * to hand-roll this actually needed — including a `//` that follows real code on the same line, which one
 * of the three hand-rolled versions this replaces did not strip at all.
 */
/** Index just past the end of a `//` line comment starting at `i` — the newline itself, or `source.length`. */
function endOfLineComment(source: string, i: number): number {
  let j = i;
  while (j < source.length && source[j] !== "\n") j += 1;
  return j;
}

/** Index just past the closing star-slash of a block comment starting at `i`. Tolerates an unterminated one. */
function endOfBlockComment(source: string, i: number): number {
  let j = i + 2;
  while (j < source.length && !(source[j] === "*" && source[j + 1] === "/")) j += 1;
  return j + 2; // past the closing delimiter; harmless if unterminated and j already reached source.length
}

/**
 * Index just past the matching `}` of a `${` interpolation, given `i` pointing at the `{` itself.
 *
 * WITHOUT THIS, a template literal containing a NESTED template literal in its interpolation —
 * `` `${cond ? `a` : `b`}` `` — corrupts everything scanned afterward. `copyStringLiteral`'s own loop looks
 * for the next literal backtick to end the OUTER string; the first backtick it meets is the INNER
 * literal's opening one, so it closes there instead, and the true outer close is never found. Measured for
 * real on `select-changed-tests.mjs`'s `console.log` call (a ternary of two template literals inside one
 * interpolation): the entire `main()` function body after it — including a real `refuseUnknownFlags(` call
 * — was swallowed into what the scanner believed was still inside the FIRST string, and a census reading
 * the stripped output reported an already-guarded file as unguarded. This walks the interpolation as real
 * code — honouring nested strings/templates (recursively, via `copyStringLiteral` itself) and comments —
 * so brace depth is only counted OUTSIDE of them, and the true matching `}` is found regardless of what it
 * contains.
 */
function skipInterpolation(source: string, i: number): number {
  let depth = 1;
  let j = i + 1;
  while (j < source.length && depth > 0) {
    const ch = source[j];
    const next = source[j + 1];
    if (ch === "{") { depth += 1; j += 1; continue; }
    if (ch === "}") { depth -= 1; j += 1; continue; }
    if (ch === "/" && next === "/") { j = endOfLineComment(source, j); continue; }
    if (ch === "/" && next === "*") { j = endOfBlockComment(source, j); continue; }
    if (ch === "'" || ch === "\"" || ch === "`") { j = copyStringLiteral(source, j).end; continue; }
    j += 1;
  }
  return j;
}

/**
 * The string literal starting at `i` (its opening quote is `source[i]`), copied through VERBATIM including
 * both quotes — comments are never stripped from inside one, which is this whole file's reason to exist.
 * Escaped characters are copied as a pair so an escaped quote (`\"`) can never be misread as the closing one.
 *
 * A TEMPLATE LITERAL'S `${...}` IS SKIPPED AS A UNIT, via `skipInterpolation`, rather than scanned
 * character-by-character like the rest of the string — see that function for the corruption this
 * prevents. What is INSIDE an interpolation is still copied verbatim into `text` (comments included, the
 * documented, unchanged "KNOWN LIMITATION" this file's own tests pin) — only the OUTER template literal's
 * true end is now found correctly regardless of what the interpolation contains.
 */
function copyStringLiteral(source: string, i: number): { text: string; end: number } {
  const quote = source[i];
  let text = quote;
  let j = i + 1;
  while (j < source.length && source[j] !== quote) {
    if (source[j] === "\\" && j + 1 < source.length) {
      text += source[j] + source[j + 1];
      j += 2;
      continue;
    }
    if (quote === "`" && source[j] === "$" && source[j + 1] === "{") {
      const start = j + 1; // the "{" itself
      const end = skipInterpolation(source, start);
      text += source.slice(j, end);
      j = end;
      continue;
    }
    text += source[j];
    j += 1;
  }
  if (j < source.length) { text += source[j]; j += 1; } // the closing quote
  return { text, end: j };
}

export function stripComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") { i = endOfLineComment(source, i); continue; }
    if (ch === "/" && next === "*") { i = endOfBlockComment(source, i); continue; }
    if (ch === "'" || ch === "\"" || ch === "`") {
      const literal = copyStringLiteral(source, i);
      out += literal.text;
      i = literal.end;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}
