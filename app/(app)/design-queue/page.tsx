"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import { Check, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useOrderTypeOptions } from "@/lib/order-code-options";
import type { AppRole } from "@/lib/access-control";
import { buildYearOptions, type MonthFilter } from "../reports/_lib";

type DesignQueueRow = {
  id: string;
  queue_date: string;
  queue_year: number;
  queue_month: number;
  queue_sequence: number;
  queue_number: string;
  order_sequence: number;
  order_no: string;
  type_code: string;
  customer_phone: string;
  style_name: string;
  notes: string;
  is_designed: boolean;
  designed_at: string | null;
  graphic_user_id: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type WorkTypeFilter = "ALL" | "URGENT" | "NORMAL";
type GraphicUserRow = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
};
type ViewerProfile = {
  id: string;
  role: AppRole;
  full_name: string;
};

const URGENT_WORK_TYPE = "ງານດ່ວນ";
const NORMAL_WORK_TYPE = "ງານປົກກະຕິ";

const WORK_TYPE_OPTIONS = [
  { value: URGENT_WORK_TYPE, label: URGENT_WORK_TYPE },
  { value: NORMAL_WORK_TYPE, label: NORMAL_WORK_TYPE },
] as const;

function getLocalDateInputValue() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function buildMonthOptions() {
  return [
    { value: "ALL" as const, label: "ທຸກເດືອນ" },
    ...Array.from({ length: 12 }, (_, index) => ({
      value: index + 1,
      label: `ເດືອນ ${index + 1}`,
    })),
  ];
}

function syncTypeCodeYear(typeCode: string, dateValue: string) {
  const normalized = String(typeCode || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const year = Number(String(dateValue || "").slice(0, 4)) || new Date().getFullYear();
  const yearSuffix = String(year % 100).padStart(2, "0");

  if (!normalized) return "";
  if (/\d{2}$/.test(normalized)) return normalized.replace(/\d{2}$/, yearSuffix);
  return `${normalized}${yearSuffix}`;
}

function formatDisplayDate(dateValue: string) {
  if (!dateValue) return "-";
  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day) return dateValue;
  return `${day}/${month}/${year}`;
}

