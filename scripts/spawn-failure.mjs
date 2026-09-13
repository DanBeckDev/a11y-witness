// @ts-check
// command: (not a command) the ONE description of a failed spawn: its argv, and its stderr only when piped.

/**
 * #1293: A FAILED SPAWN, DESCRIBED IN ONE LINE THAT CARRIES BOTH HALVES.
 *
 * Two facts make a spawn failure actionable: WHICH command died (the argv) and WHY (the child's stderr).
 * Which of the two a caller is missing depends entirely on how it spawned, and until this file every
 * script in `scripts/` decided that by accident of how its own `run` was written:
 *
 *   stdio "inherit"  -> the cause is already on screen above; the failure line must add the ARGV
 *   stdio "pipe"     -> the cause was captured, not shown; the failure line must add the STDERR
 *
 * #1283 settled the first for `pr-open` (gh's stderr is inherited, so the line names the argv). #1246's
 * batch push settled nothing: 91 refused pushes logged `Command failed: git … push …` and not one said why.
 *
 * WHAT NODE ACTUALLY THROWS, measured on node v22 before this was written (and pinned by the test, so a
 * Node that changes it is noticed): a PIPED `execFileSync` failure appends the child's whole stderr to
 * `error.message`, after the argv line -- so the incident's log must have kept only the message's FIRST
 * line, which is exactly the argv. An INHERITED failure's message is the argv alone and `stderr` is
 * `null`. A command that never started (`ENOENT`) has no stderr and a different message entirely. So this
 * reads the argv from the message's first line ONLY -- taking the whole message would print the stderr
 * twice, which is how a three-line refusal became twenty-four (#1277).
 *
 * THREE ABSENCES, THREE STRINGS. "It wrote nothing to stderr", "its stderr was not captured" and "it never
 * started" are different facts about a failure, and a reader acting on the line needs to know which.
 */

/**
 * The fields of a Node spawn error this reads. Everything is optional: the input is whatever was caught.
 * @typedef {{ message?: string, status?: number | null, signal?: string | null, code?: string,
 *             stderr?: string | Buffer | null }} SpawnError
 */

/**
 * One line naming the failed command and, when its output was piped, the last thing it said on stderr.
 * @param {unknown} error what a `catch` around `execFileSync`/`spawnSync` received
 * @param {{ inherited: boolean }} how whether the child's stderr went straight to this process's stderr
 * @returns {string}
 */
export function describeSpawnFailure(error, { inherited }) {
  const failure = /** @type {SpawnError} */ (error ?? {});
  const argv = firstLine(failure.message) ?? "a spawned command failed with no message";
  if (failure.code && typeof failure.status !== "number") {
    return `${argv} -- the command never started (${failure.code})`;
  }
  const outcome = failure.signal ? `killed by ${failure.signal}` : `exited ${failure.status ?? "without a status"}`;
  return inherited
    ? `${argv} -- ${outcome}; its stderr is above`
    : `${argv} -- ${outcome}: ${lastStderrLine(failure.stderr)}`;
}

/** @param {string | undefined} text @returns {string | null} */
function firstLine(text) {
  const line = typeof text === "string" ? text.split("\n")[0].trim() : "";
  return line === "" ? null : line;
}

/**
 * The last non-empty stderr line -- the refusal, in every guard this repository writes -- or which of the
 * two absences it was.
 * @param {string | Buffer | null | undefined} stderr
 */
function lastStderrLine(stderr) {
  if (stderr === null || stderr === undefined) return "its stderr was not captured";
  const lines = String(stderr).split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : "it wrote nothing to stderr";
}
