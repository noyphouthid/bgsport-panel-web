import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

function loadTs(path) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const compiled = { exports: {} };
  new Function("module", "exports", outputText)(compiled, compiled.exports);
  return compiled.exports;
}
const { getTransportNoteCardHtml, getTransportNotePrintHtml, mapTransportNoteToForm } = loadTs("../lib/transport-notes.ts");
const { validateTransportCod, ensureTransportCodStorage } = loadTs("../lib/transport-cod.ts");

test("recipient name appears once beside the heading and is escaped", () => {
  const html = getTransportNoteCardHtml({ receiver_name: '<Customer & Co>', transporters: [] });
  assert.equal((html.match(/&lt;Customer &amp; Co&gt;/g) || []).length, 1);
  assert.ok(html.includes('class="receiver-name">&lt;Customer &amp; Co&gt;'));
  assert.equal(html.includes("ຊື່ຜູ້ຮັບ"), false);
  assert.equal(html.includes("(Receiver)"), false);
});

test("only explicit COD selects the COD artwork, phone and amount", () => {
  const cod = getTransportNoteCardHtml({ cod_enabled: true, cod_amount: 1500000 });
  assert.ok(cod.includes("20 23 515 558"));
  assert.ok(cod.includes("bg-sport-transport-header-cod.svg"));
  assert.ok(cod.includes('class="cod-amount">1,500,000 ກີບ'));
  assert.equal(cod.includes("20 9220 1288"), false);
  for (const fields of [{}, { cod_enabled: false, cod_amount: 1500000 }]) {
    const html = getTransportNoteCardHtml(fields);
    assert.ok(html.includes("20 9220 1288"));
    assert.equal(html.includes("20 23 515 558"), false);
    assert.equal(html.includes('class="cod"'), false);
  }
  const batch = getTransportNotePrintHtml([{ cod_enabled: true, cod_amount: 1500000 }, { cod_enabled: false }], "", { headerSrc: "normal.svg", codHeaderSrc: "cod.svg" });
  assert.equal((batch.match(/src="cod.svg"/g) || []).length, 1);
  assert.equal((batch.match(/src="normal.svg"/g) || []).length, 1);
});

test("COD snapshots reopen with explicit values; legacy and disabled notes default to no COD", () => {
  assert.equal(mapTransportNoteToForm({}).codEnabled, false);
  assert.equal(mapTransportNoteToForm({}).codAmount, 0);
  assert.equal(mapTransportNoteToForm({ cod_enabled: false, cod_amount: 500 }).codAmount, 0);
  const form = mapTransportNoteToForm({ cod_enabled: true, cod_amount: 1500000 });
  assert.equal(form.codEnabled, true);
  assert.equal(form.codAmount, 1500000);
});

test("COD rejects invalid amounts and collecting more than the remaining order balance", () => {
  for (const amount of [0, -1, NaN, Infinity, 0.001, 1.234, 1e14]) assert.ok(validateTransportCod(true, amount));
  assert.ok(validateTransportCod(true, 1500000, 1000000));
  assert.equal(validateTransportCod(true, 1500000, 1500000), null);
  assert.equal(validateTransportCod(true, 100.25), null);
  assert.equal(validateTransportCod(false, 0), null);
});

test("COD storage checks both snapshots and names the migration before any write", async () => {
  const checks = [];
  const client = { from(table) { return { select(columns) { checks.push([table, columns]); return { limit: async () => ({ error: table === "shipment_delivery_requests" ? { code: "PGRST204", message: "Missing COD columns" } : null }) }; } }; } };
  await assert.rejects(ensureTransportCodStorage(client, true), /20261102_add_transport_cod.sql/);
  assert.deepEqual(checks, [["transport_notes", "cod_enabled,cod_amount"], ["shipment_delivery_requests", "transport_cod_enabled,transport_cod_amount"]]);
});
