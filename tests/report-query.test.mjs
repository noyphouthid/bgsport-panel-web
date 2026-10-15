import assert from "node:assert/strict";
import test from "node:test";
import { fetchAllReportRows, fetchReportRowsByIds } from "../lib/report-query.ts";

test("large reports retrieve every unique order through bounded UUID filters", async () => {
  const ids = Array.from({ length: 1205 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
  const requestedIds = [];
  const result = await fetchReportRowsByIds([...ids, ...ids.slice(0, 100), ""], async (batchIds) => {
    assert.ok(batchIds.length <= 100);
    requestedIds.push(...batchIds);
    return { data: batchIds.map((id) => ({ id })), error: null };
  });
  assert.equal(result.error, null);
  assert.deepEqual(requestedIds, ids);
  assert.deepEqual(result.data.map((row) => row.id), ids);
});

test("an empty report does not send an empty ID filter", async () => {
  const result = await fetchReportRowsByIds([], () => {
    assert.fail("No query expected for an empty report");
  });
  assert.deepEqual(result, { data: [], error: null });
});

test("a failed batch returns the error without exposing incomplete report data", async () => {
  let calls = 0;
  const error = { message: "Permission denied", code: "42501" };
  const result = await fetchReportRowsByIds(Array.from({ length: 250 }, (_, index) => String(index)), async (batchIds) => {
    calls += 1;
    return calls === 2 ? { data: null, error } : { data: batchIds.map((id) => ({ id })), error: null };
  });
  assert.equal(calls, 2);
  assert.equal(result.error, error);
  assert.equal(result.data, null);
});

test("delivery reports paginate beyond the API row limit without losing the final page", async () => {
  const rows = Array.from({ length: 1205 }, (_, index) => ({ id: index }));
  const pages = [];
  const result = await fetchAllReportRows(async (from, to) => {
    pages.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  });
  assert.deepEqual(result.data, rows);
  assert.deepEqual(pages, [[0, 499], [500, 999], [1000, 1499]]);
});

test("a failed later page cannot produce a partial report", async () => {
  const error = { message: "Failed to fetch page" };
  const result = await fetchAllReportRows(async (from) => from ? { data: null, error } : { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null });
  assert.equal(result.error, error);
  assert.equal(result.data, null);
});
