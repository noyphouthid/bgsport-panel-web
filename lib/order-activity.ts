export const ORDER_AUDIT_FIELD_LABELS: Record<string, string> = {
  order_code: "ລະຫັດອໍເດີ",
  order_date: "ວັນທີອໍເດີ",
  work_category: "ປະເພດງານ",
  customer_phone: "ເບີລູກຄ້າ",
  customer_whatsapp: "WhatsApp",
  factory_bill_code: "ບິນໂຮງງານ",
  admin_user_id: "ແອັດມິນ",
  graphic_user_id: "ກຣາຟິກ",
  fabric_id: "ຜ້າ",
  fabric_name: "ຊື່ຜ້າ",
  fabric_short_price: "ລາຄາແຂນສັ້ນ",
  fabric_long_price: "ລາຄາແຂນຍາວ",
  short_qty: "ແຂນສັ້ນ",
  long_qty: "ແຂນຍາວ",
  free_qty: "ຈຳນວນແຖມ",
  qty_3xl: "3XL",
  qty_4xl: "4XL",
  qty_5xl: "5XL",
  qty_6xl: "6XL",
  collar_type: "ຄໍເສື້ອ",
  collar_qty: "ຈຳນວນຄໍ",
  sleeve_charge_qty: "ຈຳນວນບວກແຂນ",
  extra_charge: "ບວກເພີ່ມ",
  design_deposit: "ຫັກຄ່າແບບ",
  discount: "ສ່ວນຫຼຸດ",
  initial_deposit: "ເງິນມັດຈຳ",
  factory_cost: "ຕົ້ນທຶນໂຮງງານ",
  gross_total: "ຍອດລວມ",
  net_total: "ຍອດສຸດທິ",
  balance: "ຍອດຄ້າງ",
  order_transfer_slip_count: "ຈຳນວນສະລິບອໍເດີ",
  order_image_count: "ຈຳນວນຮູບອໍເດີ",
  order_image_path: "ທີ່ເກັບຮູບອໍເດີ",
  order_image_url: "ຮູບອໍເດີ",
  order_image_file_name: "ຊື່ໄຟລ໌ຮູບອໍເດີ",
  order_transfer_slip_path: "ທີ່ເກັບສະລິບອໍເດີ",
  order_transfer_slip_url: "ສະລິບອໍເດີ",
  order_transfer_slip_file_name: "ຊື່ໄຟລ໌ສະລິບອໍເດີ",
  customer_paid_full_at: "ວັນທີລູກຄ້າຊຳລະຄົບ",
  factory_paid_full_at: "ວັນທີຊຳລະໂຮງງານ",
  production_completed_at: "ວັນທີຜະລິດສຳເລັດ",
  customer_remaining_due_at: "ວັນຄົບກຳນົດຊຳລະຂອງລູກຄ້າ",
  factory_payment_due_at: "ວັນຄົບກຳນົດຊຳລະໂຮງງານ",
  shipment_status: "ສະຖານະຈັດສົ່ງ",
  shipment_completed_at: "ວັນທີຈັດສົ່ງສຳເລັດ",
  size_upcharge: "ຄ່າບວກໄຊສ໌ໃຫຍ່",
  status: "ສະຖານະອໍເດີ",
  closed_at: "ວັນທີປິດອໍເດີ",
  created_at: "ວັນທີສ້າງ",
  updated_at: "ວັນທີແກ້ໄຂ",
};


export const ORDER_ACTIVITY_ACTION_LABELS: Record<string, string> = {
  create_order: "ສ້າງອໍເດີ",
  update_order: "ແກ້ໄຂອໍເດີ",
  receive_customer_payment: "ຮັບເງິນລູກຄ້າ",
  pay_factory: "ຈ່າຍເງິນໂຮງງານ",
  production_completed: "ຜະລິດສຳເລັດ",
  close_order: "ປິດອໍເດີ",
  reopen_order: "ຍົກເລີກປິດອໍເດີ",
  cancel_factory_receipt: "ຍົກເລີກນຳເຂົ້າ",
  cancel_factory_receipt_approved: "ອະນຸມັດຍົກເລີກນຳເຂົ້າ",
  cancel_shipment: "ຍົກເລີກຈັດສົ່ງ",
  cancel_shipment_approved: "ອະນຸມັດຍົກເລີກຈັດສົ່ງ",
  approve_shipment_delivery_request: "ອະນຸມັດສົ່ງມອບ",
  reject_shipment_delivery_request: "ປະຕິເສດສົ່ງມອບ",
};

