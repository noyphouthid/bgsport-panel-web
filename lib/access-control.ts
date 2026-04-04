export type AppRole = "superadmin" | "admin" | "manager" | "staff" | "graphic" | "accountant";

type RouteRule = {
  prefix: string;
  roles: AppRole[];
};

const ALL_ROLES: AppRole[] = ["superadmin", "admin", "manager", "staff", "graphic", "accountant"];

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
  { prefix: "/inventory-qr", roles: ["superadmin", "admin", "manager", "staff", "accountant"] },
  { prefix: "/factory-receipts", roles: ["superadmin", "admin", "manager", "staff", "accountant"] },
  { prefix: "/shipments", roles: ["superadmin", "admin", "manager", "staff", "accountant"] },
  { prefix: "/change-requests", roles: ["superadmin", "admin", "manager", "staff", "accountant"] },
  { prefix: "/reports/graphic-work", roles: ["superadmin", "manager", "graphic"] },
  { prefix: "/reports/admin-sales", roles: ["superadmin", "manager"] },
  { prefix: "/reports/monthly-close", roles: ["superadmin", "admin", "manager", "accountant"] },
  { prefix: "/reports/sales-profit", roles: ["superadmin", "manager", "accountant"] },
  { prefix: "/reports/orders", roles: ["superadmin", "manager", "accountant"] },
  { prefix: "/reports/sale-admin", roles: ["superadmin", "manager", "accountant"] },
  { prefix: "/reports", roles: ["superadmin", "admin", "manager", "accountant", "graphic"] },
  { prefix: "/quotations", roles: ["superadmin", "admin", "manager", "staff"] },
  { prefix: "/orders/new", roles: ["superadmin", "manager", "staff"] },
  { prefix: "/orders", roles: ["superadmin", "admin", "manager", "staff", "graphic", "accountant"] },
  { prefix: "/search", roles: ["superadmin", "admin", "manager", "staff", "graphic", "accountant"] },
  { prefix: "/dashboard", roles: ALL_ROLES },
];

export function canAccessPath(pathname: string, role: AppRole) {
  if (role === "superadmin") return true;
  const matched = ROUTE_RULES.find((rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`));
  if (!matched) return false;
  return matched.roles.includes(role);
}
