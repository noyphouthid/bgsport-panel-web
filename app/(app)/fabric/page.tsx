"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Fabric = {
  id: string;
  name: string;
  short_price: number;
  long_add: number;
  long_price: number; // generated column
  is_active: boolean;
  updated_at: string;
};

export default function FabricPage() {
  const [rows, setRows] = useState<Fabric[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Add new
  const [newName, setNewName] = useState("");
  const [newShort, setNewShort] = useState<number>(0);
  const [newLongAdd, setNewLongAdd] = useState<number>(20000);

  // Edit modal
  const [editing, setEditing] = useState<Fabric | null>(null);
  const [editName, setEditName] = useState("");
  const [editShort, setEditShort] = useState<number>(0);
  const [editLongAdd, setEditLongAdd] = useState<number>(20000);
  const [editActive, setEditActive] = useState(true);

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
    load();
  }, []);

  const openEdit = (f: Fabric) => {
    setEditing(f);
    setEditName(f.name);
    setEditShort(f.short_price);
    setEditLongAdd(f.long_add ?? 20000);
    setEditActive(f.is_active);
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
    if (!name) return alert("ກະລຸນາປ້ອນຊື່ຜ້າ");

    setErr(null);
    const { error } = await supabase.from("fabrics").insert({
      name,
      short_price: Math.max(0, newShort),
      long_add: Math.max(0, newLongAdd),
      is_active: true,
    });

    if (error) return setErr(error.message);

    setNewName("");
    setNewShort(0);
    setNewLongAdd(20000);
    await load();
    alert("ເພີ່ມຜ້າໃໝ່ແລ້ວ");
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

    if (error) return setErr(error.message);

    closeEdit();
    await load();
    alert("ບັນທຶກລາຄາແລ້ວ");
  };

  const sorted = useMemo(() => rows, [rows]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">ລາຄາຜ້າ</h1>
        <div className="text-sm text-slate-500 font-medium">
          ແກ້ລາຄາຜ້າໄດ້ທີ່ນີ້ —{" "}
          <span className="font-bold text-slate-700 underline decoration-slate-200">ຫ້າມກະທົບອໍເດີ້ເກົ່າ</span>{" "}
          (ອໍເດີ້ຈະເກັບ snapshot ລາຄາໃນວັນທີ່ບັນທຶກ)
        </div>

        {err && (
          <div className="mt-2 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm font-medium">
            Error: {err}
          </div>
        )}
      </div>

      {/* Add new */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-4">
        <div className="font-bold text-slate-700 mb-3 uppercase text-xs tracking-wider">ເພີ່ມຜ້າໃໝ່</div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-600 mb-1 block">ຊື່ຜ້າ</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ຕົວຢ່າງ: ຜ້າກິລາ"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">ລາຄາແຂນສັ້ນ</label>
            <input
              type="number"
              value={newShort}
              onChange={(e) => setNewShort(Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold"
              min={0}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">ເພີ່ມແຂນຍາວ</label>
            <input
              type="number"
              value={newLongAdd}
              onChange={(e) => setNewLongAdd(Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold"
              min={0}
            />
          </div>

          <div className="md:col-span-2">
            <button
              onClick={addFabric}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 w-full shadow-sm transition-all active:scale-[0.98]"
            >
              + ເພີ່ມຜ້າໃໝ່
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 bg-slate-50/50 flex items-center justify-between border-b border-slate-100">
          <div className="text-sm font-black text-slate-700 uppercase tracking-widest">ລາຍການຜ້າ</div>
          <div className="text-xs font-bold text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
            {loading ? "ກຳລັງໂຫຼດ..." : `ຈຳນວນ: ${rows.length} ຊະນິດ`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
              <tr>
                <th className="p-4 text-left font-bold text-[11px] uppercase tracking-wider">ຊື່ຜ້າ</th>
                <th className="p-4 text-right font-bold text-[11px] uppercase tracking-wider">ແຂນສັ້ນ</th>
                <th className="p-4 text-right font-bold text-[11px] uppercase tracking-wider">ແຂນຍາວ</th>
                <th className="p-4 text-right font-bold text-[11px] uppercase tracking-wider">+ ແຂນຍາວ</th>
                <th className="p-4 text-center font-bold text-[11px] uppercase tracking-wider">ສະຖານະ</th>
                <th className="p-4 text-left font-bold text-[11px] uppercase tracking-wider">ອັບເດດ</th>
                <th className="p-4 text-center font-bold text-[11px] uppercase tracking-wider">ຈັດການ</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50">
              {!loading && sorted.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-slate-400 font-medium" colSpan={7}>
                    ບໍ່ມີຂໍ້ມູນໃນລະບົບ
                  </td>
                </tr>
              ) : (
                sorted.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-black text-slate-900">{f.name}</td>
                    <td className="p-4 text-right font-black text-slate-800">{f.short_price.toLocaleString()}</td>
                    <td className="p-4 text-right font-black text-blue-700">{f.long_price.toLocaleString()}</td>
                    <td className="p-4 text-right font-bold text-slate-500">+{f.long_add.toLocaleString()}</td>
                    <td className="p-4 text-center">
                      {f.is_active ? (
                        <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-800 text-[10px] font-black uppercase">
                          ໃຊ້ງານ
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-slate-200 text-slate-600 text-[10px] font-black uppercase">
                          ປິດ
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-slate-500 font-medium text-xs">{(f.updated_at ?? "").slice(0, 10)}</td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => openEdit(f)} 
                        className="text-blue-600 font-black text-xs hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all"
                      >
                        ແກ້ໄຂ
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 text-[11px] font-bold text-slate-400 italic">
          * ປັບລາຄາຜ້າມີຜົນກັບອໍເດີ້ໃໝ່ເທົ່ານັ້ນ (ອໍເດີ້ເກົ່າຈະໃຊ້ລາຄາເດີມທີ່ເຄີຍບັນທຶກໄວ້)
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="font-black text-slate-800 uppercase tracking-tight">ແກ້ໄຂລາຄາຜ້າ: {editing.name}</div>
              <button onClick={closeEdit} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1.1 1.1 0 011.414 0L10 8.586l4.293-4.293a1.1 1.1 0 111.414 1.414L11.414 10l4.293 4.293a1.1 1.1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1.1 1.1 0 01-1.414-1.414L8.586 10 4.293 5.707a1.1 1.1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase">ຊື່ຜ້າ</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase">ລາຄາແຂນສັ້ນ</label>
                  <input
                    type="number"
                    value={editShort}
                    onChange={(e) => setEditShort(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-black focus:ring-2 focus:ring-blue-500 outline-none"
                    min={0}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase">ເພີ່ມແຂນຍາວ</label>
                  <input
                    type="number"
                    value={editLongAdd}
                    onChange={(e) => setEditLongAdd(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-black focus:ring-2 focus:ring-blue-500 outline-none"
                    min={0}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <input
                  id="active"
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <label htmlFor="active" className="text-sm font-bold text-slate-700 cursor-pointer">
                  ເປີດໃຊ້ງານລາຍການນີ້ (Active)
                </label>
              </div>
            </div>

            <div className="p-5 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
              <button
                onClick={closeEdit}
                className="bg-white border border-slate-200 text-slate-600 px-6 py-2 rounded-xl text-sm font-bold hover:bg-slate-100 transition-colors"
              >
                ຍົກເລີກ
              </button>
              <button
                onClick={saveEdit}
                className="bg-green-600 text-white px-8 py-2 rounded-xl text-sm font-black hover:bg-green-700 shadow-lg shadow-green-100 transition-all active:scale-[0.95]"
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