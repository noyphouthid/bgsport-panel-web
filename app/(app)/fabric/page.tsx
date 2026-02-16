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
        <h1 className="text-2xl font-bold">ລາຄາຜ້າ</h1>
        <div className="text-sm text-gray-500">
          ແກ້ລາຄາຜ້າໄດ້ທີ່ນີ້ —{" "}
          <span className="font-semibold text-gray-700">ຫ້າມກະທົບອໍເດີ້ເກົ່າ</span>{" "}
          (ອໍເດີ້ຈະເກັບ snapshot ລາຄາໃນວັນທີ່ບັນທຶກ)
        </div>

        {err && (
          <div className="mt-2 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
            Error: {err}
          </div>
        )}
      </div>

      {/* Add new */}
      <div className="bg-white rounded shadow p-4 mb-4">
        <div className="font-semibold text-gray-700 mb-3">ເພີ່ມຜ້າໃໝ່</div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-gray-600">ຊື່ຜ້າ</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ຕົວຢ່າງ: ຜ້າກິລາ"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">ລາຄາແຂນສັ້ນ</label>
            <input
              type="number"
              value={newShort}
              onChange={(e) => setNewShort(Number(e.target.value))}
              className="w-full border rounded px-3 py-2 text-sm"
              min={0}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">ເພີ່ມແຂນຍາວ</label>
            <input
              type="number"
              value={newLongAdd}
              onChange={(e) => setNewLongAdd(Number(e.target.value))}
              className="w-full border rounded px-3 py-2 text-sm"
              min={0}
            />
          </div>

          <div className="md:col-span-2">
            <button
              onClick={addFabric}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-green-700 w-full"
            >
              + ເພີ່ມ
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded shadow overflow-hidden">
        <div className="p-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-700">ລາຍການຜ້າ</div>
          <div className="text-sm text-gray-500">
            {loading ? "ກຳລັງໂຫຼດ..." : `ຈຳນວນ: ${rows.length}`}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="p-3 text-left">ຊື່ຜ້າ</th>
              <th className="p-3 text-right">ແຂນສັ້ນ</th>
              <th className="p-3 text-right">ແຂນຍາວ</th>
              <th className="p-3 text-right">+ ແຂນຍາວ</th>
              <th className="p-3 text-center">ໃຊ້ງານ</th>
              <th className="p-3 text-left">ອັບເດດ</th>
              <th className="p-3 text-center">ຈັດການ</th>
            </tr>
          </thead>

          <tbody>
            {!loading && sorted.length === 0 ? (
              <tr className="border-t">
                <td className="p-4 text-gray-500" colSpan={7}>
                  ບໍ່ມີຂໍ້ມູນ
                </td>
              </tr>
            ) : (
              sorted.map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="p-3 font-semibold">{f.name}</td>
                  <td className="p-3 text-right">{f.short_price.toLocaleString()}</td>
                  <td className="p-3 text-right">{f.long_price.toLocaleString()}</td>
                  <td className="p-3 text-right">{f.long_add.toLocaleString()}</td>
                  <td className="p-3 text-center">
                    {f.is_active ? (
                      <span className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-semibold">
                        ໃຊ້ງານ
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-gray-200 text-gray-700 text-xs font-semibold">
                        ປິດ
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-gray-600">{(f.updated_at ?? "").slice(0, 10)}</td>
                  <td className="p-3 text-center">
                    <button onClick={() => openEdit(f)} className="text-blue-600 font-semibold hover:underline">
                      ແກ້ໄຂ
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="p-3 border-t text-xs text-gray-500">
          * ປັບລາຄາຜ້າມີຜົນກັບອໍເດີ້ໃໝ່ເທົ່ານັ້ນ (ອໍເດີ້ເກົ່າບໍ່ປ່ຽນ)
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded shadow w-full max-w-lg">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold text-gray-700">ແກ້ໄຂລາຄາຜ້າ</div>
              <button onClick={closeEdit} className="text-gray-500 hover:text-gray-700">
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">ຊື່ຜ້າ</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600">ລາຄາແຂນສັ້ນ</label>
                  <input
                    type="number"
                    value={editShort}
                    onChange={(e) => setEditShort(Number(e.target.value))}
                    className="w-full border rounded px-3 py-2 text-sm"
                    min={0}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">ເພີ່ມແຂນຍາວ</label>
                  <input
                    type="number"
                    value={editLongAdd}
                    onChange={(e) => setEditLongAdd(Number(e.target.value))}
                    className="w-full border rounded px-3 py-2 text-sm"
                    min={0}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="active"
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                />
                <label htmlFor="active" className="text-sm text-gray-700">
                  ໃຊ້ງານ (Active)
                </label>
              </div>
            </div>

            <div className="p-4 border-t flex gap-2 justify-end">
              <button
                onClick={closeEdit}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm font-semibold hover:bg-gray-300"
              >
                ຍົກເລີກ
              </button>
              <button
                onClick={saveEdit}
                className="bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-green-700"
              >
                ບັນທຶກ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
