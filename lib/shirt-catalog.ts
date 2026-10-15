export const SHIRT_CATEGORIES = [
  { id: "football", lo: "ບານເຕະ", en: "Football" },
  { id: "volleyball", lo: "ບານສົ່ງ", en: "Volleyball" },
  { id: "basketball", lo: "ບານບ້ວງ", en: "Basketball" },
  { id: "polo", lo: "ໂປໂລ", en: "Polo" },
  { id: "teamwear", lo: "ເສື້ອທີມງານ", en: "Teamwear" },
] as const;

// IDs are durable slugs; category names and ordering are managed in the database.
export type ShirtCategory = string;
export type StorefrontCategory = { id: string; lo: string; en: string; icon: string; sort_order: number };
export const DEFAULT_STOREFRONT_CATEGORIES: StorefrontCategory[] = SHIRT_CATEGORIES.map((category, index) => ({ ...category, icon: category.id, sort_order: (index + 1) * 10 }));
export type CatalogImage = { url: string; path?: string; bucket?: string; mockup_id?: string; queue_entry_id?: string; order_code?: string; name?: string };
export type ShirtCatalogEntry = {
  id: string;
  design_code: string;
  name_lo: string;
  name_en: string;
  description_lo: string;
  description_en: string;
  caption_lo: string;
  caption_en: string;
  slogan_lo: string;
  slogan_en: string;
  category: ShirtCategory;
  category_ids?: ShirtCategory[];
  placement: "catalog" | "store" | "both";
  price_lak: number | null;
  images: CatalogImage[];
  is_published: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
};

// Older databases and public responses still contain only the original category.
export function shirtCategoryIds(entry: { category: string; category_ids?: string[] | null }): string[] {
  return [...new Set(entry.category_ids ?? [entry.category])].filter(Boolean);
}

export function isPublicImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export type LibraryImage = { id: string; file_url: string | null; file_name: string; file_path: string; queue_entry_id: string; queue: { type_code: string; order_no: string } | null };
export const LIBRARY_SELECT = "id,file_url,file_name,file_path,queue_entry_id,queue:design_queue_entries(type_code,order_no)";
export type StorefrontPromotion = Pick<ShirtCatalogEntry, "name_lo" | "name_en" | "caption_lo" | "caption_en" | "slogan_lo" | "slogan_en" | "images" | "is_published"> & { id?: string; link_url: string; sort_order: number };
export const STOREFRONT_FIELDS = [
  { key: "brandName", label: "ຊື່ຮ້ານ", defaultLo: "BG SPORT STORE", defaultEn: "BG SPORT STORE" },
  { key: "brandSlogan", label: "ຄຳຂວັນຮ້ານ", defaultLo: "YOUR TEAM. YOUR IDENTITY.", defaultEn: "YOUR TEAM. YOUR IDENTITY." },
  { key: "heroHeadline", label: "ຫົວຂໍ້ໃຫຍ່ໜ້າຫຼັກ", defaultLo: "YOUR TEAM.\nYOUR IDENTITY.", defaultEn: "YOUR TEAM.\nYOUR IDENTITY." },
  { key: "heroTitle", label: "ຫົວຂໍ້ແນະນຳ", defaultLo: "ແບບເສື້ອທີ່ບອກຄວາມເປັນທີມຂອງທ່ານ.", defaultEn: "A look that tells your team’s story." },
  { key: "heroBody", label: "ແຄັບຊັນໜ້າຫຼັກ", defaultLo: "ເລືອກແບບທີ່ມັກ ແລ້ວໃຫ້ BG SPORT ຊ່ວຍອອກແບບ ແລະ ຜະລິດເສື້ອໃນສະໄຕລ໌ຂອງທ່ານ.", defaultEn: "Find a design you love. Let BG SPORT help design and produce teamwear that feels like you." },
  { key: "topline", label: "ຂໍ້ຄວາມແຖບເທິງ", defaultLo: "ອອກແບບ ແລະ ຜະລິດເສື້ອພິມລາຍ ↗", defaultEn: "CUSTOM DESIGN & SUBLIMATION ↗" },
  { key: "latest", label: "ຫົວຂໍ້ລາຍການແບບເສື້ອ", defaultLo: "ແບບເສື້ອຈາກ BG SPORT", defaultEn: "The BG SPORT design edit." },
  { key: "aboutTitle", label: "ຫົວຂໍ້ກ່ຽວກັບຮ້ານ", defaultLo: "BG SPORT ອອກແບບ ແລະ ຜະລິດເສື້ອພິມລາຍ", defaultEn: "BG SPORT — custom design & sublimation." },
  { key: "aboutBody", label: "ລາຍລະອຽດຮ້ານ", defaultLo: "", defaultEn: "" },
] as const;
export type StorefrontContent = Record<string, { lo?: string; en?: string }>;
