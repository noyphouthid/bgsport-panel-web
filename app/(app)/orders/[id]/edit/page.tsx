"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";

type OrderDetail = {
  id: string;
  order_code: string;
  order_date: string;
  customer_phone: string | null;
  customer_whatsapp: string | null;
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
  qty_6xl: number;
  size_upcharge: number;
  extra_charge: number;
  design_deposit: number;
  initial_deposit: number;
  factory_cost: number;
  gross_total: number;
  net_total: number;
  balance: number;
  status: "in_progress" | "completed";
  production_completed_at: string | null;
  shipment_status?: "pending" | "shipped";
  shipment_completed_at?: string | null;
  customer_remaining_due_at: string | null;
  factory_payment_due_at: string | null;
  customer_paid_full_at: string | null;
  factory_paid_full_at: string | null;
  closed_at: string | null;
  created_at: string;
};

type UserOption = {
  id: string;
  full_name: string;
  role: "superadmin" | "admin" | "manager" | "staff" | "graphic" | "accountant";
  is_active: boolean;
};

type FabricRow = {
  id: string;
  name: string;
  short_price: number;
  long_add: number;
  long_price: number;
  is_active: boolean;
};

type CustomerPayment = {
  id: string;
  amount: number;
  paid_at: string;
  note: string | null;
};

type FactoryPayment = {
  id: string;
  amount: number;
  paid_at: string;
  note: string | null;
};

type ImportReceiptInfo = {
  receipt_id: string;
  received_at: string;
  received_by: string;
  note: string | null;
};

const SIZE_UPCHARGES = {
  "3XL": 20000,
  "4XL": 30000,
  "5XL": 35000,
} as const;

