// Imports a real package that is NOT declared in this manifest's dependencies. In the workspace npm's
// hoisting resolves it from the root `node_modules` and everything looks fine; installed standalone there
// is nothing to resolve. This is the phantom dependency ADR 0005 accepts npm will permit and ADR 0007's
// gate exists to catch.
import * as typescript from "typescript";
export const version = () => typescript.version;
