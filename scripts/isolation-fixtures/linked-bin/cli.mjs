#!/usr/bin/env node
// Packed, so npm links it. Without this fixture the bin check would be one that only ever says no, which
// is the failure `sound` was added to rule out for the two original ones.
console.log("linked-bin cli");