export default function EditOrderPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [fabrics, setFabrics] = useState<FabricRow[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [factoryPayments, setFactoryPayments] = useState<FactoryPayment[]>([]);
  const [importReceipt, setImportReceipt] = useState<ImportReceiptInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingFabrics, setLoadingFabrics] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);

  const [orderDate, setOrderDate] = useState("");
  const [orderCode, setOrderCode] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [factoryBillCode, setFactoryBillCode] = useState("");
  const [fabricId, setFabricId] = useState("");
  const [adminUserId, setAdminUserId] = useState("");
  const [graphicUserId, setGraphicUserId] = useState("");
  const [shortQty, setShortQty] = useState(0);
  const [longQty, setLongQty] = useState(0);
  const [freeQty, setFreeQty] = useState(0);
  const [qty3XL, setQty3XL] = useState(0);
  const [qty4XL, setQty4XL] = useState(0);
  const [qty5XL, setQty5XL] = useState(0);
  const [qty6XL, setQty6XL] = useState(0);
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
  const [cancelingImport, setCancelingImport] = useState(false);

  const toDateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
  const dateInputToIso = (value: string) => (value ? new Date(`${value}T12:00:00`).toISOString() : null);

  const safeInsertAction = async (action: string, detail: string) => {
    const { error } = await supabase.from("order_status_history").insert({
      order_id: orderId,
      action,
      detail,
      action_at: new Date().toISOString(),
    });
    if (error && !error.message.includes("Could not find the table")) setErr(error.message);
  };

  const loadOrder = async () => {
    const { data, error } = await supabase.from("orders").select("*").eq("id", orderId).single();
    if (error) throw error;
    const o = data as OrderDetail;
    setOrder(o);
    setOrderDate(o.order_date);
    setOrderCode(o.order_code);
    setCustomerPhone(o.customer_phone || "");
    setCustomerWhatsapp(o.customer_whatsapp || "");
    setFactoryBillCode(o.factory_bill_code || "");
    setFabricId(o.fabric_id || "");
    setAdminUserId(o.admin_user_id || "");
    setGraphicUserId(o.graphic_user_id || "");
    setShortQty(o.short_qty);
    setLongQty(o.long_qty);
    setFreeQty(o.free_qty);
    setQty3XL(o.qty_3xl);
    setQty4XL(o.qty_4xl);
    setQty5XL(o.qty_5xl);
    setQty6XL(o.qty_6xl);
    setExtraCharge(o.extra_charge);
    setDesignDeposit(o.design_deposit);
    setFactoryCost(o.factory_cost);
    setCustomerRemainingDueDate(toDateInput(o.customer_remaining_due_at));
    setFactoryPaymentDueDate(toDateInput(o.factory_payment_due_at));
    setProductionCompletedDate(toDateInput(o.production_completed_at));
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    const { data, error } = await supabase.from("users").select("id,full_name,role,is_active").eq("is_active", true).in("role", ["superadmin", "admin", "graphic"]).order("full_name", { ascending: true });
    if (error) throw error;
    setUsers((data ?? []) as UserOption[]);
    setLoadingUsers(false);
  };

  const loadFabrics = async () => {
    setLoadingFabrics(true);
    const { data, error } = await supabase.from("fabrics").select("id,name,short_price,long_add,long_price,is_active").eq("is_active", true).order("name", { ascending: true });
    if (error) throw error;
    setFabrics((data ?? []) as FabricRow[]);
    setLoadingFabrics(false);
  };

  const loadCustomerPayments = async () => {
    const { data, error } = await supabase.from("payment_transactions").select("id,amount,paid_at,note").eq("order_id", orderId).order("paid_at", { ascending: false });
    if (error) {
      if (error.message.includes("Could not find the table")) return setCustomerPayments([]);
      throw error;
    }
    setCustomerPayments((data ?? []) as CustomerPayment[]);
  };

  const loadFactoryPayments = async () => {
    const { data, error } = await supabase.from("factory_payments").select("id,amount,paid_at,note").eq("order_id", orderId).order("paid_at", { ascending: false });
    if (error) {
      if (error.message.includes("Could not find the table")) return setFactoryPayments([]);
      throw error;
    }
    setFactoryPayments((data ?? []) as FactoryPayment[]);
  };

  const loadImportReceipt = async () => {
    const { data, error } = await supabase
      .from("factory_receipt_items")
      .select("receipt_id,factory_receipts!inner(received_at,received_by,note)")
      .eq("order_id", orderId)
      .limit(1)
      .maybeSingle();

    if (error) {
      if (!error.message.includes("0 rows")) throw error;
      setImportReceipt(null);
      return;
    }

    if (data) {
      const row = data as {
        receipt_id: string;
        factory_receipts: Array<{ received_at: string; received_by: string; note: string | null }>;
      };
      const receipt = row.factory_receipts?.[0];
      if (!receipt) {
        setImportReceipt(null);
        return;
      }
      setImportReceipt({
        receipt_id: row.receipt_id,
        received_at: receipt.received_at,
        received_by: receipt.received_by,
        note: receipt.note,
      });
      return;
    }

    const { data: orderData } = await supabase.from("orders").select("production_completed_at").eq("id", orderId).maybeSingle();
    const productionCompletedAt = (orderData as { production_completed_at?: string | null } | null)?.production_completed_at || null;
    if (!productionCompletedAt) {
      setImportReceipt(null);
      return;
    }

    const { data: fallbackReceipt } = await supabase
      .from("factory_receipts")
      .select("id,received_at,received_by,note")
      .eq("received_at", productionCompletedAt)
      .limit(1)
      .maybeSingle();

    if (!fallbackReceipt) {
      setImportReceipt(null);
      return;
    }

    setImportReceipt({
      receipt_id: (fallbackReceipt as { id: string }).id,
      received_at: (fallbackReceipt as { received_at: string }).received_at,
      received_by: (fallbackReceipt as { received_by: string }).received_by,
      note: (fallbackReceipt as { note: string | null }).note,
    });
  };

  const reloadAll = async () => {
    setLoading(true);
    setErr(null);
    try {
      await Promise.all([loadOrder(), loadUsers(), loadFabrics()]);
      await Promise.all([loadCustomerPayments(), loadFactoryPayments(), loadImportReceipt()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
      setLoadingUsers(false);
      setLoadingFabrics(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId) void reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    const loadViewerRole = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user.id;
      if (!authUserId) return;
      const { data } = await supabase.from("users").select("role").eq("auth_user_id", authUserId).maybeSingle();
      if (data?.role) setViewerRole(data.role as AppRole);
    };
    void loadViewerRole();
  }, []);

  const adminOptions = useMemo(() => users.filter((u) => u.role === "superadmin" || u.role === "admin"), [users]);
  const graphicOptions = useMemo(() => users.filter((u) => u.role === "graphic"), [users]);
  const selectedFabric = useMemo(() => fabrics.find((f) => f.id === fabricId) ?? null, [fabrics, fabricId]);

  const shirtsTotal = useMemo(() => {
    const shortPrice = selectedFabric?.short_price ?? order?.fabric_short_price ?? 0;
    const longPrice = selectedFabric?.long_price ?? order?.fabric_long_price ?? 0;
    return shortQty * shortPrice + longQty * longPrice;
  }, [selectedFabric, order, shortQty, longQty]);

  const plusSizeTotal = useMemo(
    () =>
      qty3XL * SIZE_UPCHARGES["3XL"] +
      qty4XL * SIZE_UPCHARGES["4XL"] +
      qty5XL * SIZE_UPCHARGES["5XL"] +
      qty6XL * SIZE_UPCHARGES["5XL"],
    [qty3XL, qty4XL, qty5XL, qty6XL]
  );
  const grossTotal = useMemo(() => shirtsTotal + plusSizeTotal + extraCharge, [shirtsTotal, plusSizeTotal, extraCharge]);
  const netTotal = useMemo(() => Math.max(0, grossTotal - designDeposit), [grossTotal, designDeposit]);

  const customerReceived = useMemo(() => {
    const paymentHistoryTotal = customerPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const savedDeposit = Number(order?.initial_deposit || 0);
    const receivedFromBalance = order ? Math.max(0, Number(order.net_total || 0) - Number(order.balance || 0)) : 0;
    return Math.max(paymentHistoryTotal, savedDeposit, receivedFromBalance);
  }, [customerPayments, order]);

  const customerOutstanding = useMemo(() => Math.max(0, netTotal - customerReceived), [netTotal, customerReceived]);
  const factoryPaid = useMemo(() => factoryPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0), [factoryPayments]);
  const factoryOutstanding = useMemo(() => Math.max(0, Math.max(0, Number(factoryCost || 0)) - factoryPaid), [factoryCost, factoryPaid]);
  const profitPreview = useMemo(() => netTotal - Math.max(0, Number(factoryCost || 0)), [netTotal, factoryCost]);

  const productionStatusLabel = order?.production_completed_at ? "ຜະລິດສຳເລັດ" : "ກຳລັງຜະລິດ";
  const closeStatusLabel = order?.status === "completed" ? "ປິດງານແລ້ວ" : "ຍັງບໍ່ປິດງານ";
  const isReadOnlyAdmin = viewerRole === "admin";

  const handleUpdate = async () => {
    if (!order || isReadOnlyAdmin) return;
    if (!adminUserId) return toast.error("ກະລຸນາເລືອກ Admin");
    if (!graphicUserId) return toast.error("ກະລຸນາເລືອກ Graphic");
    if (!fabricId) return toast.error("ກະລຸນາເລືອກປະເພດຜ້າ");

    const fabric = selectedFabric ?? { id: order.fabric_id, name: order.fabric_name, short_price: order.fabric_short_price, long_add: 0, long_price: order.fabric_long_price, is_active: true };
    const payload = {
      order_code: orderCode.trim(),
      order_date: orderDate,
      customer_phone: customerPhone.trim() || null,
      customer_whatsapp: customerWhatsapp.trim() || null,
      factory_bill_code: factoryBillCode.trim() || null,
      fabric_id: fabric.id,
      fabric_name: fabric.name,
      fabric_short_price: fabric.short_price,
      fabric_long_price: fabric.long_price,
      admin_user_id: adminUserId || null,
      graphic_user_id: graphicUserId || null,
      short_qty: Math.max(0, shortQty),
      long_qty: Math.max(0, longQty),
      free_qty: Math.max(0, freeQty),
      qty_3xl: Math.max(0, qty3XL),
      qty_4xl: Math.max(0, qty4XL),
      qty_5xl: Math.max(0, qty5XL),
      qty_6xl: Math.max(0, qty6XL),
      extra_charge: Math.max(0, extraCharge),
      design_deposit: Math.max(0, designDeposit),
      factory_cost: Math.max(0, factoryCost),
      gross_total: grossTotal,
      net_total: netTotal,
      initial_deposit: customerReceived,
      balance: customerOutstanding,
      customer_paid_full_at: customerOutstanding === 0 ? order.customer_paid_full_at || new Date().toISOString() : null,
      customer_remaining_due_at: dateInputToIso(customerRemainingDueDate),
      factory_payment_due_at: dateInputToIso(factoryPaymentDueDate),
      production_completed_at: dateInputToIso(productionCompletedDate),
    };

    const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
    if (error) {
      setErr(error.message);
      return toast.error(`ບັນທຶກບໍ່ສຳເລັດ: ${error.message}`);
    }
    await safeInsertAction("update_order", "Updated order details");
    await reloadAll();
    toast.success("ບັນທຶກແລ້ວ");
  };

  const handleAddCustomerPayment = async () => {
    if (!order || isReadOnlyAdmin) return;
    if (customerPayAmount <= 0) return alert("ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0");
    if (customerPayAmount > customerOutstanding) return alert("ຈຳນວນເງິນເກີນຍອດຄ້າງຊຳລະ");

    const paidAtIso = dateInputToIso(customerPayDate) || new Date().toISOString();
    const { error: insertError } = await supabase.from("payment_transactions").insert({
      order_id: orderId,
      amount: customerPayAmount,
      paid_at: paidAtIso,
      note: customerPayNote.trim() || null,
    });
    if (insertError) {
      setErr(insertError.message);
      return;
    }

    const nextReceived = Math.max(Number(order.initial_deposit || 0), customerReceived) + customerPayAmount;
    const nextOutstanding = Math.max(0, netTotal - nextReceived);
    const { error: updateError } = await supabase.from("orders").update({
      initial_deposit: nextReceived,
      balance: nextOutstanding,
      customer_paid_full_at: nextOutstanding === 0 ? paidAtIso : null,
    }).eq("id", orderId);
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
    if (isReadOnlyAdmin) return;
    if (factoryPayAmount <= 0) return alert("ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0");
    if (factoryPayAmount > factoryOutstanding) return alert("ຈຳນວນເງິນເກີນຍອດຄ້າງຊຳລະໂຮງງານ");

    const paidAtIso = dateInputToIso(factoryPayDate) || new Date().toISOString();
    const { error: insertError } = await supabase.from("factory_payments").insert({
      order_id: orderId,
      amount: factoryPayAmount,
      paid_at: paidAtIso,
      note: factoryPayNote.trim() || null,
    });
    if (insertError) {
      setErr(insertError.message);
      return;
    }

    const nextFactoryPaid = factoryPaid + factoryPayAmount;
    const nextFactoryOutstanding = Math.max(0, Math.max(0, Number(factoryCost || 0)) - nextFactoryPaid);
    const { error: updateError } = await supabase.from("orders").update({
      factory_paid_full_at: nextFactoryOutstanding === 0 ? paidAtIso : null,
    }).eq("id", orderId);
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
    if (isReadOnlyAdmin) return;
    if (!productionCompletedDate) return alert("ກະລຸນາເລືອກວັນທີຜະລິດສຳເລັດ");
    const { error } = await supabase.from("orders").update({ production_completed_at: dateInputToIso(productionCompletedDate) }).eq("id", orderId);
    if (error) {
      setErr(error.message);
      return;
    }
    await safeInsertAction("production_completed", "Marked production completed");
    await reloadAll();
  };

  const handleCloseOrder = async () => {
    if (isReadOnlyAdmin) return;
    if (customerOutstanding > 0) return alert("ລູກຄ້າຍັງຄ້າງຊຳລະ");
    const { error } = await supabase.from("orders").update({
      status: "completed",
      closed_at: new Date().toISOString(),
    }).eq("id", orderId);
    if (error) {
      setErr(error.message);
      return;
    }
    await safeInsertAction("close_order", "Closed order");
    await reloadAll();
  };

  const handleCancelImport = async () => {
    if (!order || !order.production_completed_at) {
      toast.error("ອໍເດີນີ້ຍັງບໍ່ໄດ້ນຳເຂົ້າ");
      return;
    }
    if (order.shipment_status === "shipped" || order.shipment_completed_at) {
      toast.error("ບໍ່ສາມາດຍົກເລີກນຳເຂົ້າໄດ້ ເພາະອໍເດີນີ້ຖືກຈັດສົ່ງແລ້ວ");
      return;
    }

    const ok = confirm(`ຕ້ອງການຍົກເລີກນຳເຂົ້າຂອງ ${order.order_code} ຫຼື ບໍ່?`);
    if (!ok) return;

    setCancelingImport(true);
    setErr(null);

    const { data: labelData, error: labelError } = await supabase
      .from("order_qr_labels")
      .select("id,label_status")
      .eq("order_id", orderId)
      .maybeSingle();

    if (labelError) {
      setCancelingImport(false);
      setErr(labelError.message);
      return;
    }

    if ((labelData as { label_status?: string } | null)?.label_status === "shipped") {
      setCancelingImport(false);
      toast.error("ບໍ່ສາມາດຍົກເລີກນຳເຂົ້າໄດ້ ເພາະ QR ນີ້ຖືກຈັດສົ່ງແລ້ວ");
      return;
    }

    const { data: receiptItems, error: receiptItemsError } = await supabase
      .from("factory_receipt_items")
      .select("id,receipt_id")
      .eq("order_id", orderId);

    if (receiptItemsError) {
      setCancelingImport(false);
      setErr(receiptItemsError.message);
      return;
    }

    const receiptIds = Array.from(new Set(((receiptItems ?? []) as Array<{ receipt_id: string }>).map((item) => item.receipt_id)));

    if ((receiptItems ?? []).length > 0) {
      const { error: deleteReceiptItemsError } = await supabase.from("factory_receipt_items").delete().eq("order_id", orderId);
      if (deleteReceiptItemsError) {
        setCancelingImport(false);
        setErr(deleteReceiptItemsError.message);
        return;
      }
    }

    if (receiptIds.length > 0) {
      for (const receiptId of receiptIds) {
        const { count, error: countError } = await supabase
          .from("factory_receipt_items")
          .select("id", { count: "exact", head: true })
          .eq("receipt_id", receiptId);

        if (countError) {
          setCancelingImport(false);
          setErr(countError.message);
          return;
        }

        if ((count || 0) === 0) {
          const { error: deleteReceiptError } = await supabase.from("factory_receipts").delete().eq("id", receiptId);
          if (deleteReceiptError) {
            setCancelingImport(false);
            setErr(deleteReceiptError.message);
            return;
          }
        }
      }
    } else if (importReceipt?.receipt_id) {
      const { count, error: countError } = await supabase
        .from("factory_receipt_items")
        .select("id", { count: "exact", head: true })
        .eq("receipt_id", importReceipt.receipt_id);

      if (countError) {
        setCancelingImport(false);
        setErr(countError.message);
        return;
      }

      if ((count || 0) === 0) {
        await supabase.from("factory_receipts").delete().eq("id", importReceipt.receipt_id);
      }
    }

    if (labelData?.id) {
      const { error: revertLabelError } = await supabase
        .from("order_qr_labels")
        .update({
          label_status: "created",
          received_at: null,
          received_by: null,
          last_scanned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", labelData.id);

      if (revertLabelError) {
        setCancelingImport(false);
        setErr(revertLabelError.message);
        return;
      }
    }

    const { error: revertOrderError } = await supabase
      .from("orders")
      .update({ production_completed_at: null })
      .eq("id", orderId)
      .eq("production_completed_at", order.production_completed_at);

    setCancelingImport(false);

    if (revertOrderError) {
      setErr(revertOrderError.message);
      return;
    }

    await safeInsertAction("cancel_factory_receipt", "Canceled imported stock from edit page");
    await reloadAll();
    toast.success("ຍົກເລີກນຳເຂົ້າສຳເລັດ");
  };

  const handleDelete = async () => {
    if (!order || isReadOnlyAdmin) return;
    const ok = confirm(`ຕ້ອງການລຶບອໍເດີ ${order.order_code} ຫຼື ບໍ່?`);
    if (!ok) return;
    const { error } = await supabase.from("orders").delete().eq("id", orderId);
    if (error) return setErr(error.message);
    router.push("/orders");
  };

  if (loading) return <div className="font-bold text-slate-900">ກຳລັງໂຫຼດ...</div>;
  if (!order) return <div className="font-bold text-red-700">ບໍ່ພົບຂໍ້ມູນອໍເດີ.</div>;

  return (
    <div className="space-y-4">
      {err && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 font-bold">ຂໍ້ຜິດພາດ: {err}</div>}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">ແກ້ໄຂອໍເດີ: {order.order_code}</h1>
          <div className="text-sm text-slate-800 font-medium">ສ້າງເມື່ອ: {new Date(order.created_at).toLocaleString("en-US")}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isReadOnlyAdmin ? <button onClick={handleCancelImport} disabled={cancelingImport || !order.production_completed_at} className="rounded bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50">{cancelingImport ? "ກຳລັງຍົກເລີກ..." : "ຍົກເລີກນຳເຂົ້າ"}</button> : null}
          <Link href="/orders" className="rounded border border-slate-400 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">ກັບຄືນ</Link>
          {!isReadOnlyAdmin ? <button onClick={handleMarkProductionCompleted} className="rounded bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700">ຜະລິດສຳເລັດ</button> : null}
          {!isReadOnlyAdmin ? <button onClick={handleCloseOrder} className="rounded bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-green-700">ປິດງານແລ້ວ</button> : null}
          {!isReadOnlyAdmin ? <button onClick={handleUpdate} className="rounded bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-700">ບັນທຶກ</button> : null}
          {!isReadOnlyAdmin ? <button onClick={handleDelete} className="rounded bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700">ລຶບ</button> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 shadow-sm">
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ວັນທີສັ່ງຊື້</label>
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ລະຫັດອໍເດີ</label>
              <input value={orderCode} onChange={(e) => setOrderCode(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-black text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ເບີໂທລູກຄ້າ</label>
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500" placeholder="ເບີໂທລູກຄ້າ" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ເບີ WhatsApp</label>
              <input value={customerWhatsapp} onChange={(e) => setCustomerWhatsapp(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500" placeholder="ເບີ WhatsApp" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ລະຫັດບິນໂຮງງານ</label>
              <input value={factoryBillCode} onChange={(e) => setFactoryBillCode(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500" placeholder="ລະຫັດບິນໂຮງງານ" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ປະເພດຜ້າ</label>
              <select value={fabricId} onChange={(e) => setFabricId(e.target.value)} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900" disabled={loadingFabrics}>
                <option value="">{loadingFabrics ? "ກຳລັງໂຫຼດ..." : "ເລືອກປະເພດຜ້າ"}</option>
                {fabrics.map((fabric) => <option key={fabric.id} value={fabric.id}>{fabric.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">Admin</label>
              <select value={adminUserId} onChange={(e) => setAdminUserId(e.target.value)} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900" disabled={loadingUsers}>
                <option value="">Select admin</option>
                {adminOptions.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">Graphic</label>
              <select value={graphicUserId} onChange={(e) => setGraphicUserId(e.target.value)} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900" disabled={loadingUsers}>
                <option value="">Select graphic</option>
                {graphicOptions.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ຈຳນວນແຂນສັ້ນ</label>
              <input type="number" min={0} value={shortQty} onChange={(e) => setShortQty(Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ຈຳນວນແຂນຍາວ</label>
              <input type="number" min={0} value={longQty} onChange={(e) => setLongQty(Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ຈຳນວນແຖມ</label>
              <input type="number" min={0} value={freeQty} onChange={(e) => setFreeQty(Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">3XL (+20,000)</label>
              <input type="number" min={0} value={qty3XL} onChange={(e) => setQty3XL(Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">4XL (+30,000)</label>
              <input type="number" min={0} value={qty4XL} onChange={(e) => setQty4XL(Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">5XL (+35,000)</label>
              <input type="number" min={0} value={qty5XL} onChange={(e) => setQty5XL(Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">6XL (+35,000)</label>
              <input type="number" min={0} value={qty6XL} onChange={(e) => setQty6XL(Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ຕົ້ນທຶນໂຮງງານ</label>
              <input type="number" min={0} value={factoryCost} onChange={(e) => setFactoryCost(Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ຄ່າໃຊ້ຈ່າຍເພີ່ມ</label>
              <input type="number" min={0} value={extraCharge} onChange={(e) => setExtraCharge(Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ມັດຈຳຄ່າອອກແບບ</label>
              <input type="number" min={0} value={designDeposit} onChange={(e) => setDesignDeposit(Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ກຳນົດຊຳລະລູກຄ້າ</label>
              <input type="date" value={customerRemainingDueDate} onChange={(e) => setCustomerRemainingDueDate(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ວັນທີຊຳລະໂຮງງານ</label>
              <input type="date" value={factoryPaymentDueDate} onChange={(e) => setFactoryPaymentDueDate(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-800">ວັນທີຜະລິດສຳເລັດ</label>
              <input type="date" value={productionCompletedDate} onChange={(e) => setProductionCompletedDate(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between border-b pb-2 border-slate-100">
              <div className="font-black text-slate-900">ປະຫວັດການຊຳລະຂອງລູກຄ້າ</div>
              {!isReadOnlyAdmin ? <button onClick={() => setShowCustomerPayModal(true)} className="rounded bg-blue-600 px-3 py-1.5 text-xs font-black text-white hover:bg-blue-700">ຮັບເງິນຊຳລະ</button> : null}
            </div>
            <div className="space-y-2">
              {customerPayments.length === 0 ? <div className="text-sm text-slate-800 py-2 font-medium">ບໍ່ມີລາຍການ.</div> : customerPayments.map((p) => (
                <div key={p.id} className="flex justify-between rounded border border-slate-200 bg-slate-50 p-2 text-xs">
                  <div><div className="font-black text-slate-900">{new Date(p.paid_at).toLocaleString("en-US")}</div><div className="text-slate-800 font-medium">{p.note || "-"}</div></div>
                  <div className="font-black text-emerald-700 text-sm">+{Number(p.amount).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-900 shadow-sm space-y-2">
            <div className="font-black text-slate-900">ຂໍ້ມູນການນຳເຂົ້າ</div>
            <div><span className="font-black">ສະຖານະ:</span> <span className="font-bold">{order.production_completed_at ? "ນຳເຂົ້າແລ້ວ" : "ຍັງບໍ່ໄດ້ນຳເຂົ້າ"}</span></div>
            <div><span className="font-black">ວັນທີນຳເຂົ້າ:</span> <span className="font-bold">{importReceipt?.received_at ? new Date(importReceipt.received_at).toLocaleString("en-US") : (order.production_completed_at ? new Date(order.production_completed_at).toLocaleString("en-US") : "-")}</span></div>
            <div><span className="font-black">ຜູ້ນຳເຂົ້າ:</span> <span className="font-bold">{importReceipt?.received_by || "-"}</span></div>
            <div><span className="font-black">ໝາຍເຫດ:</span> <span className="font-bold">{importReceipt?.note?.trim() || "-"}</span></div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
            <div className="font-black text-slate-900 border-b pb-2 border-slate-100 mb-2">ສະຫຼຸບອໍເດີ</div>
            <div className="mt-2 flex justify-between text-slate-800 font-bold"><span>ຍອດສຸດທິ</span><span className="font-black text-slate-900">{netTotal.toLocaleString()}</span></div>
            <div className="flex justify-between text-slate-800 font-bold"><span>ຮັບແແລ້ວ</span><span className="font-black text-emerald-700">{customerReceived.toLocaleString()}</span></div>
            <div className="flex justify-between text-slate-800 font-bold"><span>ຄ້າງຊຳລະ</span><span className="font-black text-rose-700">{customerOutstanding.toLocaleString()}</span></div>
            <div className="flex justify-between text-slate-800 font-bold"><span>ຕົ້ນທຶນ</span><span className="font-black text-slate-900">{factoryCost.toLocaleString()}</span></div>
            <div className="flex justify-between border-t pt-2 border-slate-100 mt-2 text-slate-800 font-bold"><span>ກຳໄລເບື້ອງຕົ້ນ</span><span className={`font-black ${profitPreview >= 0 ? "text-blue-700" : "text-red-700"}`}>{profitPreview.toLocaleString()}</span></div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-900 shadow-sm space-y-1">
            <div><span className="font-black">ສະຖານະຜະລິດ:</span> <span className="font-bold">{productionStatusLabel}</span></div>
            <div><span className="font-black">ສະຖານະປິດງານ:</span> <span className="font-bold">{closeStatusLabel}</span></div>
            <div><span className="font-black">ລູກຄ້າຊຳລະຄົບ:</span> <span className="font-bold">{order.customer_paid_full_at ? new Date(order.customer_paid_full_at).toLocaleString("en-US") : "-"}</span></div>
            <div><span className="font-black">ປິດອໍເດີເມື່ອ:</span> <span className="font-bold">{order.closed_at ? new Date(order.closed_at).toLocaleString("en-US") : "-"}</span></div>
          </div>
        </div>
      </div>

      {showCustomerPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="w-full max-w-md space-y-3 rounded-xl border border-slate-300 bg-white p-5 shadow-2xl">
            <div className="font-black text-slate-900 text-lg">ຮັບເງິນຊຳລະຈາກລູກຄ້າ</div>
            <div className="text-sm text-slate-900 font-bold bg-slate-100 p-2 rounded">ຍອດຄ້າງຊຳລະ: {customerOutstanding.toLocaleString()}</div>
            <input type="date" value={customerPayDate} onChange={(e) => setCustomerPayDate(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 font-bold" />
            <input type="number" value={customerPayAmount} onChange={(e) => setCustomerPayAmount(Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 font-black" placeholder="ຈຳນວນເງິນ" />
            <input value={customerPayNote} onChange={(e) => setCustomerPayNote(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 font-medium" placeholder="ໝາຍເຫດ" />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCustomerPayModal(false)} className="rounded border border-slate-400 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">ຍົກເລີກ</button>
              <button onClick={handleAddCustomerPayment} className="rounded bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700">ຢືນຢັນ</button>
            </div>
          </div>
        </div>
      )}

      {showFactoryPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="w-full max-w-md space-y-3 rounded-xl border border-slate-300 bg-white p-5 shadow-2xl">
            <div className="font-black text-slate-900 text-lg">ຊຳລະເງິນໃຫ້ໂຮງງານ</div>
            <div className="text-sm text-slate-900 font-bold bg-slate-100 p-2 rounded">ຍອດຄ້າງຊຳລະ: {factoryOutstanding.toLocaleString()}</div>
            <input type="date" value={factoryPayDate} onChange={(e) => setFactoryPayDate(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 font-bold" />
            <input type="number" value={factoryPayAmount} onChange={(e) => setFactoryPayAmount(Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 font-black" placeholder="ຈຳນວນເງິນ" />
            <input value={factoryPayNote} onChange={(e) => setFactoryPayNote(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 font-medium" placeholder="ໝາຍເຫດ" />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowFactoryPayModal(false)} className="rounded border border-slate-400 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">ຍົກເລີກ</button>
              <button onClick={handleAddFactoryPayment} className="rounded bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">ຢືນຢັນ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
