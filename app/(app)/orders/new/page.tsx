"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import {
  buildEmptyPantsOrderItem,
  buildPantsOrderItemPayload,
  buildShirtOrderItemPayload,
  getPantsItemsSummary,
  getPantsLineGross,
  getPantsTotalQty,
  isMissingOrderItemsTableError,
  type PantsOrderItemDraft,
} from "@/lib/order-items";
import { getMissingOrderCollarFieldsMessage, isMissingOrderCollarFieldsError } from "@/lib/order-collar-fields";
import { isAdminRole, isGraphicRole, ORDER_ASSIGNABLE_USER_ROLES } from "@/lib/role-groups";
import { buildOrderCode, normalizeOrderNo, normalizeOrderType, type OrderType } from "@/lib/order-code";
import { useOrderTypeOptions } from "@/lib/order-code-options";
import { buildSafeStorageFileName, isImageFileName, ORDER_MEDIA_BUCKET } from "@/lib/order-media";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
import { canEditWithPermissions, normalizeUserPermissionSettings, type UserPermissionSettings } from "@/lib/user-permissions";

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
  auth_user_id?: string | null;
  permission_settings?: UserPermissionSettings | null;
};

const SIZE_UPCHARGES = {
  "3XL": 20000,
  "4XL": 25000,
  "5XL": 35000,
} as const;
const COLLAR_PRICE = 20000;
const QUOTATION_COLLAR_OPTIONS = [
  { value: "none", label: "ບໍ່ບວກ" },
  { value: "polo", label: "ໂປໂລ" },
  { value: "mandarin", label: "ຄໍຈີນ" },
] as const;
const QUOTATION_SLEEVE_OPTIONS = [
  { value: "short", label: "ແຂນສັ້ນ" },
  { value: "long", label: "ແຂນຍາວ" },
  { value: "mixed", label: "ແຂນສັ້ນ/ແຂນຍາວ" },
] as const;

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
  const [viewerRole, setViewerRole] = useState<UserOption["role"] | null>(null);
  const [viewerPermissions, setViewerPermissions] = useState<UserPermissionSettings>({});

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
  const [orderImageFiles, setOrderImageFiles] = useState<File[]>([]);
  const [orderImagePreviewUrls, setOrderImagePreviewUrls] = useState<string[]>([]);
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
  const [collarType, setCollarType] = useState<"none" | "polo" | "mandarin">("none");
  const [collarQty, setCollarQty] = useState<number>(0);
  const [pantsItems, setPantsItems] = useState<PantsOrderItemDraft[]>([]);

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
      .select("id,full_name,role,is_active,auth_user_id,permission_settings")
      .eq("is_active", true)
      .in("role", ORDER_ASSIGNABLE_USER_ROLES)
      .order("full_name", { ascending: true });

    if (error) {
      setErr(error.message);
      setUsers([]);
      setLoadingUsers(false);
      return;
    }

    const rows = (data ?? []) as UserOption[];
    setUsers(rows);
    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id ?? null;
    const currentUser = rows.find((row) => row.auth_user_id === authUserId) || null;
    setViewerRole(currentUser?.role ?? null);
    setViewerPermissions(normalizeUserPermissionSettings(currentUser?.permission_settings));
    setLoadingUsers(false);
  };

  useEffect(() => {
    loadFabrics();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      orderImagePreviewUrls.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
      if (orderTransferSlipPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(orderTransferSlipPreviewUrl);
      pantsItems.forEach((item) => {
        if (item.mockupPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.mockupPreviewUrl);
      });
    };
  }, [orderImagePreviewUrls, orderTransferSlipPreviewUrl, pantsItems]);

  const selectedFabric = useMemo(() => fabrics.find((f) => f.id === fabricId) ?? null, [fabrics, fabricId]);
  const fabricsById = useMemo(() => new Map(fabrics.map((fabric) => [fabric.id, fabric])), [fabrics]);
  const adminOptions = useMemo(() => users.filter((u) => isAdminRole(u.role)), [users]);
  const graphicOptions = useMemo(() => users.filter((u) => isGraphicRole(u.role)), [users]);
  const canEditOrders = canEditWithPermissions(viewerPermissions, "orders", viewerRole !== "admin");

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
  const collarTotal = useMemo(() => (collarType === "none" ? 0 : Math.max(0, collarQty) * COLLAR_PRICE), [collarQty, collarType]);
  const pantsSummary = useMemo(() => getPantsItemsSummary(pantsItems), [pantsItems]);
  const grossTotal = useMemo(
    () => shirtsTotal + plusSizeTotal + pantsSummary.grossTotal + collarTotal + extraCharge,
    [shirtsTotal, plusSizeTotal, pantsSummary.grossTotal, collarTotal, extraCharge]
  );
  const netTotal = useMemo(() => Math.max(0, grossTotal - designDeposit), [grossTotal, designDeposit]);
  const balance = useMemo(() => Math.max(0, netTotal - initialDeposit), [netTotal, initialDeposit]);
  const totalFactoryCost = useMemo(() => Math.max(0, factoryCost) + pantsSummary.factoryCostTotal, [factoryCost, pantsSummary.factoryCostTotal]);
  const profitPreview = useMemo(() => netTotal - totalFactoryCost, [netTotal, totalFactoryCost]);
  const totalOrderBillableQty = useMemo(() => billableQty + pantsSummary.billableQty, [billableQty, pantsSummary.billableQty]);
  const totalOrderFreeQty = useMemo(() => freeQty + pantsSummary.freeQty, [freeQty, pantsSummary.freeQty]);
  const totalOrderQty = useMemo(() => totalProductionQty + pantsSummary.billableQty + pantsSummary.freeQty, [totalProductionQty, pantsSummary.billableQty, pantsSummary.freeQty]);
  const sleeveType = useMemo<"short" | "long" | "mixed">(
    () => (shortQty > 0 && longQty > 0 ? "mixed" : longQty > 0 ? "long" : "short"),
    [shortQty, longQty]
  );
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
    setOrderImageFiles([]);
    orderImagePreviewUrls.forEach((url) => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
    setOrderImagePreviewUrls([]);
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
    setCollarType("none");
    setCollarQty(0);
    pantsItems.forEach((item) => {
      if (item.mockupPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.mockupPreviewUrl);
    });
    setPantsItems([]);
    setExtraCharge(0);
    setDesignDeposit(0);
    setInitialDeposit(0);
    setFactoryCost(0);
  };

  const addPantsItem = () => {
    setPantsItems((prev) => [...prev, buildEmptyPantsOrderItem()]);
  };

  const updatePantsItem = (clientId: string, updater: (item: PantsOrderItemDraft) => PantsOrderItemDraft) => {
    setPantsItems((prev) => prev.map((item) => (item.clientId === clientId ? updater(item) : item)));
  };

  const removePantsItem = (clientId: string) => {
    setPantsItems((prev) => {
      const removed = prev.find((item) => item.clientId === clientId);
      if (removed?.mockupPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(removed.mockupPreviewUrl);
      return prev.filter((item) => item.clientId !== clientId);
    });
  };

  const handlePantsMockupSelected = (clientId: string, file: File | null) => {
    updatePantsItem(clientId, (current) => {
      if (current.mockupPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(current.mockupPreviewUrl);
      }
      return {
        ...current,
        mockupFile: file,
        mockupFileName: file?.name || current.mockupFileName || null,
        mockupPreviewUrl: file && file.type.startsWith("image/") ? URL.createObjectURL(file) : current.mockupUrl || null,
      };
    });
  };

  const clearPantsMockup = (clientId: string) => {
    updatePantsItem(clientId, (current) => {
      if (current.mockupPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(current.mockupPreviewUrl);
      }
      return {
        ...current,
        mockupPath: null,
        mockupUrl: null,
        mockupFileName: null,
        mockupFile: null,
        mockupPreviewUrl: null,
      };
    });
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

  const handleOrderImageSelected = (fileList: FileList | null) => {
    const nextFiles = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
    if (nextFiles.length === 0) return;

    const nextPreviewUrls = nextFiles.map((file) => URL.createObjectURL(file));
    setOrderImageFiles((prev) => [...prev, ...nextFiles]);
    setOrderImagePreviewUrls((prev) => [...prev, ...nextPreviewUrls]);
  };

  const removeOrderImageAt = (index: number) => {
    setOrderImageFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setOrderImagePreviewUrls((prev) =>
      prev.filter((url, itemIndex) => {
        if (itemIndex === index && url.startsWith("blob:")) URL.revokeObjectURL(url);
        return itemIndex !== index;
      })
    );
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

  const uploadOrderImages = async (orderCode: string, files: File[]) => {
    const uploaded: Array<{ path: string; url: string; fileName: string }> = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const safeName = buildSafeStorageFileName(file.name, `order-image-${index + 1}`);
      const path = `order-image/${orderCode}/${safeName}`;
      const { error: uploadError } = await supabase.storage.from(ORDER_MEDIA_BUCKET).upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(ORDER_MEDIA_BUCKET).getPublicUrl(path);
      uploaded.push({
        path,
        url: data.publicUrl,
        fileName: file.name,
      });
    }

    return uploaded;
  };

  const uploadPantsMockupsIfNeeded = async (currentOrderCode: string) => {
    const nextItems: PantsOrderItemDraft[] = [];

    for (let index = 0; index < pantsItems.length; index += 1) {
      const item = pantsItems[index];
      if (!item.mockupFile) {
        nextItems.push(item);
        continue;
      }

      const safeName = buildSafeStorageFileName(item.mockupFile.name, `pants-mockup-${index + 1}`);
      const path = `pants-mockup/${currentOrderCode}/${safeName}`;
      const { error: uploadError } = await supabase.storage.from(ORDER_MEDIA_BUCKET).upload(path, item.mockupFile, { upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(ORDER_MEDIA_BUCKET).getPublicUrl(path);
      if (item.mockupPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.mockupPreviewUrl);

      nextItems.push({
        ...item,
        mockupPath: path,
        mockupUrl: data.publicUrl,
        mockupFileName: item.mockupFile.name,
        mockupFile: null,
        mockupPreviewUrl: data.publicUrl,
      });
    }

    setPantsItems(nextItems);
    return nextItems;
  };

  const handleSave = async () => {
    if (!canEditOrders) {
      toast.error("ທ່ານບໍ່ມີສິດສ້າງອໍເດີ");
      return;
    }
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

    const hasShirtLine = billableQty > 0 || freeQty > 0 || qty3XL > 0 || qty4XL > 0 || qty5XL > 0 || qty6XL > 0;
    const hasPantsLine = pantsItems.some((item) => getPantsTotalQty(item) > 0);
    if (!hasShirtLine && !hasPantsLine) {
      toast.error("ກະລຸນາປ້ອນຢ່າງໜ້ອຍ 1 ລາຍການສິນຄ້າ");
      return;
    }

    for (const item of pantsItems) {
      if (getPantsTotalQty(item) <= 0) {
        toast.error("ລາຍການໂສ້ງແຕ່ລະອັນຕ້ອງມີຈຳນວນຫຼາຍກວ່າ 0");
        return;
      }
      if (!item.fabricId) {
        toast.error("ກະລຸນາເລືອກຜ້າໃຫ້ລາຍການໂສ້ງ");
        return;
      }
      if ((Number(item.unitPrice) || 0) <= 0) {
        toast.error("ກະລຸນາປ້ອນລາຄາຂາຍຂອງລາຍການໂສ້ງ");
        return;
      }
    }

    const orderCode = buildOrderCode(orderType, orderNo);

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
      collar_type: collarType,
      collar_qty: Math.max(0, collarQty),

      size_upcharge: SIZE_UPCHARGES["3XL"],

      extra_charge: Math.max(0, extraCharge),
      design_deposit: Math.max(0, designDeposit),
      initial_deposit: Math.max(0, initialDeposit),
      factory_cost: totalFactoryCost,

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

    const uploadedOrderImages = await uploadOrderImages(orderCode, orderImageFiles);
    const uploadedOrderTransferSlip = await uploadOrderAsset("order-transfer-slip", orderCode, orderTransferSlipFile);
    const uploadedPantsItems = await uploadPantsMockupsIfNeeded(orderCode);
    const primaryOrderImage = uploadedOrderImages[0] || null;

    const finalPayload = {
      ...payload,
      order_image_path: primaryOrderImage?.path || null,
      order_image_url: primaryOrderImage?.url || null,
      order_image_file_name: primaryOrderImage?.fileName || null,
      order_transfer_slip_path: uploadedOrderTransferSlip.path,
      order_transfer_slip_url: uploadedOrderTransferSlip.url,
      order_transfer_slip_file_name: uploadedOrderTransferSlip.fileName,
    };

    const { data: insertedOrder, error } = await supabase.from("orders").insert(finalPayload).select("id").single();
    if (error || !insertedOrder?.id) {
      setErr(error?.message || "insert_order_failed");
      toast.error(isMissingOrderCollarFieldsError(error) ? getMissingOrderCollarFieldsMessage() : `ບັນທຶກບໍ່ສຳເລັດ: ${error?.message || "insert_order_failed"}`);
      return;
    }

    const itemPayloads = [
      ...(hasShirtLine
        ? [
            buildShirtOrderItemPayload({
              orderId: insertedOrder.id as string,
              lineNo: 1,
              fabric: {
                id: selectedFabric.id,
                name: selectedFabric.name,
                shortPrice: selectedFabric.short_price,
                longPrice: selectedFabric.long_price,
              },
              shortQty,
              longQty,
              freeQty,
              qty3XL,
              qty4XL,
              qty5XL,
              qty6XL,
              grossTotal: shirtsTotal + plusSizeTotal,
              netTotal: shirtsTotal + plusSizeTotal,
              factoryCostTotal: Math.max(0, factoryCost),
            }),
          ]
        : []),
      ...uploadedPantsItems.map((item, index) =>
        buildPantsOrderItemPayload({
          orderId: insertedOrder.id as string,
          lineNo: index + 2,
          item,
          fabricsById,
        })
      ),
    ];

    if (itemPayloads.length > 0) {
      const { error: itemError } = await supabase.from("order_items").insert(itemPayloads);
      if (itemError) {
        if (isMissingOrderItemsTableError(itemError)) {
          if (hasPantsLine) {
            toast("ບັນທຶກອໍເດີແລ້ວ ແຕ່ຂໍ້ມູນໂສ້ງຍັງບໍ່ຖືກເກັບ ເນື່ອງຈາກ `order_items` ຍັງບໍ່ພ້ອມ");
          }
        } else {
        setErr(itemError.message);
        toast.error(`ບັນທຶກລາຍການສິນຄ້າບໍ່ສຳເລັດ: ${itemError.message}`);
        return;
        }
      }
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
            disabled={!canEditOrders}
            className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-emerald-700 shadow-sm transition-all disabled:opacity-50"
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
                      onChange={(e) => setOrderNo(normalizeOrderNo(e.target.value))}
                      placeholder="ຕົວຢ່າງ 5001 ຫຼື 5001+1"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold"
                      inputMode="text"
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
                      <input
                        ref={orderImageFileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        onChange={(e) => {
                          handleOrderImageSelected(e.target.files);
                          e.currentTarget.value = "";
                        }}
                      />
                      <input
                        ref={orderImageCameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        onChange={(e) => {
                          handleOrderImageSelected(e.target.files);
                          e.currentTarget.value = "";
                        }}
                      />
                    </div>
                    <div className="mt-2 text-xs font-semibold text-slate-500">
                      {orderImageFiles.length > 0 ? `ເລືອກແລ້ວ ${orderImageFiles.length} ຮູບ` : "ຍັງບໍ່ມີຮູບ"}
                    </div>
                    {orderImagePreviewUrls.length > 0 ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {orderImagePreviewUrls.map((previewUrl, index) => (
                          <div key={`${previewUrl}-${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                            <a href={previewUrl} target="_blank" rel="noreferrer" className="block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={previewUrl} alt={`order preview ${index + 1}`} className="h-40 w-full object-cover" />
                            </a>
                            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
                              <div className="truncate text-xs font-semibold text-slate-500">{orderImageFiles[index]?.name || `ຮູບ ${index + 1}`}</div>
                              <button
                                type="button"
                                onClick={() => removeOrderImageAt(index)}
                                className="shrink-0 rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-black text-rose-600"
                              >
                                ລຶບ
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
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
            <div className="font-bold text-slate-800 mb-3 uppercase text-xs tracking-wider border-b pb-2 border-slate-50">2) ເສື້ອພິມລາຍ</div>

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
                <label className="text-xs font-bold text-slate-700 block mb-1">4XL (+25,000)</label>
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
            <div className="mb-3 flex items-center justify-between border-b border-slate-50 pb-2">
              <div className="font-bold text-slate-800 uppercase text-xs tracking-wider">3) ໂສ້ງພິມລາຍ</div>
              <button onClick={addPantsItem} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-black text-white hover:bg-slate-800">
                ເພີ່ມລາຍການໂສ້ງ
              </button>
            </div>

            {pantsItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-500">
                ຍັງບໍ່ມີລາຍການໂສ້ງ. ຖ້າອໍເດີມີໂສ້ງພິມລາຍ ໃຫ້ກົດ `ເພີ່ມລາຍການໂສ້ງ`
              </div>
            ) : (
              <div className="space-y-4">
                {pantsItems.map((item, index) => (
                  <div key={item.clientId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-black text-slate-800">ລາຍການໂສ້ງ {index + 1}</div>
                      <button onClick={() => removePantsItem(item.clientId)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-100">
                        ລົບ
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="text-xs font-bold text-slate-700 block mb-1">ຮູບໂສ້ງ</label>
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">
                              ເລືອກຮູບ
                              <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={(e) => handlePantsMockupSelected(item.clientId, e.target.files?.[0] || null)}
                              />
                            </label>
                            {(item.mockupPreviewUrl || item.mockupUrl) ? (
                              <button
                                type="button"
                                onClick={() => clearPantsMockup(item.clientId)}
                                className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100"
                              >
                                ລົບຮູບ
                              </button>
                            ) : null}
                            <span className="text-xs font-medium text-slate-500">{item.mockupFileName || "ຍັງບໍ່ມີຮູບ"}</span>
                          </div>
                          {(item.mockupPreviewUrl || item.mockupUrl) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.mockupPreviewUrl || item.mockupUrl || ""}
                              alt={`pants-mockup-${index + 1}`}
                              className="mt-3 h-40 w-full rounded-xl border border-slate-200 object-contain bg-white"
                            />
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">ຊື່ລາຍການ</label>
                        <input
                          value={item.productName}
                          onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, productName: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">ຜ້າ</label>
                        <select
                          value={item.fabricId}
                          onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, fabricId: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 bg-white"
                        >
                          <option value="">ເລືອກຜ້າ</option>
                          {fabrics.map((fabric) => (
                            <option key={fabric.id} value={fabric.id}>
                              {fabric.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">ຈຳນວນຄິດເງິນ</label>
                        <input
                          type="number"
                          min={0}
                          value={item.qty}
                          onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, qty: Number(e.target.value) }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">ຈຳນວນແຖມ</label>
                        <input
                          type="number"
                          min={0}
                          value={item.freeQty}
                          onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, freeQty: Number(e.target.value) }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-orange-600"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">ລາຄາຂາຍ/ຕົວ</label>
                        <input
                          type="number"
                          min={0}
                          value={item.unitPrice}
                          onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, unitPrice: Number(e.target.value) }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">ຕົ້ນທຶນໂຮງງານຂອງລາຍການ</label>
                        <input
                          type="number"
                          min={0}
                          value={item.factoryCost}
                          onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, factoryCost: Number(e.target.value) }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs font-bold text-slate-700 block mb-1">ໝາຍເຫດ</label>
                        <textarea
                          value={item.notes}
                          onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, notes: e.target.value }))}
                          rows={2}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-900"
                          placeholder="ເຊັ່ນ ໄຊສ໌, ກະເປົາ, ຊົງໂສ້ງ..."
                        />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <div className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600">ຜະລິດລວມ: <span className="text-slate-900">{getPantsTotalQty(item).toLocaleString()}</span></div>
                      <div className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600">ຍອດຂາຍ: <span className="text-slate-900">{getPantsLineGross(item).toLocaleString()}</span></div>
                      <div className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600">ຕົ້ນທຶນ: <span className="text-slate-900">{Math.max(0, Number(item.factoryCost) || 0).toLocaleString()}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="font-bold text-slate-800 mb-3 uppercase text-xs tracking-wider border-b pb-2 border-slate-50">4) ຮູບແບບມັດຈຳ & ລາຍການບວກເພີ່ມ</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ຄໍເສື້ອ/ແຂນເສື້ອ</label>
                <select
                  value={collarType}
                  onChange={(e) => {
                    const nextValue = e.target.value as "none" | "polo" | "mandarin";
                    setCollarType(nextValue);
                    if (nextValue === "none") setCollarQty(0);
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold bg-white"
                >
                  {QUOTATION_COLLAR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[11px] font-bold text-slate-500">
                  ແຂນເສື້ອ: {QUOTATION_SLEEVE_OPTIONS.find((option) => option.value === sleeveType)?.label || "-"}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ຈຳນວນຄໍທີ່ບວກເພີ່ມ</label>
                <input
                  type="number"
                  value={collarQty}
                  onChange={(e) => setCollarQty(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold"
                  min={0}
                  disabled={collarType === "none"}
                />
                <div className="mt-1 text-[11px] font-bold text-slate-500">ລວມຄ່າບວກ: {collarTotal.toLocaleString()} ກີບ</div>
              </div>

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
                <label className="text-xs font-bold text-slate-700 block mb-1">ຕົ້ນທຶນໂຮງງານສ່ວນເສື້ອ</label>
                <input type="number" value={factoryCost} onChange={(e) => setFactoryCost(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold" min={0} />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!canEditOrders} className="bg-emerald-600 text-white px-8 py-2.5 rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-md transition-all active:scale-95 disabled:opacity-50">
              ບັນທຶກອໍເດີ
            </button>
            <button onClick={handleCancelReset} className="bg-slate-100 text-slate-600 px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-200 border border-slate-200 transition-all">
              ຍົກເລີກ / ລ້າງ
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sticky top-4">
            <div className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest border-b pb-3 border-slate-50">5) ສະຫຼຸບອໍເດີ</div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">ຈຳນວນສັ່ງທັງໝົດ:</span>
                <span className="font-bold text-slate-900">{totalOrderBillableQty.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">ຈຳນວນເສື້ອ:</span>
                <span className="font-bold text-slate-900">{billableQty.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">ຈຳນວນໂສ້ງ:</span>
                <span className="font-bold text-slate-900">{pantsSummary.billableQty.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">ຈຳນວນແຖມ:</span>
                <span className="font-bold text-orange-600">{totalOrderFreeQty.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">ແຖມເສື້ອ:</span>
                <span className="font-bold text-orange-600">{freeQty.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">ແຖມໂສ້ງ:</span>
                <span className="font-bold text-orange-600">{pantsSummary.freeQty.toLocaleString()}</span>
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
                <span className="text-slate-500 font-medium">ຄ່າໂສ້ງທັງໝົດ:</span>
                <span className="font-bold text-slate-800">{pantsSummary.grossTotal.toLocaleString()}</span>
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

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">ຕົ້ນທຶນລວມ:</span>
                <span className="font-bold text-slate-800">{totalFactoryCost.toLocaleString()}</span>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                <span className="text-slate-500 font-medium">ກຳໄລ (ຕົວຢ່າງ):</span>
                <span className={`text-lg font-black ${profitPreview >= 0 ? "text-blue-600" : "text-red-600"}`}>
                  {profitPreview.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="mt-6 p-3 bg-amber-50 rounded-xl text-[10px] text-amber-700 font-bold leading-relaxed border border-amber-100">
              ລາຍການລວມ: {totalOrderQty.toLocaleString()} ຊິ້ນ | ກຳໄລຈະນັບເມື່ອປິດງານ (Completed) ແລະ ຈ່າຍຄົບ 100%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
