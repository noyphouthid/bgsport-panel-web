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
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
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

export function canManageAllTransportNotes(
  role: "superadmin" | "admin" | "manager" | "staff" | "graphic" | "accountant" | null
) {
  return role === "superadmin" || role === "admin";
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

export function getTransportNotePrintHtml(rows: TransportNoteRow[]) {
  const cards = rows
    .map((row) => {
      const shippingModeText = row.shipping_charge_mode === "origin" ? "ຈ່າຍຕົ້ນທາງ" : "ຈ່າຍປາຍທາງ";
      const transporters = row.transporters.join(", ");
      return `
        <section class="note">
          <div class="header">
            <div class="logo">BG</div>
            <div class="shop">
              ຮ້ານ: BG SPORT<br />
              ເບີ: 2092201288
            </div>
          </div>
          <div class="chip">ຜູ້ຮັບ (Receiver):</div>
          <div class="body">
            <div>ຊື່ຜູ້ຮັບ: <strong>${row.receiver_name || "-"}</strong></div>
            <div>ເບີຜູ້ຮັບ: <strong>${row.receiver_phone || "-"}</strong></div>
            <div>ຝາກສາຂາ: <strong>${row.branch || "-"}</strong></div>
            <div>ເມືອງ: <strong>${row.city || "-"}</strong></div>
            <div>ແຂວງ: <strong>${row.province || "-"}</strong></div>
            <div class="divider"></div>
            <div>ຝາກຂົນສົ່ງ: <strong>${transporters || "-"}</strong></div>
            <div>ຄ່າຂົນສົ່ງ: <strong>${shippingModeText}</strong></div>
            <div class="divider"></div>
            <div class="foot">* ກະລຸນາຖ່າຍ VDO ຕອນຮັບເຄື່ອງກ່ອນທຸກຄັ້ງ! *</div>
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
        margin-left: 10px;
        font-size: 14px;
        line-height: 1.2;
        font-weight: 700;
      }
      .chip {
        margin: 6px 0 0 10px;
        display: inline-block;
        background: #000;
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        padding: 4px 8px;
      }
      .body {
        padding: 6px 10px 4px;
        font-size: 14px;
        line-height: 1.78;
      }
      .body strong {
        font-size: 15px;
      }
      .divider {
        border-bottom: 1.5px solid #000;
        margin: 4px 0;
      }
      .foot {
        text-align: center;
        font-size: 9px;
        font-weight: 500;
      }
    </style>
  </head>
  <body>
    <div class="sheet">${cards}</div>
    <script>window.onload = () => { window.print(); };</script>
  </body>
</html>`;
}
