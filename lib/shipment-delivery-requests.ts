export type ShipmentDeliveryMethod = "pickup" | "transport";

export type ShipmentDeliveryStatus = "draft" | "submitted" | "approved" | "rejected" | "delivered" | "cancelled";

export type ShipmentAttachment = {
  path: string | null;
  url: string;
  file_name: string;
};

export type ShipmentAttachmentDraft = ShipmentAttachment & { file?: File };

type ShipmentAttachmentSource = Partial<Pick<ShipmentDeliveryRequestRow,
  "transfer_slips" | "handoff_photos" | "transfer_slip_url" | "handoff_photo_url" |
  "transfer_slip_path" | "handoff_photo_path" | "handoff_photo_file_name"
>>;

// Old requests keep their original attachment until they are next saved.
export function getShipmentAttachments(
  request: ShipmentAttachmentSource | null | undefined,
  kind: "transfer_slips" | "handoff_photos",
): ShipmentAttachment[] {
  if (!request) return [];
  if (Array.isArray(request[kind])) return request[kind];
  const isSlip = kind === "transfer_slips";
  const url = isSlip ? request.transfer_slip_url : request.handoff_photo_url;
  const path = (isSlip ? request.transfer_slip_path : request.handoff_photo_path) || null;
  if (!url) return [];
  return [{ path, url, file_name: (!isSlip && request.handoff_photo_file_name) || path?.split("/").pop() || (isSlip ? "transfer-slip" : "handoff-photo") }];
}

export const SHIPMENT_DELIVERY_METHOD_LABELS: Record<ShipmentDeliveryMethod, string> = {
  pickup: "ລູກຄ້າເຂົ້າມາຮັບເອງ",
  transport: "ຝາກຂົນສົ່ງ",
};

export const SHIPMENT_DELIVERY_STATUS_LABELS: Record<ShipmentDeliveryStatus, string> = {
  draft: "ຮ່າງ",
  submitted: "ລໍຖ້າອະນຸມັດ",
  approved: "ອະນຸມັດແລ້ວ",
  rejected: "ຖືກປະຕິເສດ",
  delivered: "ສົ່ງມອບແລ້ວ",
  cancelled: "ຍົກເລີກ",
};

export const SHIPMENT_DELIVERY_STATUS_STYLES: Record<ShipmentDeliveryStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-amber-100 text-amber-800",
  approved: "bg-sky-100 text-sky-800",
  rejected: "bg-rose-100 text-rose-700",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-700",
};

export type ShipmentDeliveryRequestRow = {
  id: string;
  request_no: string;
  order_id: string;
  qr_label_id: string;
  delivery_method: ShipmentDeliveryMethod;
  status: ShipmentDeliveryStatus;
  requested_by_user_id: string | null;
  delivery_scheduled_at: string;
  delivery_person_name: string;
  note: string | null;
  payment_outstanding_amount: number;
  payment_amount: number;
  payment_method: "cash" | "transfer" | null;
  payment_paid_at: string | null;
  transfer_slip_path: string | null;
  transfer_slip_url: string | null;
  transfer_slip_uploaded_at: string | null;
  transfer_slip_uploaded_by_user_id?: string | null;
  transfer_slips?: ShipmentAttachment[];
  handoff_photo_path: string | null;
  handoff_photo_url: string | null;
  handoff_photo_file_name: string | null;
  handoff_photo_uploaded_at: string | null;
  handoff_photo_uploaded_by_user_id: string | null;
  handoff_photos?: ShipmentAttachment[];
  transport_receiver_name: string | null;
  transport_receiver_phone: string | null;
  transport_branch: string | null;
  transport_branch_code?: string | null;
  transport_city: string | null;
  transport_province: string | null;
  transport_providers: string[];
  transport_charge_mode: "origin" | "destination" | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  delivered_at: string | null;
  delivered_by_user_id: string | null;
  rejected_at: string | null;
  rejected_by_user_id: string | null;
  rejection_note: string | null;
  created_at: string;
  updated_at: string;
};
