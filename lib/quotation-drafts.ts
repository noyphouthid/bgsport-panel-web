import { supabase } from "@/lib/supabase";

export type QuotationDraftStatus = "draft" | "confirmed" | "cancelled";

export type QuotationDraft = {
  id?: string;
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
  createdByUserId?: string | null;
};

type QuotationDraftDbRow = {
  id: string;
  created_by_user_id: string | null;
  created_by_name: string;
  quote_no: string;
  quote_date: string;
  status: QuotationDraftStatus;
  customer_name: string;
  customer_phone: string;
  customer_whatsapp: string;
  customer_facebook: string;
  fabric_id: string;
  fabric_name: string;
  fabric_short_price: number;
  fabric_long_price: number;
  style_name: string;
  color_name: string;
  sleeve_type: "short" | "long" | "mixed";
  short_qty: number;
  long_qty: number;
  free_qty: number;
  qty_3xl: number;
  qty_4xl: number;
  qty_5xl: number;
  qty_6xl: number;
  collar_type: "none" | "polo" | "mandarin";
  collar_qty: number;
  extra_charge: number;
  discount: number;
  deposit: number;
  payment_due_date: string;
  delivery_date: string;
  payment_terms: string;
  notes: string;
  warning_note: string;
  created_at: string;
  updated_at: string;
};

const QUOTATION_DRAFT_SELECT = `
  id,
  created_by_user_id,
  created_by_name,
  quote_no,
  quote_date,
  status,
  customer_name,
  customer_phone,
  customer_whatsapp,
  customer_facebook,
  fabric_id,
  fabric_name,
  fabric_short_price,
  fabric_long_price,
  style_name,
  color_name,
  sleeve_type,
  short_qty,
  long_qty,
  free_qty,
  qty_3xl,
  qty_4xl,
  qty_5xl,
  qty_6xl,
  collar_type,
  collar_qty,
  extra_charge,
  discount,
  deposit,
  payment_due_date,
  delivery_date,
  payment_terms,
  notes,
  warning_note,
  created_at,
  updated_at
`;

function mapRowToDraft(row: QuotationDraftDbRow): QuotationDraft {
  return {
    id: row.id,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name || "",
    quoteNo: row.quote_no || "",
    quoteDate: row.quote_date || "",
    status: row.status || "draft",
    customerName: row.customer_name || "",
    customerPhone: row.customer_phone || "",
    customerWhatsapp: row.customer_whatsapp || "",
    customerFacebook: row.customer_facebook || "",
    fabricId: row.fabric_id || "",
    fabricName: row.fabric_name || "",
    fabricShortPrice: Number(row.fabric_short_price) || 0,
    fabricLongPrice: Number(row.fabric_long_price) || 0,
    styleName: row.style_name || "",
    colorName: row.color_name || "",
    sleeveType: row.sleeve_type || "short",
    shortQty: Number(row.short_qty) || 0,
    longQty: Number(row.long_qty) || 0,
    freeQty: Number(row.free_qty) || 0,
    qty3XL: Number(row.qty_3xl) || 0,
    qty4XL: Number(row.qty_4xl) || 0,
    qty5XL: Number(row.qty_5xl) || 0,
    qty6XL: Number(row.qty_6xl) || 0,
    collarType: row.collar_type || "none",
    collarQty: Number(row.collar_qty) || 0,
    extraCharge: Number(row.extra_charge) || 0,
    discount: Number(row.discount) || 0,
    deposit: Number(row.deposit) || 0,
    paymentDueDate: row.payment_due_date || "",
    deliveryDate: row.delivery_date || "",
    paymentTerms: row.payment_terms || "",
    notes: row.notes || "",
    warningNote: row.warning_note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getCurrentUserProfile() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const authUserId = sessionData.session?.user.id ?? null;
  const email = String(sessionData.session?.user.email || "").trim();
  if (!authUserId && !email) return null;

  if (authUserId) {
    const { data, error } = await supabase
      .from("users")
      .select("id,full_name,role")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as { id: string; full_name: string; role: string };
  }

  if (email) {
    const { data, error } = await supabase.from("users").select("id,full_name,role").eq("email", email).maybeSingle();
    if (error) throw error;
    if (data) return data as { id: string; full_name: string; role: string };
  }

  return null;
}

export async function getQuotationDrafts(): Promise<QuotationDraft[]> {
  const { data, error } = await supabase
    .from("quotation_drafts")
    .select(QUOTATION_DRAFT_SELECT)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as QuotationDraftDbRow[]).map(mapRowToDraft);
}

export async function getQuotationDraftById(id: string) {
  const { data, error } = await supabase
    .from("quotation_drafts")
    .select(QUOTATION_DRAFT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapRowToDraft(data as QuotationDraftDbRow);
}

export async function saveQuotationDraft(draft: QuotationDraft) {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser) throw new Error("ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້");

  const now = new Date().toISOString();
  let existingMeta: { created_by_user_id: string | null; created_by_name: string; created_at: string } | null = null;

  if (draft.id) {
    const { data, error } = await supabase
      .from("quotation_drafts")
      .select("created_by_user_id,created_by_name,created_at")
      .eq("id", draft.id)
      .maybeSingle();

    if (error) throw error;
    existingMeta = (data as { created_by_user_id: string | null; created_by_name: string; created_at: string } | null) ?? null;
  }

  const payload = {
    ...(draft.id ? { id: draft.id } : {}),
    created_by_user_id: existingMeta?.created_by_user_id || draft.createdByUserId || currentUser.id,
    created_by_name: existingMeta?.created_by_name || draft.createdByName || currentUser.full_name || "",
    quote_no: draft.quoteNo,
    quote_date: draft.quoteDate,
    status: draft.status,
    customer_name: draft.customerName,
    customer_phone: draft.customerPhone,
    customer_whatsapp: draft.customerWhatsapp,
    customer_facebook: draft.customerFacebook,
    fabric_id: draft.fabricId,
    fabric_name: draft.fabricName,
    fabric_short_price: Number(draft.fabricShortPrice) || 0,
    fabric_long_price: Number(draft.fabricLongPrice) || 0,
    style_name: draft.styleName,
    color_name: draft.colorName,
    sleeve_type: draft.sleeveType,
    short_qty: Number(draft.shortQty) || 0,
    long_qty: Number(draft.longQty) || 0,
    free_qty: Number(draft.freeQty) || 0,
    qty_3xl: Number(draft.qty3XL) || 0,
    qty_4xl: Number(draft.qty4XL) || 0,
    qty_5xl: Number(draft.qty5XL) || 0,
    qty_6xl: Number(draft.qty6XL) || 0,
    collar_type: draft.collarType,
    collar_qty: Number(draft.collarQty) || 0,
    extra_charge: Number(draft.extraCharge) || 0,
    discount: Number(draft.discount) || 0,
    deposit: Number(draft.deposit) || 0,
    payment_due_date: draft.paymentDueDate || "",
    delivery_date: draft.deliveryDate || "",
    payment_terms: draft.paymentTerms,
    notes: draft.notes,
    warning_note: draft.warningNote,
    created_at: existingMeta?.created_at || draft.createdAt || now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("quotation_drafts")
    .upsert(payload, { onConflict: "id" })
    .select(QUOTATION_DRAFT_SELECT)
    .single();

  if (error) throw error;
  return mapRowToDraft(data as QuotationDraftDbRow);
}

export async function deleteQuotationDraft(id: string) {
  const { error } = await supabase.from("quotation_drafts").delete().eq("id", id);
  if (error) throw error;
}
