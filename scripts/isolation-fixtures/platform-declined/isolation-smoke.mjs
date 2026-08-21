// A smoke test that DECLINES a check this machine cannot make, by exiting 3.
//
// `nvda-worker` does this when guidepup refuses to import without a screen reader, and `worker-fleet` does it
// for a host-capacity read that is macOS-only by design. The gate must report those as SKIP rather than FAIL:
// a platform limit is not a packaging defect, and treating it as one stopped `release:gate` at its first leg
// on the only machine with the Python venv the judge needs.
//
// The package itself resolves fine, which is the point — everything checkable was checked.
import { hello } from "@a11y-witness-fixture/platform-declined";
if (typeof hello() !== "string") throw new Error("the fixture package is broken, which is not what this tests");
console.error("cannot verify the platform-specific part here: this fixture always declines. Everything else passed.");
process.exit(3);
