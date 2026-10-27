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
  branch_code?: string | null;
  city: string | null;
  province: string | null;
  transporters: string[];
  shipping_charge_mode: ShippingChargeMode;
  cod_enabled?: boolean;
  cod_amount?: number;
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
  created_by_name?: string | null;
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
  branchCode: string;
  city: string;
  province: string;
  transporters: string[];
  shippingChargeMode: ShippingChargeMode;
  codEnabled: boolean;
  codAmount: number;
};

export const PASSENGER_BUS_TRANSPORTER = "ລົດໂດຍສານ";
export const TRANSPORTERS = ["Anousith Express", "HAL Logistic", "Unitel Logistic", "Mixay Express", PASSENGER_BUS_TRANSPORTER];

export function isPassengerBusTransport(transporters: readonly string[]) {
  return transporters.length === 1 && transporters[0] === PASSENGER_BUS_TRANSPORTER;
}

export const DEFAULT_TRANSPORT_NOTE_FORM: TransportNoteForm = {
  receiverName: "",
  receiverPhone: "",
  branch: "",
  branchCode: "",
  city: "",
  province: "",
  transporters: [],
  shippingChargeMode: "destination",
  codEnabled: false,
  codAmount: 0,
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
    branchCode: isPassengerBusTransport(row.transporters || []) ? "" : row.branch_code || "",
    city: row.city || "",
    province: row.province || "",
    transporters: Array.isArray(row.transporters) ? row.transporters : [],
    shippingChargeMode: row.shipping_charge_mode === "origin" ? "origin" : "destination",
    codEnabled: row.cod_enabled === true,
    codAmount: row.cod_enabled === true ? Number(row.cod_amount) || 0 : 0,
  };
}

export function getTransportNoteDisplayNo(row: Pick<TransportNoteRow, "note_no" | "source_type">, orderCode?: string | null) {
  if (row.source_type === "shipment_request" && orderCode?.trim()) {
    return orderCode.trim();
  }
  return row.note_no;
}

