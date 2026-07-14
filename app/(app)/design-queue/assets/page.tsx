"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";
import { Download, FileSpreadsheet, Images, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import { GRAPHIC_ASSIGNABLE_ROLES } from "@/lib/role-groups";
import { buildYearOptions, type MonthFilter } from "../../reports/_lib";
import { canEditWithPermissions, normalizeUserPermissionSettings, type UserPermissionSettings } from "@/lib/user-permissions";
import {
  buildDesignQueueMockupExportName,
  buildDesignQueueOrderCode,
  getDesignQueueMockupUrl,
  type DesignQueueMockupRow,
  type DesignQueueUploadTarget,
} from "@/lib/design-queue-media";
import { MockupUploadModal } from "../_components/mockup-upload-modal";

type DesignQueueRow = {
  id: string;
  queue_date: string;
  queue_year: number;
  queue_month: number;
  queue_number: string;
  order_no: string;
  type_code: string;
  customer_phone: string;
  style_name: string;
  notes: string;
  is_designed: boolean;
  graphic_user_id: string | null;
  updated_at: string;
};

type GraphicUserRow = {
  id: string;
  full_name: string;
};

type ViewerProfile = {
  id: string;
  role: AppRole;
  permission_settings?: UserPermissionSettings | null;
};

type WorkTypeFilter = "ALL" | "URGENT" | "NORMAL";
type TypeFilter = "ALL" | string;
type GalleryCardRow = {
  mockup: DesignQueueMockupRow;
  queue: DesignQueueRow;
  previewUrl: string | null;
  graphicName: string;
};

const URGENT_WORK_TYPE = "ງານດ່ວນ";
const ALL_GRAPHIC_FILTER = "__ALL__";

function buildMonthOptions() {
  return [
    { value: "ALL" as const, label: "ທຸກເດືອນ" },
    ...Array.from({ length: 12 }, (_, index) => ({
      value: index + 1,
      label: `ເດືອນ ${index + 1}`,
    })),
  ];
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isUrgentWorkType(value: string) {
  return String(value || "").trim() === URGENT_WORK_TYPE;
}

function getWorkTypeBadgeClass(value: string) {
  return isUrgentWorkType(value)
    ? "border border-rose-200 bg-rose-50 text-rose-700"
    : "border border-sky-200 bg-sky-50 text-sky-700";
}

function toUploadTarget(row: DesignQueueRow): DesignQueueUploadTarget {
  return {
    id: row.id,
    queue_number: row.queue_number,
    order_no: row.order_no,
    type_code: row.type_code,
    style_name: row.style_name,
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 1000);
}

export default function DesignQueueAssetsPage() {
  const today = new Date();
  const [rows, setRows] = useState<DesignQueueRow[]>([]);
  const [mockups, setMockups] = useState<DesignQueueMockupRow[]>([]);
  const [graphics, setGraphics] = useState<GraphicUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerPermissions, setViewerPermissions] = useState<UserPermissionSettings>({});
  const [activeQueue, setActiveQueue] = useState<DesignQueueUploadTarget | null>(null);

  const [monthFilter, setMonthFilter] = useState<MonthFilter>(today.getMonth() + 1);
  const [yearFilter, setYearFilter] = useState(today.getFullYear());
  const [workTypeFilter, setWorkTypeFilter] = useState<WorkTypeFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [graphicFilter, setGraphicFilter] = useState<string>(ALL_GRAPHIC_FILTER);
  const [queueDateFrom, setQueueDateFrom] = useState("");
  const [queueDateTo, setQueueDateTo] = useState("");
  const [uploadedFrom, setUploadedFrom] = useState("");
  const [uploadedTo, setUploadedTo] = useState("");
  const [query, setQuery] = useState("");
  const [exportingImages, setExportingImages] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const canEditQueue = canEditWithPermissions(viewerPermissions, "design_queue", true);
  const isGraphicViewer = viewerRole === "graphic";

  const load = async () => {
    setLoading(true);
    setErr(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id;

    let profile: ViewerProfile | null = null;
    if (authUserId) {
      const { data: profileData, error: profileError } = await supabase
        .from("users")
        .select("id,role,permission_settings")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (profileError) {
        setErr(profileError.message);
        setLoading(false);
        return;
      }

      profile = (profileData ?? null) as ViewerProfile | null;
      setViewerRole(profile?.role ?? null);
      setViewerUserId(profile?.id ?? null);
      setViewerPermissions(normalizeUserPermissionSettings(profile?.permission_settings));
    }

    let queueQuery = supabase
      .from("design_queue_entries")
      .select("id,queue_date,queue_year,queue_month,queue_number,order_no,type_code,customer_phone,style_name,notes,is_designed,graphic_user_id,updated_at")
      .eq("is_designed", true)
      .order("queue_date", { ascending: false })
      .order("updated_at", { ascending: false });

    if (profile?.role === "graphic" && profile.id) {
      queueQuery = queueQuery.eq("graphic_user_id", profile.id);
    }

    const [{ data: queueData, error: queueError }, { data: mockupData, error: mockupError }, { data: graphicData, error: graphicError }] =
      await Promise.all([
        queueQuery,
        supabase
          .from("design_queue_mockups")
          .select("id,queue_entry_id,file_name,file_path,file_url,mime_type,width,height,file_size_bytes,uploaded_by_user_id,uploaded_at,updated_at")
          .order("uploaded_at", { ascending: false }),
        supabase.from("users").select("id,full_name").eq("is_active", true).in("role", GRAPHIC_ASSIGNABLE_ROLES).order("full_name", { ascending: true }),
      ]);

    if (queueError) {
      setRows([]);
      setErr(queueError.message);
      setLoading(false);
      return;
    }

    if (mockupError) {
      setMockups([]);
      setErr(mockupError.message);
      setLoading(false);
      return;
    }

    if (graphicError) {
      setGraphics([]);
      setErr(graphicError.message);
      setLoading(false);
      return;
    }

    setRows((queueData ?? []) as DesignQueueRow[]);
    setMockups((mockupData ?? []) as DesignQueueMockupRow[]);
    setGraphics((graphicData ?? []) as GraphicUserRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const queueById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const graphicNameMap = useMemo(() => new Map(graphics.map((user) => [user.id, user.full_name])), [graphics]);
  const typeOptions = useMemo(() => ["ALL", ...Array.from(new Set(rows.map((row) => row.type_code).filter(Boolean))).sort()] as TypeFilter[], [rows]);

  const galleryRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    const activeGraphicFilter = isGraphicViewer && viewerUserId ? viewerUserId : graphicFilter;

    return mockups
      .map((mockup) => {
        const queue = queueById.get(mockup.queue_entry_id);
        if (!queue) return null;

        return {
          mockup,
          queue,
          previewUrl: getDesignQueueMockupUrl(mockup),
          graphicName: queue.graphic_user_id ? graphicNameMap.get(queue.graphic_user_id) || "-" : "-",
        } satisfies GalleryCardRow;
      })
      .filter((item): item is GalleryCardRow => Boolean(item))
      .filter((item) => {
        if (monthFilter !== "ALL" && item.queue.queue_month !== monthFilter) return false;
        if (item.queue.queue_year !== yearFilter) return false;
        if (workTypeFilter === "URGENT" && !isUrgentWorkType(item.queue.style_name)) return false;
        if (workTypeFilter === "NORMAL" && isUrgentWorkType(item.queue.style_name)) return false;
        if (typeFilter !== "ALL" && item.queue.type_code !== typeFilter) return false;
        if (activeGraphicFilter !== ALL_GRAPHIC_FILTER && item.queue.graphic_user_id !== activeGraphicFilter) return false;
        if (queueDateFrom && item.queue.queue_date < queueDateFrom) return false;
        if (queueDateTo && item.queue.queue_date > queueDateTo) return false;

        const uploadedDate = item.mockup.uploaded_at.slice(0, 10);
        if (uploadedFrom && uploadedDate < uploadedFrom) return false;
        if (uploadedTo && uploadedDate > uploadedTo) return false;

        if (!search) return true;

        const haystack = [
          item.queue.queue_number,
          item.queue.order_no,
          item.queue.type_code,
          item.queue.customer_phone,
          item.queue.style_name,
          item.queue.notes,
          item.graphicName,
          item.mockup.file_name,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(search);
      })
      .sort((left, right) => new Date(right.mockup.uploaded_at).getTime() - new Date(left.mockup.uploaded_at).getTime());
  }, [
    graphicFilter,
    graphicNameMap,
    isGraphicViewer,
    mockups,
    monthFilter,
    query,
    queueById,
    queueDateFrom,
    queueDateTo,
    typeFilter,
    uploadedFrom,
    uploadedTo,
    viewerUserId,
    workTypeFilter,
    yearFilter,
  ]);

  const summary = useMemo(() => {
    const queueIds = new Set(galleryRows.map((row) => row.queue.id));
    const graphicIds = new Set(galleryRows.map((row) => row.queue.graphic_user_id).filter((value): value is string => Boolean(value)));
    return {
      totalImages: galleryRows.length,
      totalQueues: queueIds.size,
      urgentImages: galleryRows.filter((row) => isUrgentWorkType(row.queue.style_name)).length,
      totalGraphics: graphicIds.size,
    };
  }, [galleryRows]);

  const exportExcel = async () => {
    if (galleryRows.length === 0) {
      toast.error("ບໍ່ມີຮູບສຳລັບ export");
      return;
    }

    setExportingExcel(true);
    try {
      const sheetRows = galleryRows.map((item, index) => ({
        no: index + 1,
        queue_number: item.queue.queue_number,
        order_code: buildDesignQueueOrderCode(item.queue),
        order_no: item.queue.order_no,
        type_code: item.queue.type_code,
        graphic_name: item.graphicName,
        customer_phone: item.queue.customer_phone,
        work_type: item.queue.style_name,
        queue_date: item.queue.queue_date,
        uploaded_at: item.mockup.uploaded_at,
        file_name: item.mockup.file_name,
        image_url: item.previewUrl || item.mockup.file_url || "",
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      XLSX.utils.book_append_sheet(wb, ws, "Design Shirt Images");
      XLSX.writeFile(wb, `design-queue-images-${yearFilter}-${monthFilter === "ALL" ? "all" : monthFilter}.xlsx`);
      toast.success("Export Excel ສຳເລັດ");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export Excel ບໍ່ສຳເລັດ";
      toast.error(message);
    } finally {
      setExportingExcel(false);
    }
  };

  const exportImages = async () => {
    if (galleryRows.length === 0) {
      toast.error("ບໍ່ມີຮູບສຳລັບ export");
      return;
    }

    setExportingImages(true);
    let successCount = 0;
    let failedCount = 0;

    try {
      for (const [index, item] of galleryRows.entries()) {
        const url = item.previewUrl || item.mockup.file_url;
        if (!url) {
          failedCount += 1;
          continue;
        }

        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`download_failed_${response.status}`);
          }
          const blob = await response.blob();
          const fileName = buildDesignQueueMockupExportName(item.queue, item.mockup.file_name, index);
          downloadBlob(blob, fileName);
          successCount += 1;
        } catch (error) {
          failedCount += 1;
          const message = error instanceof Error ? error.message : `ດາວໂຫລດຮູບ ${item.mockup.file_name} ບໍ່ສຳເລັດ`;
          toast.error(message);
        }
      }
    } finally {
      setExportingImages(false);
    }

    if (successCount > 0) {
      toast.success(`Export ຮູບສຳເລັດ ${successCount} ໄຟລ໌`);
    }
    if (failedCount > 0 && successCount === 0) {
      toast.error("ບໍ່ສາມາດ export ຮູບໄດ້");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Design Gallery</div>
          <h1 className="mt-1 text-3xl font-black text-slate-900">ຄັງຮູບເສື້ອຈາກຄິວອອກແບບ</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">ເກັບຮູບເສື້ອທີ່ອອກແບບສຳເລັດແລ້ວ ພ້ອມຕົວກອງ ແລະ ປຸ່ມ export ຕາມຊຸດຂໍ້ມູນທີ່ເລືອກ.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void exportImages()}
            disabled={exportingImages || galleryRows.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            {exportingImages ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {exportingImages ? "ກຳລັງ Export..." : "Export ຮູບ"}
          </button>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={exportingExcel || galleryRows.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50"
          >
            {exportingExcel ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            {exportingExcel ? "ກຳລັງ Export..." : "Export Excel"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            ໂຫຼດຄືນ
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/design-queue"
          className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
        >
          ລາຍການຍັງບໍ່ທັນອອກແບບ
        </Link>
        <Link
          href="/design-queue/completed"
          className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
        >
          ລາຍການອອກແບບສຳເລັດ
        </Link>
        <Link href="/design-queue/assets" className="inline-flex items-center rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-black text-white shadow-sm">
          ຄັງຮູບເສື້ອ
        </Link>
      </div>

      {err ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{err}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-slate-500">ຮູບທັງໝົດ</div>
          <div className="mt-2 text-3xl font-black text-slate-900">{summary.totalImages.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-sky-100 bg-sky-50 p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-sky-700">ຄິວທີ່ມີຮູບ</div>
          <div className="mt-2 text-3xl font-black text-sky-700">{summary.totalQueues.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-rose-700">ຮູບງານດ່ວນ</div>
          <div className="mt-2 text-3xl font-black text-rose-700">{summary.urgentImages.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-emerald-700">ກຣາຟິກທີ່ກ່ຽວຂ້ອງ</div>
          <div className="mt-2 text-3xl font-black text-emerald-700">{summary.totalGraphics.toLocaleString()}</div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-6">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ຄົ້ນຫາເລກຄິວ / ອໍເດີ / ໂທ / ກຣາຟິກ / ໄຟລ໌"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400 xl:col-span-2"
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
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
          >
            {typeOptions.map((typeCode) => (
              <option key={typeCode} value={typeCode}>
                {typeCode === "ALL" ? "ທຸກ TYPE" : typeCode}
              </option>
            ))}
          </select>
          <select
            value={graphicFilter}
            onChange={(event) => setGraphicFilter(event.target.value)}
            disabled={isGraphicViewer}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400 disabled:bg-slate-50"
          >
            <option value={ALL_GRAPHIC_FILTER}>ທຸກ Graphic</option>
            {graphics.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-6">
          <select
            value={workTypeFilter}
            onChange={(event) => setWorkTypeFilter(event.target.value as WorkTypeFilter)}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
          >
            <option value="ALL">ທຸກຮູບແບບວຽກ</option>
            <option value="URGENT">{URGENT_WORK_TYPE}</option>
            <option value="NORMAL">ງານປົກກະຕິ</option>
          </select>
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-slate-500">ຄິວຈາກວັນທີ</label>
            <input
              type="date"
              value={queueDateFrom}
              max={queueDateTo || undefined}
              onChange={(event) => setQueueDateFrom(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-slate-500">ຄິວເຖິງວັນທີ</label>
            <input
              type="date"
              value={queueDateTo}
              min={queueDateFrom || undefined}
              onChange={(event) => setQueueDateTo(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-slate-500">ອັບຮູບຈາກວັນທີ</label>
            <input
              type="date"
              value={uploadedFrom}
              max={uploadedTo || undefined}
              onChange={(event) => setUploadedFrom(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-slate-500">ອັບຮູບເຖິງວັນທີ</label>
            <input
              type="date"
              value={uploadedTo}
              min={uploadedFrom || undefined}
              onChange={(event) => setUploadedTo(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
            />
          </div>
          <div className="flex items-end">
            <div className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-700">
              Export ຈະໃຊ້ filter ຊຸດນີ້ ({galleryRows.length.toLocaleString()} ໄຟລ໌)
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-slate-100 bg-white text-sm font-bold text-slate-500 shadow-sm">
          ກຳລັງໂຫຼດຄັງຮູບ...
        </div>
      ) : galleryRows.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-slate-100 bg-white px-6 text-center text-sm font-medium text-slate-500 shadow-sm">
          <Images size={28} className="mb-3 text-slate-400" />
          ບໍ່ພົບຮູບທີ່ກົງກັບ filter ທີ່ເລືອກ
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {galleryRows.map((item, index) => (
            <article key={item.mockup.id} className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
              <div className="relative bg-slate-100">
                {item.previewUrl ? (
                  <a href={item.previewUrl} target="_blank" rel="noreferrer" className="block">
                    <img src={item.previewUrl} alt={item.mockup.file_name} className="h-72 w-full object-cover" />
                  </a>
                ) : (
                  <div className="flex h-72 items-center justify-center text-sm font-bold text-slate-500">ບໍ່ພົບ preview</div>
                )}
                <div className="absolute left-4 top-4 inline-flex rounded-full bg-slate-950/80 px-3 py-1 text-xs font-black text-white">
                  #{item.queue.queue_number}
                </div>
              </div>
              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-black text-slate-900">{buildDesignQueueOrderCode(item.queue)}</div>
                    <div className="mt-1 text-sm font-medium text-slate-500">{item.mockup.file_name}</div>
                  </div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${getWorkTypeBadgeClass(item.queue.style_name)}`}>
                    {item.queue.style_name || "-"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-slate-50 px-3 py-2">
                    <div className="text-xs font-black uppercase text-slate-500">Graphic</div>
                    <div className="mt-1 font-black text-slate-900">{item.graphicName}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2">
                    <div className="text-xs font-black uppercase text-slate-500">Phone</div>
                    <div className="mt-1 font-black text-slate-900">{item.queue.customer_phone || "-"}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2">
                    <div className="text-xs font-black uppercase text-slate-500">Queue Date</div>
                    <div className="mt-1 font-black text-slate-900">{item.queue.queue_date}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2">
                    <div className="text-xs font-black uppercase text-slate-500">Uploaded</div>
                    <div className="mt-1 font-black text-slate-900">{formatDateTime(item.mockup.uploaded_at)}</div>
                  </div>
                </div>

                {item.queue.notes ? <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">{item.queue.notes}</div> : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveQueue(toUploadTarget(item.queue))}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800"
                  >
                    <Images size={15} />
                    ຈັດການຮູບ
                  </button>
                  {item.previewUrl ? (
                    <a
                      href={item.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                    >
                      <Download size={15} />
                      ເປີດຮູບ
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={async () => {
                      const url = item.previewUrl || item.mockup.file_url;
                      if (!url) {
                        toast.error("ບໍ່ພົບ URL ຮູບ");
                        return;
                      }

                      try {
                        const response = await fetch(url);
                        if (!response.ok) throw new Error(`download_failed_${response.status}`);
                        const blob = await response.blob();
                        downloadBlob(blob, buildDesignQueueMockupExportName(item.queue, item.mockup.file_name, index));
                        toast.success("ດາວໂຫລດຮູບສຳເລັດ");
                      } catch (error) {
                        const message = error instanceof Error ? error.message : "ດາວໂຫລດຮູບບໍ່ສຳເລັດ";
                        toast.error(message);
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-black text-sky-700 transition hover:bg-sky-100"
                  >
                    <Download size={15} />
                    ດາວໂຫລດຮູບ
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <MockupUploadModal
        canEdit={canEditQueue}
        queue={activeQueue}
        viewerUserId={viewerUserId}
        onClose={() => setActiveQueue(null)}
        onUpdated={() => {
          void load();
        }}
      />
    </div>
  );
}
