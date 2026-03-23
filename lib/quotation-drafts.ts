export type QuotationDraftStatus = "draft" | "confirmed" | "cancelled";

export type QuotationDraft = {
  id: string;
  quoteNo: string;
  quoteDate: string;
  status: QuotationDraftStatus;
  createdByName: string;
  customerName: string;
  customerPhone: string;
  customerWhatsapp: string;
  customerFacebook: string;
  fabricId: string;
  fabricName: string;
  fabricShortPrice: number;
  fabricLongPrice: number;
  styleName: string;
  colorName: string;
  sleeveType: "short" | "long" | "mixed";
  shortQty: number;
  longQty: number;
  freeQty: number;
  qty3XL: number;
  qty4XL: number;
  qty5XL: number;
  qty6XL: number;
  collarType: "none" | "polo" | "mandarin";
  collarQty: number;
  extraCharge: number;
  discount: number;
  deposit: number;
  paymentDueDate: string;
  deliveryDate: string;
  paymentTerms: string;
  notes: string;
  warningNote: string;
  updatedAt: string;
  createdAt: string;
};

const STORAGE_KEY = "bgsport-quotation-drafts";

export function getQuotationDrafts(): QuotationDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QuotationDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getQuotationDraftById(id: string) {
  return getQuotationDrafts().find((item) => item.id === id) ?? null;
}

export function saveQuotationDraft(draft: QuotationDraft) {
  if (typeof window === "undefined") return;
  const rows = getQuotationDrafts();
  const nextRows = [draft, ...rows.filter((item) => item.id !== draft.id)].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRows));
}

export function deleteQuotationDraft(id: string) {
  if (typeof window === "undefined") return;
  const rows = getQuotationDrafts().filter((item) => item.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}
