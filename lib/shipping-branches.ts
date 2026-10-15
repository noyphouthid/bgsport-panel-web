import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BRANCH_PROVIDERS,
  normalizeTransportBranches,
  type TransportBranchDirectory,
  type BranchProvider,
} from "@/lib/transport-branches";

export class ShippingBranchDirectoryError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}

// Read only the fields used by the picker. Raw source payloads/contact details
// stay in the database. No carrier API or cached API directory is a fallback.
const COMPANIES: Record<BranchProvider, string> = {
  hal: "HAL",
  anousith: "ANOUSITH",
  unitel: "UNITEL",
};

export async function loadImportedTransportBranches(
  client: Pick<SupabaseClient, "from"> | null,
  provider: BranchProvider,
  now: () => number = Date.now,
): Promise<TransportBranchDirectory> {
  if (!client)
    throw new ShippingBranchDirectoryError("ບໍ່ສາມາດເຊື່ອມຕໍ່ຖານຂໍ້ມູນສາຂາໄດ້");
  const carrierName = BRANCH_PROVIDERS[provider].name;
  const migration =
    provider === "anousith"
      ? "20261018_import_anousith_branches.sql"
      : "20261019_import_hal_unitel_branches.sql";
  const rows: {
    id: string;
    source_id: string | null;
    branch_name: string;
    branch_code: string | null;
    province: string | null;
    district: string | null;
  }[] = [];
  const seenIds = new Set<string>();
  const seenSourceIds = new Set<string>();
  let total: number | null = null;
  for (let page = 0; page < 100; page++) {
    const { data, error, count } = await client
      .from("shipping_branches")
      .select("id,source_id,branch_name,branch_code,province,district", {
        count: "exact",
      })
      .eq("company", COMPANIES[provider])
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(rows.length, rows.length + 199);
    if (error) {
      if (["PGRST205", "42P01", "42703", "PGRST204"].includes(error.code)) {
        throw new ShippingBranchDirectoryError(
          `ກະລຸນານຳເຂົ້າສາຂາ ${carrierName} ກ່ອນ (${migration})`,
        );
      }
      throw new ShippingBranchDirectoryError(
        `ໂຫຼດສາຂາ ${carrierName} ທີ່ນຳເຂົ້າບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່`,
      );
    }
    if (
      !Array.isArray(data) ||
      count === null ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > 20000 ||
      (total !== null && count !== total)
    ) {
      throw new ShippingBranchDirectoryError(
        `ລາຍຊື່ສາຂາ ${carrierName} ມີການປ່ຽນແປງ ກະລຸນາລອງໃໝ່`,
      );
    }
    total = count;
    if (total === 0)
      throw new ShippingBranchDirectoryError(
        `ຍັງບໍ່ມີສາຂາ ${carrierName} ທີ່ນຳເຂົ້າ ກະລຸນານຳເຂົ້າລາຍຊື່ສາຂາກ່ອນ`,
        409,
      );
    if (!data.length || rows.length + data.length > total)
      throw new ShippingBranchDirectoryError(
        `ລາຍຊື່ສາຂາ ${carrierName} ບໍ່ຄົບ ກະລຸນາລອງໃໝ່`,
      );
    for (const row of data) {
      if (
        typeof row.id !== "string" ||
        !row.id.trim() ||
        typeof row.branch_name !== "string" ||
        !row.branch_name.trim() ||
        seenIds.has(row.id) ||
        (row.source_id && seenSourceIds.has(row.source_id))
      ) {
        throw new ShippingBranchDirectoryError(
          `ຂໍ້ມູນສາຂາ ${carrierName} ຊ້ຳ ຫຼືບໍ່ສົມບູນ ກະລຸນາກວດສອບລາຍຊື່ທີ່ນຳເຂົ້າ`,
        );
      }
      seenIds.add(row.id);
      if (row.source_id) seenSourceIds.add(row.source_id);
      rows.push(row);
    }
    if (rows.length === total) {
      const branches = normalizeTransportBranches(
        "anousith",
        rows.map((row) => ({
          id_branch: row.source_id || row.id,
          branch_name: row.branch_name,
          branch_code: row.branch_code,
          provinceID: { provinceName: row.province },
          districtName: row.district,
          public: 1,
        })),
      );
      if (branches.length !== total)
        throw new ShippingBranchDirectoryError(
          `ຂໍ້ມູນສາຂາ ${carrierName} ບໍ່ສົມບູນ`,
        );
      return {
        provider,
        branches,
        source: "supabase",
        sourceUrl: BRANCH_PROVIDERS[provider].sourceUrl,
        fetchedAt: new Date(now()).toISOString(),
        stale: false,
      };
    }
  }
  throw new ShippingBranchDirectoryError(
    `ລາຍຊື່ສາຂາ ${carrierName} ເກີນຂີດຈຳກັດ`,
  );
}