const DETAIL_LABELS: Record<string, string> = {
  "Created order": "ສ້າງອໍເດີ",
  "Updated order details": "ແກ້ໄຂຂໍ້ມູນອໍເດີ",
  "Removed order transfer slip": "ລຶບສະລິບການໂອນເງິນຂອງອໍເດີ",
  "Marked production completed": "ບັນທຶກຜະລິດສຳເລັດ",
  "Closed order": "ປິດອໍເດີ",
  "Reopened order": "ຍົກເລີກປິດອໍເດີ",
  "Canceled imported stock from edit page": "ຍົກເລີກນຳເຂົ້າຈາກໜ້າແກ້ໄຂອໍເດີ",
};

export function getOrderActivityFieldLabel(label: unknown, key?: unknown) {
  if (typeof key === "string" && Object.hasOwn(ORDER_AUDIT_FIELD_LABELS, key)) return ORDER_AUDIT_FIELD_LABELS[key];
  if (typeof label !== "string" || !label.trim()) return "ຟິວບໍ່ລະບຸ";
  const text = label.trim();
  if (Object.hasOwn(ORDER_AUDIT_FIELD_LABELS, text)) return ORDER_AUDIT_FIELD_LABELS[text];
  if (text === "Admin") return ORDER_AUDIT_FIELD_LABELS.admin_user_id;
  if (text === "Graphic") return ORDER_AUDIT_FIELD_LABELS.graphic_user_id;
  return text;
}

// Translate known system messages at display time so old audit records stay intact.
export function getOrderActivityDetail(detail: string | null | undefined) {
  const text = detail?.trim() || "";
  if (Object.hasOwn(DETAIL_LABELS, text)) return DETAIL_LABELS[text];
  let match = text.match(/^Received ([\d.,-]+)$/);
  if (match) return `ຮັບເງິນລູກຄ້າ ${match[1]}`;
  match = text.match(/^Paid factory ([\d.,-]+)$/);
  if (match) return `ຈ່າຍເງິນໂຮງງານ ${match[1]}`;
  match = text.match(/^Approved delivery request ([^;]+); method=(pickup|transport); payment_amount=([^;]+); shipped_at=(.+)$/);
  if (match) return `ອະນຸມັດຄຳຂໍສົ່ງມອບ ${match[1]}; ວິທີສົ່ງມອບ: ${match[2] === "pickup" ? "ລູກຄ້າເຂົ້າມາຮັບເອງ" : "ຝາກຂົນສົ່ງ"}; ຈຳນວນເງິນ: ${match[3]}; ວັນທີຈັດສົ່ງ: ${match[4]}`;
  match = text.match(/^Rejected delivery request ([^;]+); reason=([\s\S]*)$/);
  if (match) return `ປະຕິເສດຄຳຂໍສົ່ງມອບ ${match[1]}; ເຫດຜົນ: ${match[2]}`;
  match = text.match(/^Canceled shipment ([^;]+); rollback_amount=([^;]+); reason=([\s\S]*)$/);
  if (match) return `ຍົກເລີກຈັດສົ່ງ ${match[1]}; ຈຳນວນເງິນທີ່ຍົກເລີກ: ${match[2]}; ເຫດຜົນ: ${match[3]}`;
  match = text.match(/^Approved request ([^;]+)(?:; rollback_amount=([^;]+))?$/);
  if (match) return `ອະນຸມັດຄຳຂໍ ${match[1]}${match[2] ? `; ຈຳນວນເງິນທີ່ຍົກເລີກ: ${match[2]}` : ""}`;
  return text;
}
