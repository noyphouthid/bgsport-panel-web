export type ShippingChargeMode = "destination" | "origin";

export type TransportNoteSourceType = "standalone" | "shipment_request";

export type TransportNoteStatus = "draft" | "saved";

export type TransportNoteRow = {
  id: string;
  note_no: string;
  source_type: TransportNoteSourceType;
  order_id: string | null;
  delivery_request_id: string | null;
  receiver_name: string;
  receiver_phone: string;
  branch: string | null;
  city: string | null;
  province: string | null;
  transporters: string[];
  shipping_charge_mode: ShippingChargeMode;
  note: string | null;
  status: TransportNoteStatus;
  printed_at: string | null;
  printed_by: string | null;
  print_count: number;
  last_printed_at: string | null;
  transport_deposited_at: string | null;
  transport_deposited_by: string | null;
  transport_deposit_receipt_id: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TransportNotePrintRow = TransportNoteRow & {
  display_no?: string | null;
  qr_code_text?: string | null;
  qr_code_data_url?: string | null;
  barcode_value?: string | null;
  barcode_svg_markup?: string | null;
};

export type TransportNoteForm = {
  receiverName: string;
  receiverPhone: string;
  branch: string;
  city: string;
  province: string;
  transporters: string[];
  shippingChargeMode: ShippingChargeMode;
};

export const TRANSPORTERS = ["Anousith Express", "HAL Logistic", "Mixay Express"];

export const DEFAULT_TRANSPORT_NOTE_FORM: TransportNoteForm = {
  receiverName: "",
  receiverPhone: "",
  branch: "",
  city: "",
  province: "",
  transporters: [],
  shippingChargeMode: "destination",
};

const TRANSPORT_NOTE_QR_PREFIX = "BGSPORT-TRANSPORT-NOTE";
const TRANSPORT_NOTE_QR_SPLITTER = /\|/;

export function canManageAllTransportNotes(
  role: AppRole | null
) {
  return role === "superadmin" || role === "admin" || role === "manager" || role === "staff" || role === "accountant";
}

export function buildTransportNoteNo() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `TN${yy}-${mm}${dd}${hh}${min}`;
}

export function isTransportNotePrinted(row: Pick<TransportNoteRow, "print_count" | "printed_at" | "last_printed_at">) {
  return (Number(row.print_count) || 0) > 0 || Boolean(row.printed_at) || Boolean(row.last_printed_at);
}

export function isTransportNoteDeposited(row: Pick<TransportNoteRow, "transport_deposited_at" | "transport_deposit_receipt_id">) {
  return Boolean(row.transport_deposited_at || row.transport_deposit_receipt_id);
}

export function buildTransportNoteQrCode(note: Pick<TransportNoteRow, "id" | "note_no" | "order_id">) {
  if (!note.id) {
    throw new Error("ຈຳເປັນຕ້ອງມີລະຫັດໃບຝາກເຄື່ອງກ່ອນສ້າງ QR");
  }
  return [TRANSPORT_NOTE_QR_PREFIX, note.id, note.order_id || "", note.note_no.trim()].join("|");
}

export function buildTransportNoteBarcodeValue(note: Pick<TransportNoteRow, "note_no">) {
  const value = note.note_no.trim();
  if (!value) {
    throw new Error("ຈຳເປັນຕ້ອງມີລະຫັດໃບຝາກເຄື່ອງກ່ອນສ້າງ Barcode");
  }
  return value;
}

export function parseTransportNoteQrInput(rawValue: string) {
  const normalized = rawValue.trim();
  if (!normalized) {
    return {
      normalized: "",
      kind: "empty" as const,
      noteId: null,
      noteNo: null,
    };
  }

  if (normalized.startsWith(`${TRANSPORT_NOTE_QR_PREFIX}|`)) {
    const [, noteId = "", , noteNo = ""] = normalized.split(TRANSPORT_NOTE_QR_SPLITTER);
    return {
      normalized,
      kind: "transport_note_qr" as const,
      noteId: noteId || null,
      noteNo: noteNo || null,
    };
  }

  return {
    normalized,
    kind: "note_no" as const,
    noteId: null,
    noteNo: normalized,
  };
}

