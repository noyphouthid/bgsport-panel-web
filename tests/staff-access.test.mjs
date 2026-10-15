import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadTs(path, dependencies = {}) {
  const { outputText } = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  );
  const compiled = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, compiled, compiled.exports);
  return compiled.exports;
}

const permissions = loadTs("../lib/user-permissions.ts");
const { canAccessPath } = loadTs("../lib/access-control.ts", {
  "@/lib/user-permissions": permissions,
});
const { canManageAllTransportNotes } = loadTs("../lib/transport-notes.ts");

const staffPaths = [
  "/factory-receipts",
  "/factory-receipts/orders",
  "/shipments",
  "/shipments/notes",
  "/shipments/deposits/scan",
  "/shipments/transport-note",
];

test("staff can access all receipt and shipment work pages, including trailing slashes", () => {
  for (const path of staffPaths) {
    assert.equal(canAccessPath(path, "staff"), true, path);
    assert.equal(canAccessPath(`${path}/`, "staff"), true, `${path}/`);
  }
});

test("staff can manage transport notes created by other users", () => {
  assert.equal(canManageAllTransportNotes("staff"), true);
});

test("explicit access denials still apply to staff work pages", () => {
  for (const path of staffPaths) {
    const key = permissions.findAccessPermissionKey(path);
    assert.ok(key, path);
    assert.equal(canAccessPath(path, "staff", { access: { [key]: "deny" } }), false, path);
  }
});

test("staff access stays limited to the existing work pages", () => {
  for (const path of [
    "/shipments/approvals",
    "/users",
    "/payments",
    "/orders/example/edit",
    "/shipments/transport-note-extra",
    "/shipments/transport-note/unknown",
  ]) {
    assert.equal(canAccessPath(path, "staff"), false, path);
  }
});

test("transport-note access for other roles keeps its existing defaults", () => {
  for (const role of ["superadmin", "admin", "manager", "accountant"]) {
    assert.equal(canAccessPath("/shipments/transport-note", role), true, role);
  }
  for (const role of ["graphic", "production"]) {
    assert.equal(canAccessPath("/shipments/transport-note", role), false, role);
  }
});
