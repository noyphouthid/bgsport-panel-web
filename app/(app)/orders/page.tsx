"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, MessageCircleMore } from "lucide-react";
import { isMissingOrderItemsTableError, type OrderItemRow } from "@/lib/order-items";
import { extractProductionMockupUrls, isImageFileName, ORDER_MEDIA_BUCKET, toDisplayMediaUrl } from "@/lib/order-media";
import { getQuotationDraftById, type QuotationDraft } from "@/lib/quotation-drafts";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import { OrderPreviewModal } from "../_components/order-preview-modal";
import { WhatsappMessageModal } from "../_components/whatsapp-message-modal";
import { buildProductionCompletedWhatsappMessage, getWhatsappContactOptions } from "@/lib/whatsapp";

type StatusFilter = "all" | "in_progress" | "completed" | "producing" | "production_completed" | "shipment_completed";
type FactoryBillFilter = "all" | "has_code" | "no_code";

type OrderRow = {
  id: string;
  order_code: string;
  order_date: string;
  customer_phone: string | null;
  customer_whatsapp: string | null;
  factory_bill_code: string | null;
  order_image_url: string | null;
  fabric_name: string;
  net_total: number;
  design_deposit: number;
  initial_deposit: number;
  balance: number;
  factory_cost: number;
  status: "in_progress" | "completed";
  production_completed_at: string | null;
  shipment_status: "pending" | "shipped";
  shipment_completed_at: string | null;
  closed_at: string | null;
  updated_at: string;
  short_qty: number;
  long_qty: number;
  free_qty: number;
  qty_3xl: number;
  qty_4xl: number;
  qty_5xl: number;
  admin_user_id: string | null;
};

type UserOption = {
  id: string;
  full_name: string;
  role: AppRole;
  auth_user_id: string | null;
};

type PreviewGalleryImage = {
  url: string;
  label: string;
};

function getDisplayShirtTotal(row: Pick<OrderRow, "short_qty" | "long_qty" | "free_qty">) {
  return (Number(row.short_qty) || 0) + (Number(row.long_qty) || 0) + (Number(row.free_qty) || 0);
}

