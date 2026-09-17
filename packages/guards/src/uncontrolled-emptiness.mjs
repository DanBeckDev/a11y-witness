// @ts-check
// command: (not a command) the ESLint rule for #1155, imported by eslint.config.js
// AN EMPTINESS ASSERTION ON A LOCALLY DERIVED COLLECTION, WITH NOTHING PINNING WHAT IT WAS DERIVED FROM.
//
// `assert.deepEqual(offenders, [])` where `const offenders = files.filter(...)` is satisfied by an EMPTY
// `files`. The control belongs on `files`, and pinning `offenders` proves nothing -- it is the subject,
// not the population. #1123 measured 226 such assertions across 135 files and, more usefully, measured
// that they are not one population: 73 accumulators, 64 derived-local, 64 derived-from-a-call, and 35
// other. **The remedy differs per shape**, which is why `ceo` ruled a rule for the derived-local 64 only.
//
// ## What this rule deliberately does NOT do
//
// **The receiver must be an IDENTIFIER.** `const xs = f().filter(...)` is out of scope by that same
// ruling: the rule can see the shape and cannot see the population, because what `f()` returns is not
// here. Flagging it would produce a report nobody can act on except by restructuring the test, and a rule
// whose remedy is "write it differently" is a style rule wearing a correctness rule's name.
//
// **Accumulators are out of scope and are the bigger half.** `const xs = []; for (...) xs.push(...)`
// needs its control on the LOOP'S SOURCE, which is neither the asserted name nor its initialiser. #1123
// has its own row for defining that before anything is built for it.
//
// **The pin must be in the SAME TEST.** A `assert.ok(files.length)` in a neighbouring test does not
// control this one -- they run independently and either could be the one that stops examining anything.
// Searching the whole file would let one pin excuse every assertion in it, which is the shape where a
// control on the wrong object reads as a control.
//
// ## And why the exemption is by NAME rather than by cleverness
//
// `git-population-vacuity.test.ts` contains an emptiness assertion that CANNOT fail, deliberately: it
// reproduces the naive check -- *"0 checked, 0 missing"* -- to demonstrate that a check which examined
// nothing and a check which examined everything produce the same sentence. **That is a demonstration of
// this rule's defect inside the guard file for this rule's defect**, and it must stay exactly as it is.
//
// It is exempted BY NAME in the config, with the reason written there. **A rule clever enough to
// recognise a demonstration is a rule that will excuse a real one** -- the recognition would have to key
// on something a real defect can also carry (a comment, a name, a shape), and then the next author gets
// the exemption by accident. #1123's own measurement is the argument: all six assertions in the purest
// bucket read as defects and all six were correct, so the shape does not decide it and a human must.

/**
 * `assert.deepEqual(X, [])` -- the first of the two spellings #1123 measured.
 * @param {any} node @returns {any}
 */
function deepEqualEmptySubject(node) {
  const [first, second] = node.arguments ?? [];
  const isEmptyArray = second?.type === "ArrayExpression" && second.elements.length === 0;
  return first?.type === "Identifier" && isEmptyArray ? first : null;
}

/**
 * `assert.equal(X.length, 0)` -- the second spelling.
 * @param {any} node @returns {any}
 */
function lengthZeroSubject(node) {
  const [first, second] = node.arguments ?? [];
  if (second?.type !== "Literal" || second.value !== 0) return null;
  const isLength = first?.type === "MemberExpression" && first.property?.name === "length";
  return isLength && first.object?.type === "Identifier" ? first.object : null;
}

/**
 * The identifier whose emptiness this call asserts, or null.
 *
 * SPLIT IN TWO rather than disabled: the first version was one function at complexity 21 against a
 * ceiling of 15, and the `eslint-disable-next-line` I reached for did nothing -- `complexity` reports at
 * the function DECLARATION and the directive sat inside the body, so it was an unused directive beside a
 * live error. A disable that does not disable is the same shape as everything else found today: it had
 * the form of a suppression without being one.
 *
 * @param {any} node @returns {any}
 */
function emptinessSubject(node) {
  if (node.callee?.type !== "MemberExpression") return null;
  const method = node.callee.property?.name;
  if (method === "deepEqual") return deepEqualEmptySubject(node);
  if (method === "equal") return lengthZeroSubject(node);
  return null;
}

/**
 * The local collection `name` was derived from -- `SOURCE.filter(...)` -- or null if it was not.
 * @param {any} variable @returns {string | null}
 */
