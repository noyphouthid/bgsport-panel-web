"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import Swal from "sweetalert2";
import { supabase } from "@/lib/supabase";
import {
  buildFallbackOrderCodeTypeRows,
  isMissingOrderCodeTypesTableError,
  isProtectedOrderCodeType,
  seedDefaultOrderCodeTypes,
  type OrderCodeTypeRow,
} from "@/lib/order-code-options";
import { normalizeOrderType } from "@/lib/order-code";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

function getSupabaseErrorMessage(error: unknown, fallback = "unknown_error") {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [maybe.message, maybe.details, maybe.hint, maybe.code]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .map((value) => String(value).trim());
    if (parts.length > 0) return parts.join(" | ");
  }
  return fallback;
}

export default function OrderCodeTypesPage() {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = useState<OrderCodeTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [usingFallbackRows, setUsingFallbackRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newSortOrder, setNewSortOrder] = useState(100);
  const [newActive, setNewActive] = useState(true);

  const [editing, setEditing] = useState<OrderCodeTypeRow | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(100);
  const [editActive, setEditActive] = useState(true);
  const { markClean } = useUnsavedChangesGuard({ scopeRef: pageRef, enabled: !loading });
  const editingProtected = editing ? isProtectedOrderCodeType(editing.code) : false;

  const fetchPersistedRows = async () => {
    const { data, error } = await supabase
      .from("order_code_types")
      .select("id,code,label,sort_order,is_active,is_system,created_at,updated_at")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true });

    if (error) throw error;

    return ((data ?? []) as OrderCodeTypeRow[]).map((row) => ({
      ...row,
      code: normalizeOrderType(row.code),
    }));
  };

  const load = async () => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    setTableMissing(false);
    setUsingFallbackRows(false);

    try {
      let nextRows: OrderCodeTypeRow[] = [];

      try {
        nextRows = await fetchPersistedRows();
      } catch (error) {
        if (error instanceof Error && isMissingOrderCodeTypesTableError(error.message)) {
          setTableMissing(true);
          setUsingFallbackRows(true);
          setRows(buildFallbackOrderCodeTypeRows());
          setNotice("ຖານຂໍ້ມູນຍັງບໍ່ມີຕາຕະລາງປະເພດລະຫັດ ຈຶ່ງສະແດງລາຍການ default ຊົ່ວຄາວ ແລະຍັງແກ້ໄຂບໍ່ໄດ້");
          return;
        }

        throw error;
      }

      if (nextRows.length === 0) {
        try {
          await seedDefaultOrderCodeTypes();
          nextRows = await fetchPersistedRows();
          if (nextRows.length > 0) {
            setNotice("ລະບົບໄດ້ສ້າງລາຍການ default ເຂົ້າຖານຂໍ້ມູນໃຫ້ແລ້ວ");
          }
        } catch (error) {
          const message = getSupabaseErrorMessage(error, "seed_default_order_code_types_failed");
          setErr(message);
          setUsingFallbackRows(true);
          setRows(buildFallbackOrderCodeTypeRows());
          setNotice("ຕາຕະລາງປະເພດລະຫັດຍັງບໍ່ມີຂໍ້ມູນ ແລະການ seed ຈາກ Supabase ບໍ່ສຳເລັດ ຈຶ່ງສະແດງລາຍການ default ຊົ່ວຄາວ");
          return;
        }
      }

      setRows(nextRows);
    } catch (error) {
      const message = getSupabaseErrorMessage(error, "load_failed");
      setErr(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeEdit = () => {
    setEditing(null);
    setEditCode("");
    setEditLabel("");
    setEditSortOrder(100);
    setEditActive(true);
  };

  const openEdit = (row: OrderCodeTypeRow) => {
    if (usingFallbackRows) {
      toast.error("ລາຍການ default ນີ້ຍັງບໍ່ໄດ້ຖືກບັນທຶກໃນ database");
      return;
    }

    setEditing(row);
    setEditCode(row.code);
    setEditLabel(row.label || "");
    setEditSortOrder(row.sort_order ?? 100);
    setEditActive(row.is_active);
  };

  const addType = async () => {
    if (tableMissing || usingFallbackRows) {
      toast.error("ຍັງບໍ່ສາມາດບັນທຶກໄດ້ ເພາະ table ຍັງບໍ່ພ້ອມ");
      return;
    }

    const code = normalizeOrderType(newCode);
    if (!code) {
      toast.error("ກະລຸນາປ້ອນປະເພດລະຫັດ");
      return;
    }

    setSaving(true);
    setErr(null);

    const { error } = await supabase.from("order_code_types").insert({
      code,
      label: newLabel.trim() || null,
      sort_order: Math.max(0, Number(newSortOrder) || 0),
      is_active: newActive,
      is_system: false,
    });

    setSaving(false);

    if (error) {
      setErr(error.message);
      toast.error(error.message.includes("duplicate") ? "ປະເພດລະຫັດນີ້ມີແລ້ວ" : error.message);
      return;
    }

    setNewCode("");
    setNewLabel("");
    setNewSortOrder(100);
    setNewActive(true);
    markClean();
    toast.success("ເພີ່ມປະເພດລະຫັດແລ້ວ");
    await load();
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (tableMissing || usingFallbackRows) {
      toast.error("ຍັງບໍ່ສາມາດບັນທຶກໄດ້ ເພາະ table ຍັງບໍ່ພ້ອມ");
      return;
    }

    const code = normalizeOrderType(editCode);
    if (!code) {
      toast.error("ກະລຸນາປ້ອນປະເພດລະຫັດ");
      return;
    }

    setSaving(true);
    setErr(null);

    const resolvedCode = editingProtected ? editing.code : code;
    const resolvedActive = editingProtected ? true : editActive;

    const { error } = await supabase
      .from("order_code_types")
      .update({
        code: resolvedCode,
        label: editLabel.trim() || null,
        sort_order: Math.max(0, Number(editSortOrder) || 0),
        is_active: resolvedActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editing.id);

    setSaving(false);

    if (error) {
      setErr(error.message);
      toast.error(error.message.includes("duplicate") ? "ປະເພດລະຫັດນີ້ມີແລ້ວ" : error.message);
      return;
    }

    toast.success("ບັນທຶກແລ້ວ");
    closeEdit();
    markClean();
    await load();
  };

  const deleteType = async (row: OrderCodeTypeRow) => {
    if (tableMissing || usingFallbackRows) {
      toast.error("ຍັງບໍ່ສາມາດລຶບໄດ້ ເພາະ table ຍັງບໍ່ພ້ອມ");
      return;
    }

    if (isProtectedOrderCodeType(row.code)) {
      toast.error("ລະຫັດຫຼັກຂອງລະບົບບໍ່ສາມາດລຶບໄດ້");
      return;
    }

    const { count, error: usageError } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .ilike("order_code", `${row.code}-%`);

    if (usageError) {
      setErr(usageError.message);
      toast.error(usageError.message);
      return;
    }

    if ((count ?? 0) > 0) {
      toast.error("ຍັງມີອໍເດີໃຊ້ລະຫັດນີ້ຢູ່ ເລີຍລຶບບໍ່ໄດ້");
      return;
    }

    const ok = await Swal.fire({
      icon: "warning",
      title: "ຢືນຢັນລຶບປະເພດລະຫັດ?",
      html: `<b>${row.code}</b>`,
      showCancelButton: true,
      confirmButtonText: "ລຶບ",
      cancelButtonText: "ຍົກເລີກ",
      reverseButtons: true,
    });

    if (!ok.isConfirmed) return;

    setDeletingId(row.id);
    setErr(null);

    const { error } = await supabase.from("order_code_types").delete().eq("id", row.id);

    setDeletingId(null);

    if (error) {
      setErr(error.message);
      toast.error(error.message);
      return;
    }

    if (editing?.id === row.id) closeEdit();
    toast.success("ລຶບແລ້ວ");
    await load();
  };

  const sortedRows = useMemo(() => rows, [rows]);

  return (
    <div ref={pageRef} className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">ຈັດການປະເພດລະຫັດ</h1>
        <div className="text-sm font-medium text-slate-500">
          ເພີ່ມ ຫຼື ປິດການໃຊ້ງານປະເພດລະຫັດທີ່ຈະໄປສະແດງໃນໜ້າສ້າງອໍເດີ
        </div>
        {err ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">ຂໍ້ຜິດພາດ: {err}</div> : null}
        {notice ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
            {notice}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="mb-3 text-xs font-black uppercase tracking-wider text-slate-700">ເພີ່ມປະເພດລະຫັດໃໝ່</div>
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Code</label>
            <input
              value={newCode}
              onChange={(e) => setNewCode(normalizeOrderType(e.target.value))}
              placeholder="ຕົວຢ່າງ PK27"
              disabled={tableMissing || usingFallbackRows}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold uppercase text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-bold text-slate-600">ຊື່ສະແດງ (ບໍ່ບັງຄັບ)</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="ຕົວຢ່າງ: MK26 ຮ້ານ"
              disabled={tableMissing || usingFallbackRows}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">ລຳດັບ</label>
            <input
              type="number"
              min={0}
              value={newSortOrder}
              onChange={(e) => setNewSortOrder(Number(e.target.value))}
              disabled={tableMissing || usingFallbackRows}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900"
            />
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={newActive} onChange={(e) => setNewActive(e.target.checked)} disabled={tableMissing || usingFallbackRows} />
            ເປີດໃຊ້ງານ
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={addType}
            disabled={saving || tableMissing || usingFallbackRows}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            + ເພີ່ມລາຍການ
          </button>
        </div>
      </div>

      {editing ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-wider text-slate-700">ແກ້ໄຂປະເພດລະຫັດ</div>
            <button onClick={closeEdit} className="text-sm font-bold text-slate-500 hover:text-slate-800">
              ປິດ
            </button>
          </div>
          <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Code</label>
              <input
                value={editCode}
                onChange={(e) => setEditCode(normalizeOrderType(e.target.value))}
                disabled={tableMissing || usingFallbackRows || editingProtected}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold uppercase text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-600">ຊື່ສະແດງ</label>
              <input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                disabled={tableMissing || usingFallbackRows}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">ລຳດັບ</label>
              <input
                type="number"
                min={0}
                value={editSortOrder}
                onChange={(e) => setEditSortOrder(Number(e.target.value))}
                disabled={tableMissing || usingFallbackRows}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900"
              />
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} disabled={tableMissing || usingFallbackRows || editingProtected} />
              ເປີດໃຊ້ງານ
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={saveEdit}
              disabled={saving || tableMissing || usingFallbackRows}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              ບັນທຶກການແກ້ໄຂ
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-4">
          <div className="text-sm font-black uppercase tracking-widest text-slate-700">ລາຍການປະເພດລະຫັດ</div>
          <div className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-500">
            {loading ? "ກຳລັງໂຫຼດ..." : `ຈຳນວນ: ${rows.length} ລາຍການ`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/50 text-slate-500">
              <tr>
                <th className="p-4 text-left text-[11px] font-bold uppercase tracking-wider">Code</th>
                <th className="p-4 text-left text-[11px] font-bold uppercase tracking-wider">ຊື່ສະແດງ</th>
                <th className="p-4 text-center text-[11px] font-bold uppercase tracking-wider">ລຳດັບ</th>
                <th className="p-4 text-center text-[11px] font-bold uppercase tracking-wider">ປະເພດ</th>
                <th className="p-4 text-center text-[11px] font-bold uppercase tracking-wider">ສະຖານະ</th>
                <th className="p-4 text-left text-[11px] font-bold uppercase tracking-wider">ອັບເດດ</th>
                <th className="p-4 text-center text-[11px] font-bold uppercase tracking-wider">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && sortedRows.length === 0 ? (
                <tr>
                  <td className="p-10 text-center font-medium text-slate-400" colSpan={7}>
                    ບໍ່ມີຂໍ້ມູນໃນລະບົບ
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50/50">
                    <td className="p-4 font-black text-slate-900">{row.code}</td>
                    <td className="p-4 font-medium text-slate-700">{row.label || "-"}</td>
                    <td className="p-4 text-center font-bold text-slate-700">{row.sort_order}</td>
                    <td className="p-4 text-center">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${row.is_system ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-blue-700"}`}>
                        {row.is_system ? "system" : "custom"}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {row.is_active ? (
                        <span className="rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-black uppercase text-green-800">ໃຊ້ງານ</span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">ປິດ</span>
                      )}
                    </td>
                    <td className="p-4 text-xs font-medium text-slate-500">{(row.updated_at || row.created_at || "").slice(0, 10) || "-"}</td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(row)}
                          disabled={tableMissing || usingFallbackRows}
                          className="rounded-lg px-3 py-1.5 text-xs font-black text-blue-600 transition-all hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          ແກ້ໄຂ
                        </button>
                        <button
                          onClick={() => deleteType(row)}
                          disabled={tableMissing || usingFallbackRows || deletingId === row.id || isProtectedOrderCodeType(row.code)}
                          className="rounded-lg px-3 py-1.5 text-xs font-black text-rose-600 transition-all hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          {deletingId === row.id ? "ກຳລັງລຶບ..." : "ລຶບ"}
                        </button>
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
