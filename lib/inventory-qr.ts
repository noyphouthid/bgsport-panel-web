export type OrderQrLabelStatus = "created" | "received" | "shipped";

import { getTotalShirtQty } from "@/lib/order-quantities";

export type OrderSummary = {
  id: string;
  order_code: string;
  customer_phone?: string | null;
  customer_whatsapp?: string | null;
  factory_bill_code: string | null;
  order_image_url?: string | null;
  order_transfer_slip_url?: string | null;
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
  design_deposit?: number;
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
  printed_at: string | null;
  printed_by: string | null;
  print_count: number;
  last_printed_at: string | null;
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
const ORDER_CODE_PATTERN = /^[A-Z0-9]+-[A-Z0-9+]+$/i;
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

  const factoryBillCode = extractFactoryBillCode(normalized);
  if (factoryBillCode && factoryBillCode === normalized && !/[A-Za-z]/.test(normalized)) {
    return {
      kind: "factory_bill_code",
      normalized,
      factoryBillCode,
    };
  }

  if (ORDER_CODE_PATTERN.test(normalized)) {
    return {
      kind: "order_code",
      normalized: normalized.toUpperCase(),
      factoryBillCode: null,
    };
  }

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
  "id,order_id,qr_code,order_code,factory_bill_code,label_status,printed_at,printed_by,print_count,last_printed_at,received_at,received_by,shipped_at,shipped_by,last_scanned_at,created_at,updated_at";

export const ORDER_QR_ORDER_SELECT =
  "id,order_code,factory_bill_code,order_image_url,order_transfer_slip_url,order_date,production_completed_at,shipment_status,shipment_completed_at,short_qty,long_qty,free_qty,qty_3xl,qty_4xl,qty_5xl,net_total,design_deposit,initial_deposit,balance,factory_cost,customer_paid_full_at,factory_paid_full_at,status";

export function buildOrderLookupOrFilter(term: string) {
  const escaped = term.replace(/%/g, "\\%").replace(/_/g, "\\_");
  return `order_code.ilike.%${escaped}%,factory_bill_code.ilike.%${escaped}%`;
}

export function getOrderStickerTitle(orderCode: string) {
  return orderCode;
}

export function getOrderStickerQtyText(order?: Partial<OrderSummary> | null) {
  if (!order) return "";
  return `ຈຳນວນ ${getTotalUnits(order)} ໂຕ`;
}

export function getOrderNetTotal(order?: Partial<OrderSummary> | null) {
  return Math.max(0, Number(order?.net_total) || 0);
}

export function getOrderBalanceTotal(order?: Partial<OrderSummary> | null) {
  return Math.max(0, Number(order?.balance) || 0);
}

export function getOrderPaidTotal(order?: Partial<OrderSummary> | null) {
  return Math.max(0, getOrderNetTotal(order) - getOrderBalanceTotal(order));
}

export function formatMoneyText(value?: number | null) {
  return `${formatCurrency(value)} ກີບ`;
}

export function getOrderQrPrintHtml(
  labels: QrLabelRow[],
  previewMap: Record<string, string>,
  ordersById: Record<string, Partial<OrderSummary>>
) {
  const stickersHtml = labels
    .map((label) => {
      const qrImage = previewMap[label.id] || "";
      const importedDate = formatDateOnly(label.received_at);
      const order = ordersById[label.order_id];
      const orderTitle = getOrderStickerTitle(label.order_code);
      const qtyText = getOrderStickerQtyText(order);
      const totalText = formatMoneyText(getOrderNetTotal(order));
      const paidText = formatMoneyText(getOrderPaidTotal(order));
      const balanceText = formatMoneyText(getOrderBalanceTotal(order));
      return `
        <section class="sticker">
          <div class="content">
            <div class="top-row">
              <div class="qr-shell">
                <img src="${qrImage}" alt="${label.order_code}" />
              </div>
              <div class="meta">
                <div class="order-code">${orderTitle}</div>
                ${qtyText ? `<div class="order-qty">${qtyText}</div>` : ""}
                <div class="factory-bill">ລະຫັດບິນໂຮງງານ: ${label.factory_bill_code?.trim() || "-"}</div>
                <div class="import-date">ວັນທີນຳເຂົ້າ: ${importedDate}</div>
              </div>
            </div>
            <div class="payment-grid">
              <div class="payment-row">
                <div class="payment-label">ຍອດທັງໝົດ:</div>
                <div class="payment-value">${totalText}</div>
              </div>
              <div class="payment-row">
                <div class="payment-label">ມັດຈຳແລ້ວ:</div>
                <div class="payment-value">${paidText}</div>
              </div>
            </div>
            <div class="balance-row">
              <div class="balance-label">ຄ້າງຈ່າຍ:</div>
              <div class="balance-value">${balanceText}</div>
            </div>
          </div>
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
            size: 100mm 80mm;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            margin: 0;
            background: #ffffff;
            font-family: "Noto Sans Lao Looped", "Noto Sans Lao", Tahoma, Arial, Helvetica, sans-serif;
          }
          .sticker {
            width: 100mm;
            height: 80mm;
            padding: 0;
            display: flex;
            background: #ffffff;
            page-break-after: always;
            overflow: hidden;
          }
          .content {
            width: 100%;
            height: 100%;
            border: 0.4mm solid #111111;
            display: flex;
            flex-direction: column;
            background: #ffffff;
          }
          .top-row {
            display: grid;
            grid-template-columns: 40mm 1fr;
            gap: 3mm;
            padding: 3.2mm 3.2mm 2.6mm;
            align-items: start;
            min-height: 46mm;
          }
          .qr-shell {
            width: 37mm;
            height: 37mm;
            border-radius: 0;
            border: 0.35mm solid #cbd5e1;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .qr-shell img {
            width: 33.5mm;
            height: 33.5mm;
            display: block;
          }
          .meta {
            min-width: 0;
            padding-top: 0.5mm;
          }
          .order-code {
            color: #111827;
            font-size: 6.6mm;
            font-weight: 900;
            letter-spacing: -0.12mm;
            line-height: 1;
            text-align: left;
            max-width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .order-qty {
            margin-top: 1.3mm;
            color: #111827;
            font-size: 6mm;
            font-weight: 900;
            line-height: 1.05;
            text-align: left;
            max-width: 100%;
            white-space: nowrap;
          }
          .factory-bill {
            margin-top: 2.4mm;
            color: #374151;
            font-size: 2.9mm;
            font-weight: 800;
            text-align: left;
            line-height: 1.2;
            max-width: 100%;
            white-space: nowrap;
          }
          .import-date {
            margin-top: 0.6mm;
            color: #374151;
            font-size: 2.9mm;
            font-weight: 800;
            text-align: left;
            line-height: 1.2;
            max-width: 100%;
            white-space: nowrap;
          }
          .payment-grid {
            border-top: 0.35mm solid #111111;
            border-bottom: 0.35mm solid #111111;
          }
          .payment-row {
            display: grid;
            grid-template-columns: 34mm 1fr;
            min-height: 7.4mm;
          }
          .payment-row + .payment-row {
            border-top: 0.35mm solid #111111;
          }
          .payment-label {
            border-right: 0.35mm solid #111111;
            padding: 1.1mm 2mm;
            font-size: 2.85mm;
            font-weight: 900;
            color: #111111;
            display: flex;
            align-items: center;
          }
          .payment-value {
            padding: 1.1mm 2mm;
            font-size: 3.1mm;
            font-weight: 900;
            color: #111111;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .balance-row {
            display: grid;
            grid-template-columns: 34mm 1fr;
            flex: 1;
            min-height: 0;
          }
          .balance-label {
            background: #111111;
            color: #ffffff;
            padding: 1.8mm 2.2mm;
            font-size: 5.4mm;
            font-weight: 900;
            line-height: 1;
            display: flex;
            align-items: center;
          }
          .balance-value {
            background: #ffffff;
            color: #111111;
            padding: 1.8mm 2.2mm;
            font-size: 6.3mm;
            font-weight: 900;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
          }
        </style>
      </head>
      <body>${stickersHtml}</body>
    </html>
  `;
}

export function getTotalUnits(order: Partial<OrderSummary>) {
  return getTotalShirtQty(order);
}

function getValidDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatDateTime(value?: string | null) {
  const date = getValidDate(value);
  if (!date) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

export function formatDateOnly(value?: string | null) {
  const date = getValidDate(value);
  if (!date) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
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
