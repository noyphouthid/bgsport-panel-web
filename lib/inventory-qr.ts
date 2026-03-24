export type OrderQrLabelStatus = "created" | "received" | "shipped";

export type OrderSummary = {
  id: string;
  order_code: string;
  customer_phone?: string | null;
  customer_whatsapp?: string | null;
  factory_bill_code: string | null;
  order_date?: string;
  production_completed_at?: string | null;
  shipment_status?: "pending" | "shipped";
  shipment_completed_at?: string | null;
  short_qty?: number;
  long_qty?: number;
  free_qty?: number;
  qty_3xl?: number;
  qty_4xl?: number;
  qty_5xl?: number;
  net_total?: number;
  balance?: number;
  initial_deposit?: number;
  factory_cost?: number;
  customer_paid_full_at?: string | null;
  factory_paid_full_at?: string | null;
  status?: "in_progress" | "completed";
};

export type QrLabelRow = {
  id: string;
  order_id: string;
  qr_code: string;
  order_code: string;
  factory_bill_code: string | null;
  label_status: OrderQrLabelStatus;
  received_at: string | null;
  received_by: string | null;
  shipped_at: string | null;
  shipped_by: string | null;
  last_scanned_at: string | null;
  created_at: string;
  updated_at?: string;
};

export type QrInputKind = "shop_qr" | "factory_qr" | "factory_bill_code" | "order_code" | "unknown";

