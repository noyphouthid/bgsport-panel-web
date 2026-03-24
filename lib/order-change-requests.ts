import type { AppRole } from "@/lib/access-control";

export type OrderChangeRequestType = "cancel_factory_receipt" | "cancel_shipment";
export type OrderChangeRequestStatus = "submitted" | "approved" | "rejected";

export type OrderChangeRequestRow = {
  id: string;
  order_id: string;
  request_type: OrderChangeRequestType;
  status: OrderChangeRequestStatus;
  target_receipt_id: string | null;
  target_shipment_id: string | null;
  request_reason: string;
  decision_note: string | null;
  requested_by_user_id: string | null;
  approved_by_user_id: string | null;
  rejected_by_user_id: string | null;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
};

export const ORDER_CHANGE_REQUEST_TYPE_LABELS: Record<OrderChangeRequestType, string> = {
  cancel_factory_receipt: "ຂໍຍົກເລີກນຳເຂົ້າ",
  cancel_shipment: "ຂໍຍົກເລີກຈັດສົ່ງ",
};

export const ORDER_CHANGE_REQUEST_STATUS_LABELS: Record<OrderChangeRequestStatus, string> = {
  submitted: "ລໍຖ້າອະນຸມັດ",
  approved: "ອະນຸມັດແລ້ວ",
  rejected: "ປະຕິເສດ",
};

export const ORDER_CHANGE_REQUEST_STATUS_STYLES: Record<OrderChangeRequestStatus, string> = {
  submitted: "bg-amber-100 text-amber-700 border border-amber-200",
  approved: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  rejected: "bg-rose-100 text-rose-700 border border-rose-200",
};

export function canSubmitOrderChangeRequest(role: AppRole) {
  return ["superadmin", "admin", "manager", "staff", "accountant"].includes(role);
}

export function canApproveOrderChangeRequest(role: AppRole) {
  return role === "superadmin" || role === "accountant";
}
