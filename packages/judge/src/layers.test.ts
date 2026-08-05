import { test } from "node:test";
import assert from "node:assert/strict";
import { layerOf, orderByLayer } from "./layers.js";

test("maps WCAG principle 1 (Perceivable) to perceive", () => {
  assert.equal(layerOf("1.1.1 Non-text Content"), "perceive");
  assert.equal(layerOf("1.3.1 Info and Relationships"), "perceive");
});

test("maps principle 2 (Operable) to navigate", () => {
  assert.equal(layerOf("2.4.4 Link Purpose (In Context)"), "navigate");
  assert.equal(layerOf("2.4.6 Headings and Labels"), "navigate");
});

test("maps principles 3 (Understandable) and 4 (Robust) to interact", () => {
  assert.equal(layerOf("3.3.1 Error Identification"), "interact");
  assert.equal(layerOf("4.1.2 Name, Role, Value"), "interact");
});

test("orders findings as the waterfall: perceive, then navigate, then interact", () => {
  const findings = [
    { wcag: "4.1.2 Name, Role, Value" },
    { wcag: "2.4.4 Link Purpose (In Context)" },
    { wcag: "1.1.1 Non-text Content" },
  ];
  assert.deepEqual(
    orderByLayer(findings).map((f) => f.wcag),
    ["1.1.1 Non-text Content", "2.4.4 Link Purpose (In Context)", "4.1.2 Name, Role, Value"],
  );
});

test("is stable within a layer (preserves input order)", () => {
  const findings = [
    { wcag: "1.3.1 Info and Relationships", id: "a" },
    { wcag: "1.1.1 Non-text Content", id: "b" },
  ];
  assert.deepEqual(orderByLayer(findings).map((f) => f.id), ["a", "b"]);
});
