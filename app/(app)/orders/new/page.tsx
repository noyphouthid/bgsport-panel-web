"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type FabricRow = {
  id: string;
  name: string;
  short_price: number;
  long_add: number;
  long_price: number; // generated
  is_active: boolean;
};

type UserOption = {
  id: string;
  full_name: string;
  role: "admin" | "manager" | "staff" | "graphic" | "accountant";
  is_active: boolean;
};

export default function NewOrderPage() {
  // Fabrics from DB
  const [fabrics, setFabrics] = useState<FabricRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingFabrics, setLoadingFabrics] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ===== 1) ຂໍ້ມູນພື້ນຖານ =====
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [orderCode, setOrderCode] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [factoryBillCode, setFactoryBillCode] = useState(""); // optional
  const [fabricId, setFabricId] = useState<string>("");
  const [adminUserId, setAdminUserId] = useState<string>("");
  const [graphicUserId, setGraphicUserId] = useState<string>("");

  // ===== 2) ຈຳນວນ & ຂະໜາດ =====
  const [shortQty, setShortQty] = useState<number>(0);
  const [longQty, setLongQty] = useState<number>(0);
  const [freeQty, setFreeQty] = useState<number>(0); // ແຖມ (ບໍ່ຄິດເງິນ)
  const [qty3XL, setQty3XL] = useState<number>(0);
  const [qty4XL, setQty4XL] = useState<number>(0);
  const [qty5XL, setQty5XL] = useState<number>(0);

  // ===== 3) ການເງິນ & ຄ່າທຳນຽມ =====
  const [extraCharge, setExtraCharge] = useState<number>(0);
  const [designDeposit, setDesignDeposit] = useState<number>(0);
  const [initialDeposit, setInitialDeposit] = useState<number>(0);
  const [factoryCost, setFactoryCost] = useState<number>(0);

  // ===== ກົດກາ =====
  const sizeUpcharge = 20000;

  const loadFabrics = async () => {
    setLoadingFabrics(true);
    setErr(null);

    const { data, error } = await supabase
      .from("fabrics")
      .select("id,name,short_price,long_add,long_price,is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      setErr(error.message);
      setFabrics([]);
      setLoadingFabrics(false);
      return;
    }

    const rows = (data ?? []) as FabricRow[];
    setFabrics(rows);
    setLoadingFabrics(false);

    if (!fabricId && rows.length > 0) setFabricId(rows[0].id);
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    const { data, error } = await supabase
      .from("users")
      .select("id,full_name,role,is_active")
      .eq("is_active", true)
      .in("role", ["admin", "graphic"])
      .order("full_name", { ascending: true });

    if (error) {
      setErr(error.message);
      setUsers([]);
      setLoadingUsers(false);
      return;
    }

    const rows = (data ?? []) as UserOption[];
    setUsers(rows);
    setLoadingUsers(false);
  };

  useEffect(() => {
    loadFabrics();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedFabric = useMemo(() => fabrics.find((f) => f.id === fabricId) ?? null, [fabrics, fabricId]);
  const adminOptions = useMemo(() => users.filter((u) => u.role === "admin"), [users]);
  const graphicOptions = useMemo(() => users.filter((u) => u.role === "graphic"), [users]);

  const totalProductionQty = useMemo(() => shortQty + longQty + freeQty, [shortQty, longQty, freeQty]);
  const billableQty = useMemo(() => shortQty + longQty, [shortQty, longQty]);
  const plusSizeQty = useMemo(() => qty3XL + qty4XL + qty5XL, [qty3XL, qty4XL, qty5XL]);

  const shirtsTotal = useMemo(() => {
    if (!selectedFabric) return 0;
    return shortQty * selectedFabric.short_price + longQty * selectedFabric.long_price;
  }, [shortQty, longQty, selectedFabric]);

  const plusSizeTotal = useMemo(() => plusSizeQty * sizeUpcharge, [plusSizeQty]);
  const grossTotal = useMemo(() => shirtsTotal + plusSizeTotal + extraCharge, [shirtsTotal, plusSizeTotal, extraCharge]);
  const netTotal = useMemo(() => Math.max(0, grossTotal - designDeposit), [grossTotal, designDeposit]);
  const balance = useMemo(() => Math.max(0, netTotal - initialDeposit), [netTotal, initialDeposit]);
  const profitPreview = useMemo(() => netTotal - factoryCost, [netTotal, factoryCost]);

  const resetForm = () => {
    setOrderDate(new Date().toISOString().slice(0, 10));
    setOrderCode("");
    setCustomerPhone("");
    setFactoryBillCode("");
    setAdminUserId("");
    setGraphicUserId("");
    if (fabrics.length > 0) setFabricId(fabrics[0].id);
    setShortQty(0);
    setLongQty(0);
    setFreeQty(0);
    setQty3XL(0);
    setQty4XL(0);
    setQty5XL(0);
    setExtraCharge(0);
    setDesignDeposit(0);
    setInitialDeposit(0);
    setFactoryCost(0);
  };

  const handleSave = async () => {
    setErr(null);

    if (!adminUserId) return alert("Please select admin");
    if (!graphicUserId) return alert("Please select graphic");
    if (!orderCode.trim()) return alert("ກະລຸນາປ້ອນລະຫັດອໍເດີ້");
    if (!selectedFabric) return alert("ກະລຸນາເລືອກຜ້າ");

    const payload = {
      order_code: orderCode.trim(),
      order_date: orderDate,
      customer_phone: customerPhone.trim() || null,
      factory_bill_code: factoryBillCode.trim() || null,
      admin_user_id: adminUserId || null,
      graphic_user_id: graphicUserId || null,

      fabric_id: selectedFabric.id,
      // snapshot (สำคัญ)
      fabric_name: selectedFabric.name,
      fabric_short_price: selectedFabric.short_price,
      fabric_long_price: selectedFabric.long_price,

      short_qty: Math.max(0, shortQty),
      long_qty: Math.max(0, longQty),
      free_qty: Math.max(0, freeQty),
      qty_3xl: Math.max(0, qty3XL),
      qty_4xl: Math.max(0, qty4XL),
      qty_5xl: Math.max(0, qty5XL),

      size_upcharge: sizeUpcharge,

      extra_charge: Math.max(0, extraCharge),
      design_deposit: Math.max(0, designDeposit),
      initial_deposit: Math.max(0, initialDeposit),
      factory_cost: Math.max(0, factoryCost),

      gross_total: grossTotal,
      net_total: netTotal,
      balance: balance,

      status: "in_progress",
    };

    const { error } = await supabase.from("orders").insert(payload);
    if (error) {
      setErr(error.message);
      return;
    }

    alert("ບັນທຶກອໍເດີ້ແລ້ວ");
    resetForm();
  };

  return (
    <div className="text-slate-900">
      {err && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
          Error: {err}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ເພີ່ມອໍເດີ້ໃໝ່</h1>
          <div className="text-sm text-slate-500 font-medium">ບັນທຶກອໍເດີ້ (ດຶງລາຄາຜ້າຈາກ Supabase)</div>
        </div>

        <div className="flex gap-2">
          <Link href="/orders" className="border border-slate-300 px-4 py-2 rounded text-sm font-bold text-slate-700 hover:bg-white shadow-sm transition-all">
            ກັບຄືນ
          </Link>
          <button
            onClick={handleSave}
            className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-emerald-700 shadow-sm transition-all"
          >
            ບັນທຶກ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left */}
        <div className="lg:col-span-2 space-y-4">
          {/* Basic */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="font-bold text-slate-800 mb-3 uppercase text-xs tracking-wider border-b pb-2 border-slate-50">1) ກ່ຽວກັບອໍເດີ້ </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ວັນທີມັດຈຳສັ່ງຜະລິດ</label>
                <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ລະຫັດອໍເດີ້</label>
                <input value={orderCode} onChange={(e) => setOrderCode(e.target.value)} placeholder="PKF26-001" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold placeholder-slate-300" />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ເບີໂທລູກຄ້າ ຫຼື FB (ຖ້າມີ)</label>
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="020xxxxxxxx" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ບິນໂຮງງານ (ບໍ່ບັງຄັບ)</label>
                <input value={factoryBillCode} onChange={(e) => setFactoryBillCode(e.target.value)} placeholder="ສາມາດເພີ່ມພາຍຫຼັງໄດ້" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Admin</label>
                <select
                  value={adminUserId}
                  onChange={(e) => setAdminUserId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold bg-white"
                  disabled={loadingUsers}
                >
                  <option value="">Select admin</option>
                  {adminOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Graphic</label>
                <select
                  value={graphicUserId}
                  onChange={(e) => setGraphicUserId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold bg-white"
                  disabled={loadingUsers}
                >
                  <option value="">Select graphic</option>
                  {graphicOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-700 block mb-1">ປະເພດຜ້າ</label>
                <select
                  value={fabricId}
                  onChange={(e) => setFabricId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold bg-white"
                  disabled={loadingFabrics}
                >
                  {loadingFabrics ? (
                    <option>ກຳລັງໂຫຼດ...</option>
                  ) : fabrics.length === 0 ? (
                    <option>ບໍ່ມີຜ້າ (ໄປເພີ່ມທີ່ ລາຄາຜ້າ)</option>
                  ) : (
                    fabrics.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} (ແຂນສັ້ນ:{f.short_price.toLocaleString()})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Qty */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="font-bold text-slate-800 mb-3 uppercase text-xs tracking-wider border-b pb-2 border-slate-50">2) ຈຳນວນ & ບວກເພີ່ມໄຊທ໌</div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ແຂນສັ້ນ</label>
                <input type="number" value={shortQty} onChange={(e) => setShortQty(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold" min={0} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ແຂນຍາວ</label>
                <input type="number" value={longQty} onChange={(e) => setLongQty(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold" min={0} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ຈຳນວນແຖມ (ບໍ່ຄິດເງິນ)</label>
                <input type="number" value={freeQty} onChange={(e) => setFreeQty(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold text-orange-600" min={0} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">3XL</label>
                <input type="number" value={qty3XL} onChange={(e) => setQty3XL(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium" min={0} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">4XL</label>
                <input type="number" value={qty4XL} onChange={(e) => setQty4XL(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium" min={0} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">5XL</label>
                <input type="number" value={qty5XL} onChange={(e) => setQty5XL(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium" min={0} />
              </div>
            </div>

            <div className="mt-4 p-2 bg-slate-50 rounded-lg text-[11px] font-bold text-slate-500 uppercase tracking-tight">
              ຈຳນວນຜະລິດ (ລວມແຖມ): <span className="text-slate-900">{totalProductionQty}</span> | ຈຳນວນຄິດເງິນ:{" "}
              <span className="text-blue-600">{billableQty}</span>
            </div>
          </div>

          {/* Finance */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="font-bold text-slate-800 mb-3 uppercase text-xs tracking-wider border-b pb-2 border-slate-50">3) ຮູບແບບມັດຈຳ & ລາຍການບວກເພີ່ມ</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ບວກເພີ່ມ (ງານດ່ວນ,ອື່ນໆ)</label>
                <input type="number" value={extraCharge} onChange={(e) => setExtraCharge(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold" min={0} />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ຫັກຄ່າແບບ-ສ່ວນຫຼຸດ</label>
                <input type="number" value={designDeposit} onChange={(e) => setDesignDeposit(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-red-600 font-bold" min={0} />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ມັດຈຳສັ່ງຜະລິດ</label>
                <input type="number" value={initialDeposit} onChange={(e) => setInitialDeposit(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-emerald-600 font-bold" min={0} />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ຕົ້ນທຶນໂຮງງານ</label>
                <input type="number" value={factoryCost} onChange={(e) => setFactoryCost(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold" min={0} />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} className="bg-emerald-600 text-white px-8 py-2.5 rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-md transition-all active:scale-95">
              ບັນທຶກອໍເດີ້
            </button>
            <button onClick={resetForm} className="bg-slate-100 text-slate-600 px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-200 border border-slate-200 transition-all">
              ຍົກເລີກ / ລ້າງ
            </button>
          </div>
        </div>

        {/* Right summary */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sticky top-4">
            <div className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest border-b pb-3 border-slate-50">4) ສະຫຼຸບອໍເດີ້</div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">ປະເພດຜ້າ:</span>
                <span className="font-bold text-slate-900">{selectedFabric?.name ?? "—"}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">ຄ່າເສື້ອທັງໝົດ:</span>
                <span className="font-bold text-slate-800">{shirtsTotal.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">ບວກໄຊສ໌ໃຫຍ່:</span>
                <span className="font-bold text-slate-800">{plusSizeTotal.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">ບວກເພີ່ມ (ງານດ່ວນ,ອື່ນໆ):</span>
                <span className="font-bold text-slate-800">{extraCharge.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center bg-red-50/50 p-2 rounded-lg">
                <span className="text-red-600 font-bold">ຫັກຄ່າແບບ-ສ່ວນຫຼຸດ:</span>
                <span className="font-bold text-red-600">-{designDeposit.toLocaleString()}</span>
              </div>

              <div className="border-t border-dashed pt-3 flex justify-between items-center">
                <span className="text-slate-800 font-extrabold uppercase text-xs">ຍອດສຸດທິ:</span>
                <span className="text-xl font-black text-slate-900">{netTotal.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-bold">ມັດຈຳສັ່ງຜະລິດກ່ອນ:</span>
                <span className="font-bold text-emerald-600">+{initialDeposit.toLocaleString()}</span>
              </div>

              <div className="border-t-2 border-slate-100 pt-3 flex justify-between items-center">
                <span className="text-slate-800 font-extrabold uppercase text-xs">ຍອດຄ້າງຈ່າຍ:</span>
                <span className="text-xl font-black text-rose-600">{balance.toLocaleString()}</span>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                <span className="text-slate-500 font-medium">ກຳໄລ (ຕົວຢ່າງ):</span>
                <span className={`text-lg font-black ${profitPreview >= 0 ? "text-blue-600" : "text-red-600"}`}>
                  {profitPreview.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="mt-6 p-3 bg-amber-50 rounded-xl text-[10px] text-amber-700 font-bold leading-relaxed border border-amber-100">
              ⚠️ ກຳໄລຈະນັບເມື່ອປິດງານ (Completed) ແລະ ຈ່າຍຄົບ 100% ເທົ່ານັ້ນ
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
