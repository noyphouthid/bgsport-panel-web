import { getProductionCollarLabel, normalizeProductionCollarCode } from "@/lib/production-collars";
import { buildEmptyPantsOrderItem, getPantsTotalQty, type PantsOrderItemDraft } from "@/lib/order-items";
import { sortProductionPlayerRowsBySize } from "@/lib/production-player-rows";

export type ProductionSleeveType = "short" | "long" | "mixed" | "raglan" | "basketball";
export type ProductionCollarType = string;
export type ProductionHemType = "straight" | "curved";
export type ProductionSlotCount = 1 | 2 | 3 | 4 | 5 | 6;
export type ProductionSizeKey = "xs" | "jxs" | "js" | "jm" | "jl" | "jxl" | "j2xl" | "s" | "m" | "l" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl";
export type ProductionPriority = "normal" | "urgent";
export type ProductionPlayerMode = "none" | "name_only" | "number_only" | "name_and_number";

export type ProductionSizeMap = Record<ProductionSizeKey, number>;

export type ProductionPlayerRow = {
  id: string;
  size: ProductionSizeKey | "";
  player_name: string;
  jersey_number: string;
  note: string;
};

export type ProductionItem = {
  client_id: string;
  sleeve_type: ProductionSleeveType;
  collar_type: ProductionCollarType;
  collar_label?: string;
  hem_type: ProductionHemType;
  mockup_url: string | null;
  mockup_path: string | null;
  mockup_file_name: string | null;
  mockup_file: File | null;
  mockup_preview_url: string | null;
  sizes: ProductionSizeMap;
  player_mode: ProductionPlayerMode;
  player_rows: ProductionPlayerRow[];
};

export type PantsProductionItem = PantsOrderItemDraft & {
  mockup_url: string | null;
  mockup_path: string | null;
  mockup_file_name: string | null;
  mockup_file: File | null;
  mockup_preview_url: string | null;
  sizes: ProductionSizeMap;
  player_mode: ProductionPlayerMode;
  player_rows: ProductionPlayerRow[];
};

export const PRODUCTION_SLEEVE_OPTIONS: Array<{ value: ProductionSleeveType; label: string }> = [
  { value: "short", label: "ແຂນສັ້ນ" },
  { value: "long", label: "ແຂນຍາວ" },
  { value: "mixed", label: "ແຂນສັ້ນ/ແຂນຍາວ" },
  { value: "raglan", label: "ແຂນກິ້ນ" },
  { value: "basketball", label: "ເສື້ອບາສ" },
];


export const PRODUCTION_HEM_OPTIONS: Array<{ value: ProductionHemType; label: string }> = [
  { value: "straight", label: "ຕີນຊື່" },
  { value: "curved", label: "ຕີນໂຄ້ງ" },
];

export const PRODUCTION_SIZE_FIELDS: Array<{ key: ProductionSizeKey; label: string }> = [
  { key: "xs", label: "XS" },
  { key: "jxs", label: "JXS" },
  { key: "js", label: "JS" },
  { key: "jm", label: "JM" },
  { key: "jl", label: "JL" },
  { key: "jxl", label: "JXL" },
  { key: "j2xl", label: "J2XL" },
  { key: "s", label: "S" },
  { key: "m", label: "M" },
  { key: "l", label: "L" },
  { key: "xl", label: "XL" },
  { key: "2xl", label: "2XL" },
  { key: "3xl", label: "3XL" },
  { key: "4xl", label: "4XL" },
  { key: "5xl", label: "5XL" },
  { key: "6xl", label: "6XL" },
];

export function toPositiveInt(value: unknown) {
  return Math.max(0, Number(value) || 0);
}

export function buildEmptySizeMap(): ProductionSizeMap {
  return {
    xs: 0,
    jxs: 0,
    js: 0,
    jm: 0,
    jl: 0,
    jxl: 0,
    j2xl: 0,
    s: 0,
    m: 0,
    l: 0,
    xl: 0,
    "2xl": 0,
    "3xl": 0,
    "4xl": 0,
    "5xl": 0,
    "6xl": 0,
  };
}

