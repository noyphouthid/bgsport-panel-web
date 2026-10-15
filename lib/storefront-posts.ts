import type { CatalogImage } from "@/lib/shirt-catalog";

export type StorefrontPostKind = "review" | "fabric";
export type StorefrontPost = {
  id: string;
  kind: StorefrontPostKind;
  title_lo: string;
  title_en: string;
  description_lo: string;
  description_en: string;
  images: CatalogImage[];
  sort_order: number;
  is_published: boolean;
};

export const STOREFRONT_POST_SECTIONS = {
  review: { label: "ລີວິວສິນຄ້າຈິງ", description: "ໂພສຮູບເສື້ອຈິງຈາກລູກຄ້າ ແລະ ລາຍລະອຽດຜົນງານ", path: "/shirt-catalog/reviews", publicPath: "/reviews/" },
  fabric: { label: "ລາຍການຜ້າ", description: "ໂພສຮູບເນື້ອຜ້າ ຄຸນສົມບັດ ແລະ ການໃຊ້ງານ", path: "/shirt-catalog/fabrics", publicPath: "/fabrics/" },
} as const;

export const STOREFRONT_POSTS_MIGRATION = "20261016_create_storefront_posts.sql";
