import type { OrderWorkCategory } from "@/lib/order-work-category";

export type DesignPaymentType = "free" | "deposit";

export type QueueCustomer = {
  id: string;
  queue_number: string;
  type_code: string;
  order_no: string;
  customer_name: string;
  customer_phone: string;
  work_category: OrderWorkCategory | null;
  design_payment_type: DesignPaymentType | null;
  design_deposit_amount: number | null;
};

export function queueDesignDeposit(row: Pick<QueueCustomer, "design_payment_type" | "design_deposit_amount">) {
  const amount = Number(row.design_deposit_amount);
  return row.design_payment_type === "deposit" && Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function queueOrderCode(row: Pick<QueueCustomer, "type_code" | "order_no">) {
  return `${row.type_code}-${row.order_no}`;
}

export function documentNumberHint(prefix: "QT" | "DPF", date: string) {
  return `${prefix}${date.slice(2, 4)}-${date.slice(5, 7)}-…`;
}

export function workflowErrorMessage(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
  if (/(collar_label|collar_unit_price|work_category_label|internal_collar_types|internal_work_categories)/i.test(message)
    && /(column|schema cache|relation)/i.test(message)) {
    return "ກະລຸນາລັນ migration 20261104_create_internal_document_options.sql ໃນ Supabase ກ່ອນໃຊ້ງານ";
  }
  if (/(design_payment_type|design_deposit_amount|p_design_payment)/i.test(message)
    && /(column|schema cache|function)/i.test(message)) {
    return "ກະລຸນາຮັນ migration 20261021_add_queue_design_deposits.sql ໃນ Supabase ກ່ອນໃຊ້ງານ";
  }
  if (/(work_category|design_queue_entry_id|order_code|p_work_category|search_design_queue_customers)/i.test(message)
    && /(column|schema cache|function)/i.test(message)) {
    return "ກະລຸນາຮັນ migration 20261020_link_queue_customer_documents.sql ໃນ Supabase ກ່ອນໃຊ້ງານ";
  }
  return message;
}
