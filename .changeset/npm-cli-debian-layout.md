---
"@a11ign/worker-fleet": patch
---

`npm ci`, `fleet:deploy` and every other place this package resolves npm's own CLI script now also find it through the `npx`/`npm` executable on `PATH`, symlinks resolved. Debian and Ubuntu package npm at `/usr/share/nodejs/npm`, a layout the two fixed candidates (Windows, upstream tarball) never named, so on a machine whose Node came from apt the resolver refused and nothing that spawns npm could run (#1268).
