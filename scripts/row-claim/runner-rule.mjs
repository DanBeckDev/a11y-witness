#!/usr/bin/env node
// @ts-check
// RULE: IS THIS ROW RESERVED FOR A SPECIFIC SESSION? -- #444.
//
// "Ready, for a named runner" was a state the tracker could not express: a row like #324 (the V1
// rehearsal) needs a genuinely fresh agent -- a session that has read this repository all night cannot
// un-know it -- and the only mechanism available was a COMMENT, which nothing enforces. The row still
// carried `ready`, still sat in the Ready lane, and still read pickable to every other session.
//
// A `runner:<session>` label, one per session name, honoured here: if a row carries one and it does not
// name the asking session, refuse and say who it is reserved for -- the named runner proceeds exactly as
// if the label were not there. Mirrors the rule already in `decideClaim` one clause below this: resuming
// your OWN claimed row must not read as someone else holding it, and here, proceeding as your OWN
// reservation must not read as a reservation at all.
//
// RUNS BEFORE THE `claimed` CHECK, DELIBERATELY -- a row can be `ready` (not yet `in-progress`) and still
// reserved, which is exactly #324's shape before anyone claims it. A check gated on `claimed` first would
// let anyone else take a reserved-but-unclaimed row.

/**
 * @param {string[]} labels
 * @param {string} mySession
 * @returns {string | null} a refusal reason, or null if nothing reserves this row against `mySession`
 */
export function runnerReason(labels, mySession) {
  const runners = labels.filter((l) => l.startsWith("runner:")).map((l) => l.slice("runner:".length));
  if (runners.length === 0) return null;
  if (runners.includes(mySession)) return null;
  return `reserved for ${runners.join(", ")} (a \`runner:\` label) -- this row needs something only that `
    + "session can supply (a fresh agent, a specific worker's own diagnosis), not merely that nobody else "
    + "has started it yet.";
}
