import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadTs(path, dependencies = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, compiled, compiled.exports);
  return compiled.exports;
}

const navigation = loadTs("../lib/app-navigation.ts");
const permissions = loadTs("../lib/user-permissions.ts", { "@/lib/app-navigation": navigation });
const { canAccessPath, isRoleLockedPath } = loadTs("../lib/access-control.ts", {
  "@/lib/user-permissions": permissions,
});

test("every static authenticated page has its own permission entry", () => {
  const root = new URL("../app/(app)/", import.meta.url);
  const keys = permissions.ACCESS_PERMISSION_ITEMS.map(item => item.key);
  assert.equal(new Set(keys).size, keys.length, "No duplicate page permissions");
  for (const file of readdirSync(root, { recursive: true })) {
    const path = String(file).replaceAll("\\", "/");
    if (!path.endsWith("/page.tsx") || path.includes("[")) continue;
    // This URL only redirects; access is checked on /reports/admin-sales.
    if (path === "reports/sale-admin/page.tsx") continue;
    assert.ok(keys.includes(`/${path.slice(0, -"/page.tsx".length)}`), `Missing page: ${path}`);
  }
});

test("new sidebar links automatically appear and survive permission normalization", () => {
  const newLink = { type: "link", href: "/future-page", label: "Future page", icon: "Globe" };
  const expanded = loadTs("../lib/user-permissions.ts", {
    "@/lib/app-navigation": { APP_NAVIGATION: [...navigation.APP_NAVIGATION, newLink] },
  });
  assert.ok(expanded.ACCESS_PERMISSION_ITEMS.some(item => item.key === newLink.href));
  assert.equal(expanded.normalizeUserPermissionSettings({ access: { [newLink.href]: "deny" } }).access[newLink.href], "deny");
});

test("new page overrides save, unknown keys are removed, and invalid modes inherit", () => {
  assert.deepEqual(permissions.normalizeUserPermissionSettings({ access: {
    "/order-alerts": "allow", "/reports/customer-delivery": "deny", "/shirt-catalog/reviews": "invalid", "/unknown": "allow",
  } }), { access: {
    "/order-alerts": "allow", "/reports/customer-delivery": "deny", "/shirt-catalog/reviews": "inherit",
  }, edit: {} });
  assert.equal(canAccessPath("/order-alerts", "staff"), false);
  assert.equal(canAccessPath("/order-alerts", "staff", { access: { "/order-alerts": "allow" } }), true);
});

test("existing parent grants and denials continue to apply to newly listed subpages", () => {
  for (const [parent, child, role] of [
    ["/reports", "/reports/customer-delivery", "accountant"],
    ["/shirt-catalog", "/shirt-catalog/reviews", "graphic"],
    ["/shipments", "/shipments/notes", "staff"],
    ["/orders", "/orders/example/edit", "admin"],
  ]) {
    for (const mode of ["allow", "deny"]) {
      assert.equal(canAccessPath(child, role, { access: { [parent]: mode } }), mode === "allow", child);
      const childKey = permissions.findAccessPermissionKey(child);
      if (childKey !== parent) {
        assert.equal(canAccessPath(child, role, { access: { [parent]: mode, [childKey]: "inherit" } }), mode === "allow", child);
      }
    }
  }
});

test("specific child decisions win without affecting sibling pages or prefix lookalikes", () => {
  const settings = { access: { "/reports": "deny", "/reports/customer-delivery": "allow" } };
  assert.equal(canAccessPath("/reports/customer-delivery/", "accountant", settings), true);
  assert.equal(canAccessPath("/reports/transport-bills", "accountant", settings), false);
  assert.equal(permissions.findAccessPermissionKey("/reports-extra"), null);
  assert.equal(canAccessPath("/shirt-catalog/reviews", "manager", { access: { "/shirt-catalog": "allow", "/shirt-catalog/reviews": "deny" } }), false);
});

test("role-locked routes and superadmin retain their existing access rules", () => {
  for (const path of ["/factory-production-queue/records", "/reports/data-export", "/reports/monthly-close", "/reports/income-expense", "/reports/admin-sales", "/reports/design-phone-status"]) {
    assert.equal(isRoleLockedPath(path), true, path);
    assert.equal(canAccessPath(path, "staff", { access: { [path]: "allow" } }), false, path);
    assert.equal(canAccessPath(path, "superadmin", { access: { [path]: "deny" } }), true, path);
  }
  assert.equal(isRoleLockedPath("/reports/customer-delivery"), false);
});
