#!/usr/bin/env node
// `a11y-scorer-fetch-encoder` — download the 87 MB encoder into this package.
//
// A thin wrapper rather than a `bin` pointing straight at the `.py`: npm's bin shims assume an executable
// node script, and the interpreter is the caller's choice (`A11Y_PYTHON`, because a GitHub Windows runner has
// no venv). The Python program resolves its own output directory from its file location, so this cannot write
// the encoder into the wrong place no matter where it is run from.
import { spawnSync } from "node:child_process";
import { scorerPaths } from "../dist/index.js";

const python = process.env.A11Y_PYTHON ?? "python3";
const { fetchEncoderScript, requirements } = scorerPaths();
const result = spawnSync(python, [fetchEncoderScript, ...process.argv.slice(2)], { stdio: "inherit" });

if (result.error?.code === "ENOENT") {
  process.stderr.write(`cannot run ${python}. Set A11Y_PYTHON, and install ${requirements} first.\n`);
  process.exit(127);
}
process.exit(result.status ?? 1);
