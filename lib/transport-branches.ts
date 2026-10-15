import { resolveLaosProvince } from "@/lib/laos-provinces";

export const BRANCH_PROVIDERS = {
  hal: {
    name: "HAL Express",
    transporter: "HAL Logistic",
    sourceUrl: "https://halexpress.la/branch",
  },
  anousith: {
    name: "Anousith Express",
    transporter: "Anousith Express",
    sourceUrl: "https://app.anousith.express/branches",
  },
} as const;
export type BranchProvider = keyof typeof BRANCH_PROVIDERS;
export type TransportBranch = {
  id: string;
  name: string;
  code: string;
  district: string;
  province: string;
};
export type TransportBranchDirectory = {
  provider: BranchProvider;
  branches: TransportBranch[];
  fetchedAt: string;
  stale: boolean;
  sourceUrl: string;
};
export type TransportAddress = {
  branch: string;
  branchCode: string;
  city: string;
  province: string;
  transporters: string[];
};
export function isBranchProvider(value: string): value is BranchProvider {
  return value === "hal" || value === "anousith";
}
export function branchProviderForTransporter(
  value: string,
): BranchProvider | null {
  if (value === "HAL Logistic" || value === "HAL Express") return "hal";
  return value === "Anousith Express" ? "anousith" : null;
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const text = (value: unknown) =>
  typeof value === "string"
    ? value.trim()
    : typeof value === "number"
      ? String(value)
      : "";

export function normalizeTransportBranches(
  provider: BranchProvider,
  rows: unknown,
): TransportBranch[] {
  if (!Array.isArray(rows))
    throw new Error("Invalid branch directory response");
  const branches = new Map<string, TransportBranch>();
  for (const value of rows) {
    const row = record(value);
    if (
      provider === "hal" &&
      (Number(row.status) !== 1 ||
        Number(row.is_hide || 0) !== 0 ||
        row.is_permanently_closed === true ||
        row.is_permanently_closed === 1 ||
        row.deleted_at)
    )
      continue;
    if (
      provider === "anousith" &&
      (Number(row.public) !== 1 || Number(row.isDeleted || 0) !== 0)
    )
      continue;
    const id = text(provider === "hal" ? row.id : row.id_branch);
    const name = text(provider === "hal" ? row.name : row.branch_name);
    if (!id || !name) continue;
    const rawProvince = text(
      provider === "hal"
        ? record(row.province).name
        : record(row.provinceID).provinceName,
    );
    branches.set(id, {
      id,
      name,
      code: text(provider === "hal" ? row.code : row.branch_code),
      district: text(
        provider === "hal" ? record(row.district).name : row.districtName,
      ).replace(/^ເມືອງ\s*/, ""),
      province: resolveLaosProvince(rawProvince)?.name ?? rawProvince,
    });
  }
  return [...branches.values()].sort(
    (a, b) =>
      a.province.localeCompare(b.province, "lo") ||
      a.name.localeCompare(b.name, "lo"),
  );
}
export function addressForTransportBranch(
  provider: BranchProvider,
  branch: TransportBranch,
): TransportAddress {
  return {
    branch: branch.name,
    branchCode: branch.code,
    city: branch.district,
    province: branch.province,
    transporters: [BRANCH_PROVIDERS[provider].transporter],
  };
}
