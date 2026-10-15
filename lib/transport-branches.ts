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
  unitel: {
    name: "Unitel Logistic",
    transporter: "Unitel Logistic",
    sourceUrl: "https://unilogistic.besgroup.vn/lo/offices",
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
  source?: "supabase";
};
export type TransportAddress = {
  branch: string;
  branchCode: string;
  city: string;
  province: string;
  transporters: string[];
};
export function isBranchProvider(value: string): value is BranchProvider {
  return value === "hal" || value === "anousith" || value === "unitel";
}
export function branchProviderForTransporter(
  value: string,
): BranchProvider | null {
  if (value === "HAL Logistic" || value === "HAL Express") return "hal";
  if (value === "Unitel Logistic") return "unitel";
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
    const id = text(provider === "anousith" ? row.id_branch : row.id);
    const name = text(provider === "anousith" ? row.branch_name : row.name);
    if (!id || !name) continue;
    const rawProvince = text(
      provider === "unitel"
        ? row.province
        : provider === "hal"
          ? record(row.province).name
          : record(row.provinceID).provinceName,
    );
    branches.set(id, {
      id,
      name,
      code: text(provider === "anousith" ? row.branch_code : row.code),
      district: text(
        provider === "unitel"
          ? row.district
          : provider === "hal"
            ? record(row.district).name
            : row.districtName,
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

// Unitel publishes a formatted address ending in district, province, Laos.
// Match those exact trailing fields against its public geography directory;
// never guess a district from a village name, branch code or free-text address.
export function normalizeUnitelBranches(
  rows: unknown,
  provinces: unknown,
  districts: unknown,
): TransportBranch[] {
  if (
    !Array.isArray(rows) ||
    !Array.isArray(provinces) ||
    !Array.isArray(districts) ||
    !provinces.length ||
    !districts.length
  ) {
    throw new Error("Invalid Unitel geography directory");
  }
  const districtKey = (value: string) =>
    value
      .normalize("NFC")
      .replace(/^\s*ເມືອງ\s*/, "")
      .replace(/\s+/g, "")
      .replace(/ໍາ/g, "ຳ");
  const provinceById = new Map<string, { sourceId: string; name: string }>();
  for (const value of provinces) {
    const province = record(value);
    if (Number(province.status) !== 1 || province.countrycode !== "LA")
      continue;
    const canonical = resolveLaosProvince(text(province.name));
    if (canonical && text(province.id))
      provinceById.set(canonical.id, {
        sourceId: text(province.id),
        name: canonical.name,
      });
  }
  const districtByParentAndName = new Map<string, string>();
  for (const value of districts) {
    const district = record(value);
    if (Number(district.status) !== 1 || district.countrycode !== "LA")
      continue;
    const name = text(district.name);
    if (name && text(district.parentId))
      districtByParentAndName.set(
        `${text(district.parentId)}|${districtKey(name)}`,
        name,
      );
  }
  if (!provinceById.size || !districtByParentAndName.size)
    throw new Error("Invalid Unitel geography directory");
  return normalizeTransportBranches(
    "unitel",
    rows.map((value) => {
      const row = record(value);
      const parts = text(row.address)
        .split(",")
        .map((part) => part.trim());
      const candidate =
        parts.at(-1)?.toLowerCase() === "laos"
          ? resolveLaosProvince(parts.at(-2))
          : null;
      const province = candidate ? provinceById.get(candidate.id) : undefined;
      const district = province
        ? districtByParentAndName.get(
            `${province.sourceId}|${districtKey(parts.at(-3) || "")}`,
          ) || ""
        : "";
      const code = text(row.code);
      const name = text(row.name);
      return {
        id: row.id,
        code,
        name:
          code && name.startsWith(`${code} - `)
            ? name.slice(code.length + 3).trim()
            : name,
        district,
        province: province?.name || "",
      };
    }),
  );
}