function derivedFrom(variable) {
  const def = variable?.defs?.[0];
  const init = def?.node?.type === "VariableDeclarator" ? def.node.init : null;
  if (init?.type !== "CallExpression" || init.callee?.type !== "MemberExpression") return null;
  const DERIVING = new Set(["filter", "map", "flatMap", "flat", "slice", "concat"]);
  if (!DERIVING.has(init.callee.property?.name)) return null;
  // THE RECEIVER MUST BE AN IDENTIFIER -- see the header. A call receiver is a population this rule
  // cannot see, and reporting it would be a finding with no action attached.
  return init.callee.object?.type === "Identifier" ? init.callee.object.name : null;
}

/**
 * The nearest enclosing `test(...)` / `it(...)` call, or null.
 * @param {any} node @returns {any}
 */
function enclosingTest(node) {
  for (let n = node; n; n = n.parent) {
    if (n.type === "CallExpression" && n.callee?.type === "Identifier"
      && (n.callee.name === "test" || n.callee.name === "it")) return n;
  }
  return null;
}

/** Does `source` get pinned non-empty anywhere inside `scope`? Text over the scope's own range. */
/**
 * Does this expression assert that `name` is NON-EMPTY? Structural, not textual.
 *
 * #1155, after worker-judge's five edges: the first version was a regex over the test's source and every
 * one of its mistakes fell the same way -- **reading an absent control as present**, which is the cheap,
 * uncaught direction. All five are gone because the question is now asked of the SYNTAX:
 *
 *   assert.ok(a.length > 0 || files.length > 0)   a disjunction controls NEITHER operand
 *   assert.ok(!(files.length > 0))                asserts it IS empty
 *   assert.ok(cond ? files.length > 0 : true)     controls nothing when `cond` is false
 *   // assert.ok(files.length > 0)                a COMMENT -- and commenting a line out is HOW a pin
 *                                                 gets removed (#1088: a source-text guard defeated by a
 *                                                 comment carrying the phrase, which read 44/0)
 *   assert.equal(files.length, 0)                 asserts it is EMPTY, and read as a pin because `\s*`
 *                                                 backtracked so the negative lookahead was evaluated
 *                                                 before the `0` -- a guard that never guarded
 *
 * **Only `&&` recurses.** A conjunction controls both operands, which is the case that cost a redundant
 * pin in #1160; `||`, `!` and `?:` are refused rather than handled, because each would need a claim about
 * the other branch that this rule cannot make.
 *
 * @param {any} node an expression inside an assertion call
 * @param {string} name the population's identifier
 * @returns {boolean}
 */
function assertsNonEmpty(node, name) {
  if (!node) return false;
  if (node.type === "LogicalExpression" && node.operator === "&&") {
    return assertsNonEmpty(node.left, name) || assertsNonEmpty(node.right, name);
  }
  // `name.length` bare, or compared against something that is not zero.
  if (isLengthOf(node, name)) return true;
  if (node.type === "BinaryExpression" && [">", ">=", "!==", "!="].includes(node.operator)) {
    // `name.length > 0`, `>= 1`, `!== 0`. A `>= 0` is true of an empty array and is NOT a pin.
    const zeroish = node.right?.type === "Literal" && node.right.value === 0;
    if (isLengthOf(node.left, name) && !(node.operator === ">=" && zeroish)) return true;
  }
  return false;
}

/** `name.length` as a member expression. @param {any} n @param {string} name @returns {boolean} */
function isLengthOf(n, name) {
  return n?.type === "MemberExpression" && n.property?.name === "length"
    && n.object?.type === "Identifier" && n.object.name === name;
}

/** `assert.equal(name.length, <non-zero>)` pins; `, 0` asserts the OPPOSITE and must not.
 * @param {any[]} args @param {string} name @returns {boolean} */
function pinsViaEqual(args, name) {
  const [first, second] = args;
  const assertsZero = second?.type === "Literal" && second.value === 0;
  return isLengthOf(first, name) && !assertsZero;
}

/**
 * Is this call itself a pin on `name`? One predicate per assertion method, because together they were a
 * single function at complexity 19 against a ceiling of 15 -- and before that a single arrow at 31.
 * Optional chaining costs a branch each, so the shape that reads as flat is not.
 *
 * @param {any} n @param {string} name @returns {boolean}
 */
function isPinningCall(n, name) {
  if (n.type !== "CallExpression" || n.callee?.type !== "MemberExpression") return false;
  const args = n.arguments ?? [];
  const method = n.callee.property?.name;
  if (method === "ok") return assertsNonEmpty(args[0], name);
  if (method === "equal") return pinsViaEqual(args, name);
  if (method === "notDeepEqual") return args[0]?.type === "Identifier" && args[0].name === name;
  return false;
}

