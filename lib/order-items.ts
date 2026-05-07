export type OrderItemProductType = "shirt_printed" | "pants_printed";

export type OrderItemRow = {
  id: string;
  order_id: string;
  line_no: number;
  product_type: OrderItemProductType;
  product_name: string;
  fabric_id: string | null;
  fabric_name: string;
  qty: number;
  free_qty: number;
  unit_price: number;
  extra_charge: number;
  line_discount: number;
  gross_total: number;
  net_total: number;
  factory_cost_total: number;
  size_breakdown: Record<string, number>;
  attributes: Record<string, unknown>;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type PantsOrderItemDraft = {
  id?: string;
  clientId: string;
  productName: string;
  fabricId: string;
  qty: number;
  freeQty: number;
  unitPrice: number;
  factoryCost: number;
  notes: string;
  mockupPath?: string | null;
  mockupUrl?: string | null;
  mockupFileName?: string | null;
  mockupFile?: File | null;
  mockupPreviewUrl?: string | null;
};

type ShirtOrderItemPayloadInput = {
  orderId: string;
  lineNo?: number;
  fabric: {
    id: string;
    name: string;
    shortPrice: number;
    longPrice: number;
  };
  shortQty: number;
  longQty: number;
  freeQty: number;
  qty3XL: number;
  qty4XL: number;
  qty5XL: number;
  qty6XL: number;
  grossTotal: number;
  netTotal: number;
  factoryCostTotal: number;
};

type PantsOrderItemPayloadInput = {
  orderId: string;
  lineNo: number;
  item: PantsOrderItemDraft;
  fabricsById: Map<string, { id: string; name: string }>;
};

export const PRINTED_SHIRT_PRODUCT_NAME = "ເສື້ອພິມລາຍ";
export const PRINTED_PANTS_PRODUCT_NAME = "ໂສ້ງພິມລາຍ";

export function isMissingOrderItemsTableError(error: { message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("order_items") && (message.includes("could not find the table") || message.includes("schema cache"));
}

export function buildOrderItemClientId() {
  return `order-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildEmptyPantsOrderItem(overrides?: Partial<PantsOrderItemDraft>): PantsOrderItemDraft {
  return {
    clientId: overrides?.clientId || buildOrderItemClientId(),
    id: overrides?.id,
    productName: overrides?.productName || PRINTED_PANTS_PRODUCT_NAME,
    fabricId: overrides?.fabricId || "",
    qty: Math.max(0, Number(overrides?.qty) || 0),
    freeQty: Math.max(0, Number(overrides?.freeQty) || 0),
    unitPrice: Math.max(0, Number(overrides?.unitPrice) || 0),
    factoryCost: Math.max(0, Number(overrides?.factoryCost) || 0),
    notes: overrides?.notes || "",
    mockupPath: overrides?.mockupPath ?? null,
    mockupUrl: overrides?.mockupUrl ?? null,
    mockupFileName: overrides?.mockupFileName ?? null,
    mockupFile: overrides?.mockupFile ?? null,
    mockupPreviewUrl: overrides?.mockupPreviewUrl ?? null,
  };
}

export function parsePantsDraftItems(value: unknown) {
  if (!Array.isArray(value)) return [] as PantsOrderItemDraft[];

  return value
    .map((entry, index) => {
      const row = typeof entry === "object" && entry ? (entry as Record<string, unknown>) : {};
      const rawId = typeof row.id === "string" ? row.id : undefined;
      const rawClientId = typeof row.clientId === "string" ? row.clientId : typeof row.client_id === "string" ? row.client_id : undefined;

      return buildEmptyPantsOrderItem({
        id: rawId,
        clientId: rawClientId || rawId || `pants-draft-${index + 1}`,
        productName:
          typeof row.productName === "string"
            ? row.productName
            : typeof row.product_name === "string"
              ? row.product_name
              : PRINTED_PANTS_PRODUCT_NAME,
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
        mockupPath:
          typeof row.mockupPath === "string"
            ? row.mockupPath
            : typeof row.mockup_path === "string"
              ? row.mockup_path
              : null,
        mockupUrl:
          typeof row.mockupUrl === "string"
            ? row.mockupUrl
            : typeof row.mockup_url === "string"
              ? row.mockup_url
              : null,
        mockupFileName:
          typeof row.mockupFileName === "string"
            ? row.mockupFileName
            : typeof row.mockup_file_name === "string"
              ? row.mockup_file_name
              : null,
      });
    })
    .filter((item) => item.productName.trim() || item.fabricId || item.qty > 0 || item.freeQty > 0 || item.unitPrice > 0 || item.factoryCost > 0 || item.notes.trim());
}

export function getPantsBillableQty(item: PantsOrderItemDraft) {
  return Math.max(0, Number(item.qty) || 0);
}

export function getPantsFreeQty(item: PantsOrderItemDraft) {
  return Math.max(0, Number(item.freeQty) || 0);
}

export function getPantsTotalQty(item: PantsOrderItemDraft) {
  return getPantsBillableQty(item) + getPantsFreeQty(item);
}

export function getPantsLineGross(item: PantsOrderItemDraft) {
  return getPantsBillableQty(item) * Math.max(0, Number(item.unitPrice) || 0);
}

export function getPantsLineNet(item: PantsOrderItemDraft) {
  return getPantsLineGross(item);
}

export function getPantsLineFactoryCost(item: PantsOrderItemDraft) {
  return Math.max(0, Number(item.factoryCost) || 0);
}

export function getPantsItemsSummary(items: PantsOrderItemDraft[]) {
  return items.reduce(
    (acc, item) => {
      acc.billableQty += getPantsBillableQty(item);
      acc.freeQty += getPantsFreeQty(item);
      acc.grossTotal += getPantsLineGross(item);
      acc.netTotal += getPantsLineNet(item);
      acc.factoryCostTotal += getPantsLineFactoryCost(item);
      return acc;
    },
    { billableQty: 0, freeQty: 0, grossTotal: 0, netTotal: 0, factoryCostTotal: 0 }
  );
}

export function buildShirtOrderItemPayload(input: ShirtOrderItemPayloadInput) {
  const billableQty = Math.max(0, Number(input.shortQty) || 0) + Math.max(0, Number(input.longQty) || 0);
  const unitPrice = billableQty > 0 ? Math.round((Math.max(0, Number(input.grossTotal) || 0) / billableQty) * 100) / 100 : 0;

  return {
    order_id: input.orderId,
    line_no: input.lineNo ?? 1,
    product_type: "shirt_printed" as const,
    product_name: PRINTED_SHIRT_PRODUCT_NAME,
    fabric_id: input.fabric.id,
    fabric_name: input.fabric.name,
    qty: billableQty,
    free_qty: Math.max(0, Number(input.freeQty) || 0),
    unit_price: unitPrice,
    extra_charge: 0,
    line_discount: 0,
    gross_total: Math.max(0, Number(input.grossTotal) || 0),
    net_total: Math.max(0, Number(input.netTotal) || 0),
    factory_cost_total: Math.max(0, Number(input.factoryCostTotal) || 0),
    size_breakdown: {
      short_qty: Math.max(0, Number(input.shortQty) || 0),
      long_qty: Math.max(0, Number(input.longQty) || 0),
      free_qty: Math.max(0, Number(input.freeQty) || 0),
      qty_3xl: Math.max(0, Number(input.qty3XL) || 0),
      qty_4xl: Math.max(0, Number(input.qty4XL) || 0),
      qty_5xl: Math.max(0, Number(input.qty5XL) || 0),
      qty_6xl: Math.max(0, Number(input.qty6XL) || 0),
    },
    attributes: {
      short_price: Math.max(0, Number(input.fabric.shortPrice) || 0),
      long_price: Math.max(0, Number(input.fabric.longPrice) || 0),
    },
    notes: "",
  };
}

export function buildPantsOrderItemPayload(input: PantsOrderItemPayloadInput) {
  const fabric = input.fabricsById.get(input.item.fabricId);
  return {
    order_id: input.orderId,
    line_no: input.lineNo,
    product_type: "pants_printed" as const,
    product_name: input.item.productName.trim() || PRINTED_PANTS_PRODUCT_NAME,
    fabric_id: input.item.fabricId || null,
    fabric_name: fabric?.name || "",
    qty: getPantsBillableQty(input.item),
    free_qty: getPantsFreeQty(input.item),
    unit_price: Math.max(0, Number(input.item.unitPrice) || 0),
    extra_charge: 0,
    line_discount: 0,
    gross_total: getPantsLineGross(input.item),
    net_total: getPantsLineNet(input.item),
    factory_cost_total: getPantsLineFactoryCost(input.item),
    size_breakdown: {},
    attributes: {
      mockup_path: input.item.mockupPath ?? null,
      mockup_url: input.item.mockupUrl ?? null,
      mockup_file_name: input.item.mockupFileName ?? null,
    },
    notes: input.item.notes.trim(),
  };
}

export function parsePantsOrderItems(rows: OrderItemRow[]) {
  return rows
    .filter((row) => row.product_type === "pants_printed")
    .sort((a, b) => a.line_no - b.line_no)
    .map((row) =>
      {
        const attributes = row.attributes && typeof row.attributes === "object" ? (row.attributes as Record<string, unknown>) : {};
        return (
      buildEmptyPantsOrderItem({
        id: row.id,
        clientId: row.id,
        productName: row.product_name || PRINTED_PANTS_PRODUCT_NAME,
        fabricId: row.fabric_id || "",
        qty: Math.max(0, Number(row.qty) || 0),
        freeQty: Math.max(0, Number(row.free_qty) || 0),
        unitPrice: Math.max(0, Number(row.unit_price) || 0),
        factoryCost: Math.max(0, Number(row.factory_cost_total) || 0),
        notes: row.notes || "",
        mockupPath: typeof attributes.mockup_path === "string" ? attributes.mockup_path : null,
        mockupUrl: typeof attributes.mockup_url === "string" ? attributes.mockup_url : null,
        mockupFileName: typeof attributes.mockup_file_name === "string" ? attributes.mockup_file_name : null,
      })
        );
      }
    );
}
