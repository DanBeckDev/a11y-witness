// `"files"` lists only index.mjs, so this sibling never reaches the tarball. Nothing warns: the package
// publishes cleanly and breaks on first import. `.ps1`, `.cmd` and `.safetensors` payloads in this repo are
// exactly this shape of asset.
import { greeting } from "./helper.mjs";
export const hello = () => greeting();