const QR_PREFIX = "BGSPORT-FACTORY";
const FACTORY_URL_BILL_PATTERN = /\/orders\/(\d+)\/print(?:[/?#]|$)/i;
const NUMERIC_CODE_PATTERN = /^\d{4,}$/;
const ORDER_CODE_PATTERN = /^[A-Z]{2,6}\d{2}-\d{1,}$/i;
const SHOP_QR_SPLITTER = /\|/;

export function buildOrderQrCode(order: Pick<OrderSummary, "id" | "order_code" | "factory_bill_code">) {
  const factoryBillCode = String(order.factory_bill_code || "").trim();
  if (!factoryBillCode) {
    throw new Error("ຈຳເປັນຕ້ອງມີລະຫັດບິນໂຮງງານກ່ອນສ້າງ QR");
  }
  const parts = [QR_PREFIX, factoryBillCode, order.id, order.order_code.trim()];
  return parts.join("|");
}

export function normalizeQrCode(raw: string) {
  return String(raw || "").trim();
}

export function extractFactoryBillCode(raw: string) {
  const value = normalizeQrCode(raw);
  if (!value) return "";

  const urlMatch = value.match(FACTORY_URL_BILL_PATTERN);
  if (urlMatch?.[1]) return urlMatch[1].trim();

  if (value.startsWith("http://") || value.startsWith("https://")) {
    const digitGroups = value.match(/\d{4,}/g);
    return digitGroups?.[digitGroups.length - 1]?.trim() || "";
  }

  if (NUMERIC_CODE_PATTERN.test(value)) return value;

  const firstNumericGroup = value.match(/\b\d{4,}\b/);
  return firstNumericGroup?.[0]?.trim() || "";
}

export function parseQrInput(raw: string): { kind: QrInputKind; normalized: string; factoryBillCode: string | null } {
  const normalized = normalizeQrCode(raw);
  if (!normalized) {
    return { kind: "unknown", normalized: "", factoryBillCode: null };
  }

  if (normalized.startsWith(`${QR_PREFIX}|`)) {
    const [, factoryBillCode] = normalized.split(SHOP_QR_SPLITTER);
    return {
      kind: "shop_qr",
      normalized,
      factoryBillCode: factoryBillCode?.trim() || null,
    };
  }

  if (normalized.includes("/orders/") && normalized.includes("/print")) {
    const factoryBillCode = extractFactoryBillCode(normalized);
    return {
      kind: factoryBillCode ? "factory_qr" : "unknown",
      normalized,
      factoryBillCode: factoryBillCode || null,
    };
  }

  if (ORDER_CODE_PATTERN.test(normalized)) {
    return {
      kind: "order_code",
      normalized: normalized.toUpperCase(),
      factoryBillCode: null,
    };
  }

  const factoryBillCode = extractFactoryBillCode(normalized);
  if (factoryBillCode) {
    if (factoryBillCode === normalized) {
      return { kind: "factory_bill_code", normalized, factoryBillCode };
    }
    return { kind: "factory_qr", normalized, factoryBillCode };
  }

  return {
    kind: "order_code",
    normalized,
    factoryBillCode: null,
  };
}

export function getOrderQrLabelTitle() {
  return "ສະຕິກເກີ QR BG SPORT";
}

export const ORDER_QR_LABEL_SELECT =
  "id,order_id,qr_code,order_code,factory_bill_code,label_status,received_at,received_by,shipped_at,shipped_by,last_scanned_at,created_at,updated_at";

export const ORDER_QR_ORDER_SELECT =
  "id,order_code,factory_bill_code,order_date,production_completed_at,shipment_status,shipment_completed_at,short_qty,long_qty,free_qty,qty_3xl,qty_4xl,qty_5xl,net_total,initial_deposit,balance,factory_cost,customer_paid_full_at,factory_paid_full_at,status";

export function buildOrderLookupOrFilter(term: string) {
  const escaped = term.replace(/%/g, "\\%").replace(/_/g, "\\_");
  return `order_code.ilike.%${escaped}%,factory_bill_code.ilike.%${escaped}%`;
}

export function getOrderQrPrintHtml(labels: QrLabelRow[], previewMap: Record<string, string>) {
  const stickersHtml = labels
    .map((label) => {
      const qrImage = previewMap[label.id] || "";
      return `
        <section class="sticker">
          <div class="title">${getOrderQrLabelTitle()}</div>
          <div class="qr-shell">
            <img src="${qrImage}" alt="${label.order_code}" />
          </div>
          <div class="order-code">${label.order_code}</div>
          <div class="factory-bill">ລະຫັດບິນໂຮງງານ: ${label.factory_bill_code?.trim() || "-"}</div>
        </section>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="lo">
      <head>
        <meta charset="utf-8" />
        <title>ສະຕິກເກີ QR BG SPORT</title>
        <style>
          @page {
            size: 80mm 100mm;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            margin: 0;
            background: #ecebea;
            font-family: "Noto Sans Lao Looped", "Noto Sans Lao", Tahoma, Arial, Helvetica, sans-serif;
          }
          .sticker {
            width: 80mm;
            height: 100mm;
            padding: 6mm 7mm 8mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #f6f4f1;
            page-break-after: always;
            overflow: hidden;
          }
          .title {
            margin-top: 0;
            color: #8a98b6;
            font-size: 3.1mm;
            font-weight: 700;
            letter-spacing: 0.35mm;
            text-align: center;
            white-space: nowrap;
          }
          .qr-shell {
            width: 56mm;
            height: 56mm;
            margin-top: 5.5mm;
            border-radius: 5.5mm;
            border: 0.4mm solid #e5e7eb;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 1mm 2mm rgba(15, 23, 42, 0.08);
            flex-shrink: 0;
          }
          .qr-shell img {
            width: 48mm;
            height: 48mm;
            display: block;
          }
          .order-code {
            margin-top: 7.5mm;
            color: #111827;
            font-size: 8mm;
            font-weight: 900;
            letter-spacing: -0.1mm;
            line-height: 1.05;
            text-align: center;
            white-space: nowrap;
            max-width: 100%;
          }
          .factory-bill {
            margin-top: 4.5mm;
            color: #6b7280;
            font-size: 3.5mm;
            font-weight: 700;
            text-align: center;
            line-height: 1.3;
            max-width: 100%;
            white-space: nowrap;
          }
        </style>
      </head>
      <body>${stickersHtml}</body>
    </html>
  `;
}

export function getTotalUnits(order: Partial<OrderSummary>) {
  return (
    Number(order.short_qty || 0) +
    Number(order.long_qty || 0) +
    Number(order.free_qty || 0) +
    Number(order.qty_3xl || 0) +
    Number(order.qty_4xl || 0) +
    Number(order.qty_5xl || 0)
  );
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function formatTimeOnly(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCurrency(value?: number | null) {
  return Number(value || 0).toLocaleString();
}
