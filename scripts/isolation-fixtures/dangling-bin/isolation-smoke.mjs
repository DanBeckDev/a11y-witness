// Deliberately exercises only the import, the way most real smoke tests in this repo do. It PASSES against
// a tarball whose bin never shipped, which is why the bin check cannot be left to the smoke test.
import { hello } from "@a11ign-fixture/dangling-bin";
console.log(hello());
