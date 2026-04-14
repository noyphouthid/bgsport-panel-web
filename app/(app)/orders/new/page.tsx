"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { buildOrderCode, normalizeOrderType, type OrderType } from "@/lib/order-code";
import { useOrderTypeOptions } from "@/lib/order-code-options";
import { buildSafeStorageFileName, isImageFileName, ORDER_MEDIA_BUCKET } from "@/lib/order-media";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

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
  role: "superadmin" | "admin" | "manager" | "staff" | "graphic" | "accountant";
  is_active: boolean;
};

const SIZE_UPCHARGES = {
  "3XL": 20000,
  "4XL": 30000,
  "5XL": 35000,
} as const;

const CUSTOM_ORDER_TYPE_VALUE = "__custom__";

function getLocalDateInputValue() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

export default function NewOrderPage() {
  const router = useRouter();
  const pageRef = useRef<HTMLDivElement | null>(null);
  // Fabrics from DB
  const [fabrics, setFabrics] = useState<FabricRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingFabrics, setLoadingFabrics] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ===== 1) ข้อมูลพื้นฐาน =====
  const [orderDate, setOrderDate] = useState(getLocalDateInputValue);
  const [orderType, setOrderType] = useState<OrderType>("");
  const [orderNo, setOrderNo] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [factoryBillCode, setFactoryBillCode] = useState(""); // optional
  const [fabricId, setFabricId] = useState<string>("");
  const [adminUserId, setAdminUserId] = useState<string>("");
  const [graphicUserId, setGraphicUserId] = useState<string>("");
  const { options: orderTypeOptions } = useOrderTypeOptions(true);
  const [orderImageFile, setOrderImageFile] = useState<File | null>(null);
  const [orderImagePreviewUrl, setOrderImagePreviewUrl] = useState<string | null>(null);
  const [orderTransferSlipFile, setOrderTransferSlipFile] = useState<File | null>(null);
  const [orderTransferSlipPreviewUrl, setOrderTransferSlipPreviewUrl] = useState<string | null>(null);
  const orderImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const orderImageCameraInputRef = useRef<HTMLInputElement | null>(null);
  const orderTransferSlipFileInputRef = useRef<HTMLInputElement | null>(null);
  const orderTransferSlipCameraInputRef = useRef<HTMLInputElement | null>(null);

  // ===== 2) จำนวน & ขนาด =====
  const [shortQty, setShortQty] = useState<number>(0);
  const [longQty, setLongQty] = useState<number>(0);
  const [freeQty, setFreeQty] = useState<number>(0); // แถม (ไม่คิดเงิน)
  const [qty3XL, setQty3XL] = useState<number>(0);
  const [qty4XL, setQty4XL] = useState<number>(0);
  const [qty5XL, setQty5XL] = useState<number>(0);
  const [qty6XL, setQty6XL] = useState<number>(0);

  // ===== 3) การเงิน & ค่าธรรมเนียม =====
  const [extraCharge, setExtraCharge] = useState<number>(0);
  const [designDeposit, setDesignDeposit] = useState<number>(0);
  const [initialDeposit, setInitialDeposit] = useState<number>(0);
  const [factoryCost, setFactoryCost] = useState<number>(0);
  const { markClean, allowNextNavigation } = useUnsavedChangesGuard({ scopeRef: pageRef });

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
      .in("role", ["superadmin", "admin", "graphic"])
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

  useEffect(() => {
    return () => {
      if (orderImagePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(orderImagePreviewUrl);
      if (orderTransferSlipPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(orderTransferSlipPreviewUrl);
    };
  }, [orderImagePreviewUrl, orderTransferSlipPreviewUrl]);

  const selectedFabric = useMemo(() => fabrics.find((f) => f.id === fabricId) ?? null, [fabrics, fabricId]);
  const adminOptions = useMemo(() => users.filter((u) => u.role === "superadmin" || u.role === "admin"), [users]);
  const graphicOptions = useMemo(() => users.filter((u) => u.role === "graphic"), [users]);

  const totalProductionQty = useMemo(() => shortQty + longQty + freeQty, [shortQty, longQty, freeQty]);
  const billableQty = useMemo(() => shortQty + longQty, [shortQty, longQty]);
  const shirtsTotal = useMemo(() => {
    if (!selectedFabric) return 0;
    return shortQty * selectedFabric.short_price + longQty * selectedFabric.long_price;
  }, [shortQty, longQty, selectedFabric]);

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
  const balance = useMemo(() => Math.max(0, netTotal - initialDeposit), [netTotal, initialDeposit]);
  const profitPreview = useMemo(() => netTotal - factoryCost, [netTotal, factoryCost]);
  const isCustomOrderType = useMemo(() => Boolean(orderType) && !orderTypeOptions.includes(orderType), [orderType, orderTypeOptions]);
  const orderTypeSelectValue = isCustomOrderType ? CUSTOM_ORDER_TYPE_VALUE : orderType;

  const resetForm = () => {
    setOrderDate(getLocalDateInputValue());
    setOrderType("");
    setOrderNo("");
    setCustomerPhone("");
    setCustomerWhatsapp("");
    setFactoryBillCode("");
    setAdminUserId("");
    setGraphicUserId("");
    setOrderImageFile(null);
    if (orderImagePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(orderImagePreviewUrl);
    setOrderImagePreviewUrl(null);
    setOrderTransferSlipFile(null);
    if (orderTransferSlipPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(orderTransferSlipPreviewUrl);
    setOrderTransferSlipPreviewUrl(null);
    if (fabrics.length > 0) setFabricId(fabrics[0].id);
    setShortQty(0);
    setLongQty(0);
    setFreeQty(0);
    setQty3XL(0);
    setQty4XL(0);
    setQty5XL(0);
    setQty6XL(0);
    setExtraCharge(0);
    setDesignDeposit(0);
    setInitialDeposit(0);
    setFactoryCost(0);
  };

  const handleCancelReset = async () => {
    const result = await Swal.fire({
      icon: "warning",
      title: "ຢືນຢັນການຍົກເລີກ?",
      text: "ຂໍ້ມູນທີ່ປ້ອນຈະຖືກລ້າງທັງໝົດ",
      showCancelButton: true,
      confirmButtonText: "ຢືນຢັນ",
      cancelButtonText: "ກັບຄືນ",
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;
    resetForm();
    markClean();
    toast("ລ້າງຟອມແລ້ວ");
  };

  const handleCancelBack = async () => {
    const result = await Swal.fire({
      icon: "warning",
      title: "ອອກຈາກໜ້ານີ້?",
      text: "ຂໍ້ມູນທີ່ຍັງບໍ່ໄດ້ບັນທຶກຈະຫາຍ",
      showCancelButton: true,
      confirmButtonText: "ອອກ",
      cancelButtonText: "ຢູ່ຕໍ່",
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;
    toast("ຍົກເລີກການສ້າງອໍເດີ");
    allowNextNavigation();
    router.push("/orders");
  };

  const handleOrderImageSelected = (file: File | null) => {
    setOrderImageFile(file);
    if (orderImagePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(orderImagePreviewUrl);
    setOrderImagePreviewUrl(file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  };

  const handleOrderTransferSlipSelected = (file: File | null) => {
    setOrderTransferSlipFile(file);
    if (orderTransferSlipPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(orderTransferSlipPreviewUrl);
    setOrderTransferSlipPreviewUrl(file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  };

  const uploadOrderAsset = async (kind: "order-image" | "order-transfer-slip", orderCode: string, file: File | null) => {
    if (!file) {
      return {
        path: null,
        url: null,
        fileName: null,
      };
    }

    const safeName = buildSafeStorageFileName(file.name, kind);
    const path = `${kind}/${orderCode}/${safeName}`;
    const { error: uploadError } = await supabase.storage.from(ORDER_MEDIA_BUCKET).upload(path, file, { upsert: true });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(ORDER_MEDIA_BUCKET).getPublicUrl(path);
    return {
      path,
      url: data.publicUrl,
      fileName: file.name,
    };
  };

  const handleSave = async () => {
    setErr(null);

    if (!orderType) {
      toast.error("ກະລຸນາເລືອກ TYPE");
      return;
    }
    if (!orderNo) {
      toast.error("ກະລຸນາປ້ອນ ORDER No.");
      return;
    }
    if (!adminUserId) {
      toast.error("ກະລຸນາເລືອກ Admin");
      return;
    }
    if (!graphicUserId) {
      toast.error("ກະລຸນາເລືອກ Graphic");
      return;
    }
    if (!selectedFabric) {
      toast.error("ກະລຸນາເລືອກຜ້າ");
      return;
    }

    const orderCode = buildOrderCode(orderType, Number(orderNo));

    const payload = {
      order_code: orderCode,
      order_date: orderDate,
      customer_phone: customerPhone.trim() || null,
      customer_whatsapp: customerWhatsapp.trim() || null,
      factory_bill_code: factoryBillCode.trim() || null,
      admin_user_id: adminUserId || null,
      graphic_user_id: graphicUserId || null,

      fabric_id: selectedFabric.id,
      // snapshot
      fabric_name: selectedFabric.name,
      fabric_short_price: selectedFabric.short_price,
      fabric_long_price: selectedFabric.long_price,

      short_qty: Math.max(0, shortQty),
      long_qty: Math.max(0, longQty),
      free_qty: Math.max(0, freeQty),
      qty_3xl: Math.max(0, qty3XL),
      qty_4xl: Math.max(0, qty4XL),
      qty_5xl: Math.max(0, qty5XL),
      qty_6xl: Math.max(0, qty6XL),

      size_upcharge: SIZE_UPCHARGES["3XL"],

      extra_charge: Math.max(0, extraCharge),
      design_deposit: Math.max(0, designDeposit),
      initial_deposit: Math.max(0, initialDeposit),
      factory_cost: Math.max(0, factoryCost),

      gross_total: grossTotal,
      net_total: netTotal,
      balance: balance,

      status: "in_progress",
    };

    const confirm = await Swal.fire({
      icon: "question",
      title: "ຢືນຢັນການບັນທຶກ?",
      html: `ລະຫັດອໍເດີ: <b>${payload.order_code}</b><br/>ຍອດສຸດທິ: <b>${netTotal.toLocaleString()}</b>`,
      showCancelButton: true,
      confirmButtonText: "ບັນທຶກ",
      cancelButtonText: "ຍົກເລີກ",
      reverseButtons: true,
    });
    if (!confirm.isConfirmed) return;

    const uploadedOrderImage = await uploadOrderAsset("order-image", orderCode, orderImageFile);
    const uploadedOrderTransferSlip = await uploadOrderAsset("order-transfer-slip", orderCode, orderTransferSlipFile);

    const finalPayload = {
      ...payload,
      order_image_path: uploadedOrderImage.path,
      order_image_url: uploadedOrderImage.url,
      order_image_file_name: uploadedOrderImage.fileName,
      order_transfer_slip_path: uploadedOrderTransferSlip.path,
      order_transfer_slip_url: uploadedOrderTransferSlip.url,
      order_transfer_slip_file_name: uploadedOrderTransferSlip.fileName,
    };

    const { error } = await supabase.from("orders").insert(finalPayload);
    if (error) {
      setErr(error.message);
      toast.error(`ບັນທຶກບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    resetForm();
    markClean();
    toast.success("ບັນທຶກອໍເດີສຳເລັດ");
  };

  return (
    <div ref={pageRef} className="text-slate-900">
      {err && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
          Error: {err}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ເພີ່ມອໍເດີໃໝ່</h1>
          <div className="text-sm text-slate-500 font-medium">ບັນທຶກອໍເດີ (ດຶງລາຄາຜ້າຈາກ Supabase)</div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleCancelBack}
            className="border border-slate-300 px-4 py-2 rounded text-sm font-bold text-slate-700 hover:bg-white shadow-sm transition-all"
          >
            ຍົກເລີກ
          </button>
          <button
            onClick={handleSave}
            className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-emerald-700 shadow-sm transition-all"
          >
            ບັນທຶກ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="font-bold text-slate-800 mb-3 uppercase text-xs tracking-wider border-b pb-2 border-slate-50">1) ກ່ຽວກັບອໍເດີ </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ວັນທີມັດຈຳສັ່ງຜະລິດ</label>
                <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-700 block mb-1">ລະຫັດອໍເດີ</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">ປະເພດລະຫັດ</label>
                    <select
                    value={orderTypeSelectValue}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      setOrderType(nextType === CUSTOM_ORDER_TYPE_VALUE ? "" : nextType);
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold bg-white"
                  >
                      <option value="">ເລືອກ TYPE</option>
                      {orderTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                      <option value={CUSTOM_ORDER_TYPE_VALUE}>ສ້າງປະເພດລະຫັດໃໝ່</option>
                    </select>
                  </div>

                  {orderTypeSelectValue === CUSTOM_ORDER_TYPE_VALUE ? (
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">ປະເພດລະຫັດໃໝ່</label>
                      <input
                        value={orderType}
                        onChange={(e) => setOrderType(normalizeOrderType(e.target.value))}
                        placeholder="ຕົວຢ່າງ PK27"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold uppercase"
                      />
                    </div>
                  ) : null}

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">ORDER No.</label>
                    <input
                      value={orderNo}
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/\D/g, "");
                        setOrderNo(digitsOnly);
                      }}
                      placeholder="ORDER No."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ເບີໂທລູກຄ້າ ຫຼື FB (ຖ້າມີ)</label>
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="020xxxxxxxx" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ເບີ WhatsApp (ຖ້າມີ)</label>
                <input value={customerWhatsapp} onChange={(e) => setCustomerWhatsapp(e.target.value)} placeholder="020xxxxxxxx" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" />
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
                  <option value="">ເລືອກ admin</option>
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
                  <option value="">ເລືອກ graphic</option>
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

              <div className="md:col-span-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">ຮູບອໍເດີ ແລະ ສະລິບ</div>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-2">ຮູບອໍເດີ</label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => orderImageFileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white">
                        ເລືອກຮູບ
                      </button>
                      <button type="button" onClick={() => orderImageCameraInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">
                        ຖ່າຍຮູບ
                      </button>
                      <input ref={orderImageFileInputRef} type="file" accept="image/*" className="sr-only" onChange={(e) => handleOrderImageSelected(e.target.files?.[0] || null)} />
                      <input ref={orderImageCameraInputRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => handleOrderImageSelected(e.target.files?.[0] || null)} />
                    </div>
                    <div className="mt-2 text-xs font-semibold text-slate-500">{orderImageFile?.name || "ຍັງບໍ່ມີຮູບ"}</div>
                    {orderImagePreviewUrl ? (
                      <a href={orderImagePreviewUrl} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={orderImagePreviewUrl} alt="order preview" className="mt-3 h-40 w-full rounded-xl border border-slate-200 object-cover" />
                      </a>
                    ) : null}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-2">ຮູບສະລິບການໂອນ</label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => orderTransferSlipFileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white">
                        ເລືອກໄຟລ໌
                      </button>
                      <button type="button" onClick={() => orderTransferSlipCameraInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">
                        ຖ່າຍຮູບ
                      </button>
                      <input ref={orderTransferSlipFileInputRef} type="file" accept="image/*,.pdf" className="sr-only" onChange={(e) => handleOrderTransferSlipSelected(e.target.files?.[0] || null)} />
                      <input ref={orderTransferSlipCameraInputRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => handleOrderTransferSlipSelected(e.target.files?.[0] || null)} />
                    </div>
                    <div className="mt-2 text-xs font-semibold text-slate-500">{orderTransferSlipFile?.name || "ຍັງບໍ່ມີໄຟລ໌"}</div>
                    {orderTransferSlipPreviewUrl ? (
                      <a href={orderTransferSlipPreviewUrl} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={orderTransferSlipPreviewUrl} alt="transfer slip preview" className="mt-3 h-40 w-full rounded-xl border border-slate-200 object-cover" />
                      </a>
                    ) : orderTransferSlipFile && !isImageFileName(orderTransferSlipFile.name) ? (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-4 text-xs font-black text-slate-600">ໄຟລ໌ PDF ຖືກເລືອກແລ້ວ</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="font-bold text-slate-800 mb-3 uppercase text-xs tracking-wider border-b pb-2 border-slate-50">2) ຈຳນວນ & ບວກເພີ່ມໄຊສ໌</div>

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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">3XL (+20,000)</label>
                <input type="number" value={qty3XL} onChange={(e) => setQty3XL(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium" min={0} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">4XL (+30,000)</label>
                <input type="number" value={qty4XL} onChange={(e) => setQty4XL(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium" min={0} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">5XL (+35,000)</label>
                <input type="number" value={qty5XL} onChange={(e) => setQty5XL(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium" min={0} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">6XL (+35,000)</label>
                <input type="number" value={qty6XL} onChange={(e) => setQty6XL(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium" min={0} />
              </div>
            </div>

            <div className="mt-4 p-2 bg-slate-50 rounded-lg text-[11px] font-bold text-slate-500 uppercase tracking-tight">
              ຈຳນວນຜະລິດ (ລວມແຖມ): <span className="text-slate-900">{totalProductionQty}</span> | ຈຳນວນຄິດເງິນ:{" "}
              <span className="text-blue-600">{billableQty}</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="font-bold text-slate-800 mb-3 uppercase text-xs tracking-wider border-b pb-2 border-slate-50">3) ຮູບແບບມັດຈຳ & ລາຍການບວກເພີ່ມ</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ບວກເພີ່ມ (ງານດ່ວນ, ອື່ນໆ)</label>
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
              ບັນທຶກອໍເດີ
            </button>
            <button onClick={handleCancelReset} className="bg-slate-100 text-slate-600 px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-200 border border-slate-200 transition-all">
              ຍົກເລີກ / ລ້າງ
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sticky top-4">
            <div className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest border-b pb-3 border-slate-50">4) ສະຫຼຸບອໍເດີ</div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">ຈຳນວນສັ່ງທັງໝົດ:</span>
                <span className="font-bold text-slate-900">{billableQty.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">ຈຳນວນແຖມ:</span>
                <span className="font-bold text-orange-600">{freeQty.toLocaleString()}</span>
              </div>

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
                <span className="text-slate-500 font-medium">ບວກເພີ່ມ (ງານດ່ວນ, ອື່ນໆ):</span>
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
