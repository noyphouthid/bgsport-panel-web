export function isMissingOrderCollarFieldsError(error: { message?: string } | string | null | undefined) {
  const message = String(typeof error === "string" ? error : error?.message || "").toLowerCase();
  const mentionsCollarField = message.includes("collar_type") || message.includes("collar_qty");
  return message.includes("orders") && mentionsCollarField && (message.includes("column") || message.includes("schema cache"));
}

export function getMissingOrderCollarFieldsMessage() {
  return "database ຍັງບໍ່ທັນອັບ schema ສຳລັບ `collar_type`/`collar_qty` ໃນ orders. ກະລຸນາ run migration `20260519_add_order_collar_fields.sql` ໃນ Supabase SQL Editor ກ່ອນ";
}
