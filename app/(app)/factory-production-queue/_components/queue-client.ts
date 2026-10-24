import { supabase } from "@/lib/supabase";

const messages: Record<string, string> = {
  assignment_changed: "ຜູ້ຮັບຜິດຊອບຖືກປ່ຽນແລ້ວ ກະລຸນາປິດໜ້ານີ້ ແລະ ໂຫຼດຄືນ",
  invalid_planner_user: "ກະລຸນາເລືອກຝ່າຍຜະລິດທີ່ເປີດໃຊ້ງານ", pattern_not_completed: "ກະລຸນາໃຫ້ວາງ Pattern ສຳເລັດ ແລະ ເລີ່ມວາງພ້ອມພິມກ່ອນ",
  forbidden: "ບໍ່ມີສິດເຂົ້າເຖິງງານນີ້", queue_not_found: "ບໍ່ພົບລາຍການ",
  invalid_transition: "ກະລຸນາດຳເນີນຕາມລຳດັບຂັ້ນຕອນ ແລະ ໂຫຼດຄິວຄືນ",
  production_already_in_progress: "ກະລຸນາວາງງານທີ່ກຳລັງເຮັດໃຫ້ສຳເລັດກ່ອນ",
  queue_not_next: "ກະລຸນາເລີ່ມງານດ່ວນກ່ອນ ແລະ ເຮັດຕາມລຳດັບຄິວ", queue_unassigned: "ອໍເດີ້ນີ້ຍັງບໍ່ມີຜູ້ຮັບຜິດຊອບ",
};
export async function callProductionQueueApi<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("ກະລຸນາເຂົ້າລະບົບອີກຄັ້ງ");
  const response = await fetch(path, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(messages[payload.error] || payload.message || payload.error || "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ");
  return payload as T;
}
export function formatProductionDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-GB", { timeZone: "Asia/Vientiane", ...(value.length === 10 ? { year: "numeric", month: "2-digit", day: "2-digit" } : {}) });
}
