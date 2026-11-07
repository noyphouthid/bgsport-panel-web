import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { BinaryBitmap, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from "@zxing/library";

const require = createRequire(import.meta.url);
function compile(path) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
  });
  const compiled = { exports: {} };
  new Function("module", "exports", "require", outputText)(compiled, compiled.exports, require);
  return compiled.exports;
}
const { normalizeFactoryBarcode, findFactoryBarcodeOrder, normalizeReceiptBarcodeSources, describeReceiptBarcodeSources } = compile("../lib/factory-receipt-barcode.ts");
const { getFactoryBarcodeHints } = compile("../lib/factory-barcode-reader.ts");

test("factory barcode preserves the complete printed code and accepts scanner suffixes and AIM identifiers", () => {
  assert.equal(normalizeFactoryBarcode("26-184019"), "26-184019");
  assert.equal(normalizeFactoryBarcode(" 26-184019\r\n"), "26-184019");
  assert.equal(normalizeFactoryBarcode("]C026-184019\r"), "26-184019");
  assert.equal(normalizeFactoryBarcode("00184019"), "00184019");
  for (const value of ["", "BGSPORT-FACTORY|26-184019|id|RK26-10149", "https://factory.example/orders/184019/print", "26-184019,other", "26 184019"]) {
    assert.equal(normalizeFactoryBarcode(value), "");
  }
});

function mockClient(rows, error = null) {
  const calls = [];
  const query = {
    from(value) { calls.push(["from", value]); return this; },
    select(value) { calls.push(["select", value]); return this; },
    or(value) { calls.push(["or", value]); return this; },
    eq(key, value) { calls.push(["eq", key, value]); return this; },
    async limit(value) { calls.push(["limit", value]); return { data: rows, error }; },
  };
  return { client: query, calls };
}

test("scanned codes resolve only an exact factory bill match, keeping the year and hyphen", async () => {
  const order = { id: "order-id", order_code: "RK26-10149", factory_bill_code: "26-184019" };
  const { client, calls } = mockClient([order]);
  assert.deepEqual(await findFactoryBarcodeOrder(client, "26-184019\r\n", "id,order_code,factory_bill_code"), order);
  assert.deepEqual(calls, [
    ["from", "orders"], ["select", "id,order_code,factory_bill_code"],
    ["or", "factory_bill_code.eq.26-184019,order_code.eq.26-184019"], ["limit", 2],
  ]);
});

test("the shop order code printed on the production sheet resolves the same way", async () => {
  const order = { id: "order-id", order_code: "RK26-11013", factory_bill_code: "26-184019" };
  const { client, calls } = mockClient([order]);
  assert.deepEqual(await findFactoryBarcodeOrder(client, "]C0RK26-11013\r", "id"), order);
  assert.deepEqual(calls[2], ["or", "factory_bill_code.eq.RK26-11013,order_code.eq.RK26-11013"]);
});

test("choosing one barcode type searches only that column", async () => {
  const factoryOnly = mockClient([]);
  await findFactoryBarcodeOrder(factoryOnly.client, "26-184019", "id", ["factory"]);
  assert.deepEqual(factoryOnly.calls[2], ["eq", "factory_bill_code", "26-184019"]);

  const shopOnly = mockClient([]);
  await findFactoryBarcodeOrder(shopOnly.client, "RK26-11013", "id", ["shop"]);
  assert.deepEqual(shopOnly.calls[2], ["eq", "order_code", "RK26-11013"]);
});

test("barcode type selection is cleaned and never empty", () => {
  assert.deepEqual(normalizeReceiptBarcodeSources("shop"), ["shop"]);
  assert.deepEqual(normalizeReceiptBarcodeSources("shop,factory,junk"), ["factory", "shop"]);
  assert.deepEqual(normalizeReceiptBarcodeSources(["shop"]), ["shop"]);
  assert.deepEqual(normalizeReceiptBarcodeSources(""), ["factory", "shop"]);
  assert.deepEqual(normalizeReceiptBarcodeSources(null), ["factory", "shop"]);
  assert.deepEqual(normalizeReceiptBarcodeSources([]), ["factory", "shop"]);
  assert.equal(describeReceiptBarcodeSources(["shop"]), "ລະຫັດອໍເດີຮ້ານ");
  assert.equal(describeReceiptBarcodeSources(["factory", "shop"]), "ລະຫັດບິນໂຮງງານ ຫຼື ລະຫັດອໍເດີຮ້ານ");
});

test("unknown, ambiguous, invalid and failed barcode lookups cannot silently choose an order", async () => {
  assert.equal(await findFactoryBarcodeOrder(mockClient([]).client, "26-184019", "id"), null);
  await assert.rejects(findFactoryBarcodeOrder(mockClient([{ id: "one" }, { id: "two" }]).client, "26-184019", "id"), /26-184019/);
  await assert.rejects(findFactoryBarcodeOrder(mockClient(null, { message: "query failed" }).client, "26-184019", "id"), /query failed/);
  const { client, calls } = mockClient([]);
  await assert.rejects(findFactoryBarcodeOrder(client, "https://factory.example/orders/184019/print", "id"));
  assert.deepEqual(calls, []);
});

function decodePixels(pixels, width, height) {
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)));
  return new MultiFormatReader().decode(bitmap, getFactoryBarcodeHints()).getText();
}

test("the camera decoder reads real Code 128 bars with the full factory bill code", () => {
  for (const code of ["26-184019", "00184019", "184019", "RK26-11013"]) {
    const target = {};
    JsBarcode(target, code, { format: "CODE128", displayValue: false });
    const bars = target.encodings.map((encoding) => encoding.data).join("");
    const scale = 3;
    const margin = 30;
    const width = bars.length * scale + margin * 2;
    const height = 100;
    const pixels = new Uint8ClampedArray(width * height).fill(255);
    for (let y = 10; y < height - 10; y++) {
      for (let x = 0; x < bars.length * scale; x++) {
        pixels[y * width + margin + x] = bars[Math.floor(x / scale)] === "1" ? 0 : 255;
      }
    }
    assert.equal(decodePixels(pixels, width, height), code);
  }
});

test("the camera ignores a neighboring QR even when its payload is a factory bill code", () => {
  const qr = QRCode.create("26-184019");
  const scale = 5;
  const margin = 20;
  const width = qr.modules.size * scale + margin * 2;
  const pixels = new Uint8ClampedArray(width * width).fill(255);
  for (let y = 0; y < qr.modules.size * scale; y++) {
    for (let x = 0; x < qr.modules.size * scale; x++) {
      if (qr.modules.get(Math.floor(y / scale), Math.floor(x / scale))) pixels[(y + margin) * width + x + margin] = 0;
    }
  }
  assert.throws(() => decodePixels(pixels, width, width));
});
