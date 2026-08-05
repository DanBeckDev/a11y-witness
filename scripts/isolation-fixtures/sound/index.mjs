// A correctly packaged package: every file it needs is in "files", and it imports nothing undeclared.
import { greeting } from "./helper.mjs";
export const hello = () => greeting();
