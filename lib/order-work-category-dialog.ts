import Swal from "sweetalert2";
import { normalizeOrderWorkCategory } from "@/lib/order-work-category";

import { supabase } from "@/lib/supabase";
import { internalOptionsError } from "@/lib/internal-document-options";

export async function confirmOrderWorkCategory(text: string) {
  const { data, error } = await supabase.from("internal_work_categories").select("code,label").eq("is_active", true).order("sort_order").order("code");
  if (error) throw new Error(internalOptionsError(error));
  const categories = data || [];
  const result = await Swal.fire({
    title: "ຢືນຢັນບັນທຶກເປັນອໍເດີ?",
    text,
    input: "select",
    inputLabel: "ປະເພດງານ / ກຸ່ມເສື້ອ",
    inputOptions: Object.fromEntries(categories.map((category) => [category.code, category.label])),
    inputPlaceholder: "ເລືອກປະເພດງານ",
    inputValidator: (value) => categories.some(category => category.code === value) ? undefined : "ກະລຸນາເລືອກປະເພດງານ",
    showCancelButton: true,
    confirmButtonText: "ບັນທຶກເປັນອໍເດີ",
    cancelButtonText: "ຍົກເລີກ",
    reverseButtons: true,
  });
  return result.isConfirmed ? normalizeOrderWorkCategory(result.value) : null;
}
