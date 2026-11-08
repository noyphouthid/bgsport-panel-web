import assert from "node:assert/strict";
import test from "node:test";
import { fetchFactoryOrderStatuses, parseFactoryOrderStatus } from "../lib/factory-order-status.ts";

const sample = {
  status: "in_progress",
  statusLabel: "ກຳລັງຜະລິດ",
  productionTracking: {
    totalSteps: 3,
    completedSteps: 1,
    stages: [
      { stageName: "ກຳລັງພີມ", stageCode: "PRINTING", sortOrder: 2, status: "pending", statusLabel: "ລໍຖ້າ", current: true, assignedQuantity: 14, completedQuantity: 5 },
      { stageName: "ອອກບິນຜະລິດ", stageCode: "ACCOUNT", sortOrder: 1, status: "completed", statusLabel: "ສຳເລັດແລ້ວ", current: false, completedAt: "2026-10-30 17:24:11.496" },
      { stageName: "ກຳລັງຕັດ", stageCode: "CUTTING", sortOrder: 3, status: "pending", statusLabel: "ລໍຖ້າ", current: false },
    ],
  },
};

test("factory status keeps stage order and the current stage", () => {
  const parsed = parseFactoryOrderStatus(sample);
  assert.equal(parsed.statusLabel, "ກຳລັງຜະລິດ");
  assert.deepEqual(parsed.stages.map((stage) => stage.code), ["ACCOUNT", "PRINTING", "CUTTING"]);
  assert.equal(parsed.currentStage.name, "ກຳລັງພີມ");
  assert.equal(parsed.currentStage.completedQuantity, 5);
  assert.equal(parsed.completedSteps, 1);
  assert.equal(parsed.totalSteps, 3);
});

test("responses without a status are rejected", () => {
  assert.equal(parseFactoryOrderStatus({ error: "NOT_FOUND" }), null);
  assert.equal(parseFactoryOrderStatus(null), null);
});

test("each bill code is requested once and failures are reported per code", async () => {
  const requested = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requested.push(url);
    if (url.includes("26-404")) return new Response('{"error":"NOT_FOUND"}', { status: 404 });
    if (url.includes("26-500")) return new Response("oops", { status: 500 });
    return new Response(JSON.stringify(sample), { status: 200 });
  };
  try {
    const results = new Map();
    await fetchFactoryOrderStatuses(["26-1", " 26-1 ", "26-404", "26-500", ""], (code, result) => results.set(code, result.state));
    assert.equal(requested.length, 3);
    assert.deepEqual(Object.fromEntries(results), { "26-1": "ready", "26-404": "not_found", "26-500": "error" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
