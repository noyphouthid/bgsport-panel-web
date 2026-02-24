"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type OrderDetail = {
  id: string;
  order_code: string;
  order_date: string;
  customer_phone: string | null;
  factory_bill_code: string | null;
  admin_user_id: string | null;
  graphic_user_id: string | null;
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
  production_completed_at: string | null;
  customer_remaining_due_at: string | null;
  factory_payment_due_at: string | null;
  customer_paid_full_at: string | null;
  factory_paid_full_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

type UserOption = {
  id: string;
  full_name: string;
  role: "admin" | "manager" | "staff" | "graphic" | "accountant";
  is_active: boolean;
};

type CustomerPayment = {
  id: string;
  order_id: string;
  amount: number;
  paid_at: string;
  note: string | null;
  created_at: string;
};

type FactoryPayment = {
  id: string;
  order_id: string;
  amount: number;
  paid_at: string;
  note: string | null;
  created_at: string;
};

export default function EditOrderPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [factoryPayments, setFactoryPayments] = useState<FactoryPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [orderDate, setOrderDate] = useState("");
  const [orderCode, setOrderCode] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [factoryBillCode, setFactoryBillCode] = useState("");
  const [adminUserId, setAdminUserId] = useState("");
  const [graphicUserId, setGraphicUserId] = useState("");
  const [shortQty, setShortQty] = useState(0);
  const [longQty, setLongQty] = useState(0);
  const [freeQty, setFreeQty] = useState(0);
  const [qty3XL, setQty3XL] = useState(0);
  const [qty4XL, setQty4XL] = useState(0);
  const [qty5XL, setQty5XL] = useState(0);
  const [extraCharge, setExtraCharge] = useState(0);
  const [designDeposit, setDesignDeposit] = useState(0);
  const [factoryCost, setFactoryCost] = useState(0);
  const [customerRemainingDueDate, setCustomerRemainingDueDate] = useState("");
  const [factoryPaymentDueDate, setFactoryPaymentDueDate] = useState("");
  const [productionCompletedDate, setProductionCompletedDate] = useState("");

  const [showCustomerPayModal, setShowCustomerPayModal] = useState(false);
  const [customerPayAmount, setCustomerPayAmount] = useState(0);
  const [customerPayNote, setCustomerPayNote] = useState("");
  const [customerPayDate, setCustomerPayDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [showFactoryPayModal, setShowFactoryPayModal] = useState(false);
  const [factoryPayAmount, setFactoryPayAmount] = useState(0);
  const [factoryPayNote, setFactoryPayNote] = useState("");
  const [factoryPayDate, setFactoryPayDate] = useState(() => new Date().toISOString().slice(0, 10));

  const toDateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
  const dateInputToIso = (value: string) => (value ? new Date(`${value}T12:00:00`).toISOString() : null);

  const safeInsertAction = async (action: string, detail: string) => {
    const { error } = await supabase.from("order_status_history").insert({
      order_id: orderId,
      action,
      detail,
      action_at: new Date().toISOString(),
    });
    if (error && !error.message.includes("Could not find the table")) {
      setErr(error.message);
    }
  };

  const loadOrder = async () => {
    const { data, error } = await supabase.from("orders").select("*").eq("id", orderId).single();
    if (error) throw error;
    const o = data as OrderDetail;
    setOrder(o);
    setOrderDate(o.order_date);
    setOrderCode(o.order_code);
    setCustomerPhone(o.customer_phone || "");
    setFactoryBillCode(o.factory_bill_code || "");
    setAdminUserId(o.admin_user_id || "");
    setGraphicUserId(o.graphic_user_id || "");
    setShortQty(o.short_qty);
    setLongQty(o.long_qty);
    setFreeQty(o.free_qty);
    setQty3XL(o.qty_3xl);
    setQty4XL(o.qty_4xl);
    setQty5XL(o.qty_5xl);
    setExtraCharge(o.extra_charge);
    setDesignDeposit(o.design_deposit);
    setFactoryCost(o.factory_cost);
    setCustomerRemainingDueDate(toDateInput(o.customer_remaining_due_at));
    setFactoryPaymentDueDate(toDateInput(o.factory_payment_due_at));
    setProductionCompletedDate(toDateInput(o.production_completed_at));
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
      throw error;
    }
    setUsers((data ?? []) as UserOption[]);
    setLoadingUsers(false);
  };

  const loadCustomerPayments = async () => {
    const { data, error } = await supabase
      .from("payment_transactions")
      .select("id,order_id,amount,paid_at,note,created_at")
      .eq("order_id", orderId)
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      if (error.message.includes("Could not find the table")) {
        setCustomerPayments([]);
        return;
      }
      throw error;
    }
    setCustomerPayments((data ?? []) as CustomerPayment[]);
  };

  const loadFactoryPayments = async () => {
    const { data, error } = await supabase
      .from("factory_payments")
      .select("id,order_id,amount,paid_at,note,created_at")
      .eq("order_id", orderId)
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      if (error.message.includes("Could not find the table")) {
        setFactoryPayments([]);
        return;
      }
      throw error;
    }
    setFactoryPayments((data ?? []) as FactoryPayment[]);
  };

  const reloadAll = async () => {
    setLoading(true);
    setErr(null);
    try {
      await Promise.all([loadOrder(), loadUsers()]);
      await Promise.all([loadCustomerPayments(), loadFactoryPayments()]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Load failed";
      setErr(message);
      setLoadingUsers(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId) reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const adminOptions = useMemo(() => users.filter((u) => u.role === "admin"), [users]);
  const graphicOptions = useMemo(() => users.filter((u) => u.role === "graphic"), [users]);

  const shirtsTotal = useMemo(() => {
    if (!order) return 0;
    return shortQty * order.fabric_short_price + longQty * order.fabric_long_price;
  }, [order, shortQty, longQty]);

  const plusSizeQty = useMemo(() => qty3XL + qty4XL + qty5XL, [qty3XL, qty4XL, qty5XL]);
  const plusSizeTotal = useMemo(() => plusSizeQty * (order?.size_upcharge || 20000), [plusSizeQty, order]);
  const grossTotal = useMemo(() => shirtsTotal + plusSizeTotal + extraCharge, [shirtsTotal, plusSizeTotal, extraCharge]);
  const netTotal = useMemo(() => Math.max(0, grossTotal - designDeposit), [grossTotal, designDeposit]);

  const customerReceived = useMemo(() => {
    if (customerPayments.length > 0) {
      return customerPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    }
    return order ? Number(order.initial_deposit || 0) : 0;
  }, [customerPayments, order]);

  const customerOutstanding = useMemo(() => Math.max(0, netTotal - customerReceived), [netTotal, customerReceived]);

  const factoryPaid = useMemo(
    () => factoryPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [factoryPayments]
  );
  const factoryOutstanding = useMemo(
    () => Math.max(0, Math.max(0, Number(factoryCost || 0)) - factoryPaid),
    [factoryCost, factoryPaid]
  );

  const profitPreview = useMemo(() => netTotal - Math.max(0, Number(factoryCost || 0)), [netTotal, factoryCost]);

  const customerPayStatus = customerOutstanding === 0 ? "ຊຳລະແລ້ວ" : customerReceived > 0 ? "ຊຳລະບາງສ່ວນ" : "ຍັງບໍ່ຊຳລະ";
  const factoryPayStatus = factoryOutstanding === 0 ? "ຊຳລະແລ້ວ" : factoryPaid > 0 ? "ຊຳລະບາງສ່ວນ" : "ຍັງບໍ່ຊຳລະ";

  const handleUpdate = async () => {
    if (!order) return;
    setErr(null);
    if (!adminUserId) return alert("Please select admin");
    if (!graphicUserId) return alert("Please select graphic");
    const payload = {
      order_code: orderCode.trim(),
      order_date: orderDate,
      customer_phone: customerPhone.trim() || null,
      factory_bill_code: factoryBillCode.trim() || null,
      admin_user_id: adminUserId || null,
      graphic_user_id: graphicUserId || null,
      short_qty: Math.max(0, shortQty),
      long_qty: Math.max(0, longQty),
      free_qty: Math.max(0, freeQty),
      qty_3xl: Math.max(0, qty3XL),
      qty_4xl: Math.max(0, qty4XL),
      qty_5xl: Math.max(0, qty5XL),
      extra_charge: Math.max(0, extraCharge),
      design_deposit: Math.max(0, designDeposit),
      factory_cost: Math.max(0, factoryCost),
      gross_total: grossTotal,
      net_total: netTotal,
      initial_deposit: customerReceived,
      balance: customerOutstanding,
      customer_remaining_due_at: dateInputToIso(customerRemainingDueDate),
      factory_payment_due_at: dateInputToIso(factoryPaymentDueDate),
      production_completed_at: dateInputToIso(productionCompletedDate),
    };

    const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
    if (error) {
      setErr(error.message);
      return;
    }
    await safeInsertAction("update_order", "Updated order details and recalculated totals");
    await reloadAll();
  };

  const handleAddCustomerPayment = async () => {
    if (customerPayAmount <= 0) return alert("ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0");
    if (customerPayAmount > customerOutstanding) return alert("ຈຳນວນເງິນເກີນຍອດຄ້າງຊຳລະ");

    const { error: insertError } = await supabase.from("payment_transactions").insert({
      order_id: orderId,
      amount: customerPayAmount,
      paid_at: dateInputToIso(customerPayDate) || new Date().toISOString(),
      note: customerPayNote.trim() || null,
    });
    if (insertError) {
      setErr(insertError.message);
      return;
    }

    const nextReceived = customerReceived + customerPayAmount;
    const nextOutstanding = Math.max(0, netTotal - nextReceived);
    const paidAtIso = dateInputToIso(customerPayDate) || new Date().toISOString();
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        initial_deposit: nextReceived,
        balance: nextOutstanding,
        customer_paid_full_at: nextOutstanding === 0 ? paidAtIso : null,
      })
      .eq("id", orderId);
    if (updateError) {
      setErr(updateError.message);
      return;
    }

    await safeInsertAction("receive_customer_payment", `Received ${customerPayAmount}`);
    setShowCustomerPayModal(false);
    setCustomerPayAmount(0);
    setCustomerPayNote("");
    setCustomerPayDate(new Date().toISOString().slice(0, 10));
    await reloadAll();
  };

  const handleAddFactoryPayment = async () => {
    if (factoryPayAmount <= 0) return alert("ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0");
    if (factoryPayAmount > factoryOutstanding) return alert("ຈຳນວນເງິນເກີນຍອດຄ້າງຊຳລະໂຮງງານ");

    const { error: insertError } = await supabase.from("factory_payments").insert({
      order_id: orderId,
      amount: factoryPayAmount,
      paid_at: dateInputToIso(factoryPayDate) || new Date().toISOString(),
      note: factoryPayNote.trim() || null,
    });
    if (insertError) {
      setErr(insertError.message);
      return;
    }

    const nextFactoryPaid = factoryPaid + factoryPayAmount;
    const nextFactoryOutstanding = Math.max(0, Math.max(0, Number(factoryCost || 0)) - nextFactoryPaid);
    const paidAtIso = dateInputToIso(factoryPayDate) || new Date().toISOString();
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        factory_paid_full_at: nextFactoryOutstanding === 0 ? paidAtIso : null,
      })
      .eq("id", orderId);
    if (updateError) {
      setErr(updateError.message);
      return;
    }

    await safeInsertAction("pay_factory", `Paid factory ${factoryPayAmount}`);
    setShowFactoryPayModal(false);
    setFactoryPayAmount(0);
    setFactoryPayNote("");
    setFactoryPayDate(new Date().toISOString().slice(0, 10));
    await reloadAll();
  };

  const handleMarkProductionCompleted = async () => {
    if (!productionCompletedDate) return alert("ກະລຸນາເລືອກວັນທີຜະລິດສຳເລັດ");
    const { error } = await supabase
      .from("orders")
      .update({ production_completed_at: dateInputToIso(productionCompletedDate) })
      .eq("id", orderId);
    if (error) {
      setErr(error.message);
      return;
    }
    await safeInsertAction("production_completed", "Marked production completed");
    await reloadAll();
  };

  const handleCloseOrder = async () => {
    if (customerOutstanding > 0) return alert("ບໍ່ສາມາດປິດໄດ້: ລູກຄ້າຍັງຄ້າງຊຳລະ");
    if (factoryOutstanding > 0) return alert("ບໍ່ສາມາດປິດໄດ້: ຍັງຄ້າງຊຳລະໃຫ້ໂຮງງານ");

    const { error } = await supabase
      .from("orders")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    if (error) {
      setErr(error.message);
      return;
    }
    await safeInsertAction("close_order", "Closed order after customer/factory settled");
    await reloadAll();
  };

  const handleDelete = async () => {
    if (!order) return;
    const ok = confirm(`ຕ້ອງການລຶບອໍເດີ ${order.order_code} ຫຼື ບໍ່? ບໍ່ສາມາດກັບຄືນໄດ້.`);
    if (!ok) return;
    const { error } = await supabase.from("orders").delete().eq("id", orderId);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push("/orders");
  };

  if (loading) return <div className="text-slate-800 font-bold">ກຳລັງໂຫຼດ...</div>;
  if (!order) return <div className="text-red-600 font-bold">ບໍ່ພົບຂໍ້ມູນອໍເດີ.</div>;

  return (
    <div className="space-y-4">
      {err && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">ຂໍ້ຜິດພາດ: {err}</div>}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">ແກ້ໄຂອໍເດີ: {order.order_code}</h1>
          <div className="text-sm text-slate-700">ສ້າງເມື່ອ: {new Date(order.created_at).toLocaleString("en-US")}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/orders" className="border border-slate-300 px-4 py-2 rounded text-sm font-bold text-slate-700">
            ກັບຄືນ
          </Link>
          <button onClick={handleMarkProductionCompleted} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-bold">
            ຜະລິດສຳເລັດ
          </button>
          <button onClick={handleCloseOrder} className="bg-green-600 text-white px-4 py-2 rounded text-sm font-bold">
            ປິດຍອດອໍເດີ(ຮັບເງິນແລ້ວ)
          </button>
          <button onClick={handleUpdate} className="bg-orange-600 text-white px-4 py-2 rounded text-sm font-bold">
            ບັນທຶກ
          </button>
          <button onClick={handleDelete} className="bg-red-600 text-white px-4 py-2 rounded text-sm font-bold">
            ລຶບ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">ວັນທີສັ່ງຊື້</label>
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">ລະຫັດອໍເດີ</label>
              <input value={orderCode} onChange={(e) => setOrderCode(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-bold text-slate-900" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">ເບີໂທລູກຄ້າ</label>
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">ລະຫັດບິນໂຮງງານ</label>
              <input value={factoryBillCode} onChange={(e) => setFactoryBillCode(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">Admin</label>
              <select
                value={adminUserId}
                onChange={(e) => setAdminUserId(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 bg-white"
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
              <label className="text-xs font-bold text-slate-800 block mb-1">Graphic</label>
              <select
                value={graphicUserId}
                onChange={(e) => setGraphicUserId(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 bg-white"
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
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">ຈຳນວນແຂນສັ້ນ</label>
              <input type="number" min={0} value={shortQty} onChange={(e) => setShortQty(Number(e.target.value))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">ຈຳນວນແຂນຍາວ</label>
              <input type="number" min={0} value={longQty} onChange={(e) => setLongQty(Number(e.target.value))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">ຈຳນວນແຖມ</label>
              <input type="number" min={0} value={freeQty} onChange={(e) => setFreeQty(Number(e.target.value))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">ຕົ້ນທຶນໂຮງງານ</label>
              <input type="number" min={0} value={factoryCost} onChange={(e) => setFactoryCost(Number(e.target.value))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">ຄ່າໃຊ້ຈ່າຍເພີ່ມເຕີມ</label>
              <input type="number" min={0} value={extraCharge} onChange={(e) => setExtraCharge(Number(e.target.value))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">ມັດຈຳຄ່າອອກແບບ (ຫັກອອກ)</label>
              <input type="number" min={0} value={designDeposit} onChange={(e) => setDesignDeposit(Number(e.target.value))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">ລູກຄ້າຊຳລະສ່ວນທີ່ເຫຼືອ (50%)</label>
              <input type="date" value={customerRemainingDueDate} onChange={(e) => setCustomerRemainingDueDate(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">ວັນທີຊຳລະໃຫ້ໂຮງງານ</label>
              <input type="date" value={factoryPaymentDueDate} onChange={(e) => setFactoryPaymentDueDate(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">ວັນທີຜະລິດສຳເລັດ (ເດືອນກຳໄລ)</label>
              <input type="date" value={productionCompletedDate} onChange={(e) => setProductionCompletedDate(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-black text-slate-900">ປະຫວັດການຊຳລະຂອງລູກຄ້າ</div>
              <button onClick={() => setShowCustomerPayModal(true)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-black">
                ຮັບເງິນຊຳລະ
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-auto">
              {customerPayments.length === 0 ? (
                <div className="text-slate-500 text-sm">ບໍ່ມີລາຍການຊຳລະຈາກລູກຄ້າ.</div>
              ) : (
                customerPayments.map((p) => (
                  <div key={p.id} className="flex justify-between bg-slate-50 rounded p-2 border border-slate-100">
                    <div className="text-xs text-slate-700">
                      <div className="font-bold">{new Date(p.paid_at).toLocaleString("en-US")}</div>
                      <div>{p.note || "-"}</div>
                    </div>
                    <div className="text-emerald-600 font-black">+{Number(p.amount).toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-black text-slate-900">ປະຫວັດການຊຳລະໃຫ້ໂຮງງານ</div>
              <button onClick={() => setShowFactoryPayModal(true)} className="bg-rose-600 text-white px-3 py-1.5 rounded text-xs font-black">
                ຊຳລະໃຫ້ໂຮງງານ
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-auto">
              {factoryPayments.length === 0 ? (
                <div className="text-slate-500 text-sm">ບໍ່ມີລາຍການຊຳລະໃຫ້ໂຮງງານ.</div>
              ) : (
                factoryPayments.map((p) => (
                  <div key={p.id} className="flex justify-between bg-slate-50 rounded p-2 border border-slate-100">
                    <div className="text-xs text-slate-700">
                      <div className="font-bold">{new Date(p.paid_at).toLocaleString("en-US")}</div>
                      <div>{p.note || "-"}</div>
                    </div>
                    <div className="text-rose-600 font-black">-{Number(p.amount).toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
            <div className="text-sm font-black text-slate-900">ສະຫຼຸບອໍເດີ</div>
            <div className="flex justify-between text-sm text-slate-800"><span>ຍອດລວມສຸດທິ</span><span className="font-black">{netTotal.toLocaleString()}</span></div>
            <div className="flex justify-between text-sm text-slate-800"><span>ຕົ້ນທຶນໂຮງງານ</span><span className="font-black">{Number(factoryCost).toLocaleString()}</span></div>
            <div className="flex justify-between text-sm text-slate-800"><span>ກຳໄລເບື້ອງຕົ້ນ</span><span className={`font-black ${profitPreview >= 0 ? "text-blue-600" : "text-red-600"}`}>{profitPreview.toLocaleString()}</span></div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
            <div className="text-sm font-black text-slate-900">ລາຍຮັບ (ຈາກລູກຄ້າ)</div>
            <div className="flex justify-between text-sm text-slate-800"><span>ຮັບແລ້ວ</span><span className="font-black text-emerald-600">{customerReceived.toLocaleString()}</span></div>
            <div className="flex justify-between text-sm text-slate-800"><span>ຄ້າງຊຳລະ</span><span className="font-black text-rose-600">{customerOutstanding.toLocaleString()}</span></div>
            <div className="text-xs font-bold text-slate-700 uppercase">ສະຖານະ: {customerPayStatus}</div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
            <div className="text-sm font-black text-slate-900">ລາຍຈ່າຍ (ໃຫ້ໂຮງງານ)</div>
            <div className="flex justify-between text-sm text-slate-800"><span>ຊຳລະແລ້ວ</span><span className="font-black text-rose-600">{factoryPaid.toLocaleString()}</span></div>
            <div className="flex justify-between text-sm text-slate-800"><span>ຄ້າງຊຳລະ</span><span className="font-black text-amber-600">{factoryOutstanding.toLocaleString()}</span></div>
            <div className="text-xs font-bold text-slate-700 uppercase">ສະຖານະ: {factoryPayStatus}</div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-1 text-xs text-slate-800">
            <div><span className="font-bold text-slate-900">ຜະລິດສຳເລັດ:</span> {order.production_completed_at ? new Date(order.production_completed_at).toLocaleString("en-US") : "-"}</div>
            <div><span className="font-bold text-slate-900">ກຳນົດຊຳລະລູກຄ້າ:</span> {order.customer_remaining_due_at ? new Date(order.customer_remaining_due_at).toLocaleDateString("en-US") : "-"}</div>
            <div><span className="font-bold text-slate-900">ວັນທີຊຳລະໂຮງງານ:</span> {order.factory_payment_due_at ? new Date(order.factory_payment_due_at).toLocaleDateString("en-US") : "-"}</div>
            <div><span className="font-bold text-slate-900">ລູກຄ້າຊຳລະຄົບ:</span> {order.customer_paid_full_at ? new Date(order.customer_paid_full_at).toLocaleString("en-US") : "-"}</div>
            <div><span className="font-bold text-slate-900">ໂຮງງານຊຳລະຄົບ:</span> {order.factory_paid_full_at ? new Date(order.factory_paid_full_at).toLocaleString("en-US") : "-"}</div>
            <div><span className="font-bold text-slate-900">ປິດອໍເດີເມື່ອ:</span> {order.closed_at ? new Date(order.closed_at).toLocaleString("en-US") : "-"}</div>
            <div><span className="font-bold text-slate-900">ສະຖານະ:</span> {order.status === "in_progress" ? "ກຳລັງດຳເນີນການ" : "ສຳເລັດແລ້ວ"}</div>
          </div>
        </div>
      </div>

      {showCustomerPayModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-4 w-full max-w-md space-y-3">
            <div className="font-black text-slate-900">ຮັບເງິນຊຳລະຈາກລູກຄ້າ</div>
            <div className="text-sm text-slate-700">ຍອດຄ້າງຊຳລະ: {customerOutstanding.toLocaleString()}</div>
            <input type="date" value={customerPayDate} onChange={(e) => setCustomerPayDate(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
            <input type="number" value={customerPayAmount} onChange={(e) => setCustomerPayAmount(Number(e.target.value))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" placeholder="ຈຳນວນເງິນ" />
            <input value={customerPayNote} onChange={(e) => setCustomerPayNote(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" placeholder="ໝາຍເຫດ" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCustomerPayModal(false)} className="px-3 py-2 rounded border border-slate-300 text-sm font-bold text-slate-700">ຍົກເລີກ</button>
              <button onClick={handleAddCustomerPayment} className="px-3 py-2 rounded bg-green-600 text-white text-sm font-bold">ຢືນຢັນ</button>
            </div>
          </div>
        </div>
      )}

      {showFactoryPayModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-4 w-full max-w-md space-y-3">
            <div className="font-black text-slate-900">ຊຳລະເງິນໃຫ້ໂຮງງານ</div>
            <div className="text-sm text-slate-700">ຍອດຄ້າງຊຳລະ: {factoryOutstanding.toLocaleString()}</div>
            <input type="date" value={factoryPayDate} onChange={(e) => setFactoryPayDate(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" />
            <input type="number" value={factoryPayAmount} onChange={(e) => setFactoryPayAmount(Number(e.target.value))} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" placeholder="ຈຳນວນເງິນ" />
            <input value={factoryPayNote} onChange={(e) => setFactoryPayNote(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900" placeholder="ໝາຍເຫດ" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowFactoryPayModal(false)} className="px-3 py-2 rounded border border-slate-300 text-sm font-bold text-slate-700">ຍົກເລີກ</button>
              <button onClick={handleAddFactoryPayment} className="px-3 py-2 rounded bg-rose-600 text-white text-sm font-bold">ຢືນຢັນ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
