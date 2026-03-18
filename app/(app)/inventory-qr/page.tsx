"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import toast from "react-hot-toast";
import { Download, QrCode, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { buildOrderQrCode, formatDateTime, getTotalUnits, type OrderSummary, type QrLabelRow } from "@/lib/inventory-qr";

type SearchOrderRow = OrderSummary;

export default function InventoryQrPage() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchOrderRow[]>([]);
  const [labelsByOrderId, setLabelsByOrderId] = useState<Record<string, QrLabelRow>>({});
  const [activeLabel, setActiveLabel] = useState<QrLabelRow | null>(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState("");
  const [recentLabels, setRecentLabels] = useState<QrLabelRow[]>([]);

  const loadRecentLabels = async () => {
    const { data, error } = await supabase
      .from("order_qr_labels")
      .select("id,order_id,qr_code,order_code,factory_bill_code,label_status,received_at,received_by,shipped_at,shipped_by,last_scanned_at,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      toast.error(`ໂຫຼດຂໍ້ມູນ QR ບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }
    setRecentLabels((data ?? []) as QrLabelRow[]);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadRecentLabels();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const searchOrders = async () => {
    const term = query.trim();
    if (!term) {
      toast.error("ກະລຸນາປ້ອນລະຫັດອໍເດີ ຫຼື ລະຫັດບິນໂຮງງານ");
      return;
    }

    setSearching(true);
    const escaped = term.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const { data, error } = await supabase
      .from("orders")
      .select("id,order_code,factory_bill_code,order_date,production_completed_at,short_qty,long_qty,free_qty,qty_3xl,qty_4xl,qty_5xl,status")
      .or(`order_code.ilike.%${escaped}%,factory_bill_code.ilike.%${escaped}%`)
      .order("order_date", { ascending: false })
      .limit(12);

    setSearching(false);

    if (error) {
      toast.error(`ຄົ້ນຫາບໍ່ສຳເລັດ: ${error.message}`);
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
      .select("id,order_id,qr_code,order_code,factory_bill_code,label_status,received_at,received_by,shipped_at,shipped_by,last_scanned_at,created_at,updated_at")
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

  const generatePreview = async (label: QrLabelRow) => {
    const dataUrl = await QRCode.toDataURL(label.qr_code, {
      width: 720,
      margin: 2,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    });
    setActiveLabel(label);
    setActivePreviewUrl(dataUrl);
  };

  const createLabel = async (order: SearchOrderRow) => {
    const qrCode = buildOrderQrCode(order);
    const payload = {
      order_id: order.id,
      qr_code: qrCode,
      order_code: order.order_code,
      factory_bill_code: order.factory_bill_code || null,
      label_status: labelsByOrderId[order.id]?.label_status || "created",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("order_qr_labels")
      .upsert(payload, { onConflict: "order_id" })
      .select("id,order_id,qr_code,order_code,factory_bill_code,label_status,received_at,received_by,shipped_at,shipped_by,last_scanned_at,created_at,updated_at")
      .single();

    if (error) {
      toast.error(`ສ້າງ QR ບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    const label = data as QrLabelRow;
    setLabelsByOrderId((prev) => ({ ...prev, [label.order_id]: label }));
    await generatePreview(label);
    await loadRecentLabels();
    toast.success(`ສ້າງ QR ສຳເລັດສຳລັບ ${order.order_code}`);
  };

  const downloadLabel = () => {
    if (!activePreviewUrl || !activeLabel) return;
    const link = document.createElement("a");
    link.href = activePreviewUrl;
    link.download = `${activeLabel.order_code}-qr-label.png`;
    link.click();
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
            <h1 className="mt-4 text-3xl font-black tracking-tight">ສ້າງສະຕິກເກີ QR ສຳລັບຮັບສິນຄ້າເຂົ້າຮ້ານ</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-200">
              ຄົ້ນຫາດ້ວຍລະຫັດອໍເດີ ຫຼື ລະຫັດບິນໂຮງງານ, ສ້າງ QR ສຳລັບພິມ ແລະ ດາວໂຫຼດເປັນໄຟລ໌ PNG ໄວ້ແນບໃບບິນ ຫຼື ພິມຜ່ານເຄື່ອງພິມຄວາມຮ້ອນ.
            </p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-slate-100">
            ສະຕິກເກີຈະສະແດງ: QR + ລະຫັດອໍເດີ + ລະຫັດບິນໂຮງງານ
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
              {searching ? "ກຳລັງຄົ້ນຫາ..." : "ຄົ້ນຫາອໍເດີ"}
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
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                            {label.label_status}
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
                            onClick={() => void generatePreview(label)}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-100"
                          >
                            ເບິ່ງຕົວຢ່າງ
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-black text-slate-900">ຕົວຢ່າງສະຕິກເກີ</div>
              <div className="text-sm font-medium text-slate-500">ດາວໂຫຼດ PNG ສຳລັບໃບບິນ ແລະ ເຄື່ອງພິມຄວາມຮ້ອນ</div>
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
                <div className="text-center text-xs font-black uppercase tracking-[0.35em] text-slate-400">ສະຕິກເກີຮັບສິນຄ້າ BG Sport</div>
                <div className="mt-4 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={activePreviewUrl} alt={activeLabel.order_code} className="h-56 w-56 rounded-2xl border border-slate-100 object-contain p-3 shadow-sm" />
                </div>
                <div className="mt-4 text-center">
                  <div className="text-2xl font-black tracking-tight text-slate-950">{activeLabel.order_code}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">ລະຫັດບິນໂຮງງານ: {activeLabel.factory_bill_code?.trim() || "-"}</div>
                  <div className="mt-2 text-xs font-semibold text-slate-400">{activeLabel.qr_code}</div>
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
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm font-medium text-slate-500">
              ສ້າງ QR ເພື່ອເບິ່ງຕົວຢ່າງສະຕິກເກີສຳລັບພິມທີ່ນີ້.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-black text-slate-900">QR ລ່າສຸດ</div>
            <div className="text-sm font-medium text-slate-500">ລາຍການ QR ທີ່ສ້າງຫຼ້າສຸດໃນລະບົບ</div>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {recentLabels.map((label) => (
            <button
              type="button"
              key={label.id}
              onClick={() => void generatePreview(label)}
              className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:bg-slate-100"
            >
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{label.label_status}</div>
              <div className="mt-2 text-lg font-black text-slate-900">{label.order_code}</div>
              <div className="text-sm font-medium text-slate-500">{label.factory_bill_code?.trim() || "-"}</div>
              <div className="mt-3 text-xs font-semibold text-slate-400">{formatDateTime(label.created_at)}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
