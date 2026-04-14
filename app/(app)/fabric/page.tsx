"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

type Fabric = {
  id: string;
  name: string;
  short_price: number;
  long_add: number;
  long_price: number;
  is_active: boolean;
  updated_at: string;
};

export default function FabricPage() {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = useState<Fabric[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newShort, setNewShort] = useState<number>(0);
  const [newLongAdd, setNewLongAdd] = useState<number>(20000);

  const [editing, setEditing] = useState<Fabric | null>(null);
  const [editName, setEditName] = useState("");
  const [editShort, setEditShort] = useState<number>(0);
  const [editLongAdd, setEditLongAdd] = useState<number>(20000);
  const [editActive, setEditActive] = useState(true);
  const { markClean } = useUnsavedChangesGuard({ scopeRef: pageRef, enabled: !loading });

  const load = async () => {
    setLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("fabrics")
      .select("id,name,short_price,long_add,long_price,is_active,updated_at")
      .order("name", { ascending: true });

    if (error) setErr(error.message);
    setRows((data ?? []) as Fabric[]);
    setLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const openEdit = (fabric: Fabric) => {
    setEditing(fabric);
    setEditName(fabric.name);
    setEditShort(fabric.short_price);
    setEditLongAdd(fabric.long_add ?? 20000);
    setEditActive(fabric.is_active);
  };

  const closeEdit = () => {
    setEditing(null);
    setEditName("");
    setEditShort(0);
    setEditLongAdd(20000);
    setEditActive(true);
  };

  const addFabric = async () => {
    const name = newName.trim();
    if (!name) {
      alert("Please enter fabric name");
      return;
    }

    setErr(null);
    const { error } = await supabase.from("fabrics").insert({
      name,
      short_price: Math.max(0, newShort),
      long_add: Math.max(0, newLongAdd),
      is_active: true,
    });

    if (error) {
      setErr(error.message);
      return;
    }

    setNewName("");
    setNewShort(0);
    setNewLongAdd(20000);
    markClean();
    await load();
    alert("Added");
  };

  const saveEdit = async () => {
    if (!editing) return;

    setErr(null);
    const { error } = await supabase
      .from("fabrics")
      .update({
        name: editName.trim() || editing.name,
        short_price: Math.max(0, editShort),
        long_add: Math.max(0, editLongAdd),
        is_active: editActive,
      })
      .eq("id", editing.id);

    if (error) {
      setErr(error.message);
      return;
    }

    closeEdit();
    markClean();
    await load();
    alert("Saved");
  };

  const deleteFabric = async (fabric: Fabric) => {
    const confirmed = window.confirm(`Delete fabric "${fabric.name}"?`);
    if (!confirmed) return;

    setDeletingId(fabric.id);
    setErr(null);

    const { error } = await supabase.from("fabrics").delete().eq("id", fabric.id);

    if (error) {
      if (error.message.includes("orders_fabric_id_fkey")) {
        const { error: deactivateError } = await supabase
          .from("fabrics")
          .update({ is_active: false })
          .eq("id", fabric.id);

        setDeletingId(null);

        if (deactivateError) {
          setErr(deactivateError.message);
          return;
        }

        if (editing?.id === fabric.id) closeEdit();
        await load();
        alert("This fabric is already used in orders, so it was deactivated instead of deleted.");
        return;
      }

      setDeletingId(null);
      setErr(error.message);
      return;
    }

    setDeletingId(null);
    if (editing?.id === fabric.id) closeEdit();
    await load();
    alert("Deleted");
  };

  const sorted = useMemo(() => rows, [rows]);

  return (
    <div ref={pageRef}>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">ລາຄາຜ້າ</h1>
        <div className="text-sm font-medium text-slate-500">
          ແກ້ລາຄາຜ້າໄດ້ທີ່ນີ້ -
          <span className="ml-1 font-bold text-slate-700 underline decoration-slate-200">
            ບໍ່ກະທົບອໍເດີເກົ່າ
          </span>
          <span className="ml-1">(ອໍເດີຈະເກັບ snapshot ລາຄາໄວ້ຕອນບັນທຶກ)</span>
        </div>

        {err && (
          <div className="mt-2 rounded border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            Error: {err}
          </div>
        )}
      </div>

      <div className="mb-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700">ເພີ່ມຜ້າໃໝ່</div>

        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-bold text-slate-600">ຊື່ຜ້າ</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ຕົວຢ່າງ: Sport Fabric"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">ລາຄາແຂນສັ້ນ</label>
            <input
              type="number"
              value={newShort}
              onChange={(e) => setNewShort(Number(e.target.value))}
              min={0}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">ເພີ່ມແຂນຍາວ</label>
            <input
              type="number"
              value={newLongAdd}
              onChange={(e) => setNewLongAdd(Number(e.target.value))}
              min={0}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900"
            />
          </div>

          <div className="md:col-span-2">
            <button
              onClick={addFabric}
              className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-green-700 active:scale-[0.98]"
            >
              + ເພີ່ມຜ້າໃໝ່
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-4">
          <div className="text-sm font-black uppercase tracking-widest text-slate-700">ລາຍການຜ້າ</div>
          <div className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-500">
            {loading ? "ກຳລັງໂຫຼດ..." : `ຈຳນວນ: ${rows.length} ຊະນິດ`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
              <tr>
                <th className="p-4 text-left text-[11px] font-bold uppercase tracking-wider">ຊື່ຜ້າ</th>
                <th className="p-4 text-right text-[11px] font-bold uppercase tracking-wider">ແຂນສັ້ນ</th>
                <th className="p-4 text-right text-[11px] font-bold uppercase tracking-wider">ແຂນຍາວ</th>
                <th className="p-4 text-right text-[11px] font-bold uppercase tracking-wider">+ ແຂນຍາວ</th>
                <th className="p-4 text-center text-[11px] font-bold uppercase tracking-wider">ສະຖານະ</th>
                <th className="p-4 text-left text-[11px] font-bold uppercase tracking-wider">ອັບເດດ</th>
                <th className="p-4 text-center text-[11px] font-bold uppercase tracking-wider">ຈັດການ</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50">
              {!loading && sorted.length === 0 ? (
                <tr>
                  <td className="p-10 text-center font-medium text-slate-400" colSpan={7}>
                    ບໍ່ມີຂໍ້ມູນໃນລະບົບ
                  </td>
                </tr>
              ) : (
                sorted.map((fabric) => (
                  <tr key={fabric.id} className="transition-colors hover:bg-slate-50/50">
                    <td className="p-4 font-black text-slate-900">{fabric.name}</td>
                    <td className="p-4 text-right font-black text-slate-800">{fabric.short_price.toLocaleString()}</td>
                    <td className="p-4 text-right font-black text-blue-700">{fabric.long_price.toLocaleString()}</td>
                    <td className="p-4 text-right font-bold text-slate-500">+{fabric.long_add.toLocaleString()}</td>
                    <td className="p-4 text-center">
                      {fabric.is_active ? (
                        <span className="rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-black uppercase text-green-800">
                          ໃຊ້ງານ
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">
                          ປິດ
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-xs font-medium text-slate-500">{(fabric.updated_at ?? "").slice(0, 10)}</td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(fabric)}
                          className="rounded-lg px-3 py-1.5 text-xs font-black text-blue-600 transition-all hover:bg-blue-50"
                        >
                          ແກ້ໄຂ
                        </button>
                        <button
                          onClick={() => deleteFabric(fabric)}
                          disabled={deletingId === fabric.id}
                          className="rounded-lg px-3 py-1.5 text-xs font-black text-red-600 transition-all hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === fabric.id ? "Deleting..." : "ລົບ"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 p-4 text-[11px] font-bold italic text-slate-400">
          * ການປັບລາຄາຜ້າຈະມີຜົນກັບອໍເດີໃໝ່ເທົ່ານັ້ນ
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-5">
              <div className="font-black tracking-tight text-slate-800">ແກ້ໄຂລາຄາຜ້າ: {editing.name}</div>
              <button onClick={closeEdit} className="p-1 text-slate-400 transition-colors hover:text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1.1 1.1 0 011.414 0L10 8.586l4.293-4.293a1.1 1.1 0 111.414 1.414L11.414 10l4.293 4.293a1.1 1.1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1.1 1.1 0 01-1.414-1.414L8.586 10 4.293 5.707a1.1 1.1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase text-slate-500">ຊື່ຜ້າ</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase text-slate-500">ລາຄາແຂນສັ້ນ</label>
                  <input
                    type="number"
                    value={editShort}
                    onChange={(e) => setEditShort(Number(e.target.value))}
                    min={0}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase text-slate-500">ເພີ່ມແຂນຍາວ</label>
                  <input
                    type="number"
                    value={editLongAdd}
                    onChange={(e) => setEditLongAdd(Number(e.target.value))}
                    min={0}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <input
                  id="active"
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="active" className="cursor-pointer text-sm font-bold text-slate-700">
                  ເປີດໃຊ້ງານລາຍການນີ້
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 p-5">
              <button
                onClick={closeEdit}
                className="rounded-xl border border-slate-200 bg-white px-6 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100"
              >
                ຍົກເລີກ
              </button>
              <button
                onClick={saveEdit}
                className="rounded-xl bg-green-600 px-8 py-2 text-sm font-black text-white shadow-lg shadow-green-100 transition-all hover:bg-green-700 active:scale-[0.95]"
              >
                ບັນທຶກຂໍ້ມູນ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