function getTypeBadgeClass(typeCode: string) {
  if (typeCode.startsWith("PK") || typeCode.startsWith("MK")) {
    return "bg-violet-100 text-violet-800 border border-violet-200";
  }
  if (typeCode.startsWith("PM") || typeCode.startsWith("MM")) {
    return "bg-amber-100 text-amber-900 border border-amber-200";
  }
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

function isUrgentWorkType(value: string) {
  return String(value || "").trim() === URGENT_WORK_TYPE;
}

function getWorkTypeBadgeClass(value: string) {
  if (isUrgentWorkType(value)) {
    return "bg-rose-100 text-rose-700 border border-rose-200";
  }
  return "bg-sky-100 text-sky-700 border border-sky-200";
}

type DesignQueuePageContentProps = {
  statusView?: "pending" | "completed";
};

export function DesignQueuePageContent({ statusView = "pending" }: DesignQueuePageContentProps) {
  const pathname = usePathname();
  const today = useMemo(() => new Date(), []);
  const [rows, setRows] = useState<DesignQueueRow[]>([]);
  const [graphicUsers, setGraphicUsers] = useState<GraphicUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [creatorUserId, setCreatorUserId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  const [queueDate, setQueueDate] = useState(getLocalDateInputValue);
  const [typeTemplate, setTypeTemplate] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [styleName, setStyleName] = useState(NORMAL_WORK_TYPE);
  const [graphicUserId, setGraphicUserId] = useState("");
  const [notes, setNotes] = useState("");

  const [monthFilter, setMonthFilter] = useState<MonthFilter>(today.getMonth() + 1);
  const [yearFilter, setYearFilter] = useState(today.getFullYear());
  const [workTypeFilter, setWorkTypeFilter] = useState<WorkTypeFilter>("ALL");
  const [query, setQuery] = useState("");

  const { options: orderTypeOptions, loading: loadingTypes } = useOrderTypeOptions(true);
  const selectedTypeTemplate = typeTemplate || orderTypeOptions[0] || "";
  const isGraphicViewer = viewerRole === "graphic";
  const canDeleteRows = viewerRole !== "graphic";
  const canAssignGraphic = viewerRole !== "graphic";
  const isEditing = editingRowId !== null;
  const selectedGraphicUserId = canAssignGraphic ? graphicUserId : creatorUserId || "";
  const isCompletedView = statusView === "completed";
  const showFormPanel = !isCompletedView || isEditing;

  const load = async () => {
    setLoading(true);
    setErr(null);

    let queueQuery = supabase
      .from("design_queue_entries")
      .select(
        "id,queue_date,queue_year,queue_month,queue_sequence,queue_number,order_sequence,order_no,type_code,customer_phone,style_name,notes,is_designed,designed_at,graphic_user_id,created_by_user_id,created_at,updated_at"
      )
      .order("queue_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (isGraphicViewer && creatorUserId) {
      queueQuery = queueQuery.eq("graphic_user_id", creatorUserId);
    }

    const [queueResult, graphicResult] = await Promise.all([
      queueQuery,
      supabase.from("users").select("id,full_name,role,is_active").eq("is_active", true).eq("role", "graphic").order("full_name", { ascending: true }),
    ]);

    if (queueResult.error) {
      setRows([]);
      setErr(queueResult.error.message);
      setLoading(false);
      return;
    }

    if (graphicResult.error) {
      setGraphicUsers([]);
      setErr(graphicResult.error.message);
      setLoading(false);
      return;
    }

    setRows((queueResult.data ?? []) as DesignQueueRow[]);
    setGraphicUsers((graphicResult.data ?? []) as GraphicUserRow[]);
    setLoading(false);
  };

  const triggerLoad = useEffectEvent(() => {
    void load();
  });

  useEffect(() => {
    if (!viewerRole) return;
    const timer = setTimeout(() => {
      triggerLoad();
    }, 0);

    return () => clearTimeout(timer);
  }, [creatorUserId, viewerRole]);

  useEffect(() => {
    let mounted = true;

    const loadCreator = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user.id;
      if (!authUserId || !mounted) return;

      const { data, error } = await supabase
        .from("users")
        .select("id,role,full_name")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (!mounted || error) return;
      const profile = (data ?? null) as ViewerProfile | null;
      setCreatorUserId(profile?.id ?? null);
      setViewerRole(profile?.role ?? null);
    };

    void loadCreator();

    return () => {
      mounted = false;
    };
  }, []);

  const resolvedTypeCode = useMemo(() => syncTypeCodeYear(selectedTypeTemplate, queueDate), [queueDate, selectedTypeTemplate]);
  const graphicNameMap = useMemo(() => new Map(graphicUsers.map((user) => [user.id, user.full_name])), [graphicUsers]);
  const availableGraphicUsers = useMemo(
    () => (isGraphicViewer && creatorUserId ? graphicUsers.filter((user) => user.id === creatorUserId) : graphicUsers),
    [creatorUserId, graphicUsers, isGraphicViewer]
  );

  const filteredRows = useMemo(() => {
    const search = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (monthFilter !== "ALL" && row.queue_month !== monthFilter) return false;
      if (row.queue_year !== yearFilter) return false;
      if (isCompletedView && !row.is_designed) return false;
      if (!isCompletedView && row.is_designed) return false;
      if (workTypeFilter === "URGENT" && !isUrgentWorkType(row.style_name)) return false;
      if (workTypeFilter === "NORMAL" && isUrgentWorkType(row.style_name)) return false;

      if (!search) return true;

      const haystack = [
        row.queue_number,
        row.order_no,
        row.type_code,
        row.customer_phone,
        row.style_name,
        row.notes,
        row.graphic_user_id ? graphicNameMap.get(row.graphic_user_id) || "" : "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    }).sort((a, b) => {
      const urgentDiff = Number(isUrgentWorkType(b.style_name)) - Number(isUrgentWorkType(a.style_name));
      if (urgentDiff !== 0) return urgentDiff;

      const queueDiff = a.queue_sequence - b.queue_sequence;
      if (queueDiff !== 0) return queueDiff;

      return a.order_no.localeCompare(b.order_no);
    });
  }, [graphicNameMap, isCompletedView, monthFilter, query, rows, workTypeFilter, yearFilter]);

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.is_designed) acc.designed += 1;
        else acc.pending += 1;
        if (isUrgentWorkType(row.style_name)) acc.urgent += 1;
        return acc;
      },
      { total: 0, pending: 0, designed: 0, urgent: 0 }
    );
  }, [filteredRows]);

  const resetForm = () => {
    setEditingRowId(null);
    setCustomerPhone("");
    setStyleName(NORMAL_WORK_TYPE);
    setGraphicUserId("");
    setNotes("");
    setQueueDate(getLocalDateInputValue());
    setTypeTemplate("");
  };

  const startEdit = (row: DesignQueueRow) => {
    setEditingRowId(row.id);
    setQueueDate(row.queue_date);
    setTypeTemplate(row.type_code);
    setCustomerPhone(row.customer_phone || "");
    setStyleName(row.style_name || NORMAL_WORK_TYPE);
    setGraphicUserId(row.graphic_user_id || "");
    setNotes(row.notes || "");
  };

  const handleSubmit = async () => {
    setErr(null);

    if (!isEditing && !resolvedTypeCode) {
      toast.error("ກະລຸນາເລືອກ TYPE");
      return;
    }
    if (!customerPhone.trim()) {
      toast.error("ກະລຸນາປ້ອນເບີໂທ");
      return;
    }
    if (!selectedGraphicUserId) {
      toast.error("ກະລຸນາເລືອກ Graphic");
      return;
    }
    if (!styleName.trim()) {
      toast.error("ກະລຸນາເລືອກຮູບແບບວຽກ");
      return;
    }

    setSaving(true);

    let error: { message: string } | null = null;

    if (isEditing && editingRowId) {
      const response = await supabase
        .from("design_queue_entries")
        .update({
          customer_phone: customerPhone.trim(),
          style_name: styleName.trim(),
          notes: notes.trim(),
          graphic_user_id: selectedGraphicUserId || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingRowId);
      error = response.error;
    } else {
      const response = await supabase.rpc("create_design_queue_entry", {
        p_queue_date: queueDate,
        p_type_code: resolvedTypeCode,
        p_customer_name: "",
        p_customer_phone: customerPhone,
        p_style_name: styleName,
        p_notes: notes,
        p_graphic_user_id: selectedGraphicUserId,
        p_created_by_user_id: creatorUserId,
      });
      error = response.error;
    }

    setSaving(false);

    if (error) {
      setErr(error.message);
      toast.error(`${isEditing ? "ແກ້ໄຂ" : "ບັນທຶກ"}ຄິວບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    toast.success(isEditing ? "ແກ້ໄຂຄິວສຳເລັດແລ້ວ" : "ເພີ່ມຄິວອອກແບບສຳເລັດແລ້ວ");
    resetForm();
    await load();
  };

  const toggleDesigned = async (row: DesignQueueRow) => {
    const nextDesigned = !row.is_designed;
    const { error } = await supabase
      .from("design_queue_entries")
      .update({
        is_designed: nextDesigned,
        designed_at: nextDesigned ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) {
      toast.error(`ອັບເດດສະຖານະບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    toast.success(nextDesigned ? `ຄິວ ${row.order_no} ອອກແບບແລ້ວ` : `ຄິວ ${row.order_no} ກັບໄປລໍຖ້າອອກແບບ`);
    await load();
  };

  const deleteRow = async (row: DesignQueueRow) => {
    const confirmed = window.confirm(`ຕ້ອງການລົບຄິວ ${row.order_no} ແທ້ບໍ?`);
    if (!confirmed) return;

    const { error } = await supabase.from("design_queue_entries").delete().eq("id", row.id);
    if (error) {
      toast.error(`ລົບຄິວບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    toast.success(`ລົບຄິວ ${row.order_no} ສຳເລັດແລ້ວ`);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            {isCompletedView ? "ລາຍການອອກແບບສຳເລັດ" : "ລາຍການຍັງບໍ່ທັນອອກແບບ"}
          </h1>
          <p className="text-sm font-medium text-slate-500">
            {isCompletedView
              ? "ລາຍການທີ່ກົດສະຖານະອອກແບບສຳເລັດແລ້ວຈະຖືກຍ້າຍມາໜ້ານີ້"
              : "ອໍເດີທີ່ຍັງບໍ່ທັນອອກແບບຈະຢູ່ໜ້ານີ້ ແລະ ເມື່ອກົດສຳເລັດຈະຍ້າຍໄປໜ້າລາຍການອອກແບບສຳເລັດ"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <RefreshCw size={16} />
          ໂຫຼດຄືນ
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/design-queue"
          className={`inline-flex items-center rounded-2xl px-4 py-2.5 text-sm font-black transition ${
            pathname === "/design-queue"
              ? "bg-slate-900 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          ລາຍການຍັງບໍ່ທັນອອກແບບ
        </Link>
        <Link
          href="/design-queue/completed"
          className={`inline-flex items-center rounded-2xl px-4 py-2.5 text-sm font-black transition ${
            pathname === "/design-queue/completed"
              ? "bg-emerald-600 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          ລາຍການອອກແບບສຳເລັດ
        </Link>
      </div>

      {err ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{err}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="text-xs font-black uppercase text-slate-500">ຄິວທັງໝົດ</div>
          <div className="mt-2 text-3xl font-black text-slate-900">{summary.total.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
          <div className="text-xs font-black uppercase text-amber-700">ລໍຖ້າອອກແບບ</div>
          <div className="mt-2 text-3xl font-black text-amber-700">{summary.pending.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
          <div className="text-xs font-black uppercase text-emerald-700">ອອກແບບແລ້ວ</div>
          <div className="mt-2 text-3xl font-black text-emerald-700">{summary.designed.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 shadow-sm">
          <div className="text-xs font-black uppercase text-rose-700">ງານດ່ວນ</div>
          <div className="mt-2 text-3xl font-black text-rose-700">{summary.urgent.toLocaleString()}</div>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${showFormPanel ? "xl:grid-cols-[380px_minmax(0,1fr)]" : ""}`}>
        {showFormPanel ? (
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">{isEditing ? "ແກ້ໄຂຄິວ" : "ເພີ່ມຄິວໃໝ່"}</h2>
              <div className="text-sm font-medium text-slate-500">
                {isEditing ? "ປັບຂໍ້ມູນຄິວນີ້ໄດ້ຈາກຟອມນີ້" : "ລະບົບຈະສ້າງເລກໃຫ້ອັດຕະໂນມັດຕອນກົດບັນທຶກ"}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-100 px-3 py-2 text-right">
              <div className="text-[11px] font-black uppercase text-slate-500">ຕົວຢ່າງ</div>
              <div className="text-sm font-black text-slate-900">{selectedTypeTemplate || "TYPE"}</div>
              <div className="text-xs font-bold text-slate-500">
                {isEditing ? "ກຳລັງແກ້ໄຂລາຍການເກົ່າ" : "ເລກຄິວອັດຕະໂນມັດ / ເລກອໍເດີອັດຕະໂນມັດ"}
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-black text-slate-700">ວັນທີ</label>
              <input
                type="date"
                value={queueDate}
                onChange={(event) => setQueueDate(event.target.value)}
                disabled={isEditing}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-black text-slate-700">TYPE</label>
              <select
                value={selectedTypeTemplate}
                onChange={(event) => setTypeTemplate(event.target.value)}
                disabled={loadingTypes || isEditing}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400 disabled:bg-slate-50"
              >
                {!typeTemplate ? <option value="">ເລືອກ TYPE</option> : null}
                {orderTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {syncTypeCodeYear(option, queueDate)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-black text-slate-700">ເບີໂທ / ຕິດຕໍ່</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="20 99 999 999"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-black text-slate-700">ກຣາຟິກ</label>
              <select
                value={selectedGraphicUserId}
                onChange={(event) => setGraphicUserId(event.target.value)}
                disabled={!canAssignGraphic}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400 disabled:bg-slate-50"
              >
                {!isGraphicViewer ? <option value="">ເລືອກກຣາຟິກ</option> : null}
                {availableGraphicUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-black text-slate-700">ຮູບແບບວຽກ</label>
              <select
                value={styleName}
                onChange={(event) => setStyleName(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
              >
                {WORK_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-black text-slate-700">ໝາຍເຫດ</label>
              <textarea
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="ລາຍລະອຽດເພີ່ມເຕີມ"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={saving || loadingTypes}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : isEditing ? <Pencil size={16} /> : <Plus size={16} />}
                {isEditing ? "ບັນທຶກການແກ້ໄຂ" : "ບັນທຶກຄິວໃໝ່"}
              </button>
              {isEditing ? (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  ຍົກເລີກ
                </button>
              ) : null}
            </div>
          </div>
        </section>
        ) : null}

        <section className="space-y-4">
          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ຄົ້ນຫາເລກຄິວ / ເລກອໍເດີ / ໂທ / ກຣາຟິກ"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400 lg:col-span-2"
              />
              <select
                value={monthFilter}
                onChange={(event) => setMonthFilter(event.target.value === "ALL" ? "ALL" : Number(event.target.value))}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
              >
                {buildMonthOptions().map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={yearFilter}
                onChange={(event) => setYearFilter(Number(event.target.value))}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
              >
                {buildYearOptions().map((year) => (
                  <option key={year} value={year}>
                    ປີ {year}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-700">
                {isCompletedView ? "ສະແດງສະເພາະທີ່ອອກແບບສຳເລັດ" : "ສະແດງສະເພາະທີ່ຍັງບໍ່ທັນອອກແບບ"}
              </div>
              <select
                value={workTypeFilter}
                onChange={(event) => setWorkTypeFilter(event.target.value as WorkTypeFilter)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
              >
                <option value="ALL">ທຸກຮູບແບບວຽກ</option>
                <option value="URGENT">{URGENT_WORK_TYPE}</option>
                <option value="NORMAL">{NORMAL_WORK_TYPE}</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 text-sm font-black text-slate-700">
              {isCompletedView ? "ລາຍການອອກແບບສຳເລັດ" : "ລາຍການຄິວ"} ({filteredRows.length})
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-100 bg-white">
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="px-4 py-3 font-black">ວັນທີ</th>
                    <th className="px-4 py-3 font-black">ຄິວ</th>
                    <th className="px-4 py-3 font-black">ປະເພດ</th>
                    <th className="px-4 py-3 font-black">ເລກອໍເດີ</th>
                    <th className="px-4 py-3 font-black">ກຣາຟິກ</th>
                    <th className="px-4 py-3 font-black">ເບີໂທ</th>
                    <th className="px-4 py-3 font-black">ຮູບແບບວຽກ</th>
                    <th className="px-4 py-3 font-black">ສະຖານະ</th>
                    <th className="px-4 py-3 text-right font-black">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-16 text-center text-sm font-bold text-slate-500">
                        ກຳລັງໂຫຼດຂໍ້ມູນ...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-16 text-center text-sm font-bold text-slate-500">
                        ຍັງບໍ່ມີຂໍ້ມູນຄິວໃນຊ່ວງທີ່ເລືອກ
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.id} className={`align-top ${isUrgentWorkType(row.style_name) ? "bg-rose-50/40" : ""}`}>
                        <td className="px-4 py-4 font-bold text-slate-700">{formatDisplayDate(row.queue_date)}</td>
                        <td className="px-4 py-4">
                          <div className="font-black text-slate-900">#{row.queue_number}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${getTypeBadgeClass(row.type_code)}`}>
                            {row.type_code}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-black text-slate-900">{row.order_no}</td>
                        <td className="px-4 py-4">
                          <div className="font-black text-slate-900">{row.graphic_user_id ? graphicNameMap.get(row.graphic_user_id) || "-" : "-"}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-black text-slate-900">{row.customer_phone || "-"}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${getWorkTypeBadgeClass(row.style_name)}`}>
                            {row.style_name || "-"}
                          </span>
                          {row.notes ? <div className="mt-1 text-xs font-medium text-slate-500">{row.notes}</div> : null}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${
                              row.is_designed
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {row.is_designed ? "ອອກແບບແລ້ວ" : "ລໍຖ້າອອກແບບ"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="inline-flex items-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 transition hover:bg-sky-100"
                            >
                              <Pencil size={14} />
                              ແກ້ໄຂ
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleDesigned(row)}
                              className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-black transition ${
                                row.is_designed
                                  ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                  : "bg-emerald-600 text-white hover:bg-emerald-700"
                              }`}
                              >
                              <Check size={14} />
                              {row.is_designed ? "ຍົກເລີກສຳເລັດ" : "ຕິກສຳເລັດ"}
                            </button>
                            {canDeleteRows ? (
                              <button
                                type="button"
                                onClick={() => void deleteRow(row)}
                                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100"
                              >
                                <Trash2 size={14} />
                                ລົບ
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function DesignQueuePage() {
  return <DesignQueuePageContent statusView="pending" />;
}
