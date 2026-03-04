export type AppRole = "admin" | "manager" | "staff" | "graphic" | "accountant";

type RouteRule = {
  prefix: string;
  roles: AppRole[];
};

const ALL_ROLES: AppRole[] = ["admin", "manager", "staff", "graphic", "accountant"];

const ROUTE_RULES: RouteRule[] = [
  { prefix: "/users", roles: ["admin"] },
  { prefix: "/imports", roles: ["admin", "manager"] },
  { prefix: "/fabric", roles: ["admin", "manager"] },
  { prefix: "/settings", roles: ["admin", "manager"] },
  { prefix: "/payments", roles: ["admin", "manager", "accountant"] },
  { prefix: "/reports/graphic-work", roles: ["admin", "manager", "graphic"] },
  { prefix: "/reports/admin-sales", roles: ["admin", "manager"] },
  { prefix: "/reports/sales-profit", roles: ["admin", "manager", "accountant"] },
  { prefix: "/reports/orders", roles: ["admin", "manager", "accountant"] },
  { prefix: "/reports/sale-admin", roles: ["admin", "manager", "accountant"] },
  { prefix: "/reports", roles: ["admin", "manager", "accountant", "graphic"] },
  { prefix: "/orders/new", roles: ["admin", "manager", "staff"] },
  { prefix: "/orders", roles: ALL_ROLES },
  { prefix: "/search", roles: ALL_ROLES },
  { prefix: "/dashboard", roles: ALL_ROLES },
];

export function canAccessPath(pathname: string, role: AppRole) {
  const matched = ROUTE_RULES.find((rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`));
  if (!matched) return false;
  return matched.roles.includes(role);
}
