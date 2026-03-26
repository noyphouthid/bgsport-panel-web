"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Swal from "sweetalert2";
import { FilePlus2, PencilLine, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import {
  canApproveFactoryDepositOrder,
  canConvertFactoryDepositOrder,
  canDeleteFactoryDepositOrder,
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
};

type UserRow = {
  id: string;
  auth_user_id: string | null;
  role: AppRole;
};

function getPrimaryDocumentCode(row: Pick<DepositRow, "quotation_quote_no" | "order_code" | "deposit_no">) {
  return row.quotation_quote_no?.trim() || row.order_code?.trim() || row.deposit_no.trim();
}

function getSecondaryDocumentCode(row: Pick<DepositRow, "quotation_quote_no" | "order_code" | "deposit_no">) {
  const primary = getPrimaryDocumentCode(row);
  const candidates = [row.order_code?.trim(), row.deposit_no.trim()].filter((value): value is string => Boolean(value && value !== primary));
  return candidates.join(" / ");
}

function toLocalDateInputValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

export default function FactoryDepositOrdersPage() {
  const today = useMemo(() => toLocalDateInputValue(), []);
  const [rows, setRows] = useState<DepositRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState<FactoryDepositOrderStatus | "all">("all");
  const [workingId, setWorkingId] = useState<string | null>(null);

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
      if (fromDate && row.deposit_date < fromDate) return false;
      if (toDate && row.deposit_date > toDate) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!keyword) return true;
      return [row.deposit_no, row.order_code || "", row.quotation_quote_no || "", row.customer_name || "", row.factory_bill_code || ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [fromDate, query, rows, statusFilter, toDate]);

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
        <div className="mb-4 grid gap-3 md:grid-cols-[180px,180px,220px,1fr,180px]">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
          />
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
                <th className="p-3 text-right text-[11px] font-black uppercase">ຍອດສຸດທິ</th>
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
                    <td className="p-3 text-right font-black text-emerald-700">{Number(row.net_total).toLocaleString()}</td>
                    <td className="p-3 text-center">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${FACTORY_DEPOSIT_ORDER_STATUS_STYLES[row.status]}`}>
                        {FACTORY_DEPOSIT_ORDER_STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center justify-center gap-2">
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
    </div>
  );
}
