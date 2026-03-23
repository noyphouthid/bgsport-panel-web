"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, Eye, FileUp, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import {
  canEditFactoryDepositOrder,
  FACTORY_DEPOSIT_ORDER_STATUS_LABELS,
  type FactoryDepositOrderStatus,
} from "@/lib/factory-deposit-orders";
import {
  getQuotationDraftById,
  saveQuotationDraft,
  type QuotationDraft,
  type QuotationDraftStatus,
} from "@/lib/quotation-drafts";

type DepositSlipRow = {
  id: string;
  deposit_order_id: string;
  file_name: string;
  file_path: string;
  file_url: string | null;
  note: string | null;
  uploaded_at: string;
};

type FabricRow = {
  id: string;
  name: string;
  short_price: number;
  long_price: number;
  is_active: boolean;
};

type UserOption = {
  id: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
  auth_user_id: string | null;
};

type DepositOrderRow = {
  id: string;
  quotation_draft_id: string | null;
  quotation_quote_no: string | null;
  deposit_no: string;
  deposit_date: string;
  order_code: string | null;
  order_date: string | null;
  status: FactoryDepositOrderStatus;
  customer_name: string;
  customer_phone: string;
  customer_whatsapp: string;
  customer_facebook: string;
  fabric_id: string | null;
  style_name: string;
  color_name: string;
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
  design_deposit: number;
  initial_deposit: number;
  factory_deposit_amount: number;
  factory_cost: number;
  payment_due_date: string | null;
  delivery_date: string | null;
  factory_bill_code: string | null;
  payment_terms: string;
  notes: string;
  warning_note: string;
  factory_deposit_note: string;
  transfer_slip_url: string | null;
  transfer_slip_path: string | null;
  admin_user_id: string | null;
  graphic_user_id: string | null;
  created_by_user_id: string | null;
};

const COLLAR_PRICE = 20000;
const SIZE_UPCHARGES = {
  "3XL": 20000,
  "4XL": 25000,
  "5XL": 35000,
  "6XL": 35000,
} as const;
const DEFAULT_TERMS = "ມັດຈຳເຂົ້າຄິວກ່ອນຜະລິດ ແລະ ຊຳລະຍອດທີ່ເຫຼືອຕາມວັນນັດ.";

function buildDepositNo() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `DPF${yy}-${mm}${dd}${hh}${min}`;
}

function formatMoney(value: number) {
  return `${Math.max(0, Number(value) || 0).toLocaleString()} ກີບ`;
}

