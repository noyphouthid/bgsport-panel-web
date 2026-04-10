"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import toast from "react-hot-toast";
import { Download, Printer, QrCode, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  buildOrderLookupOrFilter,
  buildOrderQrCode,
  formatDateTime,
  getOrderQrPrintHtml,
  getTotalUnits,
  ORDER_QR_LABEL_SELECT,
  type OrderSummary,
  type QrLabelRow,
} from "@/lib/inventory-qr";

type SearchOrderRow = OrderSummary;
type PrintFilter = "all" | "unprinted" | "printed";

function toLocalDateInputValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function toDateOnly(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function isLabelPrinted(label: Pick<QrLabelRow, "print_count" | "printed_at" | "last_printed_at">) {
  return Boolean((Number(label.print_count) || 0) > 0 || label.printed_at || label.last_printed_at);
}

function getPrintStatusLabel(label: Pick<QrLabelRow, "print_count" | "printed_at" | "last_printed_at">) {
  return isLabelPrinted(label) ? `ພິມແລ້ວ ${Math.max(1, Number(label.print_count) || 0)} ຄັ້ງ` : "ຍັງບໍ່ພິມ";
}

function getPrintStatusStyles(label: Pick<QrLabelRow, "print_count" | "printed_at" | "last_printed_at">) {
  return isLabelPrinted(label)
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

export default function InventoryQrPage() {
  const today = useMemo(() => toLocalDateInputValue(), []);
  const pageSize = 20;
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [results, setResults] = useState<SearchOrderRow[]>([]);
  const [labelsByOrderId, setLabelsByOrderId] = useState<Record<string, QrLabelRow>>({});
  const [activeLabel, setActiveLabel] = useState<QrLabelRow | null>(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState("");
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [recentLabels, setRecentLabels] = useState<QrLabelRow[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [printFilter, setPrintFilter] = useState<PrintFilter>("all");
  const [currentPrinter, setCurrentPrinter] = useState("");
  const [importedFromDate, setImportedFromDate] = useState("");
  const [importedToDate, setImportedToDate] = useState(today);
  const [recentPage, setRecentPage] = useState(1);

  const loadRecentLabels = async () => {
    const { data, error } = await supabase
      .from("order_qr_labels")
      .select(ORDER_QR_LABEL_SELECT)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(`ໂຫຼດລາຍການ QR ບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    setRecentLabels((data ?? []) as QrLabelRow[]);
  };

  const loadCurrentPrinter = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id ?? null;
    const sessionEmail = String(sessionData.session?.user.email || "").trim();
    if (!authUserId && !sessionEmail) return;

    if (authUserId) {
      const { data, error } = await supabase
        .from("users")
        .select("full_name")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      if (!error && data?.full_name) {
        setCurrentPrinter(String(data.full_name).trim());
        return;
      }
    }

    if (sessionEmail) {
      const { data, error } = await supabase
        .from("users")
        .select("full_name")
        .eq("email", sessionEmail)
        .maybeSingle();
      if (!error && data?.full_name) {
        setCurrentPrinter(String(data.full_name).trim());
        return;
      }
    }

    setCurrentPrinter(sessionEmail);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadRecentLabels();
      void loadCurrentPrinter();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const generatePreviewDataUrl = async (qrCode: string) =>
    QRCode.toDataURL(qrCode, {
      width: 720,
      margin: 2,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    });

  const showLabelPreview = async (label: QrLabelRow) => {
    const existingPreviewUrl = previewUrls[label.id];
    const dataUrl = existingPreviewUrl || (await generatePreviewDataUrl(label.qr_code));
    if (!existingPreviewUrl) {
      setPreviewUrls((prev) => ({ ...prev, [label.id]: dataUrl }));
    }
    setActiveLabel(label);
    setActivePreviewUrl(dataUrl);
  };

  const searchOrders = async () => {
    const term = query.trim();
    if (!term) {
      toast.error("ກະລຸນາປ້ອນລະຫັດອໍເດີ ຫຼື ລະຫັດບິນໂຮງງານ");
      return;
    }

    setSearching(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id,order_code,factory_bill_code,order_date,production_completed_at,short_qty,long_qty,free_qty,qty_3xl,qty_4xl,qty_5xl,status")
      .or(buildOrderLookupOrFilter(term))
      .order("order_date", { ascending: false })
      .limit(20);

    setSearching(false);

    if (error) {
      toast.error(`ຄົ້ນຫາຂໍ້ມູນບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    const orders = (data ?? []) as SearchOrderRow[];
    setResults(orders);

    if (orders.length === 0) {
      setLabelsByOrderId({});
      toast("ບໍ່ພົບອໍເດີ");
      return;
    }

    const { data: labelData, error: labelError } = await supabase
      .from("order_qr_labels")
      .select(ORDER_QR_LABEL_SELECT)
      .in("order_id", orders.map((item) => item.id));

    if (labelError) {
      toast.error(`ໂຫຼດ QR ເກົ່າບໍ່ສຳເລັດ: ${labelError.message}`);
      return;
    }

    const nextLabels: Record<string, QrLabelRow> = {};
    ((labelData ?? []) as QrLabelRow[]).forEach((label) => {
      nextLabels[label.order_id] = label;
    });
    setLabelsByOrderId(nextLabels);
  };

  const createLabel = async (order: SearchOrderRow) => {
    if (!order.factory_bill_code?.trim()) {
      toast.error(`ອໍເດີ ${order.order_code} ຍັງບໍ່ມີລະຫັດບິນໂຮງງານ`);
      return;
    }

    let qrCode = "";
    try {
      qrCode = buildOrderQrCode(order);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ສ້າງ QR ບໍ່ສຳເລັດ");
      return;
    }

    const payload = {
      order_id: order.id,
      qr_code: qrCode,
      order_code: order.order_code,
      factory_bill_code: order.factory_bill_code.trim(),
      label_status: labelsByOrderId[order.id]?.label_status || "created",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("order_qr_labels")
      .upsert(payload, { onConflict: "order_id" })
      .select(ORDER_QR_LABEL_SELECT)
      .single();

    if (error) {
      toast.error(`ສ້າງ QR ບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    const label = data as QrLabelRow;
    setLabelsByOrderId((prev) => ({ ...prev, [label.order_id]: label }));
    setRecentLabels((prev) => {
      const next = [label, ...prev.filter((item) => item.id !== label.id)];
      return next;
    });
    setSelectedLabelIds((prev) => (prev.includes(label.id) ? prev : [...prev, label.id]));
    await showLabelPreview(label);
    toast.success(`ສ້າງ QR ສຳເລັດສຳລັບ ${order.order_code}`);
  };

  const toggleLabelSelection = (labelId: string) => {
    setSelectedLabelIds((prev) => (prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId]));
  };

  const selectedLabels = useMemo(() => {
    const map = new Map<string, QrLabelRow>();
    Object.values(labelsByOrderId).forEach((label) => map.set(label.id, label));
    recentLabels.forEach((label) => map.set(label.id, label));
    return selectedLabelIds.map((id) => map.get(id)).filter(Boolean) as QrLabelRow[];
  }, [labelsByOrderId, recentLabels, selectedLabelIds]);

  const filteredRecentLabels = useMemo(() => {
    return recentLabels.filter((label) => {
      if (printFilter === "printed") return isLabelPrinted(label);
      if (printFilter === "unprinted") return !isLabelPrinted(label);
      return true;
    }).filter((label) => {
      const importedDate = toDateOnly(label.received_at);
      if (importedFromDate) {
        if (!importedDate || importedDate < importedFromDate) return false;
      }
      if (importedToDate) {
        if (!importedDate || importedDate > importedToDate) return false;
      }
      return true;
    });
  }, [importedFromDate, importedToDate, printFilter, recentLabels]);

  const totalRecentPages = Math.max(1, Math.ceil(filteredRecentLabels.length / pageSize));
  const currentRecentPage = Math.min(recentPage, totalRecentPages);

  const pagedRecentLabels = useMemo(() => {
    const from = (currentRecentPage - 1) * pageSize;
    return filteredRecentLabels.slice(from, from + pageSize);
  }, [currentRecentPage, filteredRecentLabels, pageSize]);

  const allVisibleRecentSelected =
    pagedRecentLabels.length > 0 && pagedRecentLabels.every((label) => selectedLabelIds.includes(label.id));

  const printedCount = useMemo(() => recentLabels.filter((label) => isLabelPrinted(label)).length, [recentLabels]);
  const unprintedCount = recentLabels.length - printedCount;
  const hasNextRecentPage = currentRecentPage < totalRecentPages;

  const downloadLabel = () => {
    if (!activePreviewUrl || !activeLabel) return;
    const link = document.createElement("a");
    link.href = activePreviewUrl;
    link.download = `${activeLabel.order_code}-qr-label.png`;
    link.click();
  };

  const printSelectedLabels = async () => {
    if (selectedLabels.length === 0) {
      toast.error("ກະລຸນາເລືອກ QR ຢ່າງໜ້ອຍ 1 ລາຍການ");
      return;
    }
    const confirmed = window.confirm(
      `ຕ້ອງການພິມ ${selectedLabels.length} QR ແລະ ບັນທຶກສະຖານະວ່າພິມແລ້ວ ຫຼື ບໍ່?`
    );
    if (!confirmed) return;

    setPrinting(true);
    const nextPreviewUrls = { ...previewUrls };
    for (const label of selectedLabels) {
      if (!nextPreviewUrls[label.id]) {
        nextPreviewUrls[label.id] = await generatePreviewDataUrl(label.qr_code);
      }
    }
    setPreviewUrls(nextPreviewUrls);

    const popup = window.open("", "_blank", "width=960,height=1200");
    if (!popup) {
      setPrinting(false);
      toast.error("ບໍ່ສາມາດເປີດໜ້າພິມໄດ້");
      return;
    }

    popup.document.write(getOrderQrPrintHtml(selectedLabels, nextPreviewUrls));
    popup.document.close();
    popup.focus();
    popup.print();

    const printedAt = new Date().toISOString();
    const printedBy = currentPrinter.trim() || null;
    const updates = selectedLabels.map((label) => {
      const nextPrintCount = (Number(label.print_count) || 0) + 1;
      return supabase
        .from("order_qr_labels")
        .update({
          printed_at: label.printed_at || printedAt,
          printed_by: printedBy,
          print_count: nextPrintCount,
          last_printed_at: printedAt,
          updated_at: printedAt,
        })
        .eq("id", label.id);
    });

    const updateResults = await Promise.all(updates);
    setPrinting(false);

    const updateError = updateResults.find((result) => result.error)?.error;
    if (updateError) {
      toast.error(`ພິມໄດ້ ແຕ່ບັນທຶກສະຖານະການພິມບໍ່ສຳເລັດ: ${updateError.message}`);
      return;
    }

    setRecentLabels((prev) =>
      prev.map((label) => {
        const selected = selectedLabels.find((item) => item.id === label.id);
        if (!selected) return label;
        return {
          ...label,
          printed_at: label.printed_at || printedAt,
          printed_by: printedBy,
          print_count: (Number(label.print_count) || 0) + 1,
          last_printed_at: printedAt,
          updated_at: printedAt,
        };
      })
    );
    setLabelsByOrderId((prev) => {
      const next = { ...prev };
      selectedLabels.forEach((label) => {
        const existing = next[label.order_id];
        if (!existing) return;
        next[label.order_id] = {
          ...existing,
          printed_at: existing.printed_at || printedAt,
          printed_by: printedBy,
          print_count: (Number(existing.print_count) || 0) + 1,
          last_printed_at: printedAt,
          updated_at: printedAt,
        };
      });
      return next;
    });
    setActiveLabel((prev) =>
      prev && selectedLabelIds.includes(prev.id)
        ? {
            ...prev,
            printed_at: prev.printed_at || printedAt,
            printed_by: printedBy,
            print_count: (Number(prev.print_count) || 0) + 1,
            last_printed_at: printedAt,
            updated_at: printedAt,
          }
        : prev
    );
    toast.success(`ບັນທຶກການພິມ ${selectedLabels.length} QR ສຳເລັດ`);
  };

  const toggleSelectAllRecent = () => {
    if (pagedRecentLabels.length === 0) return;

    if (allVisibleRecentSelected) {
      setSelectedLabelIds((prev) => prev.filter((id) => !pagedRecentLabels.some((label) => label.id === id)));
      return;
    }

    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      pagedRecentLabels.forEach((label) => next.add(label.id));
      return Array.from(next);
    });
  };

  const deleteLabel = async (label: QrLabelRow) => {
    const confirmed = window.confirm(`ຕ້ອງການລຶບ QR ຂອງ ${label.order_code} ແທ້ບໍ?`);
    if (!confirmed) return;

    const { error } = await supabase.from("order_qr_labels").delete().eq("id", label.id);

    if (error) {
      toast.error(`ລຶບ QR ບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    setRecentLabels((prev) => prev.filter((item) => item.id !== label.id));
    setLabelsByOrderId((prev) => {
      const next = { ...prev };
      if (next[label.order_id]?.id === label.id) {
        delete next[label.order_id];
      }
      return next;
    });
    setSelectedLabelIds((prev) => prev.filter((id) => id !== label.id));
    setPreviewUrls((prev) => {
      const next = { ...prev };
      delete next[label.id];
      return next;
    });
    if (activeLabel?.id === label.id) {
      setActiveLabel(null);
      setActivePreviewUrl("");
    }
    toast.success(`ລຶບ QR ຂອງ ${label.order_code} ສຳເລັດ`);
  };

  const selectedOrder = useMemo(() => {
    if (!activeLabel) return null;
    return results.find((item) => item.id === activeLabel.order_id) ?? null;
  }, [activeLabel, results]);

  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.25em]">
              <QrCode size={14} />
              ສ້າງ QR
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">ສ້າງ QR ຂອງຮ້ານທີ່ລິ້ງກັບລະຫັດບິນໂຮງງານ</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-200">
              ຄົ້ນຫາດ້ວຍລະຫັດບິນໂຮງງານ ຫຼື ລະຫັດອໍເດີ, ສ້າງ QR ຂອງຮ້ານຈາກລະຫັດບິນໂຮງງານ ແລ້ວ ຮວບຮວມຫຼາຍ QR ເພື່ອພິມເປັນກຸ່ມໃນຄັ້ງດຽວ.
            </p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-slate-100">
            QR ຂອງຮ້ານຈະໃຊ້ລະຫັດບິນໂຮງງານດຽວກັນກັບ QR ຂອງໂຮງງານ
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr]">
        <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void searchOrders();
                }}
                placeholder="ຄົ້ນຫາລະຫັດອໍເດີ ຫຼື ລະຫັດບິນໂຮງງານ"
                className="w-full rounded-2xl border border-slate-200 py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => void searchOrders()}
              disabled={searching}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              <Search size={18} />
              {searching ? "ກຳລັງຄົ້ນຫາ..." : "ຄົ້ນຫາ"}
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {results.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm font-medium text-slate-500">
                ຄົ້ນຫາອໍເດີເພື່ອສ້າງ QR.
              </div>
            ) : (
              results.map((order) => {
                const label = labelsByOrderId[order.id];
                const isSelected = label ? selectedLabelIds.includes(label.id) : false;
                return (
                  <div key={order.id} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-lg font-black text-slate-900">{order.order_code}</div>
                        <div className="mt-1 text-sm font-medium text-slate-500">
                          ລະຫັດບິນໂຮງງານ: {order.factory_bill_code?.trim() || "-"} • ຈຳນວນ: {getTotalUnits(order)}
                        </div>
                        <div className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          ຜະລິດສຳເລັດ: {formatDateTime(order.production_completed_at)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {label && (
                          <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleLabelSelection(label.id)} />
                            ເລືອກ
                          </label>
                        )}
                        {label && (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                            {label.label_status}
                          </span>
                        )}
                        {label && (
                          <span className={`rounded-full border px-3 py-1 text-xs font-black ${getPrintStatusStyles(label)}`}>
                            {getPrintStatusLabel(label)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => void createLabel(order)}
                          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800"
                        >
                          <RefreshCw size={16} />
                          {label ? "ອັບເດດ QR" : "ສ້າງ QR"}
                        </button>
                        {label && (
                          <button
                            type="button"
                            onClick={() => void showLabelPreview(label)}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-100"
                          >
                            ເບິ່ງຕົວຢ່າງ
                          </button>
                        )}
                      </div>
                    </div>
                    {!order.factory_bill_code?.trim() && (
                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                        ກະລຸນາເພີ່ມລະຫັດບິນໂຮງງານໃຫ້ອໍເດີນີ້ກ່ອນສ້າງ QR ໃໝ່ຂອງຮ້ານ.
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-black text-slate-900">ຕົວຢ່າງ QR</div>
              <div className="text-sm font-medium text-slate-500">ດາວໂຫຼດສະຕິກເກີແບບດ່ຽວ ຫຼື ພິມຫຼາຍລາຍການພ້ອມກັນດ້ານລຸ່ມ</div>
            </div>
            <button
              type="button"
              onClick={downloadLabel}
              disabled={!activePreviewUrl}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Download size={16} />
              ດາວໂຫຼດ PNG
            </button>
          </div>

          {activeLabel ? (
            <div className="mt-5 rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5">
              <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white p-5 shadow-inner">
                <div className="text-center text-xs font-black uppercase tracking-[0.35em] text-slate-400">ສະຕິກເກີ QR BG SPORT</div>
                <div className="mt-4 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={activePreviewUrl} alt={activeLabel.order_code} className="h-56 w-56 rounded-2xl border border-slate-100 object-contain p-3 shadow-sm" />
                </div>
                <div className="mt-4 text-center">
                  <div className="text-2xl font-black tracking-tight text-slate-950">{activeLabel.order_code}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">ລະຫັດບິນໂຮງງານ: {activeLabel.factory_bill_code?.trim() || "-"}</div>
                  <div className="mt-2 break-all text-xs font-semibold text-slate-400">{activeLabel.qr_code}</div>
                </div>
              </div>

              {selectedOrder && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ຈຳນວນ</div>
                    <div className="mt-1 text-2xl font-black text-slate-900">{getTotalUnits(selectedOrder)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ສະຖານະ</div>
                    <div className="mt-1 text-2xl font-black text-slate-900">{activeLabel.label_status}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:col-span-2">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ສະຖານະການພິມ</div>
                    <div className="mt-1 text-lg font-black text-slate-900">{getPrintStatusLabel(activeLabel)}</div>
                    <div className="mt-1 text-sm font-medium text-slate-500">
                      ພິມລ່າສຸດ: {formatDateTime(activeLabel.last_printed_at)} {activeLabel.printed_by ? `• ${activeLabel.printed_by}` : ""}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm font-medium text-slate-500">
              ສ້າງ QR ຫຼື ເປີດ QR ເພື່ອເບິ່ງຕົວຢ່າງທີ່ນີ້.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-lg font-black text-slate-900">ລາຍການພິມແບບກຸ່ມ</div>
            <div className="text-sm font-medium text-slate-500">
              ເລືອກແລ້ວ {selectedLabels.length} QR • ຍັງບໍ່ພິມ {unprintedCount} • ພິມແລ້ວ {printedCount} • ສະແດງ {pagedRecentLabels.length} / {filteredRecentLabels.length} ລາຍການ
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="date"
              value={importedFromDate}
              onChange={(e) => {
                setImportedFromDate(e.target.value);
                setRecentPage(1);
              }}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              value={importedToDate}
              onChange={(e) => {
                setImportedToDate(e.target.value);
                setRecentPage(1);
              }}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={printFilter}
              onChange={(e) => {
                setPrintFilter(e.target.value as PrintFilter);
                setRecentPage(1);
              }}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">ທັງໝົດ</option>
              <option value="unprinted">ຍັງບໍ່ພິມ</option>
              <option value="printed">ພິມແລ້ວ</option>
            </select>
            <button
              type="button"
              onClick={toggleSelectAllRecent}
              disabled={pagedRecentLabels.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              {allVisibleRecentSelected ? "ຍົກເລີກເລືອກທັງໝົດ" : "ເລືອກທັງໝົດ"}
            </button>
            <button
              type="button"
              onClick={() => void printSelectedLabels()}
              disabled={printing || selectedLabels.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              <Printer size={16} />
              {printing ? "ກຳລັງຈັດໜ້າ..." : "ພິມລາຍການທີ່ເລືອກ"}
            </button>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-3 font-bold">ເລືອກ</th>
                <th className="px-3 py-3 font-bold">ອໍເດີ</th>
                <th className="px-3 py-3 font-bold">ບິນໂຮງງານ</th>
                <th className="px-3 py-3 font-bold">ສະຖານະ</th>
                <th className="px-3 py-3 font-bold">ວັນທີນຳເຂົ້າ</th>
                <th className="px-3 py-3 font-bold">ສ້າງເມື່ອ</th>
                <th className="px-3 py-3 font-bold">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecentLabels.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center font-medium text-slate-500">
                    ບໍ່ພົບ QR ຕາມ filter ການພິມ ຫຼື ວັນທີນຳເຂົ້ານີ້.
                  </td>
                </tr>
              ) : (
                pagedRecentLabels.map((label) => (
                  <tr key={label.id} className="border-b border-slate-100">
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selectedLabelIds.includes(label.id)} onChange={() => toggleLabelSelection(label.id)} />
                    </td>
                    <td className="px-3 py-3 font-bold text-slate-900">{label.order_code}</td>
                    <td className="px-3 py-3 text-slate-600">{label.factory_bill_code?.trim() || "-"}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-600">{label.label_status}</span>
                        <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-black ${getPrintStatusStyles(label)}`}>
                          {getPrintStatusLabel(label)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      {formatDateTime(label.received_at)}
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      <div>{formatDateTime(label.created_at)}</div>
                      <div className="text-xs">
                        ພິມລ່າສຸດ: {formatDateTime(label.last_printed_at)}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void showLabelPreview(label)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-bold text-slate-700 transition hover:bg-slate-100"
                        >
                          ເບິ່ງຕົວຢ່າງ
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteLabel(label)}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 font-bold text-rose-700 transition hover:bg-rose-100"
                        >
                          ລຶບ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 md:flex-row md:items-center md:justify-between">
          <div className="text-xs font-bold uppercase tracking-tighter text-slate-400">ໜ້າ {currentRecentPage} / {totalRecentPages}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRecentPage((page) => Math.max(1, Math.min(page, totalRecentPages) - 1))}
              disabled={currentRecentPage <= 1}
              className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-40"
            >
              ← ກ່ອນໜ້າ
            </button>
            <button
              type="button"
              onClick={() => setRecentPage((page) => Math.min(totalRecentPages, page + 1))}
              disabled={!hasNextRecentPage}
              className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-40"
            >
              ຖັດໄປ →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