/**
 * Is `name` pinned non-empty by an assertion inside `testNode`?
 *
 * Walks the enclosing test's AST rather than its text, so a commented-out pin is not a pin. Exported so
 * the edges above are driven directly rather than only through a lint run.
 *
 * @param {any} testNode the enclosing `test(...)` call
 * @param {string} name
 * @returns {boolean}
 */
export function pinnedWithin(testNode, name) {
  let found = false;
  /** @param {any} n */
  const walk = (n) => {
    if (found || !n || typeof n !== "object") return;
    if (isPinningCall(n, name)) { found = true; return; }
    for (const key of Object.keys(n)) {
      if (key === "parent") continue;
      const child = n[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === "object" && typeof child.type === "string") walk(child);
    }
  };
  walk(testNode);
  return found;
}

/** @type {import("eslint").Rule.RuleModule} */
export const derivedLocalRule = {
  meta: {
    type: "problem",
    schema: [{ type: "object", properties: { exempt: { type: "object", additionalProperties: { type: "string" } } },
      additionalProperties: false }],
    messages: {
      uncontrolled: "`{{subject}}` is derived from `{{source}}`, and nothing in this test pins `{{source}}` "
        + "non-empty -- so this assertion passes when `{{source}}` is EMPTY, which is the case it exists to "
        + "rule out. The control belongs on the population, not on the filtered subject (#1123). Add "
        + "`assert.ok({{source}}.length > 0, ...)` in this test -- or, if a control is already here in a "
        + "form this rule cannot read, exempt the file in the rule's `exempt` option with one of exactly "
        + "two reasons: `demonstration` (the vacuity is the point, as in git-population-vacuity) or "
        + "`guarded-by <symbol>` (a guard outside an assertion makes the code unreachable when empty).",
      absentGuard: "`{{file}}` is exempted as `guarded-by {{symbol}}`, and `{{symbol}}` does not appear in "
        + "this file. The exemption is a claim that a control this rule cannot read is present -- if the "
        + "guard has been removed, the exemption is now hiding the defect the rule exists to find.",
      badReason: "`{{file}}` is exempted with the reason {{reason}}, which is neither `demonstration` nor "
        + "`guarded-by <symbol>`. An exemption whose reason cannot be read is one nobody can audit, and a "
        + "third kind of reason is a ROW rather than a third entry (ceo, #1155) -- because two reasons "
        + "carrying every case is how the list stops saying anything.",
    },
  },
  create(context) {
    const code = context.sourceCode;
    const exempt = context.options?.[0]?.exempt ?? {};
    const here = context.filename.replace(`${process.cwd()}/`, "");
    const reason = exempt[here];
    if (reason !== undefined) {
      // THE REASON IS CHECKED, NOT JUST THE NAME. An exemption list whose entries carry free text drifts
      // into "because it was failing", and then nobody can tell an argued case from a silenced one. Two
      // shapes only -- ceo's ruling on #1155 -- and an entry that matches neither is itself an error, so
      // the list cannot rot quietly. `guarded-by` must NAME the symbol, because "a guard exists" is the
      // claim, and an unnamed one cannot be checked against the file.
      const named = /^guarded-by (\S+)/.exec(reason);
      // THE SYMBOL IS CHECKED AGAINST THE FILE, not just its shape -- worker-judge on #1167. The rot mode
      // is the dangerous one: remove the guard, keep the entry, and the exemption hides the defect this
      // rule exists to find. The header claimed an unnamed guard "cannot be checked against the file",
      // which read as though a named one WAS.
      if (named && !code.getText().includes(named[1])) {
        return { Program(node) {
          context.report({ node, messageId: "absentGuard", data: { file: here, symbol: named[1] } });
        } };
      }
      if (!/^demonstration$|^guarded-by \S+/.test(reason)) {
        return { Program(node) {
          context.report({ node, messageId: "badReason", data: { file: here, reason: JSON.stringify(reason) } });
        } };
      }
      return {};
    }
    return {
      CallExpression(node) {
        const subject = emptinessSubject(node);
        if (!subject) return;
        const variable = code.getScope(node).references
          .find((r) => r.identifier === subject)?.resolved
          ?? code.getScope(node).variables.find((v) => v.name === subject.name);
        const source = derivedFrom(variable);
        if (!source) return;
        const test = enclosingTest(node);
        if (!test) return;
        if (pinnedWithin(test, source)) return;
        context.report({ node, messageId: "uncontrolled",
          data: { subject: subject.name, source } });
      },
    };
  },
};
