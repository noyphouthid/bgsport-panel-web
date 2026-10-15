import Swal from "sweetalert2";
import { ORDER_WORK_CATEGORIES, normalizeOrderWorkCategory } from "@/lib/order-work-category";

export async function confirmOrderWorkCategory(text: string) {
  const result = await Swal.fire({
    title: "ຢືນຢັນບັນທຶກເປັນອໍເດີ?",
    text,
    input: "select",
    inputLabel: "ປະເພດງານ / ກຸ່ມເສື້ອ",
    inputOptions: Object.fromEntries(ORDER_WORK_CATEGORIES.map((category) => [category.value, category.label])),
    inputPlaceholder: "ເລືອກປະເພດງານ",
    inputValidator: (value) => normalizeOrderWorkCategory(value) ? undefined : "ກະລຸນາເລືອກປະເພດງານ",
    showCancelButton: true,
    confirmButtonText: "ບັນທຶກເປັນອໍເດີ",
    cancelButtonText: "ຍົກເລີກ",
    reverseButtons: true,
  });
  return result.isConfirmed ? normalizeOrderWorkCategory(result.value) : null;
}
