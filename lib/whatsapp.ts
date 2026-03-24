export type WhatsappContactOption = {
  key: "phone" | "whatsapp";
  label: string;
  value: string;
};

export function normalizeWhatsappPhone(phone: string | null | undefined) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("856")) return digits;
  if (digits.startsWith("20") && digits.length >= 8) return `856${digits}`;
  if (digits.startsWith("0")) return `856${digits.slice(1)}`;
  return digits;
}

export function buildWhatsappUrl(phone: string | null | undefined, message: string) {
  const normalized = normalizeWhatsappPhone(phone);
  if (!normalized) return "";
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function getWhatsappContactOptions(customerPhone?: string | null, customerWhatsapp?: string | null) {
  const seen = new Set<string>();
  const options: WhatsappContactOption[] = [];

  const pushOption = (key: WhatsappContactOption["key"], label: string, value: string | null | undefined) => {
    const normalized = normalizeWhatsappPhone(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    options.push({ key, label, value: normalized });
  };

  pushOption("phone", "ເບີໂທ", customerPhone);
  pushOption("whatsapp", "WhatsApp", customerWhatsapp);
  return options;
}

export function buildProductionCompletedWhatsappMessage(params: {
  orderCode: string;
  totalQty: number;
  balance: number;
}) {
  const orderCode = String(params.orderCode || "").trim();
  const totalQty = Math.max(0, Number(params.totalQty) || 0);
  const balance = Math.max(0, Number(params.balance) || 0);

  if (balance > 0) {
    return [
      "ສະບາຍດີ,",
      `ອໍເດີ ${orderCode} ຂອງທ່ານຜະລິດສຳເລັດແລ້ວ.`,
      `ຈຳນວນທັງໝົດ ${totalQty}ຜືນ ຍອດຄ້າງຊຳລະທັງໝົດແມ່ນ ${balance.toLocaleString()} ກີບ`,
      "ລົບກວນຊຳລະຍອດຄ້າງຈ່າຍ ແລ້ວແຈ້ງທີ່ຢູ່ບ່ອນຝາກ ສາຂາ, ບ້ານ, ເມືອງ , ແຂວງ ໃຫ້ແນ່ເຈົ້າ ",
      ".",
      "ຂອບໃຈ",
    ].join("\n");
  }

  return [
    "ສະບາຍດີ,",
    `ອໍເດີ ${orderCode} ຂອງທ່ານຜະລິດສຳເລັດແລ້ວ.`,
    `ຈຳນວນທັງໝົດ ${totalQty}ຜືນ ຍອດຄ້າງຊຳລະທັງໝົດແມ່ນ 0 ກີບ`,
    "ລົບກວນແຈ້ງທີ່ຢູ່ບ່ອນຝາກ ສາຂາ, ບ້ານ, ເມືອງ , ແຂວງ ໃຫ້ແນ່ເຈົ້າ ",
    ".",
    "ຂອບໃຈ",
  ].join("\n");
}

export function buildShipmentCompletedWhatsappMessage(params: {
  orderCode: string;
  totalQty: number;
  balance: number;
}) {
  const orderCode = String(params.orderCode || "").trim();
  const totalQty = Math.max(0, Number(params.totalQty) || 0);
  const balance = Math.max(0, Number(params.balance) || 0);

  if (balance > 0) {
    return [
      "ສະບາຍດີ,",
      `ອໍເດີ ${orderCode} ຂອງທ່ານຖືກຈັດສົ່ງແລ້ວ.`,
      `ຈຳນວນທັງໝົດ ${totalQty} ຜືນ ແລະ ຍອດຄ້າງຊຳລະ ${balance.toLocaleString()} ກີບ`,
      "ຖ້າຮັບສິນຄ້າແລ້ວ ຫຼື ຕ້ອງການສອບຖາມເພີ່ມ ສາມາດຕິດຕໍ່ກັບຮ້ານໄດ້ເລີຍ.",
      "ຂອບໃຈ",
    ].join("\n");
  }

  return [
    "ສະບາຍດີ,",
    `ອໍເດີ ${orderCode} ຂອງທ່ານຖືກຈັດສົ່ງແລ້ວ.`,
    `ຈຳນວນທັງໝົດ ${totalQty} ຜືນ ແລະ ບໍ່ມີຍອດຄ້າງຊຳລະແລ້ວ`,
    "ຖ້າຮັບສິນຄ້າແລ້ວ ຫຼື ຕ້ອງການສອບຖາມເພີ່ມ ສາມາດຕິດຕໍ່ກັບຮ້ານໄດ້ເລີຍ.",
    "ຂອບໃຈ",
  ].join("\n");
}