export function mapTransportNoteToForm(row: Partial<TransportNoteRow>): TransportNoteForm {
  return {
    receiverName: row.receiver_name || "",
    receiverPhone: row.receiver_phone || "",
    branch: row.branch || "",
    city: row.city || "",
    province: row.province || "",
    transporters: Array.isArray(row.transporters) ? row.transporters : [],
    shippingChargeMode: row.shipping_charge_mode === "origin" ? "origin" : "destination",
  };
}

export function getTransportNoteDisplayNo(row: Pick<TransportNoteRow, "note_no" | "source_type">, orderCode?: string | null) {
  if (row.source_type === "shipment_request" && orderCode?.trim()) {
    return orderCode.trim();
  }
  return row.note_no;
}

export function getTransportNotePrintHtml(rows: TransportNotePrintRow[]) {
  const cards = rows
    .map((row) => {
      const shippingModeText = row.shipping_charge_mode === "origin" ? "ຈ່າຍຕົ້ນທາງ" : "ຈ່າຍປາຍທາງ";
      const transporters = row.transporters.join(", ");
      const barcodeHtml =
        row.barcode_svg_markup
          ? `
            <div class="barcode-wrap">
              ${row.barcode_svg_markup}
            </div>
          `
          : "";
      return `
        <section class="note">
          <div class="header">
            <div class="logo">BG</div>
            <div class="shop">
              ຮ້ານ: BG SPORT<br />
              ເບີ: 2092201288
            </div>
          </div>
          <div class="meta">
            <div class="chip">ຜູ້ຮັບ (Receiver):</div>
          </div>
          <div class="body">
            <div class="details">
              <div>ຊື່ຜູ້ຮັບ: <strong>${row.receiver_name || "-"}</strong></div>
              <div>ເບີຜູ້ຮັບ: <strong>${row.receiver_phone || "-"}</strong></div>
              <div>ຝາກສາຂາ: <strong>${row.branch || "-"}</strong></div>
              <div>ເມືອງ: <strong>${row.city || "-"}</strong></div>
              <div>ແຂວງ: <strong>${row.province || "-"}</strong></div>
              <div class="divider"></div>
              <div>ຝາກຂົນສົ່ງ: <strong>${transporters || "-"}</strong></div>
              <div>ຄ່າຂົນສົ່ງ: <strong>${shippingModeText}</strong></div>
            </div>
            <div class="divider"></div>
            ${barcodeHtml}
          </div>
        </section>
      `;
    })
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Transport Notes</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Lao+Looped:wght@400;700&display=swap');
      @page { size: 80mm 100mm; margin: 0; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        background: #fff;
        font-family: "Noto Sans Lao Looped","Noto Sans Lao","Lao Sangam MN","Lao MN","Helvetica Neue",Arial,sans-serif;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }
      .sheet { display: flex; flex-wrap: wrap; gap: 0; }
      .note {
        width: 80mm;
        height: 100mm;
        border: 1.5px solid #000;
        color: #000;
        page-break-after: always;
        overflow: hidden;
      }
      .header {
        display: flex;
        align-items: center;
        gap: 8px;
        border-bottom: 1.5px solid #000;
        padding: 8px 10px;
      }
      .logo {
        width: 54px;
        height: 54px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #000;
        color: #fff;
        font-size: 22px;
        font-weight: 700;
      }
      .shop {
        font-size: 14px;
        line-height: 1.2;
        font-weight: 700;
      }
      .chip {
        display: inline-block;
        background: #000;
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        padding: 4px 8px;
      }
      .meta {
        display: flex;
        align-items: center;
        padding: 6px 10px 0;
      }
      .body {
        padding: 6px 10px 4px;
        font-size: 14px;
        line-height: 1.78;
      }
      .details {
        min-width: 0;
      }
      .body strong {
        font-size: 15px;
      }
      .divider {
        border-bottom: 1.5px solid #000;
        margin: 4px 0;
      }
      .barcode-wrap {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 48px;
        padding-top: 2px;
      }
      .barcode-wrap svg {
        display: block;
        width: 100%;
        height: 44px;
      }
      .barcode-wrap text {
        display: none;
      }
    </style>
  </head>
  <body>
    <div class="sheet">${cards}</div>
    <script>window.onload = () => { window.print(); };</script>
  </body>
</html>`;
}
import type { AppRole } from "@/lib/access-control";