export function buildClientId() {
  return `production-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildPlayerRowId() {
  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildEmptyPlayerRow(overrides?: Partial<ProductionPlayerRow>): ProductionPlayerRow {
  return {
    id: buildPlayerRowId(),
    size: overrides?.size ?? "",
    player_name: overrides?.player_name ?? "",
    jersey_number: overrides?.jersey_number ?? "",
    note: overrides?.note ?? "",
  };
}

export function mapLegacyCollarType(value?: string | null): ProductionCollarType {
  if (value === "polo") return "polo";
  if (value === "mandarin") return "mandarin";
  return "crew";
}

export function buildEmptyProductionItem(
  overrides?: Partial<Omit<ProductionItem, "client_id" | "sizes">> & { sizes?: Partial<ProductionSizeMap> }
): ProductionItem {
  return {
    client_id: buildClientId(),
    sleeve_type: overrides?.sleeve_type ?? "short",
    collar_type: overrides?.collar_type ?? "crew",
    collar_label: overrides?.collar_label,
    hem_type: overrides?.hem_type ?? "straight",
    mockup_url: overrides?.mockup_url ?? null,
    mockup_path: overrides?.mockup_path ?? null,
    mockup_file_name: overrides?.mockup_file_name ?? null,
    mockup_file: overrides?.mockup_file ?? null,
    mockup_preview_url: overrides?.mockup_preview_url ?? null,
    player_mode: overrides?.player_mode ?? "none",
    player_rows: overrides?.player_rows ?? [],
    sizes: {
      ...buildEmptySizeMap(),
      ...(overrides?.sizes ?? {}),
    },
  };
}

export function getProductionItemTotal(item: ProductionItem) {
  const sizeMap = getProductionItemSizeMap(item);
  return PRODUCTION_SIZE_FIELDS.reduce((sum, field) => sum + (Number(sizeMap[field.key]) || 0), 0);
}

export function getFilledPlayerRows(item: { player_rows: ProductionPlayerRow[] }) {
  return sortProductionPlayerRowsBySize(
    item.player_rows.filter((row) => row.size || row.player_name.trim() || row.jersey_number.trim() || row.note.trim())
  );
}

export function getProductionItemSizeMap(item: ProductionItem) {
  const filledRows = getFilledPlayerRows(item);
  const derivedSizes = buildEmptySizeMap();
  let hasSizedRows = false;

  if (item.player_mode !== "none") {
    for (const row of filledRows) {
      if (!row.size) continue;
      derivedSizes[row.size] = (Number(derivedSizes[row.size]) || 0) + 1;
      hasSizedRows = true;
    }
  }

  return hasSizedRows ? derivedSizes : item.sizes;
}

export function playerModeNeedsName(mode: ProductionPlayerMode) {
  return mode === "name_only" || mode === "name_and_number";
}

export function playerModeNeedsNumber(mode: ProductionPlayerMode) {
  return mode === "number_only" || mode === "name_and_number";
}

export function getPlayerModeInstruction(mode: ProductionPlayerMode, numberLabel = "ເບີເສື້ອ") {
  if (mode === "name_only") return "ໄຊສ໌ + ຊື່ Player";
  if (mode === "number_only") return `ໄຊສ໌ + ${numberLabel}`;
  return `ໄຊສ໌ + ຊື່ + ${numberLabel}`;
}

export function getPlayerModePreviewTitle(mode: ProductionPlayerMode, numberLabel = "ເບີເສື້ອ") {
  if (mode === "name_only") return "NAME LIST";
  if (mode === "number_only") return "LIST";
  return `ຊື່ ແລະ ${numberLabel}`;
}

export function getPlayerModeCsvLabel(mode: ProductionPlayerMode) {
  if (mode === "name_only") return "ຊື່";
  if (mode === "number_only") return "ເບີເສື້ອ";
  if (mode === "name_and_number") return "ຊື່+ເບີເສື້ອ";
  return "ຈຳນວນໄຊສ໌";
}

export function getPlayerPreviewTextClass(mode: ProductionPlayerMode) {
  if (mode === "name_and_number") return "text-[11px] leading-tight tracking-tight";
  if (mode === "name_only") return "text-[12px] leading-[1.3]";
  return "text-[13px] leading-snug";
}

export function getProductionSleeveLabel(value: ProductionSleeveType) {
  return PRODUCTION_SLEEVE_OPTIONS.find((option) => option.value === value)?.label || "-";
}


export function getProductionHemLabel(value: ProductionHemType) {
  return PRODUCTION_HEM_OPTIONS.find((option) => option.value === value)?.label || "-";
}

export function parseProductionItems(raw: unknown, fallbackSleeve: ProductionSleeveType, fallbackCollar: ProductionCollarType) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [buildEmptyProductionItem({ sleeve_type: fallbackSleeve, collar_type: fallbackCollar })];
  }

  const items = raw
    .slice(0, 6)
    .map((entry) => {
      const row = typeof entry === "object" && entry ? (entry as Record<string, unknown>) : {};
      const nestedSizes = typeof row.sizes === "object" && row.sizes ? (row.sizes as Record<string, unknown>) : {};
      const nestedPlayers = Array.isArray(row.player_rows) ? row.player_rows : [];
      return buildEmptyProductionItem({
        sleeve_type:
          row.sleeve_type === "long" ||
          row.sleeve_type === "mixed" ||
          row.sleeve_type === "short" ||
          row.sleeve_type === "raglan" ||
          row.sleeve_type === "basketball"
            ? (row.sleeve_type as ProductionSleeveType)
            : fallbackSleeve,
        collar_type: normalizeProductionCollarCode(row.collar_type, fallbackCollar),
        collar_label: getProductionCollarLabel(normalizeProductionCollarCode(row.collar_type, fallbackCollar), typeof row.collar_label === "string" ? row.collar_label : undefined),
        hem_type:
          row.hem_type === "curved" || row.hem_type === "straight"
            ? (row.hem_type as ProductionHemType)
            : "straight",
        mockup_url: typeof row.mockup_url === "string" ? row.mockup_url : null,
        mockup_path: typeof row.mockup_path === "string" ? row.mockup_path : null,
        mockup_file_name: typeof row.mockup_file_name === "string" ? row.mockup_file_name : null,
        player_mode:
          row.player_mode === "name_only" ||
          row.player_mode === "number_only" ||
          row.player_mode === "name_and_number" ||
          row.player_mode === "none"
            ? (row.player_mode as ProductionPlayerMode)
            : "none",
        player_rows: nestedPlayers
          .map((player) => {
            const playerRow = typeof player === "object" && player ? (player as Record<string, unknown>) : {};
            const sizeValue = typeof playerRow.size === "string" ? playerRow.size : "";
            const isValidSize = PRODUCTION_SIZE_FIELDS.some((field) => field.key === sizeValue);
            return buildEmptyPlayerRow({
              size: isValidSize ? (sizeValue as ProductionSizeKey) : "",
              player_name: typeof playerRow.player_name === "string" ? playerRow.player_name : "",
              jersey_number: typeof playerRow.jersey_number === "string" ? playerRow.jersey_number : "",
              note: typeof playerRow.note === "string" ? playerRow.note : "",
            });
          })
          .filter((player) => player.size || player.player_name.trim() || player.jersey_number.trim() || player.note.trim()),
        sizes: {
          xs: toPositiveInt(nestedSizes.xs),
          jxs: toPositiveInt(nestedSizes.jxs),
          js: toPositiveInt(nestedSizes.js),
          jm: toPositiveInt(nestedSizes.jm),
          jl: toPositiveInt(nestedSizes.jl),
          jxl: toPositiveInt(nestedSizes.jxl),
          j2xl: toPositiveInt(nestedSizes.j2xl),
          s: toPositiveInt(nestedSizes.s),
          m: toPositiveInt(nestedSizes.m),
          l: toPositiveInt(nestedSizes.l),
          xl: toPositiveInt(nestedSizes.xl),
          "2xl": toPositiveInt(nestedSizes["2xl"]),
          "3xl": toPositiveInt(nestedSizes["3xl"]),
          "4xl": toPositiveInt(nestedSizes["4xl"]),
          "5xl": toPositiveInt(nestedSizes["5xl"]),
          "6xl": toPositiveInt(nestedSizes["6xl"]),
        },
      });
    })
    .filter(Boolean);

  return items.length > 0 ? items : [buildEmptyProductionItem({ sleeve_type: fallbackSleeve, collar_type: fallbackCollar })];
}

export function ensureProductionItemCount(items: ProductionItem[], count: ProductionSlotCount) {
  const next = items.slice(0, count);
  while (next.length < count) next.push(buildEmptyProductionItem());
  return next;
}

export function buildEmptyPantsProductionItem(overrides?: Partial<PantsProductionItem>): PantsProductionItem {
  const base = buildEmptyPantsOrderItem(overrides);
  return {
    ...base,
    mockup_url: overrides?.mockup_url ?? null,
    mockup_path: overrides?.mockup_path ?? null,
    mockup_file_name: overrides?.mockup_file_name ?? null,
    mockup_file: overrides?.mockup_file ?? null,
    mockup_preview_url: overrides?.mockup_preview_url ?? null,
    player_mode: overrides?.player_mode ?? "none",
    player_rows: overrides?.player_rows ?? [],
    sizes: {
      ...buildEmptySizeMap(),
      ...(overrides?.sizes ?? {}),
    },
  };
}

export function parsePantsProductionItems(raw: unknown) {
  if (!Array.isArray(raw) || raw.length === 0) return [] as PantsProductionItem[];

  return raw
    .map((entry, index) => {
      const row = typeof entry === "object" && entry ? (entry as Record<string, unknown>) : {};
      const nestedSizes = typeof row.sizes === "object" && row.sizes ? (row.sizes as Record<string, unknown>) : {};
      const nestedPlayers = Array.isArray(row.player_rows) ? row.player_rows : [];
      return buildEmptyPantsProductionItem({
        id: typeof row.id === "string" ? row.id : undefined,
        clientId:
          typeof row.clientId === "string"
            ? row.clientId
            : typeof row.client_id === "string"
              ? row.client_id
              : `pants-production-${index + 1}`,
        productName:
          typeof row.productName === "string"
            ? row.productName
            : typeof row.product_name === "string"
              ? row.product_name
              : undefined,
        fabricId:
          typeof row.fabricId === "string"
            ? row.fabricId
            : typeof row.fabric_id === "string"
              ? row.fabric_id
              : "",
        qty: Math.max(0, Number(row.qty) || 0),
        freeQty:
          typeof row.freeQty !== "undefined"
            ? Math.max(0, Number(row.freeQty) || 0)
            : Math.max(0, Number(row.free_qty) || 0),
        unitPrice:
          typeof row.unitPrice !== "undefined"
            ? Math.max(0, Number(row.unitPrice) || 0)
            : Math.max(0, Number(row.unit_price) || 0),
        factoryCost:
          typeof row.factoryCost !== "undefined"
            ? Math.max(0, Number(row.factoryCost) || 0)
            : Math.max(0, Number(row.factory_cost) || 0),
        notes: typeof row.notes === "string" ? row.notes : "",
        mockup_url: typeof row.mockup_url === "string" ? row.mockup_url : null,
        mockup_path: typeof row.mockup_path === "string" ? row.mockup_path : null,
        mockup_file_name: typeof row.mockup_file_name === "string" ? row.mockup_file_name : null,
        player_mode: row.player_mode === "number_only" ? "number_only" : "none",
        player_rows: nestedPlayers
          .map((player) => {
            const playerRow = typeof player === "object" && player ? (player as Record<string, unknown>) : {};
            const sizeValue = typeof playerRow.size === "string" ? playerRow.size : "";
            return buildEmptyPlayerRow({
              size: PRODUCTION_SIZE_FIELDS.some((field) => field.key === sizeValue) ? (sizeValue as ProductionSizeKey) : "",
              player_name: "",
              jersey_number: typeof playerRow.jersey_number === "string" ? playerRow.jersey_number : "",
              note: typeof playerRow.note === "string" ? playerRow.note : "",
            });
          })
          .filter((player) => player.size || player.player_name.trim() || player.jersey_number.trim() || player.note.trim()),
        sizes: {
          xs: toPositiveInt(nestedSizes.xs),
          jxs: toPositiveInt(nestedSizes.jxs),
          js: toPositiveInt(nestedSizes.js),
          jm: toPositiveInt(nestedSizes.jm),
          jl: toPositiveInt(nestedSizes.jl),
          jxl: toPositiveInt(nestedSizes.jxl),
          j2xl: toPositiveInt(nestedSizes.j2xl),
          s: toPositiveInt(nestedSizes.s),
          m: toPositiveInt(nestedSizes.m),
          l: toPositiveInt(nestedSizes.l),
          xl: toPositiveInt(nestedSizes.xl),
          "2xl": toPositiveInt(nestedSizes["2xl"]),
          "3xl": toPositiveInt(nestedSizes["3xl"]),
          "4xl": toPositiveInt(nestedSizes["4xl"]),
          "5xl": toPositiveInt(nestedSizes["5xl"]),
          "6xl": toPositiveInt(nestedSizes["6xl"]),
        },
      });
    })
    .filter((item) => item.productName.trim() || item.fabricId || getPantsTotalQty(item) > 0);
}

export function getPantsProductionItemTotal(item: PantsProductionItem) {
  const sizeMap = getPantsProductionItemSizeMap(item);
  return PRODUCTION_SIZE_FIELDS.reduce((sum, field) => sum + (Number(sizeMap[field.key]) || 0), 0);
}

export function getPantsProductionItemSizeMap(item: PantsProductionItem) {
  const filledRows = getFilledPlayerRows(item);
  const derivedSizes = buildEmptySizeMap();
  let hasSizedRows = false;

  if (item.player_mode !== "none") {
    for (const row of filledRows) {
      if (!row.size) continue;
      derivedSizes[row.size] = (Number(derivedSizes[row.size]) || 0) + 1;
      hasSizedRows = true;
    }
  }

  return hasSizedRows ? derivedSizes : item.sizes;
}

export type DepositSubmitInput = {
  order_code?: string | null;
  team_name?: string | null;
  fabric_id?: string | null;
  admin_user_id?: string | null;
  graphic_user_id?: string | null;
  production_sent_date?: string | null;
  delivery_date?: string | null;
  production_priority?: ProductionPriority | null;
  urgent_due_date?: string | null;
  short_qty?: number | null;
  long_qty?: number | null;
  free_qty?: number | null;
  sleeve_type?: ProductionSleeveType | null;
  collar_type?: string | null;
  production_items?: unknown;
  pants_items?: unknown;
};

// Mirrors the form's submit validation for a saved row, returning the first blocking problem.
export function getDepositSubmitBlocker(row: DepositSubmitInput, isFabricActive: boolean): string | null {
  if (!row.order_code?.trim()) return "ກະລຸນາປ້ອນລະຫັດອໍເດີ";
  if (!row.team_name?.trim()) return "ກະລຸນາປ້ອນຊື່ທີມ";
  if (!isFabricActive) return "ກະລຸນາເລືອກຜ້າ";
  if (!row.admin_user_id) return "ກະລຸນາເລືອກແອັດມິນ";
  if (!row.graphic_user_id) return "ກະລຸນາເລືອກຜູ້ອອກແບບ";

  for (const item of parsePantsProductionItems(row.pants_items)) {
    const targetQty = getPantsTotalQty(item);
    const name = item.productName || "ລາຍການໂສ້ງ";
    if (targetQty <= 0) return "ລາຍການໂສ້ງແຕ່ລະອັນຕ້ອງມີຈຳນວນຫຼາຍກວ່າ 0";
    if (!item.fabricId) return "ກະລຸນາເລືອກຜ້າໃຫ້ລາຍການໂສ້ງ";
    if ((Number(item.unitPrice) || 0) <= 0) return "ກະລຸນາປ້ອນລາຄາຂາຍຂອງລາຍການໂສ້ງ";
    if (getPantsProductionItemTotal(item) !== targetQty) return `ຈຳນວນໄຊສ໌ຂອງ ${name} ຕ້ອງເທົ່າກັບ ${targetQty}`;
    if (!item.mockup_url) return `ກະລຸນາແນບ mockup ໃຫ້ ${name}`;
    if (item.player_mode !== "none") {
      const filledRows = getFilledPlayerRows(item);
      if (filledRows.length !== targetQty) return `ຈຳນວນລາຍຊື່ Player/ເບີໂສ້ງ ຂອງ ${name} ຕ້ອງເທົ່າກັບ ${targetQty}`;
      for (const player of filledRows) {
        if (!player.size) return "ກະລຸນາເລືອກໄຊສ໌ໃຫ້ຄົບທຸກລາຍການເບີໂສ້ງ";
        if (playerModeNeedsNumber(item.player_mode) && !player.jersey_number.trim()) return "ກະລຸນາປ້ອນເບີໂສ້ງໃຫ້ຄົບ";
      }
    }
  }

  if (!row.production_sent_date) return "ກະລຸນາເລືອກວັນທີ່ສົ່ງຜະລິດ";
  if (!row.delivery_date) return "ກະລຸນາເລືອກກຳນົດສົ່ງລູກຄ້າ";
  if (row.production_priority === "urgent" && !row.urgent_due_date) return "ກະລຸນາເລືອກວັນທີກຳນົດສົ່ງສຳລັບງານດ່ວນ";

  const items = parseProductionItems(row.production_items, row.sleeve_type || "short", mapLegacyCollarType(row.collar_type));
  const orderedQty = toPositiveInt(row.short_qty) + toPositiveInt(row.long_qty) + toPositiveInt(row.free_qty);
  if (items.reduce((sum, item) => sum + getProductionItemTotal(item), 0) !== orderedQty) return "ຈຳນວນໄຊສ໌ລວມທຸກແບບຕ້ອງເທົ່າກັບຈຳນວນຜະລິດລວມ";
  for (const item of items) {
    const itemTotal = getProductionItemTotal(item);
    if (itemTotal <= 0) return "ແຕ່ລະແບບຜະລິດຕ້ອງມີຈຳນວນຢ່າງໜ້ອຍ 1";
    if (!item.mockup_url) return "ກະລຸນາແນບຮູບ mockup ໃຫ້ຄົບທຸກແບບ";
    if (item.player_mode !== "none") {
      const filledRows = getFilledPlayerRows(item);
      if (filledRows.length !== itemTotal) return "ຈຳນວນລາຍຊື່ Player/ເບີ ຕ້ອງເທົ່າກັບຈຳນວນເສື້ອຂອງແບບນັ້ນ";
      for (const player of filledRows) {
        if (!player.size) return "ກະລຸນາເລືອກໄຊສ໌ໃຫ້ຄົບທຸກລາຍຊື່ Player";
        if (playerModeNeedsNumber(item.player_mode) && !player.jersey_number.trim()) return "ກະລຸນາປ້ອນເບີເສື້ອໃຫ້ຄົບ";
        if (playerModeNeedsName(item.player_mode) && !player.player_name.trim()) return "ກະລຸນາປ້ອນຊື່ Player ໃຫ້ຄົບ";
      }
    }
  }
  return null;
}
