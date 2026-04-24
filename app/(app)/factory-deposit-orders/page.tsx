"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Swal from "sweetalert2";
import { ExternalLink, Eye, FileImage, FilePlus2, FileText, PencilLine, RefreshCw, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import {
  canApproveFactoryDepositOrder,
  canConvertFactoryDepositOrder,
  canDeleteFactoryDepositOrder,
  canManageAllFactoryDepositOrders,
  FACTORY_DEPOSIT_ORDER_STATUS_LABELS,
  FACTORY_DEPOSIT_ORDER_STATUS_STYLES,
  type FactoryDepositOrderStatus,
} from "@/lib/factory-deposit-orders";

type DepositRow = {
  id: string;
  deposit_no: string;
  deposit_date: string;
  order_code: string | null;
  order_date: string | null;
  quotation_quote_no: string | null;
  status: FactoryDepositOrderStatus;
  customer_name: string;
  customer_phone: string;
  customer_whatsapp?: string;
  fabric_name: string;
  short_qty: number;
  long_qty: number;
  free_qty: number;
  qty_3xl: number;
  qty_4xl: number;
  qty_5xl: number;
  qty_6xl: number;
  factory_bill_code: string | null;
  admin_user_id: string | null;
  graphic_user_id: string | null;
  fabric_id: string | null;
  fabric_short_price: number;
  fabric_long_price: number;
  extra_charge: number;
  design_deposit: number;
  initial_deposit: number;
  factory_cost: number;
  gross_total: number;
  net_total: number;
  balance: number;
  order_id: string | null;
  created_by_user_id: string | null;
  team_name?: string | null;
  production_sent_date?: string | null;
  delivery_date?: string | null;
  production_priority?: "normal" | "urgent" | null;
  urgent_due_date?: string | null;
  production_items?: unknown;
  transfer_slip_url?: string | null;
  transfer_slip_path?: string | null;
};

type UserRow = {
  id: string;
  auth_user_id: string | null;
  role: AppRole;
};

type DepositSlipRow = {
  id: string;
  deposit_order_id: string;
  file_name: string;
  file_path: string;
  file_url: string | null;
  note: string | null;
  uploaded_at: string;
};

type ProductionPlayerMode = "none" | "name_only" | "number_only" | "name_and_number";
type ProductionSleeveType = "short" | "long" | "mixed";
type ProductionCollarType = "crew" | "polo" | "mandarin" | "v_cut_polo" | "v_neck" | "cross_v" | "cut_v" | "pentagon";
type ProductionSizeKey = "xs" | "jxs" | "js" | "jm" | "jl" | "jxl" | "j2xl" | "s" | "m" | "l" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl";

type ProductionPlayerRow = {
  id: string;
  size: ProductionSizeKey | "";
  player_name: string;
  jersey_number: string;
  note: string;
};

type ProductionPreviewItem = {
  client_id: string;
  sleeve_type: ProductionSleeveType;
  collar_type: ProductionCollarType;
  mockup_url: string | null;
  sizes: Record<ProductionSizeKey, number>;
  player_mode: ProductionPlayerMode;
  player_rows: ProductionPlayerRow[];
};

const PRODUCTION_SLEEVE_OPTIONS: Array<{ value: ProductionSleeveType; label: string }> = [
  { value: "short", label: "ແຂນສັ້ນ" },
  { value: "long", label: "ແຂນຍາວ" },
  { value: "mixed", label: "ແຂນສັ້ນ/ແຂນຍາວ" },
];

const PRODUCTION_COLLAR_OPTIONS: Array<{ value: ProductionCollarType; label: string }> = [
  { value: "crew", label: "ຄໍມົນ" },
  { value: "polo", label: "ໂປໂລ" },
  { value: "mandarin", label: "ຄໍຈີນ" },
  { value: "v_cut_polo", label: "ຄໍໂປໂລວີຕັດ" },
  { value: "v_neck", label: "ຄໍວີ" },
  { value: "cross_v", label: "ຄໍວີໄຂວ່" },
  { value: "cut_v", label: "ຄໍວີຕັດ" },
  { value: "pentagon", label: "ຄໍ 5 ຫຼ່ຽມ" },
];

const PRODUCTION_SIZE_FIELDS: Array<{ key: ProductionSizeKey; label: string }> = [
  { key: "xs", label: "XS" },
  { key: "jxs", label: "JXS" },
  { key: "js", label: "JS" },
  { key: "jm", label: "JM" },
  { key: "jl", label: "JL" },
  { key: "jxl", label: "JXL" },
  { key: "j2xl", label: "J2XL" },
  { key: "s", label: "S" },
  { key: "m", label: "M" },
  { key: "l", label: "L" },
  { key: "xl", label: "XL" },
  { key: "2xl", label: "2XL" },
  { key: "3xl", label: "3XL" },
  { key: "4xl", label: "4XL" },
  { key: "5xl", label: "5XL" },
  { key: "6xl", label: "6XL" },
];

function toPositiveInt(value: unknown) {
  return Math.max(0, Number(value) || 0);
}

function parseProductionPreviewItems(raw: unknown): ProductionPreviewItem[] {
  if (!Array.isArray(raw)) return [] as ProductionPreviewItem[];
  return raw.slice(0, 4).map((entry, index) => {
    const row = typeof entry === "object" && entry ? (entry as Record<string, unknown>) : {};
    const nestedSizes = typeof row.sizes === "object" && row.sizes ? (row.sizes as Record<string, unknown>) : {};
    const nestedPlayers = Array.isArray(row.player_rows) ? row.player_rows : [];
    return {
      client_id: typeof row.client_id === "string" ? row.client_id : `item-${index}`,
      sleeve_type:
        row.sleeve_type === "long" || row.sleeve_type === "mixed" || row.sleeve_type === "short"
          ? (row.sleeve_type as ProductionSleeveType)
          : "short",
      collar_type:
        typeof row.collar_type === "string" && PRODUCTION_COLLAR_OPTIONS.some((option) => option.value === row.collar_type)
          ? (row.collar_type as ProductionCollarType)
          : "crew",
      mockup_url: typeof row.mockup_url === "string" ? row.mockup_url : null,
      player_mode:
        row.player_mode === "name_only" ||
        row.player_mode === "number_only" ||
        row.player_mode === "name_and_number" ||
        row.player_mode === "none"
          ? (row.player_mode as ProductionPlayerMode)
          : "none",
      player_rows: nestedPlayers.map((player, playerIndex): ProductionPlayerRow => {
        const playerRow = typeof player === "object" && player ? (player as Record<string, unknown>) : {};
        const sizeValue = typeof playerRow.size === "string" ? playerRow.size : "";
        const parsedSize: ProductionPlayerRow["size"] = PRODUCTION_SIZE_FIELDS.some((field) => field.key === sizeValue)
          ? (sizeValue as ProductionSizeKey)
          : "";
        return {
          id: typeof playerRow.id === "string" ? playerRow.id : `player-${index}-${playerIndex}`,
          size: parsedSize,
          player_name: typeof playerRow.player_name === "string" ? playerRow.player_name : "",
          jersey_number: typeof playerRow.jersey_number === "string" ? playerRow.jersey_number : "",
          note: typeof playerRow.note === "string" ? playerRow.note : "",
        };
      }),
      sizes: {
        xs: toPositiveInt(nestedSizes.xs),
        jxs: toPositiveInt(nestedSizes.jxs),
        js: toPositiveInt(nestedSizes.js),
        jm: toPositiveInt(nestedSizes.jm),
        jl: toPositiveInt(nestedSizes.jl),
        jxl: toPositiveInt(nestedSizes.jxl),
        j2xl: toPositiveInt(nestedSizes.j2xl),
        s: toPositiveInt(nestedSizes.s),
        m: toPositiveInt(nestedSizes.m),
        l: toPositiveInt(nestedSizes.l),
        xl: toPositiveInt(nestedSizes.xl),
        "2xl": toPositiveInt(nestedSizes["2xl"]),
        "3xl": toPositiveInt(nestedSizes["3xl"]),
        "4xl": toPositiveInt(nestedSizes["4xl"]),
        "5xl": toPositiveInt(nestedSizes["5xl"]),
        "6xl": toPositiveInt(nestedSizes["6xl"]),
      },
    };
  });
}

function getFilledPlayerRows(item: ProductionPreviewItem) {
  return item.player_rows.filter((row) => row.size || row.player_name.trim() || row.jersey_number.trim() || row.note.trim());
}

function playerModeNeedsName(mode: ProductionPlayerMode) {
  return mode === "name_only" || mode === "name_and_number";
}

function playerModeNeedsNumber(mode: ProductionPlayerMode) {
  return mode === "number_only" || mode === "name_and_number";
}

function getPlayerModePreviewTitle(mode: ProductionPlayerMode) {
  if (mode === "name_only") return "NAME LIST";
  if (mode === "number_only") return "NO. LIST";
  return "PLAYER / NO.";
}

function isImageFileName(name: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(name || ""));
}