export default function FactoryDepositOrderFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId");
  const editId = searchParams.get("id");

  const [fabrics, setFabrics] = useState<FabricRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSlip, setUploadingSlip] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [recordId, setRecordId] = useState<string | null>(null);
  const [status, setStatus] = useState<FactoryDepositOrderStatus>("draft");
  const [depositNo, setDepositNo] = useState(buildDepositNo());
  const [depositDate, setDepositDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [orderCode, setOrderCode] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [quotationQuoteNo, setQuotationQuoteNo] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [customerFacebook, setCustomerFacebook] = useState("");

  const [fabricId, setFabricId] = useState("");
  const [shortQty, setShortQty] = useState(0);
  const [longQty, setLongQty] = useState(0);
  const [freeQty, setFreeQty] = useState(0);
  const [qty3XL, setQty3XL] = useState(0);
  const [qty4XL, setQty4XL] = useState(0);
  const [qty5XL, setQty5XL] = useState(0);
  const [qty6XL, setQty6XL] = useState(0);
  const [collarType, setCollarType] = useState<"none" | "polo" | "mandarin">("none");
  const [collarQty, setCollarQty] = useState(0);

  const [extraCharge, setExtraCharge] = useState(0);
  const [designDeposit, setDesignDeposit] = useState(0);
  const [initialDeposit, setInitialDeposit] = useState(0);
  const [factoryCost, setFactoryCost] = useState(0);
  const [factoryBillCode, setFactoryBillCode] = useState("");
  const [paymentTerms, setPaymentTerms] = useState(DEFAULT_TERMS);
  const [notes, setNotes] = useState("");
  const [warningNote, setWarningNote] = useState("");
  const [factoryDepositNote, setFactoryDepositNote] = useState("");

  const [adminUserId, setAdminUserId] = useState("");
  const [graphicUserId, setGraphicUserId] = useState("");
  const [transferSlipUrl, setTransferSlipUrl] = useState<string | null>(null);
  const [transferSlipPath, setTransferSlipPath] = useState<string | null>(null);
  const [slipRows, setSlipRows] = useState<DepositSlipRow[]>([]);
  const [pendingSlipFiles, setPendingSlipFiles] = useState<File[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErr(null);

      try {
        const [{ data: fabricsData, error: fabricsError }, { data: usersData, error: usersError }, { data: sessionData }] =
          await Promise.all([
            supabase.from("fabrics").select("id,name,short_price,long_price,is_active").eq("is_active", true).order("name", { ascending: true }),
            supabase.from("users").select("id,full_name,role,is_active,auth_user_id").eq("is_active", true).order("full_name", { ascending: true }),
            supabase.auth.getSession(),
          ]);

        if (fabricsError) throw fabricsError;
        if (usersError) throw usersError;

        const fabricRows = (fabricsData ?? []) as FabricRow[];
        const userRows = (usersData ?? []) as UserOption[];
        setFabrics(fabricRows);
        setUsers(userRows);
        if (fabricRows.length > 0) setFabricId((prev) => prev || fabricRows[0].id);

        const authUserId = sessionData.session?.user.id ?? null;
        const currentUser = userRows.find((item) => item.auth_user_id === authUserId) || null;
        setViewerRole(currentUser?.role ?? null);
        setViewerUserId(currentUser?.id ?? null);

        if (editId) {
          const { data, error } = await supabase
            .from("factory_deposit_orders")
            .select("*")
            .eq("id", editId)
            .maybeSingle();

          if (error) throw error;
          if (!data) throw new Error("ບໍ່ພົບໃບມັດຈຳສັ່ງຜະລິດ");

          const row = data as DepositOrderRow;
          setRecordId(row.id);
          setStatus(row.status);
          setDepositNo(row.deposit_no);
          setDepositDate(row.deposit_date);
          setOrderCode(row.order_code || "");
          setOrderDate(row.order_date || new Date().toISOString().slice(0, 10));
          setQuotationQuoteNo(row.quotation_quote_no || "");
          setCustomerName(row.customer_name || "");
          setCustomerPhone(row.customer_phone || "");
          setCustomerWhatsapp(row.customer_whatsapp || "");
          setCustomerFacebook(row.customer_facebook || "");
          setFabricId(row.fabric_id || "");
          setShortQty(Number(row.short_qty) || 0);
          setLongQty(Number(row.long_qty) || 0);
          setFreeQty(Number(row.free_qty) || 0);
          setQty3XL(Number(row.qty_3xl) || 0);
          setQty4XL(Number(row.qty_4xl) || 0);
          setQty5XL(Number(row.qty_5xl) || 0);
          setQty6XL(Number(row.qty_6xl) || 0);
          setCollarType(row.collar_type || "none");
          setCollarQty(Number(row.collar_qty) || 0);
          setExtraCharge(Number(row.extra_charge) || 0);
          setDesignDeposit((Number(row.design_deposit) || 0) + (Number(row.discount) || 0));
          setInitialDeposit(Number(row.initial_deposit) || 0);
          setFactoryCost(Number(row.factory_cost) || 0);
          setFactoryBillCode(row.factory_bill_code || "");
          setPaymentTerms(row.payment_terms || DEFAULT_TERMS);
          setNotes(row.notes || "");
          setWarningNote(row.warning_note || "");
          setFactoryDepositNote(row.factory_deposit_note || "");
          setAdminUserId(row.admin_user_id || "");
          setGraphicUserId(row.graphic_user_id || "");
          setTransferSlipUrl(row.transfer_slip_url || null);
          setTransferSlipPath(row.transfer_slip_path || null);
          const { data: slipData, error: slipError } = await supabase
            .from("factory_deposit_order_slips")
            .select("id,deposit_order_id,file_name,file_path,file_url,note,uploaded_at")
            .eq("deposit_order_id", row.id)
            .order("uploaded_at", { ascending: false });
          if (slipError) throw slipError;
          setSlipRows((slipData ?? []) as DepositSlipRow[]);
          return;
        }

        if (draftId) {
          const draft = getQuotationDraftById(draftId);
          if (draft) {
            setQuotationQuoteNo(draft.quoteNo);
            setDepositDate(draft.quoteDate || new Date().toISOString().slice(0, 10));
            setOrderDate(draft.quoteDate || new Date().toISOString().slice(0, 10));
            setCustomerName(draft.customerName);
            setCustomerPhone(draft.customerPhone);
            setCustomerWhatsapp(draft.customerWhatsapp);
            setCustomerFacebook(draft.customerFacebook);
            setFabricId(draft.fabricId);
            setShortQty(draft.shortQty);
            setLongQty(draft.longQty);
            setFreeQty(draft.freeQty);
            setQty3XL(draft.qty3XL);
            setQty4XL(draft.qty4XL);
            setQty5XL(draft.qty5XL);
            setQty6XL(draft.qty6XL || 0);
            setCollarType(draft.collarType);
            setCollarQty(draft.collarQty);
            setExtraCharge(draft.extraCharge);
            setDesignDeposit(Number(draft.discount) || 0);
            setInitialDeposit(draft.deposit);
            setPaymentTerms(draft.paymentTerms || DEFAULT_TERMS);
            setNotes(draft.notes || "");
            setWarningNote(draft.warningNote || "");
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "ໂຫຼດຟອມບໍ່ສຳເລັດ";
        setErr(message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [draftId, editId]);

  const selectedFabric = useMemo(() => fabrics.find((item) => item.id === fabricId) ?? null, [fabrics, fabricId]);
  const adminOptions = useMemo(
    () => users.filter((item) => ["superadmin", "admin", "manager", "staff"].includes(item.role)),
    [users]
  );
  const graphicOptions = useMemo(() => users.filter((item) => item.role === "graphic"), [users]);
  const canEdit = viewerRole ? canEditFactoryDepositOrder(status, viewerRole) : false;

  const shirtTotal = useMemo(() => {
    if (!selectedFabric) return 0;
    return (Number(shortQty) || 0) * Number(selectedFabric.short_price || 0) + (Number(longQty) || 0) * Number(selectedFabric.long_price || 0);
  }, [selectedFabric, shortQty, longQty]);

  const plusSizeTotal = useMemo(
    () =>
      (Number(qty3XL) || 0) * SIZE_UPCHARGES["3XL"] +
      (Number(qty4XL) || 0) * SIZE_UPCHARGES["4XL"] +
      (Number(qty5XL) || 0) * SIZE_UPCHARGES["5XL"] +
      (Number(qty6XL) || 0) * SIZE_UPCHARGES["6XL"],
    [qty3XL, qty4XL, qty5XL, qty6XL]
  );

  const collarTotal = useMemo(() => {
    if (collarType === "none") return 0;
    return (Number(collarQty) || 0) * COLLAR_PRICE;
  }, [collarQty, collarType]);

  const grossTotal = useMemo(
    () => shirtTotal + plusSizeTotal + collarTotal + (Number(extraCharge) || 0),
    [shirtTotal, plusSizeTotal, collarTotal, extraCharge]
  );
  const netTotal = useMemo(() => Math.max(0, grossTotal - (Number(designDeposit) || 0)), [grossTotal, designDeposit]);
  const balance = useMemo(() => Math.max(0, netTotal - (Number(initialDeposit) || 0)), [netTotal, initialDeposit]);

  const buildQuotationDraft = (): QuotationDraft => ({
    id: draftId || `quotation-${Date.now()}`,
    quoteNo: quotationQuoteNo || orderCode || depositNo,
    quoteDate: depositDate,
    status: "draft" as QuotationDraftStatus,
    createdByName: "",
    customerName,
    customerPhone,
    customerWhatsapp,
    customerFacebook,
    fabricId: selectedFabric?.id || "",
    fabricName: selectedFabric?.name || "",
    fabricShortPrice: Number(selectedFabric?.short_price || 0),
    fabricLongPrice: Number(selectedFabric?.long_price || 0),
    styleName: "",
    colorName: "",
    sleeveType: shortQty > 0 && longQty > 0 ? "mixed" : longQty > 0 ? "long" : "short",
    shortQty,
    longQty,
    freeQty,
    qty3XL,
    qty4XL,
    qty5XL,
    qty6XL,
    collarType,
    collarQty,
    extraCharge,
    discount: designDeposit,
    deposit: initialDeposit,
    paymentDueDate: "",
    deliveryDate: "",
    paymentTerms,
    notes,
    warningNote,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const insertHistory = async (
    depositOrderId: string,
    action: string,
    detail: string,
    fromStatus: FactoryDepositOrderStatus | null,
    toStatus: FactoryDepositOrderStatus | null
  ) => {
    await supabase.from("factory_deposit_order_history").insert({
      deposit_order_id: depositOrderId,
      action,
      detail,
      from_status: fromStatus,
      to_status: toStatus,
      action_by_user_id: viewerUserId,
    });
  };

  const uploadSlipIfNeeded = async (depositOrderId: string) => {
    if (pendingSlipFiles.length === 0) {
      return {
        firstPath: transferSlipPath,
        firstUrl: transferSlipUrl,
      };
    }

    setUploadingSlip(true);
    try {
      const uploaded: Array<{ file_name: string; file_path: string; file_url: string | null }> = [];

      for (const file of pendingSlipFiles) {
        const safeName = file.name.replace(/\s+/g, "-");
        const path = `${depositOrderId}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("factory-deposit-slips")
          .upload(path, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("factory-deposit-slips").getPublicUrl(path);
        uploaded.push({
          file_name: file.name,
          file_path: path,
          file_url: data.publicUrl,
        });
      }

      const { error: insertSlipError } = await supabase.from("factory_deposit_order_slips").insert(
        uploaded.map((item) => ({
          deposit_order_id: depositOrderId,
          file_name: item.file_name,
          file_path: item.file_path,
          file_url: item.file_url,
          uploaded_by_user_id: viewerUserId,
        }))
      );
      if (insertSlipError) throw insertSlipError;

      const first = uploaded[0] || null;
      if (first) {
        setTransferSlipPath(first.file_path);
        setTransferSlipUrl(first.file_url);
      }
      setPendingSlipFiles([]);

      const { data: slipData, error: slipError } = await supabase
        .from("factory_deposit_order_slips")
        .select("id,deposit_order_id,file_name,file_path,file_url,note,uploaded_at")
        .eq("deposit_order_id", depositOrderId)
        .order("uploaded_at", { ascending: false });
      if (slipError) throw slipError;
      setSlipRows((slipData ?? []) as DepositSlipRow[]);

      return {
        firstPath: first?.file_path || transferSlipPath,
        firstUrl: first?.file_url || transferSlipUrl,
      };
    } finally {
      setUploadingSlip(false);
    }
  };

  const handleSlipChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setPendingSlipFiles((prev) => [...prev, ...files]);
    event.target.value = "";
  };

  const removePendingSlip = (name: string) => {
    setPendingSlipFiles((prev) => prev.filter((file) => file.name !== name));
  };

  const handleSave = async (nextStatus: FactoryDepositOrderStatus) => {
    if (!canEdit) {
      toast.error("ທ່ານບໍ່ມີສິດແກ້ໄຂໃບນີ້");
      return;
    }
    if (!depositNo.trim()) return toast.error("ກະລຸນາປ້ອນເລກທີ່ໃບມັດຈຳ");
    if (!orderCode.trim()) return toast.error("ກະລຸນາປ້ອນລະຫັດອໍເດີ");
    if (!selectedFabric) return toast.error("ກະລຸນາເລືອກຜ້າ");
    if (!adminUserId) return toast.error("ກະລຸນາເລືອກແອັດມິນ");
    if (!graphicUserId) return toast.error("ກະລຸນາເລືອກກຣາຟິກ");

    setSaving(true);
    setErr(null);

    try {
      const quotationDraft = buildQuotationDraft();
      if (draftId) saveQuotationDraft(quotationDraft);

      const payload = {
        quotation_draft_id: draftId || null,
        quotation_quote_no: quotationQuoteNo.trim() || null,
        quotation_snapshot: quotationDraft,
        deposit_no: depositNo.trim(),
        deposit_date: depositDate,
        order_code: orderCode.trim(),
        order_date: orderDate,
        status: nextStatus,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_whatsapp: customerWhatsapp.trim(),
        customer_facebook: customerFacebook.trim(),
        fabric_id: selectedFabric.id,
        fabric_name: selectedFabric.name,
        fabric_short_price: Number(selectedFabric.short_price || 0),
        fabric_long_price: Number(selectedFabric.long_price || 0),
        style_name: "",
        color_name: "",
        sleeve_type: shortQty > 0 && longQty > 0 ? "mixed" : longQty > 0 ? "long" : "short",
        collar_type: collarType,
        collar_qty: Math.max(0, collarQty),
        short_qty: Math.max(0, shortQty),
        long_qty: Math.max(0, longQty),
        free_qty: Math.max(0, freeQty),
        qty_3xl: Math.max(0, qty3XL),
        qty_4xl: Math.max(0, qty4XL),
        qty_5xl: Math.max(0, qty5XL),
        qty_6xl: Math.max(0, qty6XL),
        extra_charge: Math.max(0, extraCharge),
        discount: 0,
        design_deposit: Math.max(0, designDeposit),
        initial_deposit: Math.max(0, initialDeposit),
        factory_deposit_amount: 0,
        factory_cost: Math.max(0, factoryCost),
        gross_total: grossTotal,
        net_total: netTotal,
        balance,
        payment_due_date: null,
        delivery_date: null,
        factory_bill_code: factoryBillCode.trim() || null,
        payment_terms: paymentTerms.trim(),
        notes: notes.trim(),
        warning_note: warningNote.trim(),
        factory_deposit_note: factoryDepositNote.trim(),
        created_by_user_id: viewerUserId,
        admin_user_id: adminUserId,
        graphic_user_id: graphicUserId,
      };

      let depositOrderId = recordId;
      const previousStatus = status;

      if (recordId) {
        const { error } = await supabase.from("factory_deposit_orders").update(payload).eq("id", recordId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("factory_deposit_orders").insert(payload).select("id").single();
        if (error) throw error;
        depositOrderId = data.id as string;
        setRecordId(depositOrderId);
      }

      if (!depositOrderId) throw new Error("ບໍ່ພົບລະຫັດໃບມັດຈຳ");

      const uploadedSlip = await uploadSlipIfNeeded(depositOrderId);
      if (uploadedSlip.firstPath || uploadedSlip.firstUrl) {
        const { error: slipUpdateError } = await supabase
          .from("factory_deposit_orders")
          .update({
            transfer_slip_path: uploadedSlip.firstPath,
            transfer_slip_url: uploadedSlip.firstUrl,
            transfer_slip_uploaded_at: new Date().toISOString(),
            transfer_slip_uploaded_by_user_id: viewerUserId,
          })
          .eq("id", depositOrderId);

        if (slipUpdateError) throw slipUpdateError;
      }

      await insertHistory(
        depositOrderId,
        recordId ? "update" : "create",
        nextStatus === "submitted" ? "submit deposit order" : "save draft deposit order",
        recordId ? previousStatus : null,
        nextStatus
      );

      setStatus(nextStatus);
      toast.success(nextStatus === "submitted" ? "ບັນທຶກ ແລະ ສົ່ງໃບມັດຈຳແລ້ວ" : "ບັນທຶກຮ່າງໃບມັດຈຳແລ້ວ");
      router.push("/factory-deposit-orders");
    } catch (error) {
      const message = error instanceof Error ? error.message : "ບັນທຶກບໍ່ສຳເລັດ";
      setErr(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-3xl border border-slate-100 bg-white p-8 text-sm font-bold text-slate-500">ກຳລັງໂຫຼດຟອມ...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/factory-deposit-orders" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-slate-700">
            <ArrowLeft size={16} />
            ກັບໄປລາຍການໃບມັດຈຳ
          </Link>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
            {editId ? "ແກ້ໄຂໃບມັດຈຳສັ່ງຜະລິດ" : "ສ້າງໃບມັດຈຳສັ່ງຜະລິດ"}
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            ດຶງຂໍ້ມູນຈາກໃບປະເມີນລາຄາ ແລະ ບັນທຶກເປັນໃບມັດຈຳກ່ອນກົດບັນທຶກເປັນອໍເດີຈິງ
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
            ສະຖານະ: {FACTORY_DEPOSIT_ORDER_STATUS_LABELS[status]}
          </div>
          <button
            type="button"
            onClick={() => handleSave("draft")}
            disabled={saving || uploadingSlip || !canEdit}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກຮ່າງ"}
          </button>
          <button
            type="button"
            onClick={() => handleSave("submitted")}
            disabled={saving || uploadingSlip || !canEdit}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກ ແລະ ສົ່ງ"}
          </button>
        </div>
      </div>

      {err && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">ຂໍ້ຜິດພາດ: {err}</div>}
      {!canEdit && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">ໃບນີ້ຢູ່ໃນສະຖານະທີ່ບໍ່ສາມາດແກ້ໄຂໄດ້</div>}

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 text-sm font-black uppercase tracking-wider text-slate-700">ຂໍ້ມູນເອກະສານ</div>
            <div className="grid gap-4 md:grid-cols-2">
              <input value={depositNo} onChange={(e) => setDepositNo(e.target.value)} disabled={!canEdit} placeholder="ເລກທີ່ໃບມັດຈຳ" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              <input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              <input value={orderCode} onChange={(e) => setOrderCode(e.target.value)} disabled={!canEdit} placeholder="ລະຫັດອໍເດີ" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              <input value={quotationQuoteNo} onChange={(e) => setQuotationQuoteNo(e.target.value)} disabled={!canEdit} placeholder="ເລກທີ່ໃບປະເມີນລາຄາ" className="md:col-span-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 text-sm font-black uppercase tracking-wider text-slate-700">ລູກຄ້າ ແລະ ຜູ້ຮັບຜິດຊອບ</div>
            <div className="grid gap-4 md:grid-cols-2">
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={!canEdit} placeholder="ຊື່ລູກຄ້າ" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} disabled={!canEdit} placeholder="ເບີໂທ" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              <input value={customerWhatsapp} onChange={(e) => setCustomerWhatsapp(e.target.value)} disabled={!canEdit} placeholder="WhatsApp" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              <input value={customerFacebook} onChange={(e) => setCustomerFacebook(e.target.value)} disabled={!canEdit} placeholder="Facebook" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              <select value={adminUserId} onChange={(e) => setAdminUserId(e.target.value)} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50">
                <option value="">ເລືອກແອັດມິນ</option>
                {adminOptions.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
              </select>
              <select value={graphicUserId} onChange={(e) => setGraphicUserId(e.target.value)} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50">
                <option value="">ເລືອກກຣາຟິກ</option>
                {graphicOptions.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
              </select>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 text-sm font-black uppercase tracking-wider text-slate-700">ລາຍການຜະລິດ</div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ປະເພດຜ້າ</label>
                <select value={fabricId} onChange={(e) => setFabricId(e.target.value)} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50">
                  <option value="">ເລືອກຜ້າ</option>
                  {fabrics.map((fabric) => <option key={fabric.id} value={fabric.id}>{fabric.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ລະຫັດໂຮງງານ</label>
                <input value={factoryBillCode} onChange={(e) => setFactoryBillCode(e.target.value)} disabled={!canEdit} placeholder="ສາມາດໃສ່ພາຍຫຼັງໄດ້" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
              {[
                ["ແຂນສັ້ນ", shortQty, setShortQty],
                ["ແຂນຍາວ", longQty, setLongQty],
                ["ແຖມ", freeQty, setFreeQty],
                ["3XL", qty3XL, setQty3XL],
                ["4XL", qty4XL, setQty4XL],
                ["5XL", qty5XL, setQty5XL],
                ["6XL", qty6XL, setQty6XL],
                ["ຄໍເພີ່ມ", collarQty, setCollarQty],
              ].map(([label, value, setter]) => (
                <div key={label as string}>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label as string}</label>
                  <input type="number" min={0} value={value as number} onChange={(e) => (setter as (v: number) => void)(Number(e.target.value))} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
                </div>
              ))}
            </div>
            <div className="mt-4">
              <select value={collarType} onChange={(e) => setCollarType(e.target.value as "none" | "polo" | "mandarin")} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50">
                <option value="none">ບໍ່ບວກຄໍ</option>
                <option value="polo">ໂປໂລ</option>
                <option value="mandarin">ຈີນ</option>
              </select>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 text-sm font-black uppercase tracking-wider text-slate-700">ການເງິນ ແລະ ສະລິບ</div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ບວກເພີ່ມ (ງານດ່ວນ, ອື່ນໆ)</label>
                <input type="number" min={0} value={extraCharge} onChange={(e) => setExtraCharge(Number(e.target.value))} disabled={!canEdit} placeholder="0" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຫັກຄ່າແບບ-ສ່ວນຫຼຸດ</label>
                <input type="number" min={0} value={designDeposit} onChange={(e) => setDesignDeposit(Number(e.target.value))} disabled={!canEdit} placeholder="0" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ມັດຈຳສັ່ງຜະລິດຈາກລູກ</label>
                <input type="number" min={0} value={initialDeposit} onChange={(e) => setInitialDeposit(Number(e.target.value))} disabled={!canEdit} placeholder="0" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ວັນທີມັດຈຳສັ່ງຜະລິດ</label>
                <input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຕົ້ນທຶນໂຮງງານ</label>
                <input type="number" min={0} value={factoryCost} onChange={(e) => setFactoryCost(Number(e.target.value))} disabled={!canEdit} placeholder="0" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ສະລິບໂອນເງິນ</label>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
                  <div className="text-sm font-medium text-slate-600">ສາມາດເພີ່ມໄດ້ຫຼາຍສະລິບ</div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm">
                    <FileUp size={16} />
                    <span>ເພີ່ມສະລິບ</span>
                    <input type="file" accept="image/*,.pdf" multiple onChange={handleSlipChange} disabled={!canEdit} className="hidden" />
                  </label>
                </div>
                <div className="mt-3 space-y-2">
                  {pendingSlipFiles.map((file) => (
                    <div key={`pending-${file.name}-${file.size}`} className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                      <span>{file.name}</span>
                      <button type="button" onClick={() => removePendingSlip(file.name)} className="text-xs font-black text-rose-700">
                        ລົບ
                      </button>
                    </div>
                  ))}
                  {slipRows.map((slip) => (
                    <div key={slip.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                      <span>{slip.file_name || slip.file_path.split("/").pop()}</span>
                      {slip.file_url ? (
                        <Link href={slip.file_url} target="_blank" className="inline-flex items-center gap-2 text-xs font-bold text-sky-700">
                          <Eye size={14} />
                          ເບິ່ງ
                        </Link>
                      ) : null}
                    </div>
                  ))}
                  {pendingSlipFiles.length === 0 && slipRows.length === 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-400">
                      ຍັງບໍ່ມີສະລິບ
                    </div>
                  )}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ເງື່ອນໄຂການຊຳລະ</label>
                <textarea value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} disabled={!canEdit} rows={2} placeholder="ເຊັ່ນ ຈ່າຍຍອດທີ່ເຫຼືອໃນວັນຮັບງານ" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ໝາຍເຫດມັດຈຳສົ່ງຜະລິດ</label>
                <textarea value={factoryDepositNote} onChange={(e) => setFactoryDepositNote(e.target.value)} disabled={!canEdit} rows={2} placeholder="ເຊັ່ນ ໂອນເງິນມັດຈຳຮອບທຳອິດແລ້ວ" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ໝາຍເຫດເພີ່ມເຕີມ</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} rows={2} placeholder="ຂໍ້ມູນເພີ່ມເຕີມອື່ນໆ" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ໝາຍເຫດເຕືອນ</label>
                <textarea value={warningNote} onChange={(e) => setWarningNote(e.target.value)} disabled={!canEdit} rows={2} placeholder="ຂໍ້ຄວນລະວັງ ຫຼື ຈຸດທີ່ຕ້ອງເນັ້ນ" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 text-sm font-black uppercase tracking-wider text-slate-700">ສະຫຼຸບອໍເດີ</div>
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ລູກຄ້າ</div>
                <div className="mt-2 text-lg font-black text-slate-900">{customerName || "-"}</div>
                <div className="mt-1 text-sm font-medium text-slate-500">{customerPhone || "-"}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ລາຍການຜະລິດ</div>
                <div className="mt-2 text-sm font-bold text-slate-700">{selectedFabric?.name || "-"}</div>
                <div className="mt-2 text-xs font-medium text-slate-500">
                  ແຂນສັ້ນ {shortQty} / ແຂນຍາວ {longQty} / ແຖມ {freeQty}
                </div>
                <div className="mt-1 text-xs font-medium text-slate-500">
                  3XL {qty3XL} / 4XL {qty4XL} / 5XL {qty5XL} / 6XL {qty6XL}
                </div>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-sky-700">ຍອດລວມສຸດທິ</div>
                <div className="mt-2 text-2xl font-black text-sky-900">{formatMoney(netTotal)}</div>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">ມັດຈຳສັ່ງຜະລິດຈາກລູກຄ້າ</div>
                <div className="mt-2 text-2xl font-black text-emerald-900">{formatMoney(initialDeposit)}</div>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-rose-700">ຍອດຄ້າງ</div>
                <div className="mt-2 text-2xl font-black text-rose-900">{formatMoney(balance)}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
