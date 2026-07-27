import { findAccessPermissionKey, getAccessPermissionMode, resolvePermissionMode, type UserPermissionSettings } from "@/lib/user-permissions";

export type AppRole = "superadmin" | "admin" | "manager" | "staff" | "graphic" | "production" | "accountant";

type RouteRule = {
  prefix: string;
  roles: AppRole[];
};

const ALL_ROLES: AppRole[] = ["superadmin", "admin", "manager", "staff", "graphic", "production", "accountant"];
const ROLE_LOCKED_PATHS = [
  "/reports/admin-sales",
  "/reports/design-phone-status",
  "/reports/data-export",
  "/reports/monthly-close",
  "/reports/income-expense",
];
const STAFF_ALLOWED_PATHS = new Set([
  "/search",
  "/inventory-qr",
  "/factory-receipts",
  "/factory-receipts/orders",
  "/shipments",
  "/shipments/deposits",
  "/shipments/deposits/scan",
  "/shipments/notes",
  "/shipments/orders",
]);

const ROUTE_RULES: RouteRule[] = [
  { prefix: "/users", roles: ["superadmin"] },
  { prefix: "/shipments/approvals", roles: ["superadmin"] },
  { prefix: "/imports", roles: ["superadmin", "manager"] },
  { prefix: "/fabric", roles: ["superadmin", "manager"] },
  { prefix: "/order-code-types", roles: ["superadmin", "manager"] },
  { prefix: "/settings", roles: ["superadmin", "manager"] },
  { prefix: "/payroll", roles: ["superadmin", "manager", "accountant"] },
  { prefix: "/payments", roles: ["superadmin", "manager", "accountant"] },
  { prefix: "/factory-payments", roles: ["superadmin", "manager", "accountant"] },
  { prefix: "/design-queue", roles: ["superadmin", "admin", "manager", "staff", "graphic"] },
  { prefix: "/factory-deposit-orders", roles: ["superadmin", "admin", "manager", "staff", "accountant"] },
  { prefix: "/factory-production-queue", roles: ["superadmin", "production"] },
  { prefix: "/order-alerts", roles: ["superadmin", "admin", "manager", "staff", "accountant"] },
  { prefix: "/factory-production-status", roles: ["superadmin", "admin", "manager", "staff", "accountant"] },
  { prefix: "/inventory-qr", roles: ["superadmin", "admin", "manager", "staff", "accountant"] },
  { prefix: "/factory-receipts", roles: ["superadmin", "admin", "manager", "staff", "accountant"] },
  { prefix: "/shipments", roles: ["superadmin", "admin", "manager", "staff", "accountant"] },
  { prefix: "/change-requests", roles: ["superadmin", "admin", "manager", "staff", "accountant"] },
  { prefix: "/reports/graphic-work", roles: ["superadmin", "manager"] },
  { prefix: "/reports/admin-sales", roles: ["superadmin", "admin", "manager"] },
  { prefix: "/reports/design-phone-status", roles: ["superadmin", "admin", "manager"] },
  { prefix: "/reports/data-export", roles: ["superadmin", "manager", "accountant"] },
  { prefix: "/reports/monthly-close", roles: ["superadmin", "manager", "accountant"] },
  { prefix: "/reports/income-expense", roles: ["superadmin"] },
  { prefix: "/reports/sales-profit", roles: ["superadmin", "manager", "accountant"] },
  { prefix: "/reports/order-status-payments", roles: ["superadmin", "manager", "accountant"] },
  { prefix: "/reports/orders", roles: ["superadmin", "manager", "accountant"] },
  { prefix: "/reports/factory-payments", roles: ["superadmin", "manager", "accountant"] },
  { prefix: "/reports/payroll", roles: ["superadmin", "manager", "accountant"] },
  { prefix: "/reports/sale-admin", roles: ["superadmin", "manager", "accountant"] },
  { prefix: "/reports", roles: ["superadmin", "admin", "manager", "accountant"] },
  { prefix: "/quotations", roles: ["superadmin", "admin", "manager", "staff"] },
  { prefix: "/orders/new", roles: ["superadmin", "admin", "manager", "staff"] },
  { prefix: "/orders", roles: ["superadmin", "admin", "manager", "staff", "accountant"] },
  { prefix: "/search", roles: ["superadmin", "admin", "manager", "staff", "graphic", "accountant"] },
  { prefix: "/dashboard", roles: ALL_ROLES },
];

function normalizePathname(pathname: string) {
  if (!pathname) return "/";
  if (pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getDefaultPathForRole(role: AppRole) {
  if (role === "staff") return "/search";
  if (role === "production") return "/factory-production-queue";
  return "/dashboard";
}

export function canAccessPath(pathname: string, role: AppRole, permissionSettings?: UserPermissionSettings | null) {
  const normalizedPath = normalizePathname(pathname);
  if (role === "superadmin") return true;
  const accessKey = findAccessPermissionKey(normalizedPath);

  let baseAllowed = false;
  if (role === "staff") {
    baseAllowed = STAFF_ALLOWED_PATHS.has(normalizedPath);
  } else {
    const matched = ROUTE_RULES.find((rule) => matchesPrefix(normalizedPath, rule.prefix));
    baseAllowed = matched ? matched.roles.includes(role) : false;
  }

  if (ROLE_LOCKED_PATHS.some((prefix) => matchesPrefix(normalizedPath, prefix))) {
    return baseAllowed;
  }

  if (!accessKey) return baseAllowed;
  return resolvePermissionMode(getAccessPermissionMode(permissionSettings, accessKey), baseAllowed);
}