function getPrimaryDocumentCode(row: Pick<DepositRow, "quotation_quote_no" | "order_code" | "deposit_no">) {
  return row.quotation_quote_no?.trim() || row.order_code?.trim() || row.deposit_no.trim();
}

function getSecondaryDocumentCode(row: Pick<DepositRow, "quotation_quote_no" | "order_code" | "deposit_no">) {
  const primary = getPrimaryDocumentCode(row);
  const candidates = [row.order_code?.trim(), row.deposit_no.trim()].filter((value): value is string => Boolean(value && value !== primary));
  return candidates.join(" / ");
}

export default function FactoryDepositOrdersPage() {
  const [rows, setRows] = useState<DepositRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FactoryDepositOrderStatus | "all">("all");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [previewRow, setPreviewRow] = useState<DepositRow | null>(null);
  const [slipPreviewRow, setSlipPreviewRow] = useState<DepositRow | null>(null);
  const [slipPreviewRows, setSlipPreviewRows] = useState<DepositSlipRow[]>([]);
  const [slipPreviewLoading, setSlipPreviewLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [{ data: depositData, error: depositError }, { data: usersData, error: usersError }, { data: sessionData }] =
        await Promise.all([
          supabase.from("factory_deposit_orders").select("*").order("deposit_date", { ascending: false }).order("created_at", { ascending: false }),
          supabase.from("users").select("id,auth_user_id,role").eq("is_active", true),
          supabase.auth.getSession(),
        ]);

      if (depositError) throw depositError;
      if (usersError) throw usersError;

      setRows((depositData ?? []) as DepositRow[]);
      const authUserId = sessionData.session?.user.id ?? null;
      const currentUser = ((usersData ?? []) as UserRow[]).find((item) => item.auth_user_id === authUserId) || null;
      setViewerRole(currentUser?.role ?? null);
      setViewerUserId(currentUser?.id ?? null);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "ໂຫຼດລາຍການບໍ່ສຳເລັດ");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!canManageAllFactoryDepositOrders(viewerRole) && row.created_by_user_id !== viewerUserId) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!keyword) return true;
      return [row.deposit_no, row.order_code || "", row.quotation_quote_no || "", row.customer_name || "", row.factory_bill_code || ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [query, rows, statusFilter, viewerRole, viewerUserId]);

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc.amount += Number(row.net_total) || 0;
        if (row.status === "submitted") acc.submitted += 1;
        if (row.status === "approved") acc.approved += 1;
        if (row.status === "converted") acc.converted += 1;
        return acc;
      },
      { total: 0, amount: 0, submitted: 0, approved: 0, converted: 0 }
    );
  }, [filteredRows]);

  const previewItems = useMemo(() => parseProductionPreviewItems(previewRow?.production_items), [previewRow]);
  const previewTotalProductionQty = useMemo(
    () => previewItems.reduce((sum, item) => sum + PRODUCTION_SIZE_FIELDS.reduce((itemSum, field) => itemSum + (Number(item.sizes[field.key]) || 0), 0), 0),
    [previewItems]
  );
  const previewPriorityText =
    previewRow?.production_priority === "urgent"
      ? `ຕ້ອງການເຄື່ອງດ່ວນ! ກຳນົດສົ່ງບໍ່ເກີນວັນທີ ${previewRow.urgent_due_date || "../../...."}`
      : "ງານປົກກະຕິ";

  const insertHistory = async (depositOrderId: string, action: string, detail: string, fromStatus: string, toStatus: string) => {
    await supabase.from("factory_deposit_order_history").insert({
      deposit_order_id: depositOrderId,
      action,
      detail,
      from_status: fromStatus,
      to_status: toStatus,
      action_by_user_id: viewerUserId,
    });
  };

  const confirmAction = async ({
    icon = "question",
    title,
    text,
    confirmButtonText,
    cancelToast,
  }: {
    icon?: "question" | "warning";
    title: string;
    text: string;
    confirmButtonText: string;
    cancelToast: string;
  }) => {
    const result = await Swal.fire({
      icon,
      title,
      text,
      showCancelButton: true,
      confirmButtonText,
      cancelButtonText: "ຍົກເລີກ",
      reverseButtons: true,
    });

    if (!result.isConfirmed) {
      toast(cancelToast);
    }

    return result.isConfirmed;
  };

  const handleApprove = async (row: DepositRow) => {
    if (!viewerRole || !canApproveFactoryDepositOrder(viewerRole)) return toast.error("ທ່ານບໍ່ມີສິດອະນຸມັດ");
    if (row.status !== "submitted") return toast.error("ອະນຸມັດໄດ້ສະເພາະລາຍການທີ່ສົ່ງແລ້ວ");

    const confirmed = await confirmAction({
      title: "ຢືນຢັນອະນຸມັດ?",
      text: `${row.deposit_no} / ${row.order_code || "-"}`,
      confirmButtonText: "ຢືນຢັນ",
      cancelToast: "ຍົກເລີກການອະນຸມັດແລ້ວ",
    });
    if (!confirmed) return;

    setWorkingId(row.id);
    try {
      const { error } = await supabase
        .from("factory_deposit_orders")
        .update({ status: "approved", approved_at: new Date().toISOString(), approved_by_user_id: viewerUserId })
        .eq("id", row.id);
      if (error) throw error;

      await insertHistory(row.id, "approve", "approve deposit order", row.status, "approved");
      toast.success("ອະນຸມັດໃບມັດຈຳແລ້ວ");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ອະນຸມັດບໍ່ສຳເລັດ");
    } finally {
      setWorkingId(null);
    }
  };

  const handleDelete = async (row: DepositRow) => {
    if (!viewerRole || !canDeleteFactoryDepositOrder(viewerRole)) return toast.error("ທ່ານບໍ່ມີສິດລົບ");

    const confirmed = await confirmAction({
      icon: "warning",
      title: "ຢືນຢັນລົບໃບມັດຈຳ?",
      text: `${row.deposit_no} / ${row.order_code || "-"}`,
      confirmButtonText: "ລົບ",
      cancelToast: "ຍົກເລີກການລົບແລ້ວ",
    });
    if (!confirmed) return;

    setWorkingId(row.id);
    try {
      const { error } = await supabase.from("factory_deposit_orders").delete().eq("id", row.id);
      if (error) throw error;

      toast.success("ລົບໃບມັດຈຳແລ້ວ");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ລົບບໍ່ສຳເລັດ");
    } finally {
      setWorkingId(null);
    }
  };

  const handleConvert = async (row: DepositRow) => {
    if (!viewerRole || !canConvertFactoryDepositOrder(viewerRole)) return toast.error("ທ່ານບໍ່ມີສິດບັນທຶກເປັນອໍເດີ");
    if (row.status !== "approved") return toast.error("ກະລຸນາອະນຸມັດກ່ອນ");
    if (row.order_id) return toast.error("ລາຍການນີ້ຖືກບັນທຶກເປັນອໍເດີແລ້ວ");
    if (!row.order_code?.trim()) return toast.error("ບໍ່ພົບລະຫັດອໍເດີ");

    const confirmed = await confirmAction({
      title: "ຢືນຢັນບັນທຶກເປັນອໍເດີ?",
      text: `${row.deposit_no} -> ${row.order_code}`,
      confirmButtonText: "ຢືນຢັນ",
      cancelToast: "ຍົກເລີກການບັນທຶກເປັນອໍເດີແລ້ວ",
    });
    if (!confirmed) return;

    setWorkingId(row.id);
    try {
      const orderPayload = {
        order_code: row.order_code.trim(),
        order_date: row.order_date || row.deposit_date,
        customer_phone: row.customer_phone?.trim() || null,
        customer_whatsapp: row.customer_whatsapp?.trim() || null,
        factory_bill_code: row.factory_bill_code?.trim() || null,
        admin_user_id: row.admin_user_id || null,
        graphic_user_id: row.graphic_user_id || null,
        fabric_id: row.fabric_id,
        fabric_name: row.fabric_name,
        fabric_short_price: Number(row.fabric_short_price) || 0,
        fabric_long_price: Number(row.fabric_long_price) || 0,
        short_qty: Number(row.short_qty) || 0,
        long_qty: Number(row.long_qty) || 0,
        free_qty: Number(row.free_qty) || 0,
        qty_3xl: Number(row.qty_3xl) || 0,
        qty_4xl: Number(row.qty_4xl) || 0,
        qty_5xl: Number(row.qty_5xl) || 0,
        size_upcharge: 20000,
        extra_charge: Number(row.extra_charge) || 0,
        design_deposit: Number(row.design_deposit) || 0,
        initial_deposit: Number(row.initial_deposit) || 0,
        factory_cost: Number(row.factory_cost) || 0,
        gross_total: Number(row.gross_total) || 0,
        net_total: Number(row.net_total) || 0,
        balance: Number(row.balance) || 0,
        status: "in_progress",
      };

      const { data: orderData, error: insertOrderError } = await supabase.from("orders").insert(orderPayload).select("id").single();
      if (insertOrderError) throw insertOrderError;

      const { error: updateDepositError } = await supabase
        .from("factory_deposit_orders")
        .update({
          status: "converted",
          order_id: orderData.id,
          converted_at: new Date().toISOString(),
          converted_by_user_id: viewerUserId,
        })
        .eq("id", row.id);
      if (updateDepositError) throw updateDepositError;

      await insertHistory(row.id, "convert_to_order", `convert to order ${row.order_code}`, row.status, "converted");
      toast.success("ບັນທຶກເປັນອໍເດີແລ້ວ");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ບັນທຶກເປັນອໍເດີບໍ່ສຳເລັດ");
    } finally {
      setWorkingId(null);
    }
  };

  const handleOpenSlipPreview = async (row: DepositRow) => {
    setSlipPreviewRow(row);
    setSlipPreviewRows([]);
    setSlipPreviewLoading(true);
    try {
      const { data, error } = await supabase
        .from("factory_deposit_order_slips")
        .select("id,deposit_order_id,file_name,file_path,file_url,note,uploaded_at")
        .eq("deposit_order_id", row.id)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;

      const slips = (data ?? []) as DepositSlipRow[];
      if (slips.length > 0) {
        setSlipPreviewRows(slips);
      } else if (row.transfer_slip_url || row.transfer_slip_path) {
        setSlipPreviewRows([
          {
            id: `${row.id}-fallback-slip`,
            deposit_order_id: row.id,
            file_name: row.transfer_slip_path?.split("/").pop() || "transfer-slip",
            file_path: row.transfer_slip_path || "",
            file_url: row.transfer_slip_url || null,
            note: null,
            uploaded_at: row.deposit_date,
          },
        ]);
      } else {
        setSlipPreviewRows([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ໂຫຼດສະລິບບໍ່ສຳເລັດ");
      setSlipPreviewRow(null);
      setSlipPreviewRows([]);
    } finally {
      setSlipPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">ລາຍການໃບມັດຈຳສັ່ງຜະລິດ</h1>
          <div className="mt-2 text-sm font-medium text-slate-500">ລວມໃບມັດຈຳຂອງແອັດມິນທຸກຄົນ ແລະ ອະນຸມັດ ຫຼື ບັນທຶກເປັນອໍເດີໄດ້ຈາກໜ້ານີ້</div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            ໂຫຼດໃໝ່
          </button>
          <Link href="/factory-deposit-orders/new" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700">
            <FilePlus2 size={16} />
            ສ້າງໃບມັດຈຳ
          </Link>
        </div>
      </div>

      {err && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">ຂໍ້ຜິດພາດ: {err}</div>}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ທັງໝົດ</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{summary.total.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-sky-100 bg-sky-50 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-sky-700">ສົ່ງແລ້ວ</div>
          <div className="mt-2 text-2xl font-black text-sky-900">{summary.submitted.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">ອະນຸມັດແລ້ວ</div>
          <div className="mt-2 text-2xl font-black text-emerald-900">{summary.approved.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-violet-100 bg-violet-50 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-violet-700">ບັນທຶກເປັນອໍເດີແລ້ວ</div>
          <div className="mt-2 text-2xl font-black text-violet-900">{summary.converted.toLocaleString()}</div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 grid gap-3 md:grid-cols-[220px,1fr,180px]">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FactoryDepositOrderStatus | "all")}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="all">ສະຖານະທັງໝົດ</option>
            <option value="submitted">ສົ່ງແລ້ວ</option>
            <option value="approved">ອະນຸມັດແລ້ວ</option>
            <option value="converted">ບັນທຶກເປັນອໍເດີແລ້ວ</option>
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ຄົ້ນຫາເລກທີ່ໃບມັດຈຳ / ລະຫັດອໍເດີ / ລູກຄ້າ / ລະຫັດໂຮງງານ"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
          />
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700">ຍອດລວມ {summary.amount.toLocaleString()}</div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3 text-left text-[11px] font-black uppercase">ເອກະສານ</th>
                <th className="p-3 text-left text-[11px] font-black uppercase">ລູກຄ້າ</th>
                <th className="p-3 text-left text-[11px] font-black uppercase">ລາຍການ</th>
                <th className="p-3 text-right text-[11px] font-black uppercase">ຍອດການເງິນ</th>
                <th className="p-3 text-center text-[11px] font-black uppercase">ສະຖານະ</th>
                <th className="p-3 text-center text-[11px] font-black uppercase">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center font-medium text-slate-400">
                    ຍັງບໍ່ມີລາຍການ
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="p-3">
                      <div className="font-black text-slate-900">{getPrimaryDocumentCode(row)}</div>
                      <div className="text-xs font-medium text-slate-500">{getSecondaryDocumentCode(row) || "-"}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{row.customer_name || "-"}</div>
                      <div className="text-xs font-medium text-slate-500">{row.customer_phone || "-"}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{row.fabric_name || "-"}</div>
                      <div className="text-xs font-medium text-slate-500">ໂຮງງານ: {row.factory_bill_code || "-"}</div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="font-black text-emerald-700">{Number(row.net_total).toLocaleString()}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500">
                        ມັດຈຳຈາກລູກຄ້າ: <span className="text-slate-700">{Number(row.initial_deposit).toLocaleString()}</span>
                      </div>
                      <div className="mt-1 text-xs font-bold text-amber-700">
                        ຍອດຄ້າງຈາກລູກຄ້າ: <span>{Number(row.balance).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${FACTORY_DEPOSIT_ORDER_STATUS_STYLES[row.status]}`}>
                        {FACTORY_DEPOSIT_ORDER_STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewRow(row)}
                          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                        >
                          <Eye size={14} />
                          ເບິ່ງໃບສັ່ງຜະລິດ
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleOpenSlipPreview(row)}
                          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black text-amber-700 transition hover:bg-amber-50"
                        >
                          <FileImage size={14} />
                          ເບິ່ງສະລິບ
                        </button>
                        <Link href={`/factory-deposit-orders/new?id=${row.id}`} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black text-blue-700 transition hover:bg-blue-50">
                          <PencilLine size={14} />
                          ແກ້ໄຂ
                        </Link>
                        {viewerRole && canApproveFactoryDepositOrder(viewerRole) && row.status === "submitted" && (
                          <button onClick={() => handleApprove(row)} disabled={workingId === row.id} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
                            {workingId === row.id ? "ກຳລັງອະນຸມັດ..." : "ອະນຸມັດ"}
                          </button>
                        )}
                        {viewerRole && canConvertFactoryDepositOrder(viewerRole) && row.status === "approved" && (
                          <button onClick={() => handleConvert(row)} disabled={workingId === row.id} className="rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 transition hover:bg-violet-100 disabled:opacity-50">
                            {workingId === row.id ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກເປັນອໍເດີ"}
                          </button>
                        )}
                        {viewerRole && canDeleteFactoryDepositOrder(viewerRole) && (
                          <button onClick={() => handleDelete(row)} disabled={workingId === row.id} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-50 disabled:opacity-50">
                            <Trash2 size={14} />
                            {workingId === row.id ? "ກຳລັງລົບ..." : "ລົບ"}
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
      </div>

      {previewRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="relative max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl">
            <button
              type="button"
              onClick={() => setPreviewRow(null)}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            >
              <X size={18} />
            </button>

            <div className="mb-4 pr-12">
              <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Production Order Preview</div>
              <div className="mt-2 text-lg font-black text-slate-900">{getPrimaryDocumentCode(previewRow)}</div>
              <div className="mt-1 text-sm font-medium text-slate-500">
                {previewRow.customer_name || "-"} • {previewRow.deposit_date || "-"}
              </div>
            </div>

            <div className="mx-auto max-w-[980px] overflow-hidden rounded-[24px] border border-slate-300 bg-white [font-family:'Noto_Sans_Lao_Looped','Noto_Sans_Lao',Tahoma,Arial,sans-serif]">
              <div className="bg-white p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-slate-700 p-4">
                    <div className="text-[12px] font-black text-slate-700">ຊື່ທີມ:</div>
                    <div className="mt-1 text-[18px] font-black leading-tight text-slate-900">{previewRow.team_name || "-"}</div>
                    <div className="mt-3 text-[15px] font-black text-slate-700">
                      ລະຫັດອໍເດີ້: <span className="font-black text-sky-700">{previewRow.order_code || "-"}</span>
                    </div>
                    <div className="mt-1 text-[15px] font-black text-slate-700">
                      ຜ້າ: <span className="font-bold text-slate-900">{previewRow.fabric_name || "-"}</span>
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-700 p-4">
                    <div className="text-[15px] font-black text-slate-700">
                      ວັນທີ່ສົ່ງຜະລິດ: <span className="font-black text-slate-900">{previewRow.production_sent_date || "-"}</span>
                    </div>
                    <div className="mt-1 text-[15px] font-black text-slate-700">
                      ກຳນົດສົ່ງລູກຄ້າ: <span className="font-black text-slate-900">{previewRow.delivery_date || "-"}</span>
                    </div>
                    <div className="mt-4 text-[12px] font-black text-slate-700">ຈຳນວນທັງໝົດ</div>
                    <div className="mt-1 text-[26px] font-black leading-none text-sky-700">{previewTotalProductionQty.toLocaleString()} ຕົວ</div>
                  </div>
                </div>

                <div
                  className={`mt-3 rounded-md border px-4 py-2.5 text-center text-[13px] font-black shadow-sm ${
                    previewRow.production_priority === "urgent"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-sky-200 bg-sky-50 text-slate-700"
                  }`}
                >
                  <span className="opacity-80">ປະເພດງານ:</span>{" "}
                  <span className={previewRow.production_priority === "urgent" ? "text-red-600" : "text-sky-700"}>{previewPriorityText}</span>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-3">
                  {previewItems.length > 0 ? (
                    previewItems.map((item, index) => {
                      const sleeveLabel = PRODUCTION_SLEEVE_OPTIONS.find((option) => option.value === item.sleeve_type)?.label || "-";
                      const collarLabel = PRODUCTION_COLLAR_OPTIONS.find((option) => option.value === item.collar_type)?.label || "-";
                      const filledPlayerRows = getFilledPlayerRows(item);
                      return (
                        <div key={item.client_id} className="flex min-h-0 flex-col">
                          <div className="mb-2 rounded-md border border-slate-700 px-2 py-1.5 text-center text-[11px] font-black text-slate-700">
                            ແບບ {index + 1} • {sleeveLabel} • {collarLabel}
                          </div>
                          <div className="aspect-square overflow-hidden rounded-md border border-slate-700 bg-white">
                            {item.mockup_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.mockup_url} alt={`preview-${index + 1}`} className="h-full w-full object-contain bg-white" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-center text-[11px] font-bold text-slate-400">
                                ບໍ່ມີຮູບ Mockup
                              </div>
                            )}
                          </div>
                          <div className="mt-3 flex-1 rounded-md border border-slate-700 p-3">
                            <div className="mb-2 text-center text-[17px] font-black text-sky-700">ຈຳນວນໄຊສ໌</div>
                            <div className="space-y-2 text-[17px]">
                              {PRODUCTION_SIZE_FIELDS.filter((field) => Number(item.sizes[field.key]) > 0).map((field) => (
                                <div key={field.key} className="flex items-center justify-between gap-3">
                                  <span className="font-black text-slate-900">{field.label}:</span>
                                  <span className="font-black text-rose-600">{item.sizes[field.key].toLocaleString()}</span>
                                </div>
                              ))}
                              {item.player_mode === "none" && PRODUCTION_SIZE_FIELDS.every((field) => Number(item.sizes[field.key]) <= 0) ? (
                                <div className="text-center text-[13px] font-bold text-slate-400">ຍັງບໍ່ມີຈຳນວນໄຊສ໌</div>
                              ) : null}
                            </div>

                            {item.player_mode !== "none" && filledPlayerRows.length > 0 ? (
                              <div className="mt-4 border-t border-slate-200 pt-3">
                                <div className="mb-2 text-center text-[12px] font-black text-slate-700">{getPlayerModePreviewTitle(item.player_mode)}</div>
                                <div className="space-y-0.5 text-[10px] leading-tight text-slate-900">
                                  {filledPlayerRows.map((row) => {
                                    const sizeLabel = PRODUCTION_SIZE_FIELDS.find((field) => field.key === row.size)?.label || "-";
                                    const lineParts = [
                                      sizeLabel,
                                      playerModeNeedsName(item.player_mode) ? row.player_name || "-" : null,
                                      playerModeNeedsNumber(item.player_mode) ? row.jersey_number || "-" : null,
                                      row.note ? row.note : null,
                                    ].filter(Boolean);
                                    return (
                                      <div key={row.id} className="truncate font-semibold">
                                        {lineParts.join(" | ")}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-4 flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm font-bold text-slate-400">
                      ຍັງບໍ່ມີຂໍ້ມູນໃບສັ່ງຜະລິດ
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {slipPreviewRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setSlipPreviewRow(null);
                setSlipPreviewRows([]);
              }}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            >
              <X size={18} />
            </button>

            <div className="mb-4 pr-12">
              <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Transfer Slip Preview</div>
              <div className="mt-2 text-lg font-black text-slate-900">{getPrimaryDocumentCode(slipPreviewRow)}</div>
              <div className="mt-1 text-sm font-medium text-slate-500">{slipPreviewRow.customer_name || "-"}</div>
            </div>

            {slipPreviewLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center text-sm font-bold text-slate-500">ກຳລັງໂຫຼດສະລິບ...</div>
            ) : slipPreviewRows.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center text-sm font-bold text-slate-400">ບໍ່ພົບສະລິບໂອນເງິນ</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {slipPreviewRows.map((slip) => {
                  const fileName = slip.file_name || slip.file_path.split("/").pop() || "slip";
                  const isImage = isImageFileName(fileName);
                  return (
                    <div key={slip.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                          {new Date(slip.uploaded_at).toLocaleString("en-GB")}
                        </div>
                        {slip.file_url ? (
                          <Link href={slip.file_url} target="_blank" className="inline-flex items-center gap-1 text-xs font-black text-sky-700">
                            <ExternalLink size={13} />
                            ເປີດໄຟລ໌
                          </Link>
                        ) : null}
                      </div>
                      <div className="p-4">
                        <div className="mb-3 truncate text-sm font-black text-slate-900">{fileName}</div>
                        {isImage && slip.file_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={slip.file_url} alt={fileName} className="h-64 w-full rounded-2xl border border-slate-100 object-contain bg-slate-50" />
                        ) : (
                          <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-slate-500">
                            <div className="text-center">
                              {isImage ? <FileImage size={28} className="mx-auto mb-2" /> : <FileText size={28} className="mx-auto mb-2" />}
                              <div className="text-sm font-bold">{isImage ? "ໄຟລ໌ຮູບພາບ" : "ໄຟລ໌ເອກະສານ"}</div>
                            </div>
                          </div>
                        )}
                        {slip.note ? <div className="mt-3 text-sm font-medium text-slate-500">{slip.note}</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