function escapeNoteText(value: string | null | undefined) {
  return (value || "-").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

// Shared by the live preview and the 80 × 100 mm print window.
export const TRANSPORT_NOTE_STYLES = `
  .transport-note-sheet, .transport-note-sheet * { box-sizing: border-box; }
  .transport-note-sheet { color: #000; font-family: "Noto Sans Lao","Lao Sangam MN",Arial,sans-serif; font-weight: 700; }
  .transport-note-sheet strong, .transport-note-sheet b { font-weight: 700; }
  .transport-note-sheet .note {
    width: 80mm; height: 100mm; padding: 8px 10px;
    display: flex; flex-direction: column; background: #fff; color: #000;
    font-size: 12px; line-height: 1.6; overflow-wrap: anywhere;
    break-inside: avoid; break-after: page;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .transport-note-sheet .note:last-child { break-after: auto; }
  .transport-note-sheet .header { flex-shrink: 0; }
  .transport-note-sheet .header img { display: block; width: 100%; height: auto; }
  .transport-note-sheet .meta {
    display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 4px;
    border-block: 1px dashed #000; margin-top: 7px; padding: 3px 0;
    font-size: 8px; line-height: 1.6;
  }
  .transport-note-sheet .meta time { white-space: nowrap; }
  .transport-note-sheet .creator { font-weight: 700; }
  .transport-note-sheet .tracking { flex-shrink: 0; border-bottom: 1px dashed #000; padding: 5px 0 4px; }
  .transport-note-sheet .barcode-wrap { display: flex; justify-content: center; align-items: center; min-height: 32px; padding: 0 5px; }
  .transport-note-sheet .barcode-wrap svg { display: block; width: 100%; height: 30px; }
  .transport-note-sheet .barcode-wrap text { display: none; }
  .transport-note-sheet .barcode-pending { font-size: 9px; font-weight: 700; }
  .transport-note-sheet .confirmation { text-align: center; font-size: 10px; font-weight: 700; margin-top: 2px; }
  .transport-note-sheet .confirmation strong { letter-spacing: .2px; }
  .transport-note-sheet .body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .transport-note-sheet .receiver-heading { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px; margin: 7px 0 8px; }
  .transport-note-sheet .chip { padding: 4px 6px; background: #000; color: #fff; font-weight: 700; font-size: 10px; }
  .transport-note-sheet .receiver-name { min-width: 0; font-size: 14px; line-height: 1.5; }
  .transport-note-sheet .details { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 3px; font-weight: 700; }
  .transport-note-sheet .details strong { font-size: 12.5px; font-weight: 700; }
  .transport-note-sheet .locality { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .transport-note-sheet .locality > div + div { border-left: 1px solid #000; padding-left: 8px; }
  .transport-note-sheet .route-footer { margin-top: auto; padding-top: 5px; }
  .transport-note-sheet .transporter {
    display: flex; align-items: center; gap: 6px; padding: 4px 5px;
    border-block: 1px solid #000; background: #000; color: #fff;
    outline: 1px dashed #000; outline-offset: 4px; margin: 4px 0 8px;
    font-size: 11px; line-height: 1.5;
  }
  .transport-note-sheet .transporter img { flex-shrink: 0; width: 20px; height: 20px; }
  .transport-note-sheet .transporter strong { font-size: 12px; }
  .transport-note-sheet .charge { text-align: center; font-weight: 700; padding-top: 2px; font-size: 12px; }
  .transport-note-sheet .note--cod .charge { text-align: left; }
  .transport-note-sheet .note--cod .receiver-heading { margin: 6px 0 4px; }
  .transport-note-sheet .note--cod .details { gap: 2px; line-height: 1.45; }
  .transport-note-sheet .cod { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
  .transport-note-sheet .cod-label { font-size: 26px; line-height: 1.2; }
  .transport-note-sheet .cod-amount { padding: 3px 12px; background: #000; color: #fff; font-size: 14px; }
  .transport-note-sheet .note--compact { font-size: 10.5px; line-height: 1.5; }
  .transport-note-sheet .note--compact .details { gap: 2px; }
  .transport-note-sheet .note--compact .details strong { font-size: 11px; }
  .transport-note-sheet .note--compact .receiver-name { font-size: 12px; }
`;

export function formatTransportNoteCreatedAt(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Vientiane", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: string) => parts.find((item) => item.type === name)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

type TransportNotePrintAssets = { headerSrc?: string; codHeaderSrc?: string; packageSrc?: string; fontCss?: string };

export function getTransportNoteContactPhone(codEnabled: boolean) {
  return codEnabled ? "20 23 515 558" : "20 9220 1288";
}

export function getTransportNoteCardHtml(row: Partial<TransportNotePrintRow>, assets: TransportNotePrintAssets = {}) {
  const passengerBus = isPassengerBusTransport(row.transporters || []);
  const codEnabled = row.cod_enabled === true;
  const headerSrc = codEnabled ? assets.codHeaderSrc || "/bg-sport-transport-header-cod.svg" : assets.headerSrc || "/bg-sport-transport-header.svg";
  const codAmount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number.isFinite(Number(row.cod_amount)) ? Number(row.cod_amount) : 0);
  const shippingModeText = row.shipping_charge_mode === "origin" ? "ຈ່າຍຕົ້ນທາງ" : "ຈ່າຍປາຍທາງ";
  const barcode = row.barcode_svg_markup || (row.note_no ? '<svg data-note-barcode role="img" aria-label="Barcode"></svg>' : '<span class="barcode-pending">ບາໂຄດຈະສ້າງຫຼັງບັນທຶກ</span>');
  const compact = (row.branch || "").length > 40 || (row.receiver_name || "").length > 35 || (row.transporters || []).join(", ").length > 35;
  return `
    <section class="note${compact ? " note--compact" : ""}${codEnabled ? " note--cod" : ""}">
      <div class="header"><img src="${escapeNoteText(headerSrc)}" alt="BG SPORT — ${getTransportNoteContactPhone(codEnabled)}" width="767" height="136" /></div>
      <div class="meta">
        <b>ວັນທີສ້າງບິນ:</b> <time>${formatTransportNoteCreatedAt(row.created_at)}</time>
        <span class="creator">| ${escapeNoteText(row.created_by_name)} (ຝາກເຄື່ອງ)</span>
      </div>
      <div class="tracking">
        <div class="barcode-wrap">${barcode}</div>
        <div class="confirmation">ລະຫັດຢືນຢັນການຝາກ: <strong>${escapeNoteText(row.note_no)}</strong></div>
      </div>
      <div class="body">
        <div class="receiver-heading"><div class="chip">ຂໍ້ມູນຜູ້ຮັບ (ຕ້ອງໃສ່!):</div><strong class="receiver-name">${escapeNoteText(row.receiver_name)}</strong></div>
        <div class="details">
          <div>ເບີຜູ້ຮັບ: <strong>${escapeNoteText(row.receiver_phone)}</strong></div>
          <div>${passengerBus ? "ຝາກລົງ" : "ຝາກສາຂາ"}: <strong>${escapeNoteText(row.branch)}</strong></div>
          ${passengerBus ? "" : `<div>ລະຫັດສາຂາ: <strong>${escapeNoteText(row.branch_code)}</strong></div>`}
          <div class="locality">
            <div>ເມືອງ: <strong>${escapeNoteText(row.city)}</strong></div>
            <div>ແຂວງ: <strong>${escapeNoteText(row.province)}</strong></div>
          </div>
          <div class="route-footer mt-auto">
            ${passengerBus ? "" : `<div class="transporter"><img src="${escapeNoteText(assets.packageSrc || "/transport-package.svg")}" alt="" width="20" height="20" /><span>ຝາກຂົນສົ່ງ: <strong>${escapeNoteText((row.transporters || []).join(", "))}</strong></span></div>`}
            <div class="charge">*ຄ່າຂົນສົ່ງ: <strong>${shippingModeText}</strong>*</div>
            ${codEnabled ? `<div class="cod"><span class="cod-label">COD:</span><strong class="cod-amount">${codAmount} ກີບ</strong></div>` : ""}
          </div>
        </div>
      </div>
    </section>
  `;
}

export function getTransportNotePrintHtml(rows: TransportNotePrintRow[], assetOrigin = "", assets: TransportNotePrintAssets = {}) {
  return `<!doctype html>
<html lang="lo">
  <head>
    <meta charset="utf-8" />
    ${assetOrigin ? `<base href="${escapeNoteText(assetOrigin)}" />` : ""}
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BG SPORT — Transport Notes</title>
    <style>
      ${assets.fontCss || ""}
      @page { size: 80mm 100mm; margin: 0; }
      html, body { margin: 0; background: #fff; font-family: "Noto Sans Lao","Lao Sangam MN",Arial,sans-serif; font-weight: 700; }
      ${TRANSPORT_NOTE_STYLES}
    </style>
  </head>
  <body>
    <div class="transport-note-sheet">${rows.map(row => getTransportNoteCardHtml(row, assets)).join("")}</div>
    <script>
      window.addEventListener('load', async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, image => image.decode().catch(() => {})));
        window.print();
      });
    </script>
  </body>
</html>`;
}
import type { AppRole } from "@/lib/access-control";
