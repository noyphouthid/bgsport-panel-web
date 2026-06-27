"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ClipboardList, RotateCcw, Search, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { canAccessPath, type AppRole } from "@/lib/access-control";
import {
  canManageAllTransportNotes,
  getTransportNoteDisplayNo,
  isTransportNotePrinted,
  type TransportNoteRow,
} from "@/lib/transport-notes";
import type { ShipmentDeliveryRequestRow } from "@/lib/shipment-delivery-requests";

type OrderRow = {
  id: string;
  order_code: string;
  factory_bill_code: string | null;
  shipment_status: "pending" | "shipped";
  shipment_completed_at: string | null;
};

type UserRow = {
  id: string;
  full_name: string;
  email: string | null;
  auth_user_id: string | null;
  role?: AppRole;
};

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

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPrintStatusLabel(row: Pick<TransportNoteRow, "print_count" | "printed_at" | "last_printed_at">) {
  return isTransportNotePrinted(row)
    ? `ພິມແລ້ວ ${Math.max(1, Number(row.print_count) || 0)} ຄັ້ງ`
    : "ຍັງບໍ່ພິມ";
}

function getPrintStatusStyles(row: Pick<TransportNoteRow, "print_count" | "printed_at" | "last_printed_at">) {
  return isTransportNotePrinted(row)
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

export default function ShipmentDepositsPage() {
  const today = useMemo(() => toLocalDateInputValue(), []);
  const [rows, setRows] = useState<TransportNoteRow[]>([]);
  const [ordersById, setOrdersById] = useState<Record<string, OrderRow>>({});
  const [usersById, setUsersById] = useState<Record<string, UserRow>>({});
  const [query, setQuery] = useState("");
  const [adminFilter, setAdminFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: noteData, error: noteError }, { data: sessionData }, { data: userData, error: userError }] = await Promise.all([
      supabase
        .from("transport_notes")
        .select("*")
        .not("transport_deposited_at", "is", null)
        .order("transport_deposited_at", { ascending: false }),
      supabase.auth.getSession(),
      supabase.from("users").select("id,full_name,email,auth_user_id,role"),
    ]);

    if (noteError) {
      setLoading(false);
      toast.error(`ໂຫຼດລາຍການຝາກສຳເລັດບໍ່ສຳເລັດ: ${noteError.message}`);
      return;
    }
    if (userError) {
      setLoading(false);
      toast.error(`ໂຫຼດຜູ້ໃຊ້ບໍ່ສຳເລັດ: ${userError.message}`);
      return;
    }

    const noteRows = (noteData ?? []) as TransportNoteRow[];
    setRows(noteRows);

    const allUsers = (userData ?? []) as UserRow[];
    setUsersById(Object.fromEntries(allUsers.map((user) => [user.id, user])));

    const orderIds = [...new Set(noteRows.map((row) => row.order_id).filter((value): value is string => Boolean(value)))];
    if (orderIds.length > 0) {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("id,order_code,factory_bill_code,shipment_status,shipment_completed_at")
        .in("id", orderIds);
      if (orderError) {
        setLoading(false);
        toast.error(`ໂຫຼດອໍເດີບໍ່ສຳເລັດ: ${orderError.message}`);
        return;
      }
      setOrdersById(Object.fromEntries(((orderData ?? []) as OrderRow[]).map((item) => [item.id, item])));
    } else {
      setOrdersById({});
    }

    const authUserId = sessionData.session?.user.id ?? null;
    const sessionEmail = String(sessionData.session?.user.email || "").trim().toLowerCase();
    const matchedUser =
      (allUsers.find(
        (item) => item.auth_user_id === authUserId || (!!sessionEmail && String(item.email || "").trim().toLowerCase() === sessionEmail)
      ) as UserRow | undefined) || null;
    setViewerUserId(String(matchedUser?.id || ""));
    setViewerRole((matchedUser?.role as AppRole | null) || null);
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const adminOptions = useMemo(() => {
    const usedIds = new Set(rows.map((row) => row.created_by_user_id).filter((value): value is string => Boolean(value)));
    return Array.from(usedIds)
      .map((id) => usersById[id])
      .filter((user): user is UserRow => Boolean(user))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [rows, usersById]);

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!canManageAllTransportNotes(viewerRole) && row.created_by_user_id !== viewerUserId) return false;
      if (adminFilter !== "all" && row.created_by_user_id !== adminFilter) return false;

      const depositedDate = toDateOnly(row.transport_deposited_at || row.created_at);
      if (fromDate && (!depositedDate || depositedDate < fromDate)) return false;
      if (toDate && (!depositedDate || depositedDate > toDate)) return false;

      if (!keyword) return true;
      const order = row.order_id ? ordersById[row.order_id] : null;
      const creator = row.created_by_user_id ? usersById[row.created_by_user_id] : null;
      return [
        row.note_no,
        row.receiver_name,
        row.receiver_phone,
        row.branch || "",
        row.city || "",
        row.province || "",
        row.transporters.join(" "),
        row.transport_deposited_by || "",
        row.note || "",
        order?.order_code || "",
        order?.factory_bill_code || "",
        creator?.full_name || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [adminFilter, fromDate, ordersById, query, rows, toDate, usersById, viewerRole, viewerUserId]);

  const revertDeposit = async (row: TransportNoteRow) => {
    if (!row.transport_deposit_receipt_id || !row.delivery_request_id || !row.order_id) {
      toast.error("ບໍ່ພົບຂໍ້ມູນການຝາກທີ່ຈະຍ້ອນ");
      return;
    }

    const confirmed = window.confirm(`ຕ້ອງການຍ້ອນການຝາກຂອງ ${getTransportNoteDisplayNo(row, ordersById[row.order_id]?.order_code || null)} ແທ້ບໍ?`);
    if (!confirmed) return;

    setRevertingId(row.id);

    const [{ data: orderData, error: orderError }, { data: requestData, error: requestError }] = await Promise.all([
      supabase
        .from("orders")
        .select("id,shipment_status,shipment_completed_at")
        .eq("id", row.order_id)
        .maybeSingle(),
      supabase
        .from("shipment_delivery_requests")
        .select("id,status")
        .eq("id", row.delivery_request_id)
        .maybeSingle(),
    ]);

    if (orderError) {
      setRevertingId(null);
      toast.error(`ໂຫຼດສະຖານະອໍເດີບໍ່ສຳເລັດ: ${orderError.message}`);
      return;
    }
    if (requestError) {
      setRevertingId(null);
      toast.error(`ໂຫຼດສະຖານະຄຳຂໍຈັດສົ່ງບໍ່ສຳເລັດ: ${requestError.message}`);
      return;
    }

    const order = (orderData as OrderRow | null) ?? null;
    const request = (requestData as Pick<ShipmentDeliveryRequestRow, "id" | "status"> | null) ?? null;
    if (order?.shipment_status === "shipped" || order?.shipment_completed_at) {
      setRevertingId(null);
      toast.error("ບໍ່ສາມາດຍ້ອນໄດ້ ເພາະອໍເດີຖືກຈັດສົ່ງສຳເລັດແລ້ວ");
      return;
    }
    if (request?.status === "delivered" || request?.status === "cancelled") {
      setRevertingId(null);
      toast.error("ບໍ່ສາມາດຍ້ອນໄດ້ ເພາະຄຳຂໍນີ້ຖືກປິດແລ້ວ");
      return;
    }

    const { error: deleteItemError } = await supabase
      .from("transport_deposit_receipt_items")
      .delete()
      .eq("transport_note_id", row.id);
    if (deleteItemError) {
      setRevertingId(null);
      toast.error(`ລຶບລາຍການຝາກບໍ່ສຳເລັດ: ${deleteItemError.message}`);
      return;
    }

    const { error: noteUpdateError } = await supabase
      .from("transport_notes")
      .update({
        transport_deposited_at: null,
        transport_deposited_by: null,
        transport_deposit_receipt_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (noteUpdateError) {
      setRevertingId(null);
      toast.error(`ຍ້ອນສະຖານະໃບຝາກບໍ່ສຳເລັດ: ${noteUpdateError.message}`);
      return;
    }

    const { count, error: countError } = await supabase
      .from("transport_deposit_receipt_items")
      .select("id", { count: "exact", head: true })
      .eq("receipt_id", row.transport_deposit_receipt_id);
    if (!countError && Number(count || 0) === 0) {
      await supabase.from("transport_deposit_receipts").delete().eq("id", row.transport_deposit_receipt_id);
    }

    const { error: requestUpdateError } = await supabase
      .from("shipment_delivery_requests")
      .update({
        status: "draft",
        approved_at: null,
        approved_by_user_id: null,
        delivered_at: null,
        delivered_by_user_id: null,
        rejected_at: null,
        rejected_by_user_id: null,
        rejection_note: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.delivery_request_id);
    if (requestUpdateError) {
      setRevertingId(null);
      toast.error(`ຍ້ອນສະຖານະຄຳຂໍບໍ່ສຳເລັດ: ${requestUpdateError.message}`);
      return;
    }

    setRows((prev) => prev.filter((item) => item.id !== row.id));
    setRevertingId(null);
    toast.success("ຍ້ອນການຝາກສຳເລັດ");
  };

  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.25em]">
              <ClipboardList size={14} />
              ບິນຝາກສຳເລັດ
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">ລາຍການບິນຝາກເຄື່ອງສຳເລັດ</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-emerald-50">
              ລາຍການນີ້ຈະສະແດງສະເພາະໃບຝາກທີ່ຖືກຢືນຢັນຝາກຂົນສົ່ງແລ້ວ ເພື່ອແຍກອອກຈາກໜ້າ `shipments/notes` ໃຫ້ຊັດເຈນ.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/shipments/deposits/scan" className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/20">
              ໜ້າສະແກນຢືນຢັນຝາກ
            </Link>
            <Link href="/shipments/approvals" className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/20">
              ອະນຸມັດສົ່ງມອບ
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[1.4fr_180px_180px_180px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ຄົ້ນຫາລະຫັດໃບ, ອໍເດີ, ຜູ້ຮັບ, ຜູ້ຝາກ..."
              className="w-full rounded-2xl border border-slate-200 py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
          {canManageAllTransportNotes(viewerRole) ? (
            <select value={adminFilter} onChange={(e) => setAdminFilter(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="all">ທຸກຜູ້ສ້າງ</option>
              {adminOptions.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.full_name}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
              {viewerUserId ? usersById[viewerUserId]?.full_name || "-" : "-"}
            </div>
          )}
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-4">
          <div className="text-sm font-black text-slate-700">ລາຍການບິນຝາກສຳເລັດ</div>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            {loading ? "Loading..." : `${filteredRows.length} Deposits`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-700">
                <th className="p-4 text-left font-bold uppercase tracking-widest">ໃບບິນ</th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ອໍເດີ</th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ຜູ້ຮັບ</th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ຂົນສົ່ງ</th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ຝາກສຳເລັດ</th>
                <th className="p-4 text-center font-bold uppercase tracking-widest">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center font-medium text-slate-400">ບໍ່ພົບລາຍການຝາກສຳເລັດ</td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const order = row.order_id ? ordersById[row.order_id] : null;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="p-4">
                        <div className="font-black text-slate-900">{getTransportNoteDisplayNo(row, order?.order_code)}</div>
                        <div className="mt-1 text-xs font-medium text-slate-500">{row.source_type === "shipment_request" ? "ຈາກ shipment" : "standalone"}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-black text-slate-900">{order?.order_code || "-"}</div>
                        <div className="mt-1 text-xs font-medium text-slate-500">{order?.factory_bill_code?.trim() || "-"}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-700">{row.receiver_name}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.receiver_phone}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {[row.branch, row.city, row.province].filter(Boolean).join(" / ") || "-"}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-700">{row.transporters.join(", ") || "-"}</div>
                        <div className="mt-2 text-xs text-slate-500">
                          <span className={`rounded-full border px-2 py-1 ${getPrintStatusStyles(row)}`}>{getPrintStatusLabel(row)}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-700">{formatDateTime(row.transport_deposited_at)}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.transport_deposited_by || "-"}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.note || "-"}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {viewerRole && canAccessPath("/shipments/transport-note", viewerRole) ? (
                            <Link href={`/shipments/transport-note?id=${row.id}`} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 transition hover:bg-slate-200">
                              <Truck size={14} />
                              ເບິ່ງໃບ
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void revertDeposit(row)}
                            disabled={revertingId === row.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                          >
                            <RotateCcw size={14} />
                            {revertingId === row.id ? "ກຳລັງຍ້ອນ..." : "ຍ້ອນການຝາກ"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
