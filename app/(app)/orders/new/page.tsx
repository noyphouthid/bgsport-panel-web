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

export default function NewOrderPage() {
  // Fabrics from DB
  const [fabrics, setFabrics] = useState<FabricRow[]>([]);
  const [loadingFabrics, setLoadingFabrics] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ===== 1) ຂໍ້ມູນພື້ນຖານ =====
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [orderCode, setOrderCode] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [factoryBillCode, setFactoryBillCode] = useState(""); // optional
  const [fabricId, setFabricId] = useState<string>("");

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

  useEffect(() => {
    loadFabrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedFabric = useMemo(() => fabrics.find((f) => f.id === fabricId) ?? null, [fabrics, fabricId]);

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

    if (!orderCode.trim()) return alert("ກະລຸນາປ້ອນລະຫັດອໍເດີ້");
    if (!selectedFabric) return alert("ກະລຸນາເລືອກຜ້າ");

    const payload = {
      order_code: orderCode.trim(),
      order_date: orderDate,
      customer_phone: customerPhone.trim() || null,
      factory_bill_code: factoryBillCode.trim() || null,

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
    <div>
      {err && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
          Error: {err}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">ເພີ່ມອໍເດີ້ໃໝ່</h1>
          <div className="text-sm text-gray-500">ບັນທຶກອໍເດີ້ (ດຶງລາຄາຜ້າຈາກ Supabase)</div>
        </div>

        <div className="flex gap-2">
          <Link href="/orders" className="border px-4 py-2 rounded text-sm font-semibold hover:bg-white">
            ກັບຄືນ
          </Link>
          <button
            onClick={handleSave}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-green-700"
          >
            ບັນທຶກ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left */}
        <div className="lg:col-span-2 space-y-4">
          {/* Basic */}
          <div className="bg-white rounded shadow p-4">
            <div className="font-semibold text-gray-700 mb-3">1) ຂໍ້ມູນພື້ນຖານ</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">ວັນທີສັ່ງຊື້</label>
                <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600">ລະຫັດອໍເດີ້</label>
                <input value={orderCode} onChange={(e) => setOrderCode(e.target.value)} placeholder="PKF26-001" className="w-full border rounded px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600">ເບີໂທລູກຄ້າ (ຖ້າມີ)</label>
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="020xxxxxxxx" className="w-full border rounded px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600">ບິນໂຮງງານ (ບໍ່ບັງຄັບ)</label>
                <input value={factoryBillCode} onChange={(e) => setFactoryBillCode(e.target.value)} placeholder="ສາມາດເພີ່ມພາຍຫຼັງໄດ້" className="w-full border rounded px-3 py-2 text-sm" />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600">ປະເພດຜ້າ</label>
                <select
                  value={fabricId}
                  onChange={(e) => setFabricId(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  disabled={loadingFabrics}
                >
                  {loadingFabrics ? (
                    <option>ກຳລັງໂຫຼດ...</option>
                  ) : fabrics.length === 0 ? (
                    <option>ບໍ່ມີຜ້າ (ໄປເພີ່ມທີ່ ລາຄາຜ້າ)</option>
                  ) : (
                    fabrics.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} (ແຂນສັ້ນ:{f.short_price.toLocaleString()} / ແຂນຍາວ:{f.long_price.toLocaleString()})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Qty */}
          <div className="bg-white rounded shadow p-4">
            <div className="font-semibold text-gray-700 mb-3">2) ຈຳນວນ & ຂະໜາດ</div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">ແຂນສັ້ນ</label>
                <input type="number" value={shortQty} onChange={(e) => setShortQty(Number(e.target.value))} className="w-full border rounded px-3 py-2 text-sm" min={0} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">ແຂນຍາວ</label>
                <input type="number" value={longQty} onChange={(e) => setLongQty(Number(e.target.value))} className="w-full border rounded px-3 py-2 text-sm" min={0} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">ແຖມ (ບໍ່ຄິດເງິນ)</label>
                <input type="number" value={freeQty} onChange={(e) => setFreeQty(Number(e.target.value))} className="w-full border rounded px-3 py-2 text-sm" min={0} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">3XL</label>
                <input type="number" value={qty3XL} onChange={(e) => setQty3XL(Number(e.target.value))} className="w-full border rounded px-3 py-2 text-sm" min={0} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">4XL</label>
                <input type="number" value={qty4XL} onChange={(e) => setQty4XL(Number(e.target.value))} className="w-full border rounded px-3 py-2 text-sm" min={0} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">5XL</label>
                <input type="number" value={qty5XL} onChange={(e) => setQty5XL(Number(e.target.value))} className="w-full border rounded px-3 py-2 text-sm" min={0} />
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              ຈຳນວນຜະລິດ (ລວມແຖມ): <span className="font-semibold">{totalProductionQty}</span> | ຈຳນວນຄິດເງິນ:{" "}
              <span className="font-semibold">{billableQty}</span>
            </div>
          </div>

          {/* Finance */}
          <div className="bg-white rounded shadow p-4">
            <div className="font-semibold text-gray-700 mb-3">3) ການເງິນ & ຄ່າທຳນຽມ</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">ຄ່າເພີ່ມເຕີມ</label>
                <input type="number" value={extraCharge} onChange={(e) => setExtraCharge(Number(e.target.value))} className="w-full border rounded px-3 py-2 text-sm" min={0} />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600">ມັດຈຳຄ່າແບບ (ຫັກ)</label>
                <input type="number" value={designDeposit} onChange={(e) => setDesignDeposit(Number(e.target.value))} className="w-full border rounded px-3 py-2 text-sm" min={0} />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600">ມັດຈຳເບື້ອງຕົ້ນ</label>
                <input type="number" value={initialDeposit} onChange={(e) => setInitialDeposit(Number(e.target.value))} className="w-full border rounded px-3 py-2 text-sm" min={0} />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600">ຕົ້ນທຶນໂຮງງານ</label>
                <input type="number" value={factoryCost} onChange={(e) => setFactoryCost(Number(e.target.value))} className="w-full border rounded px-3 py-2 text-sm" min={0} />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} className="bg-green-600 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-green-700">
              ບັນທຶກ
            </button>
            <button onClick={resetForm} className="bg-gray-200 text-gray-700 px-5 py-2 rounded text-sm font-semibold hover:bg-gray-300">
              ຍົກເລີກ / ລ້າງ
            </button>
          </div>
        </div>

        {/* Right summary */}
        <div className="space-y-4">
          <div className="bg-white rounded shadow p-4">
            <div className="font-semibold text-gray-700 mb-3">4) ສະຫຼຸບ (ຄຳນວນທັນທີ)</div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">ຜ້າ:</span>
                <span className="font-semibold">{selectedFabric?.name ?? "—"}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">ຄ່າເສື້ອ:</span>
                <span className="font-semibold">{shirtsTotal.toLocaleString()}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">ບວກໄຊສ໌ໃຫຍ່:</span>
                <span className="font-semibold">{plusSizeTotal.toLocaleString()}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">ຄ່າເພີ່ມເຕີມ:</span>
                <span className="font-semibold">{extraCharge.toLocaleString()}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">ຫັກຄ່າແບບ:</span>
                <span className="font-semibold text-red-600">-{designDeposit.toLocaleString()}</span>
              </div>

              <div className="border-t pt-2 flex justify-between">
                <span className="text-gray-700 font-semibold">ຍອດສຸດທິ:</span>
                <span className="text-lg font-bold">{netTotal.toLocaleString()}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">ຈ່າຍແລ້ວ:</span>
                <span className="font-semibold text-green-700">{initialDeposit.toLocaleString()}</span>
              </div>

              <div className="border-t pt-2 flex justify-between">
                <span className="text-gray-700 font-semibold">ຍອດຄ້າງ:</span>
                <span className="text-lg font-bold text-red-600">{balance.toLocaleString()}</span>
              </div>

              <div className="border-t pt-2 flex justify-between">
                <span className="text-gray-600">ກຳໄລ (ຕົວຢ່າງ):</span>
                <span className={`font-bold ${profitPreview >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {profitPreview.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              * ກຳໄລຈະນັບເມື່ອປິດງານ (Completed) ແລະ ຈ່າຍຄົບ 100% ເທົ່ານັ້ນ
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
