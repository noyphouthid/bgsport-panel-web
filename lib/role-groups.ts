import type { AppRole } from "@/lib/access-control";

export const FACTORY_DEPOSIT_ADMIN_ROLES: AppRole[] = ["superadmin", "admin", "manager", "staff"];
export const ORDER_ASSIGNABLE_USER_ROLES: AppRole[] = ["superadmin", "admin", "graphic"];
export const GRAPHIC_ASSIGNABLE_ROLES: AppRole[] = ["superadmin", "graphic"];

const ADMIN_ROLE_ALIASES = new Set(["superadmin", "admin", "sale-admin", "sale_admin"]);
const GRAPHIC_ROLE_ALIASES = new Set(["superadmin", "graphic", "graphics", "designer"]);
const FACTORY_DEPOSIT_ADMIN_ROLE_ALIASES = new Set<string>(FACTORY_DEPOSIT_ADMIN_ROLES);

export function normalizeRole(role: string | null | undefined) {
  return String(role || "").trim().toLowerCase();
}

export function isAdminRole(role: string | null | undefined) {
  return ADMIN_ROLE_ALIASES.has(normalizeRole(role));
}

export function isGraphicRole(role: string | null | undefined) {
  return GRAPHIC_ROLE_ALIASES.has(normalizeRole(role));
}

export function isFactoryDepositAdminRole(role: string | null | undefined) {
  return FACTORY_DEPOSIT_ADMIN_ROLE_ALIASES.has(normalizeRole(role));
}
