export const TRANSPORT_COD_RECEIPTS_MIGRATION = "20261103_create_transport_cod_receipts.sql";
export const TRANSPORT_COD_CANCEL_MIGRATION = "20261107_cod_receipts_settle_order_balance.sql ແລະ 20261108_cancel_transport_cod_receipt.sql";

export type TransportCodItem = {
  source: "note" | "request";
  source_id: string;
  transport_note_id: string | null;
  delivery_request_id: string | null;
  note_no: string;
  order_id: string | null;
  order_code: string | null;
  receiver_name: string;
  receiver_phone: string;
  transporters: string[];
  branch: string | null;
  created_at: string;
  amount: number;
  received_at: string | null;
  received_by_name: string | null;
};

export type TransportCodList = {
  rows: TransportCodItem[];
  total: number;
  summary: {
    count: number;
    total: number;
    pending_count: number;
    pending_amount: number;
    received_count: number;
    received_amount: number;
  };
};

export function getTransportCodCancelError(error: { code?: string; message?: string }) {
  if (["PGRST202", "42883"].includes(error.code || "")) return `ກະລຸນາລັນ ${TRANSPORT_COD_CANCEL_MIGRATION} ໃນ Supabase SQL Editor ກ່ອນ`;
  if (error.message?.includes("cod_order_closed")) return "ອໍເດີນີ້ຖືກປິດງານແລ້ວ ກະລຸນາຍົກເລີກການປິດງານກ່ອນ";
  if (error.message?.includes("cod_cancel_reason_required")) return "ກະລຸນາໃສ່ເຫດຜົນທີ່ຍົກເລີກ";
  return getTransportCodReceiptError(error);
}

export function getTransportCodReceiptError(error: { code?: string; message?: string }) {
  if (["PGRST202", "PGRST204", "PGRST205", "42P01", "42703", "42883"].includes(error.code || "")) {
    return `ກະລຸນາລັນ 20261102_add_transport_cod.sql ແລະ ${TRANSPORT_COD_RECEIPTS_MIGRATION} ໃນ Supabase SQL Editor ກ່ອນ`;
  }
  if (error.code === "42501" || error.message?.includes("cod_forbidden")) return "ທ່ານບໍ່ມີສິດຈັດການລາຍການ COD";
  if (error.message?.includes("cod_amount_changed")) return "ຍອດ COD ຖືກປ່ຽນແປງ ກະລຸນາໂຫຼດລາຍການໃໝ່ກ່ອນຮັບຍອດ";
  if (error.code === "P0002") return "ບໍ່ພົບລາຍການ COD ນີ້ ກະລຸນາໂຫຼດລາຍການໃໝ່";
  return error.message || "ດຳເນີນການ COD ບໍ່ສຳເລັດ";
}
