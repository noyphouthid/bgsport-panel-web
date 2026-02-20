"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type OrderDetail = {
  id: string;
  order_code: string;
  order_date: string;
  customer_phone: string | null;
  factory_bill_code: string | null;

  fabric_id: string;
  fabric_name: string;
  fabric_short_price: number;
  fabric_long_price: number;

  short_qty: number;
  long_qty: number;
  free_qty: number;
  qty_3xl: number;
  qty_4xl: number;
  qty_5xl: number;

  size_upcharge: number;

  extra_charge: number;
  design_deposit: number;
  initial_deposit: number;
  factory_cost: number;

  gross_total: number;
  net_total: number;
  balance: number;

  status: "in_progress" | "completed";
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export default function EditOrderPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Edit fields
  const [orderDate, setOrderDate] = useState("");
  const [orderCode, setOrderCode] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [factoryBillCode, setFactoryBillCode] = useState("");

  const [shortQty, setShortQty] = useState(0);
  const [longQty, setLongQty] = useState(0);
  const [freeQty, setFreeQty] = useState(0);
  const [qty3XL, setQty3XL] = useState(0);
  const [qty4XL, setQty4XL] = useState(0);
  const [qty5XL, setQty5XL] = useState(0);

  const [extraCharge, setExtraCharge] = useState(0);
  const [designDeposit, setDesignDeposit] = useState(0);
  const [initialDeposit, setInitialDeposit] = useState(0);
  const [factoryCost, setFactoryCost] = useState(0);

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);

  const loadOrder = async () => {
    setLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    const o = data as OrderDetail;
    setOrder(o);

    // Set form values
    setOrderDate(o.order_date);
    setOrderCode(o.order_code);
    setCustomerPhone(o.customer_phone || "");
    setFactoryBillCode(o.factory_bill_code || "");

    setShortQty(o.short_qty);
    setLongQty(o.long_qty);
    setFreeQty(o.free_qty);
    setQty3XL(o.qty_3xl);
    setQty4XL(o.qty_4xl);
    setQty5XL(o.qty_5xl);

    setExtraCharge(o.extra_charge);
    setDesignDeposit(o.design_deposit);
    setInitialDeposit(o.initial_deposit);
    setFactoryCost(o.factory_cost);

    setLoading(false);
  };

  useEffect(() => {
    if (orderId) loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Calculations
  const shirtsTotal = useMemo(() => {
    if (!order) return 0;
    return shortQty * order.fabric_short_price + longQty * order.fabric_long_price;
  }, [shortQty, longQty, order]);

  const plusSizeQty = useMemo(() => qty3XL + qty4XL + qty5XL, [qty3XL, qty4XL, qty5XL]);
  const plusSizeTotal = useMemo(() => plusSizeQty * (order?.size_upcharge || 20000), [plusSizeQty, order]);
  const grossTotal = useMemo(() => shirtsTotal + plusSizeTotal + extraCharge, [shirtsTotal, plusSizeTotal, extraCharge]);
  const netTotal = useMemo(() => Math.max(0, grossTotal - designDeposit), [grossTotal, designDeposit]);
  const balance = useMemo(() => Math.max(0, netTotal - initialDeposit), [netTotal, initialDeposit]);
  const profitPreview = useMemo(() => netTotal - factoryCost, [netTotal, factoryCost]);

  const totalProductionQty = useMemo(() => shortQty + longQty + freeQty, [shortQty, longQty, freeQty]);
  const billableQty = useMemo(() => shortQty + longQty, [shortQty, longQty]);

  const handleUpdate = async () => {
    if (!order) return;
    setErr(null);

    const payload = {
      order_code: orderCode.trim(),
      order_date: orderDate,
      customer_phone: customerPhone.trim() || null,
      factory_bill_code: factoryBillCode.trim() || null,

      short_qty: Math.max(0, shortQty),
      long_qty: Math.max(0, longQty),
      free_qty: Math.max(0, freeQty),
      qty_3xl: Math.max(0, qty3XL),
      qty_4xl: Math.max(0, qty4XL),
      qty_5xl: Math.max(0, qty5XL),

      extra_charge: Math.max(0, extraCharge),
      design_deposit: Math.max(0, designDeposit),
      initial_deposit: Math.max(0, initialDeposit),
      factory_cost: Math.max(0, factoryCost),

      gross_total: grossTotal,
      net_total: netTotal,
      balance: balance,
    };

    const { error } = await supabase.from("orders").update(payload).eq("id", orderId);

    if (error) {
      setErr(error.message);
      return;
    }

    alert("ບັນທຶກການແກ້ໄຂແລ້ວ");
    await loadOrder();
  };

  const handleAddPayment = async () => {
    if (!order) return;
    if (paymentAmount <= 0) return alert("ກະລຸນາປ້ອນຈຳນວນເງິນ");
    if (paymentAmount > balance) return alert("ຈຳນວນເງິນເກີນຍອດຄ້າງ");

    setErr(null);

    const newDeposit = initialDeposit + paymentAmount;
    const newBalance = netTotal - newDeposit;

    const { error } = await supabase
      .from("orders")
      .update({
        initial_deposit: newDeposit,
        balance: newBalance,
      })
      .eq("id", orderId);

    if (error) {
      setErr(error.message);
      return;
    }

    alert(`ຮັບເງິນ ${paymentAmount.toLocaleString()} ກີບແລ້ວ`);
    setShowPaymentModal(false);
    setPaymentAmount(0);
    await loadOrder();
  };

  const handleMarkCompleted = async () => {
    if (!order) return;

    if (balance > 0) {
      return alert("ບໍ່ສາມາດປິດງານໄດ້!\nຕ້ອງຮັບເງິນຄົບກ່ອນ (ຍອດຄ້າງ = 0)");
    }

    const ok = confirm("ຢືນຢັນປິດງານ?\nອໍເດີ້ຈະຖືກເປັນ 'ສຳເລັດແລ້ວ'");
    if (!ok) return;

    setErr(null);

    const { error } = await supabase
      .from("orders")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) {
      setErr(error.message);
      return;
    }

    alert("ປິດງານສຳເລັດ!");
    await loadOrder();
  };

  const handleDelete = async () => {
    if (!order) return;

    const ok = confirm(
      `ຢືນຢັນລຶບອໍເດີ້?\n\nລະຫັດ: ${order.order_code}\nຜ້າ: ${order.fabric_name}\n\n⚠️ ການລຶບຈະບໍ່ສາມາດກູ້ຄືນໄດ້!`
    );
    if (!ok) return;

    setErr(null);

    const { error } = await supabase.from("orders").delete().eq("id", orderId);

    if (error) {
      setErr(error.message);
      return;
    }

    alert("ລຶບອໍເດີ້ແລ້ວ");
    router.push("/orders");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg font-bold text-slate-800">ກຳລັງໂຫຼດ...</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-lg font-bold text-red-600 mb-4">ບໍ່ພົບອໍເດີ້</div>
          <Link href="/orders" className="text-blue-600 font-bold hover:underline">
            ກັບໄປໜ້າອໍເດີ້
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="text-slate-900">
      {err && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm font-medium">
          Error: {err}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">ແກ້ໄຂອໍເດີ້: {order.order_code}</h1>
          <div className="text-sm text-slate-500 font-medium">
            ສ້າງວັນທີ: {new Date(order.created_at).toLocaleString("lo-LA")}
          </div>
        </div>

        <div className="flex gap-2">
          <Link href="/orders" className="border border-slate-300 px-4 py-2 rounded text-sm font-bold text-slate-700 hover:bg-white shadow-sm transition-all">
            ກັບຄືນ
          </Link>

          {order.status !== "completed" && (
            <>
              <button
                onClick={() => setShowPaymentModal(true)}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-blue-700 shadow-sm"
                disabled={balance === 0}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                ຮັບເງິນ
              </button>

              <button
                onClick={handleMarkCompleted}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-green-700 shadow-sm"
                disabled={balance > 0}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                ປິດງານ
              </button>
            </>
          )}

          <button onClick={handleUpdate} className="bg-orange-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-orange-700 shadow-sm">
            ບັນທຶກການແກ້ໄຂ
          </button>

          <button onClick={handleDelete} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-red-700 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            ລຶບ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left */}
        <div className="lg:col-span-2 space-y-4">
          {/* Status Badge */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">ສະຖານະອໍເດີ້</div>
                <div className="mt-1">
                  {order.status === "completed" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-black">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      ສຳເລັດແລ້ວ
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-black">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                      ກຳລັງຜະລິດ
                    </span>
                  )}
                </div>
              </div>

              {order.completed_at && (
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">量ປິດງານວັນທີ</div>
                  <div className="text-sm font-bold text-slate-800">{new Date(order.completed_at).toLocaleString("lo-LA")}</div>
                </div>
              )}
            </div>
          </div>

          {/* Basic Info */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="font-bold text-slate-800 mb-3 uppercase text-xs tracking-wider border-b pb-2">1) ຂໍ້ມູນພື້ນຖານ</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ວັນທີສັ່ງຊື້</label>
                <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ລະຫັດອໍເດີ້</label>
                <input value={orderCode} onChange={(e) => setOrderCode(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-black focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ເບີໂທລູກຄ້າ</label>
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="020xxxxxxxx" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold" />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ບິນໂຮງງານ</label>
                <input value={factoryBillCode} onChange={(e) => setFactoryBillCode(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold" />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-700 block mb-1">ປະເພດຜ້າ (Snapshot)</label>
                <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 font-black">
                  {order.fabric_name} (ສັ້ນ:{order.fabric_short_price.toLocaleString()} / ຍາວ:{order.fabric_long_price.toLocaleString()})
                </div>
                <div className="text-[10px] text-slate-500 mt-1 font-bold italic">* ລາຄາຜ້າຖືກ snapshot ໄວ້ແລ້ວ (ບໍ່ປ່ຽນຕາມລາຄາໃໝ່)</div>
              </div>
            </div>
          </div>

          {/* Quantity */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="font-bold text-slate-800 mb-3 uppercase text-xs tracking-wider border-b pb-2">2) ຈຳນວນ & ຂະໜາດ</div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ແຂນສັ້ນ</label>
                <input type="number" value={shortQty} onChange={(e) => setShortQty(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-black" min={0} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ແຂນຍາວ</label>
                <input type="number" value={longQty} onChange={(e) => setLongQty(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-black" min={0} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ແຖມ (ບໍ່ຄິດເງິນ)</label>
                <input type="number" value={freeQty} onChange={(e) => setFreeQty(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-orange-600 font-black" min={0} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">3XL</label>
                <input type="number" value={qty3XL} onChange={(e) => setQty3XL(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold" min={0} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">4XL</label>
                <input type="number" value={qty4XL} onChange={(e) => setQty4XL(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold" min={0} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">5XL</label>
                <input type="number" value={qty5XL} onChange={(e) => setQty5XL(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold" min={0} />
              </div>
            </div>

            <div className="mt-4 p-2 bg-slate-50 rounded-lg text-[11px] font-black text-slate-500 uppercase tracking-tight">
              ຈຳນວນຜະລິດ (ລວມແຖມ): <span className="text-slate-900">{totalProductionQty}</span> | ຈຳນວນຄິດເງິນ:{" "}
              <span className="text-blue-600 font-black">{billableQty}</span>
            </div>
          </div>

          {/* Finance */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="font-bold text-slate-800 mb-3 uppercase text-xs tracking-wider border-b pb-2"> ລາຍການບວກເພີ່ມ & ຮູບແບບການມັດຈຳ</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ບວກເພີ່ມ (ງານດ່ວນ,ອື່ນໆ)</label>
                <input type="number" value={extraCharge} onChange={(e) => setExtraCharge(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-black" min={0} />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ມັດຈຳຄ່າແບບ (ຫັກ)</label>
                <input type="number" value={designDeposit} onChange={(e) => setDesignDeposit(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-red-600 font-black" min={0} />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ມັດຈຳສັ່ງຜະລິດກ່ອນ (ຮັບແລ້ວ)</label>
                <div className="flex gap-2">
                  <input type="number" value={initialDeposit} onChange={(e) => setInitialDeposit(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-emerald-600 font-black" min={0} />
                  <button onClick={() => setShowPaymentModal(true)} className="bg-blue-600 text-white px-3 rounded-lg text-sm font-bold hover:bg-blue-700" disabled={balance === 0}>
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ຕົ້ນທຶນໂຮງງານ</label>
                <input type="number" value={factoryCost} onChange={(e) => setFactoryCost(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-black" min={0} />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleUpdate} className="flex items-center gap-2 bg-orange-600 text-white px-6 py-2.5 rounded-lg text-sm font-black hover:bg-orange-700 shadow-md active:scale-95 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
              ບັນທຶກການແກ້ໄຂ
            </button>

            {order.status !== "completed" && (
              <button onClick={handleMarkCompleted} className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-black hover:bg-green-700 shadow-md active:scale-95 transition-all" disabled={balance > 0}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                ປິດງານ
              </button>
            )}

            <button onClick={handleDelete} className="flex items-center gap-2 bg-red-600 text-white px-6 py-2.5 rounded-lg text-sm font-black hover:bg-red-700 shadow-md active:scale-95 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              ລຶບອໍເດີ້
            </button>
          </div>
        </div>

        {/* Right Summary */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sticky top-4">
            <div className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest border-b pb-3">4) ສະຫຼຸບອໍເດີ້</div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-bold">ຜ້າ:</span>
                <span className="font-black text-slate-900">{order.fabric_name}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-bold">ຄ່າເສື້ອ:</span>
                <span className="font-black text-slate-800">{shirtsTotal.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-bold">ບວກໄຊສ໌ໃຫຍ່:</span>
                <span className="font-black text-slate-800">{plusSizeTotal.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-bold">ຄ່າເພີ່ມເຕີມ:</span>
                <span className="font-black text-slate-800">{extraCharge.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center bg-red-50 p-2 rounded-lg">
                <span className="text-red-600 font-black">ຫັກຄ່າແບບ:</span>
                <span className="font-black text-red-600">-{designDeposit.toLocaleString()}</span>
              </div>

              <div className="border-t border-dashed pt-3 flex justify-between items-center">
                <span className="text-slate-800 font-black uppercase text-xs">ຍອດສຸດທິ:</span>
                <span className="text-xl font-black text-slate-900">{netTotal.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-bold">ຈ່າຍແລ້ว:</span>
                <span className="font-black text-emerald-600">+{initialDeposit.toLocaleString()}</span>
              </div>

              <div className="border-t-2 border-slate-100 pt-3 flex justify-between items-center">
                <span className="text-slate-800 font-black uppercase text-xs">ຍອດຄ້າງ:</span>
                <span className={`text-xl font-black ${balance === 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {balance.toLocaleString()}
                </span>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                <span className="text-slate-500 font-bold">ກຳໄລ:</span>
                <span className={`text-lg font-black ${profitPreview >= 0 ? "text-blue-600" : "text-red-600"}`}>
                  {profitPreview.toLocaleString()}
                </span>
              </div>
            </div>

            {balance > 0 && order.status !== "completed" && (
              <div className="mt-6">
                <button onClick={() => setShowPaymentModal(true)} className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white px-4 py-3 rounded-xl text-sm font-black hover:bg-blue-700 shadow-md transition-all active:scale-95">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                  ຮັບເງິນ ({balance.toLocaleString()})
                </button>
              </div>
            )}

            {balance === 0 && order.status !== "completed" && (
              <div className="mt-6">
                <button onClick={handleMarkCompleted} className="flex items-center justify-center gap-2 w-full bg-green-600 text-white px-4 py-3 rounded-xl text-sm font-black hover:bg-green-700 shadow-md transition-all active:scale-95">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  ປິດງານທັນທີ
                </button>
              </div>
            )}
          </div>

          {/* Payment History */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="font-bold text-slate-800 mb-3 uppercase text-xs tracking-wider border-b pb-2">ປະຫວັດການຈ່າຍ</div>
            <div className="text-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-500 font-bold">ຮັບມັດຈຳທັງໝົດ:</span>
                <span className="font-black text-slate-900">{order.initial_deposit.toLocaleString()}</span>
              </div>

              {order.status === "completed" && (
                <div className="mt-2 pt-2 border-t border-slate-50">
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 p-2 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span className="font-black text-xs uppercase">ຊຳລະຄົບຖ້ວນແລ້ວ</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm transition-all">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
              <div className="font-black text-slate-800 uppercase text-xs tracking-widest">ຮັບເງິນຈາກລູກຄ້າ</div>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">
                ✕
              </button>
            </div>

            <div className="p-6">
              <div className="mb-6 text-center">
                <div className="text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider">ຍອດຄ້າງຊຳລະ</div>
                <div className="text-3xl font-black text-rose-600">{balance.toLocaleString()} <span className="text-sm font-bold text-slate-400">ກີບ</span></div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 uppercase mb-2 block">ຈຳນວນເງິນທີ່ຮັບ</label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  placeholder="0"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-2xl font-black text-slate-900 focus:border-blue-500 outline-none transition-all text-center"
                  min={0}
                  max={balance}
                  autoFocus
                />
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2">
                <button onClick={() => setPaymentAmount(balance)} className="bg-slate-100 rounded-lg py-2 text-[11px] font-black text-slate-700 hover:bg-green-600 hover:text-white transition-all uppercase">
                  ຈ່າຍຄົບ
                </button>
                <button onClick={() => setPaymentAmount(Math.floor(balance / 2))} className="bg-slate-100 rounded-lg py-2 text-[11px] font-black text-slate-700 hover:bg-green-600 hover:text-white transition-all uppercase">
                  50%
                </button>
                <button onClick={() => setPaymentAmount(0)} className="bg-slate-100 rounded-lg py-2 text-[11px] font-black text-slate-700 hover:bg-slate-200 transition-all uppercase">
                  ລ້າງ
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t flex gap-2 justify-end">
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-500 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-200 transition-all">
                ຍົກເລີກ
              </button>
              <button onClick={handleAddPayment} className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-black hover:bg-green-700 shadow-md active:scale-95 transition-all">
                ຢືນຢັນຮັບເງິນ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}