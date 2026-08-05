// Imported BY PACKAGE NAME, never by relative path: a relative import would resolve inside the repo and
// prove nothing about what a consumer receives.
import { hello } from "@a11y-witness-fixture/sound";
console.log(hello());