export default function OrdersPage() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [pantsQtyByOrder, setPantsQtyByOrder] = useState<Record<string, number>>({});
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [activeWhatsappOrder, setActiveWhatsappOrder] = useState<OrderRow | null>(null);
  const [activePreviewOrder, setActivePreviewOrder] = useState<OrderRow | null>(null);
  const [previewGalleryImages, setPreviewGalleryImages] = useState<PreviewGalleryImage[]>([]);
  const [previewQuotationDraft, setPreviewQuotationDraft] = useState<QuotationDraft | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [adminOptions, setAdminOptions] = useState<UserOption[]>([]);

  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [factoryBillFilter, setFactoryBillFilter] = useState<FactoryBillFilter>("all");
  const [adminFilter, setAdminFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = async () => {
    setLoading(true);
    setErr(null);

    let q = supabase
      .from("orders")
      .select(
        "id,order_code,order_date,customer_phone,customer_whatsapp,factory_bill_code,order_image_url,fabric_name,net_total,design_deposit,initial_deposit,balance,factory_cost,status,production_completed_at,shipment_status,shipment_completed_at,closed_at,updated_at,short_qty,long_qty,free_qty,qty_3xl,qty_4xl,qty_5xl,admin_user_id",
        { count: "exact" }
      )
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (fromDate) q = q.gte("order_date", fromDate);
    if (toDate) q = q.lte("order_date", toDate);
    if (adminFilter !== "all") q = q.eq("admin_user_id", adminFilter);

    const s = query.trim();
    if (s) {
      const escaped = s.replace(/%/g, "\\%").replace(/_/g, "\\_");
      q = q.or(
        `order_code.ilike.%${escaped}%,factory_bill_code.ilike.%${escaped}%,customer_phone.ilike.%${escaped}%,customer_whatsapp.ilike.%${escaped}%`
      );
    }

    const { data, error } = await q;
    if (error) {
      setErr(error.message);
      setRows([]);
      setPantsQtyByOrder({});
      setFilteredTotal(0);
    } else {
      const filteredRows = ((data ?? []) as OrderRow[]).filter((row) => {
        const hasFactoryBillCode = Boolean(row.factory_bill_code?.trim());
        if (factoryBillFilter === "has_code" && !hasFactoryBillCode) return false;
        if (factoryBillFilter === "no_code" && hasFactoryBillCode) return false;
        if (status === "all") return true;
        const isClosed = row.status === "completed" || Boolean(row.closed_at);
        const isShipmentCompleted = !isClosed && (row.shipment_status === "shipped" || Boolean(row.shipment_completed_at));
        const isProductionCompleted = !isClosed && !isShipmentCompleted && Boolean(row.production_completed_at);
        const isProducing = !isClosed && !isShipmentCompleted && !row.production_completed_at;
        if (status === "shipment_completed") return isShipmentCompleted;
        if (status === "completed") return isClosed;
        if (status === "production_completed") return isProductionCompleted;
        if (status === "in_progress") return isProducing;
        return isProducing;
      });
      const from = (page - 1) * pageSize;
      const to = from + pageSize;
      const pageRows = filteredRows.slice(from, to);
      setFilteredTotal(filteredRows.length);
      setRows(pageRows);

      const orderIds = pageRows.map((row) => row.id);
      if (orderIds.length === 0) {
        setPantsQtyByOrder({});
      } else {
        const { data: itemData, error: itemError } = await supabase
          .from("order_items")
          .select("order_id,product_type,qty,free_qty")
          .in("order_id", orderIds)
          .eq("product_type", "pants_printed");

        if (itemError) {
          if (!isMissingOrderItemsTableError(itemError)) {
            setErr(itemError.message);
          }
          setPantsQtyByOrder({});
        } else {
          const totals = ((itemData ?? []) as Pick<OrderItemRow, "order_id" | "product_type" | "qty" | "free_qty">[]).reduce<Record<string, number>>(
            (acc, item) => {
              acc[item.order_id] = (acc[item.order_id] || 0) + (Number(item.qty) || 0) + (Number(item.free_qty) || 0);
              return acc;
            },
            {}
          );
          setPantsQtyByOrder(totals);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    const loadViewerRole = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user.id;
      if (!authUserId) return;
      const { data } = await supabase
        .from("users")
        .select("id,full_name,role,auth_user_id")
        .eq("is_active", true)
        .in("role", ["superadmin", "admin", "manager", "staff"]);

      const users = (data ?? []) as UserOption[];
      setAdminOptions(users);
      const currentUser = users.find((item) => item.auth_user_id === authUserId) || null;
      if (currentUser?.role) setViewerRole(currentUser.role);
    };
    void loadViewerRole();
  }, []);

  const isAdminLimited = viewerRole === "admin";
  const canViewOrderPreview = viewerRole === "superadmin" || viewerRole === "admin" || viewerRole === "staff";

  const allSelectedOnPage = useMemo(() => {
    if (rows.length === 0) return false;
    return rows.every((r) => selectedIds.includes(r.id));
  }, [rows, selectedIds]);
  const hasNextPage = page * pageSize < filteredTotal;

  const runSearch = () => {
    setPage(1);
    load();
  };

  const resetAll = () => {
    setFromDate("");
    setToDate("");
    setStatus("all");
    setFactoryBillFilter("all");
    setAdminFilter("all");
    setQuery("");
    setPage(1);
    setTimeout(load, 0);
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllOnPage = () => {
    const pageIds = rows.map((r) => r.id);
    setSelectedIds((prev) => {
      if (pageIds.every((id) => prev.includes(id))) {
        return prev.filter((id) => !pageIds.includes(id));
      }
      return [...new Set([...prev, ...pageIds])];
    });
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const ok = confirm(`ຢືນຢັນລົບ ${selectedIds.length} ອໍເດີ?`);
    if (!ok) return;

    setDeleting(true);
    setErr(null);
    const { error } = await supabase.from("orders").delete().in("id", selectedIds);
    setDeleting(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSelectedIds([]);
    await load();
  };

  const markCompleted = async (id: string) => {
    setErr(null);
    const ok = confirm("ຢືນຢັນປິດງານ? (Completed)\n* ຕ້ອງໃຫ້ຍອດຄ້າງ = 0 ກ່ອນ");
    if (!ok) return;

    const { error } = await supabase
      .from("orders")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      setErr(error.message);
      return;
    }
    await load();
  };

  const markSelectedCompleted = async () => {
    if (selectedIds.length === 0) return;
    setErr(null);
    const ok = confirm(`ຢືນຢັນປິດງານ ${selectedIds.length} ອໍເດີ?\n* ຕ້ອງໃຫ້ຍອດຄ້າງ = 0 ກ່ອນ`);
    if (!ok) return;

    setCompleting(true);
    const { error } = await supabase
      .from("orders")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .in("id", selectedIds)
      .neq("status", "completed");
    setCompleting(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setSelectedIds([]);
    await load();
  };

  const statusBadge = (s: OrderRow["status"]) =>
    s === "completed" ? (
      <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
        ສຳເລັດແລ້ວ
      </span>
    ) : (
      <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">
        ກຳລັງຜະລິດ
      </span>
    );

  const displayStatusBadge = (row: OrderRow) => {
    if (row.status === "completed" || row.closed_at) {
      return statusBadge("completed");
    }
    if (row.shipment_status === "shipped" || row.shipment_completed_at) {
      return <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200">ຈັດສົ່ງສຳເລັດ</span>;
    }
    if (row.production_completed_at) {
      return <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200">ຜະລິດສຳເລັດ</span>;
    }
    return <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">ກຳລັງຜະລິດ</span>;
  };

  const activeWhatsappOptions = activeWhatsappOrder
    ? getWhatsappContactOptions(activeWhatsappOrder.customer_phone, activeWhatsappOrder.customer_whatsapp)
    : [];

  const activeWhatsappMessage = activeWhatsappOrder
    ? buildProductionCompletedWhatsappMessage({
        orderCode: activeWhatsappOrder.order_code,
        totalQty:
          getDisplayShirtTotal(activeWhatsappOrder) +
          (Number(activeWhatsappOrder.qty_3xl) || 0) +
          (Number(activeWhatsappOrder.qty_4xl) || 0) +
          (Number(activeWhatsappOrder.qty_5xl) || 0),
        balance: Number(activeWhatsappOrder.balance) || 0,
      })
    : "";

  const handleOpenPreview = async (row: OrderRow) => {
    setActivePreviewOrder(row);
    setPreviewGalleryImages([]);
    setPreviewQuotationDraft(null);
    setPreviewError(null);
    setPreviewLoading(true);

    try {
      const imageFolderPath = `order-image/${row.order_code}`;
      const fallbackOrderImageUrl = toDisplayMediaUrl(row.order_image_url) || null;

      const [{ data: imageEntries, error: imageListError }, { data: depositData, error: depositError }] = await Promise.all([
        supabase.storage.from(ORDER_MEDIA_BUCKET).list(imageFolderPath, { limit: 100 }),
        supabase
          .from("factory_deposit_orders")
          .select("quotation_draft_id,production_items")
          .eq("order_id", row.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (depositError) throw depositError;

      const orderImages: PreviewGalleryImage[] = imageListError
        ? fallbackOrderImageUrl
          ? [{ url: fallbackOrderImageUrl, label: "ຮູບອໍເດີ #1" }]
          : []
        : ((imageEntries ?? [])
            .filter((entry) => isImageFileName(entry.name))
            .sort((left, right) => {
              const leftTime = Date.parse(left.created_at || left.updated_at || "");
              const rightTime = Date.parse(right.created_at || right.updated_at || "");
              return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
            })
            .map((entry, index) => ({
              url: supabase.storage.from(ORDER_MEDIA_BUCKET).getPublicUrl(`${imageFolderPath}/${entry.name}`).data.publicUrl,
              label: `ຮູບອໍເດີ #${index + 1}`,
            })) as PreviewGalleryImage[]);

      if (!imageListError && orderImages.length === 0 && fallbackOrderImageUrl) {
        orderImages.push({ url: fallbackOrderImageUrl, label: "ຮູບອໍເດີ #1" });
      }

      const productionImages = extractProductionMockupUrls((depositData as { production_items?: unknown } | null)?.production_items).map((url, index) => ({
        url,
        label: `ຮູບແບບຜະລິດ #${index + 1}`,
      }));

      const mergedImages = Array.from(
        new Map([...orderImages, ...productionImages].filter((item) => Boolean(item.url)).map((item) => [item.url, item])).values()
      );
      setPreviewGalleryImages(mergedImages);

      const quotationDraftId = (depositData as { quotation_draft_id?: string | null } | null)?.quotation_draft_id;
      if (quotationDraftId?.trim()) {
        const draft = await getQuotationDraftById(quotationDraftId);
        setPreviewQuotationDraft(draft);
      }
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "ໂຫຼດ preview ບໍ່ສຳເລັດ");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="text-slate-900 antialiased">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">ອໍເດີ</h1>
        {!isAdminLimited ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/factory-production-status"
              className="bg-violet-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-violet-700 shadow-md transition-all active:scale-95"
            >
              ສະຖານະໂຮງງານ
            </Link>
            <Link
              href="/quotations/new"
              className="bg-sky-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-sky-700 shadow-md transition-all active:scale-95"
            >
              + ເພີ່ມໃບປະເມີນລາຄາ
            </Link>
            <Link
              href="/orders/new"
              className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-md transition-all active:scale-95"
            >
              + ເພີ່ມອໍເດີ
            </Link>
          </div>
        ) : null}
      </div>

      {err && (
        <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-sm font-medium">
          ຂໍ້ຜິດພາດ: {err}
        </div>
      )}

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4 items-end">
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ຈາກວັນທີ</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ຫາວັນທີ</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ສະຖານະ</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
            >
              <option value="all">ທັງໝົດ</option>
              <option value="in_progress">ກຳລັງຜະລິດ</option>
              <option value="production_completed">ຜະລິດສຳເລັດ</option>
              <option value="shipment_completed">ຈັດສົ່ງສຳເລັດ</option>
              <option value="completed">ສຳເລັດແລ້ວ</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ອໍເດີແອັດມິນ</label>
            <select
              value={adminFilter}
              onChange={(e) => setAdminFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
            >
              <option value="all">ທັງໝົດ</option>
              {adminOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ລະຫັດບິນໂຮງງານ</label>
            <select
              value={factoryBillFilter}
              onChange={(e) => setFactoryBillFilter(e.target.value as FactoryBillFilter)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
            >
              <option value="all">ທັງໝົດ</option>
              <option value="has_code">ມີລະຫັດບິນໂຮງງານ</option>
              <option value="no_code">ຍັງບໍ່ມີລະຫັດບິນໂຮງງານ</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ຄົ້ນຫາ</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ລະຫັດ / ບິນ / ເບີໂທ"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder-slate-300"
            />
          </div>
          <div className="flex gap-2 md:col-span-7 mt-2">
            <button
              onClick={runSearch}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
            >
              ຄົ້ນຫາ
            </button>
            <button
              onClick={resetAll}
              className="bg-slate-100 text-slate-600 px-6 py-2 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors border border-slate-200"
            >
              ລ້າງ
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 flex items-center justify-between border-b border-slate-50 bg-slate-50/50">
          <div className="text-sm font-bold text-slate-700 uppercase tracking-widest">ລາຍການອໍເດີທັງໝົດ</div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-500 font-bold">{loading ? "ກຳລັງໂຫຼດ..." : `ສະແດງ ${rows.length} / ${filteredTotal} ລາຍການ`}</div>
            {!isAdminLimited ? (
              <>
                <button
                  onClick={markSelectedCompleted}
                  disabled={completing || deleting || selectedIds.length === 0}
                  className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {completing ? "ກຳລັງປິດງານ..." : `ປິດງານທັງໝົດ (${selectedIds.length})`}
                </button>
                <button
                  onClick={deleteSelected}
                  disabled={deleting || completing || selectedIds.length === 0}
                  className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-700 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "ກຳລັງລົບ..." : `ລົບທີ່ເລືອກ (${selectedIds.length})`}
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-slate-700 border-b border-slate-100">
                <th className="p-4 text-center font-bold uppercase text-[14px] tracking-widest">
                  {!isAdminLimited ? <input type="checkbox" checked={allSelectedOnPage} onChange={toggleSelectAllOnPage} aria-label="select all on page" /> : null}
                </th>
                <th className="p-4 text-left font-bold uppercase text-[14px] tracking-widest">ວັນທີ</th>
                <th className="p-4 text-left font-bold uppercase text-[14px] tracking-widest">ລະຫັດອໍເດີ</th>
                <th className="p-4 text-left font-bold uppercase text-[14px] tracking-widest">ບິນໂຮງງານ</th>
                <th className="p-4 text-left font-bold uppercase text-[14px] tracking-widest">ເບີໂທ / WhatsApp</th>
                <th className="p-4 text-left font-bold uppercase text-[14px] tracking-widest">ຜ້າ</th>
                <th className="p-4 text-right font-bold uppercase text-[14px] tracking-widest">ຈຳນວນເສື້ອ</th>
                <th className="p-4 text-right font-bold uppercase text-[14px] tracking-widest">ຈຳນວນໂສ້ງ</th>
                <th className="p-4 text-right font-bold uppercase text-[14px] tracking-widest">ຍອດສຸດທິ</th>
                <th className="p-4 text-right font-bold uppercase text-[14px] tracking-widest">ຄ້າງ</th>
                <th className="p-4 text-right font-bold uppercase text-[14px] tracking-widest">ຕົ້ນທຶນໂຮງງານ</th>
                <th className="p-4 text-center font-bold uppercase text-[14px] tracking-widest">ສະຖານະ</th>
                <th className="p-4 text-center font-bold uppercase text-[14px] tracking-widest">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="p-10 text-slate-400 text-center font-medium" colSpan={13}>
                    ບໍ່ພົບຂໍ້ມູນໃນລະບົບ
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="p-4 text-center">
                      {!isAdminLimited ? <input
                        type="checkbox"
                        checked={selectedIds.includes(r.id)}
                        onChange={() => toggleSelectRow(r.id)}
                        aria-label={`select ${r.order_code}`}
                      /> : null}
                    </td>
                    <td className="p-4 text-slate-600 font-medium">{r.order_date}</td>
                    <td className="p-4 font-bold text-slate-600">{r.order_code}</td>
                    <td className="p-4 text-slate-500">{r.factory_bill_code?.trim() ? r.factory_bill_code : "-"}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-700">
                          {r.customer_phone?.trim() ? r.customer_phone : r.customer_whatsapp?.trim() ? r.customer_whatsapp : "-"}
                        </span>
                        {getWhatsappContactOptions(r.customer_phone, r.customer_whatsapp).length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setActiveWhatsappOrder(r)}
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                          >
                            <MessageCircleMore size={14} />
                            ເປີດແຊັດ
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">ບໍ່ມີເບີ</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-slate-600 font-medium">{r.fabric_name}</td>
                    <td className="p-4 text-right font-bold text-slate-700">{getDisplayShirtTotal(r).toLocaleString()}</td>
                    <td className="p-4 text-right font-bold text-indigo-700">
                      {pantsQtyByOrder[r.id] > 0 ? pantsQtyByOrder[r.id].toLocaleString() : "-"}
                    </td>
                    <td className="p-4 text-right font-bold text-slate-600">{r.net_total.toLocaleString()}</td>
                    <td className="p-4 text-right font-bold text-rose-600 bg-rose-50/30">{r.balance.toLocaleString()}</td>
                    <td className="p-4 text-right font-bold text-slate-700">{r.factory_cost.toLocaleString()}</td>
                    <td className="p-4 text-center">{displayStatusBadge(r)}</td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-4">
                        {canViewOrderPreview ? (
                          <button
                            type="button"
                            onClick={() => void handleOpenPreview(r)}
                            className="inline-flex items-center gap-1 text-slate-600 font-bold transition hover:text-slate-900"
                          >
                            <Eye size={15} />
                            ເບິ່ງ
                          </button>
                        ) : null}
                        <Link href={`/orders/${r.id}/edit`} className="text-blue-600 font-bold hover:text-blue-800 underline-offset-4 hover:underline transition-all">
                          ແກ້ໄຂ
                        </Link>
                        {!isAdminLimited && r.status !== "completed" && (
                          <button
                            onClick={() => markCompleted(r.id)}
                            className="text-emerald-600 font-bold hover:text-emerald-800 transition-all active:scale-90"
                          >
                            ປິດງານ
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 flex items-center justify-between border-t border-slate-100 bg-slate-50/30">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-tighter">ໜ້າທີ: {page}</div>
          <div className="flex gap-2">
            <button
              className="bg-white border border-slate-200 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 disabled:opacity-40 transition-all shadow-sm text-slate-600"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← ກ່ອນໜ້າ
            </button>
            <button
              className="bg-white border border-slate-200 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all shadow-sm text-slate-600"
              disabled={!hasNextPage}
              onClick={() => setPage((p) => p + 1)}
            >
              ຖັດໄປ →
            </button>
          </div>
        </div>
      </div>

      <WhatsappMessageModal
        key={activeWhatsappOrder ? `whatsapp-${activeWhatsappOrder.id}-${activeWhatsappOrder.balance}` : "whatsapp-closed"}
        open={Boolean(activeWhatsappOrder)}
        title={activeWhatsappOrder ? `ແຈ້ງລູກຄ້າອໍເດີ ${activeWhatsappOrder.order_code}` : undefined}
        message={activeWhatsappMessage}
        phoneOptions={activeWhatsappOptions}
        initialPhone={activeWhatsappOptions[0]?.value}
        onClose={() => setActiveWhatsappOrder(null)}
      />

      <OrderPreviewModal
        key={activePreviewOrder ? `preview-${activePreviewOrder.id}` : "preview-closed"}
        open={Boolean(activePreviewOrder) && canViewOrderPreview}
        loading={previewLoading}
        error={previewError}
        order={activePreviewOrder}
        galleryImages={previewGalleryImages}
        quotationDraft={previewQuotationDraft}
        shirtQty={activePreviewOrder ? getDisplayShirtTotal(activePreviewOrder) : 0}
        pantsQty={activePreviewOrder ? Number(pantsQtyByOrder[activePreviewOrder.id] || 0) : 0}
        statusBadge={activePreviewOrder ? displayStatusBadge(activePreviewOrder) : null}
        onClose={() => {
          setActivePreviewOrder(null);
          setPreviewGalleryImages([]);
          setPreviewQuotationDraft(null);
          setPreviewError(null);
          setPreviewLoading(false);
        }}
      />
    </div>
  );
}
