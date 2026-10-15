// IDs match the province boundaries from Simplemaps.
export const LAOS_PROVINCES = [
  { id: "LAPH", name: "ຜົ້ງສາລີ", english: "Phongsaly", aliases: ["ຜົ່ງສາລີ", "ຜົ້ງສະລີ", "ຜົ້່ງສາລີ", "Phongsali"] },
  { id: "LALM", name: "ຫຼວງນ້ຳທາ", english: "Luang Namtha", aliases: ["ຫລວງນ້ຳທາ", "ຫລວງນ້້ຳທາ", "ຫຼວງນຳ້ທາ", "ຫຼວງນໍ້າທາ", "ຫລວງນຳທາ", "ຫລວງນຳ້ທາ", "ຫຼວງນຳທາ", "Luangnamtha", "Louangnamtha"] },
  { id: "LAOU", name: "ອຸດົມໄຊ", english: "Oudomxay", aliases: ["Oudomxai", "Udomxai", "ອຸດົມໄຊຍ"] },
  { id: "LABK", name: "ບໍ່ແກ້ວ", english: "Bokeo", aliases: ["ບໍແກ້ວ", "ບໍ່ເເກ້ວ", "ບໍເເກ້ວ", "Bokéo"] },
  { id: "LALP", name: "ຫຼວງພະບາງ", english: "Luang Prabang", aliases: ["ຫລວງພະບາງ", "ຫຼາງພະບາງ", "ຫວຼງພະບາງ", "ລວງພະບາງ", "Luangprabang", "Louangphabang"] },
  { id: "LAHO", name: "ຫົວພັນ", english: "Houaphanh", aliases: ["Houaphan", "Hua Phan", "Huaphanh"] },
  { id: "LAXA", name: "ໄຊຍະບູລີ", english: "Xayaboury", aliases: ["ໄຊຍະບຸລິ", "ໄຊຍະບຸລີ", "Xaignabouly", "Xayaburi", "Sayaboury", "Sainyabuli"] },
  { id: "LAXI", name: "ຊຽງຂວາງ", english: "Xieng Khouang", aliases: ["ຊຽງຂວງ", "Xiengkhouang", "Xiangkhouang", "Xieng Khwang"] },
  { id: "LAVI", name: "ວຽງຈັນ", english: "Vientiane Province", aliases: ["ວຽງຈັນນ", "Vientiane", "Viangchan"] },
  { id: "LAVT", name: "ນະຄອນຫຼວງວຽງຈັນ", english: "Vientiane Capital", aliases: ["ນະຄອນຫລວງວຽງຈັນ", "ນະຄອນຫລວງ", "ນະຄອນຫຼວງ", "ນະຄອນຫວງວຽງຈັນ", "ນະຄອນຫູວງວຽງຈັນ", "ນະຄອນວຽງຈັນ", "ນະຄອນຫລງວຽງຈັນ", "ນະຄອນຫຼຸວງວຽງຈັນ", "Vientiane Municipality", "นครหลวงเวียงจันทน์"] },
  { id: "LAXS", name: "ໄຊສົມບູນ", english: "Xaisomboun", aliases: ["Xaisomboon", "Xaysomboun", "Saysomboun"] },
  { id: "LABL", name: "ບໍລິຄຳໄຊ", english: "Bolikhamxay", aliases: ["ບໍລິຄໍາໄຊ", "ບໍ່ລິຄຳໄຊ", "ບໍລີຄຳໄຊ", "ບໍລີຄໍາໄຊ", "Bolikhamxai", "Borikhamxay"] },
  { id: "LAKH", name: "ຄຳມ່ວນ", english: "Khammouane", aliases: ["ຄຳມວ່ນ", "ຄຳມວນ", "ຄໍາມວ່ນ", "ຄຳມ່ວນນ", "ຄໍາມ່ວນ", "คำม่วน", "Khammouan", "Khammuane"] },
  { id: "LASV", name: "ສະຫວັນນະເຂດ", english: "Savannakhet", aliases: ["ສະຫັວນນະເຂດ", "ສະຫວັັນນະເຂດ", "ສະຫັວນະເຂດ", "ສະວັນນະເຂດ", "สะหวันนะเขด", "Savannakhét"] },
  { id: "LASL", name: "ສາລະວັນ", english: "Salavan", aliases: ["ສາລາວັນ", "Saravan", "Saravane"] },
  { id: "LAXE", name: "ເຊກອງ", english: "Sekong", aliases: ["Xekong", "Sékong"] },
  { id: "LACH", name: "ຈຳປາສັກ", english: "Champasak", aliases: ["ຈໍາປາສັກ", "Champasack", "Champassak"] },
  { id: "LAAT", name: "ອັດຕະປື", english: "Attapeu", aliases: ["Attapu", "Attapeou"] },
] as const;

export type LaosProvinceId = (typeof LAOS_PROVINCES)[number]["id"];

function provinceKey(value: string) {
  return value.normalize("NFC").toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/^\s*(ແຂວງ|province\s+|แขวง)/, "")
    .replace(/\s+province\s*$/, "")
    .replace(/[\s._-]/g, "")
    .replace(/ໍາ/g, "ຳ");
}

const provinceAliases = new Map<string, (typeof LAOS_PROVINCES)[number]>();
for (const province of LAOS_PROVINCES) {
  for (const alias of [province.id, province.name, province.english, ...province.aliases]) {
    provinceAliases.set(provinceKey(alias), province);
  }
}

// Exact, explicit aliases only: a district or unknown name must not be guessed.
export function resolveLaosProvince(value: string | null | undefined) {
  return provinceAliases.get(provinceKey(String(value || ""))) ?? null;
}
