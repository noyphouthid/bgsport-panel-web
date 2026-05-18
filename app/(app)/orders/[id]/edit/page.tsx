"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, CheckCheck, RefreshCcw, Save, Trash2, Undo2 } from "lucide-react";
import { OrderSummaryPanel } from "../../_components/order-summary-panel";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import {
  buildEmptyPantsOrderItem,
  buildPantsOrderItemPayload,
  buildShirtOrderItemPayload,
  getPantsItemsSummary,
  getPantsLineGross,
  getPantsTotalQty,
  isMissingOrderItemsTableError,
  parsePantsOrderItems,
  type OrderItemRow,
  type PantsOrderItemDraft,
} from "@/lib/order-items";
import { isAdminRole, isGraphicRole, ORDER_ASSIGNABLE_USER_ROLES } from "@/lib/role-groups";
import { buildOrderCode, normalizeOrderNo, normalizeOrderType, parseOrderCode, type OrderType } from "@/lib/order-code";
import { useOrderTypeOptions } from "@/lib/order-code-options";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
import {
  buildFactoryDesignFallbackUrl,
  buildSafeStorageFileName,
  extractProductionMockupUrls,
  isImageFileName,
  ORDER_MEDIA_BUCKET,
  toDisplayMediaUrl,
} from "@/lib/order-media";
import { getMissingOrderCollarFieldsMessage, isMissingOrderCollarFieldsError } from "@/lib/order-collar-fields";
import { canEditWithPermissions, normalizeUserPermissionSettings, type UserPermissionSettings } from "@/lib/user-permissions";

type OrderDetail = {
  id: string;
  order_code: string;
  order_date: string;
  customer_phone: string | null;
  customer_whatsapp: string | null;
  factory_bill_code: string | null;
  order_image_path?: string | null;
  order_image_url?: string | null;
  order_image_file_name?: string | null;
  order_transfer_slip_path?: string | null;
  order_transfer_slip_url?: string | null;
  order_transfer_slip_file_name?: string | null;
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
  collar_type: "none" | "polo" | "mandarin";
  collar_qty: number;
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
  factory_production_status: string | null;
  factory_production_status_index: number | null;
  factory_production_shipping_status: string | null;
  factory_production_due_date: string | null;
  factory_production_is_rush: boolean | null;
  factory_production_source_updated_at: string | null;
  factory_production_synced_at: string | null;
  factory_production_sync_error: string | null;
  factory_production_payload: FactoryProductionPayload | null;
};

type FactoryProductionPayload = {
  statuses?: string[] | null;
  events?: Array<{
    status_index?: number | null;
    status?: string | null;
    note?: string | null;
    ts?: string | null;
    ts_display?: string | null;
  }> | null;
  updated_at_display?: string | null;
  due_date_display?: string | null;
  shipping_status?: string | null;
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

type ShipmentMediaInfo = {
  delivery_scheduled_at: string | null;
  transfer_slip_url: string | null;
  handoff_photo_url: string | null;
  status: string | null;
};

type LinkedDepositMediaInfo = {
  mockup_urls: string[];
  transfer_slip_url: string | null;
  sleeve_type: "short" | "long" | "mixed" | null;
  collar_type: "none" | "polo" | "mandarin" | null;
  collar_qty: number;
  extra_charge: number;
};

const SIZE_UPCHARGES = {
  "3XL": 20000,
  "4XL": 25000,
  "5XL": 35000,
} as const;

const CUSTOM_ORDER_TYPE_VALUE = "__custom__";
const QUOTATION_SLEEVE_OPTIONS = [
  { value: "short", label: "ແຂນສັ້ນ" },
  { value: "long", label: "ແຂນຍາວ" },
  { value: "mixed", label: "ແຂນສັ້ນ/ແຂນຍາວ" },
] as const;
const QUOTATION_COLLAR_OPTIONS = [
  { value: "none", label: "ບໍ່ບວກ" },
  { value: "polo", label: "ໂປໂລ" },
  { value: "mandarin", label: "ຄໍຈີນ" },
] as const;

const inputClassName =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition-all focus:ring-2 focus:ring-blue-500";
const actionButtonClassName =
  "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-45";

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US");
}

export default function EditOrderPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;
  const pageRef = useRef<HTMLDivElement | null>(null);
  const depositCollarFallbackAppliedRef = useRef(false);

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [fabrics, setFabrics] = useState<FabricRow[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [factoryPayments, setFactoryPayments] = useState<FactoryPayment[]>([]);
  const [importReceipt, setImportReceipt] = useState<ImportReceiptInfo | null>(null);
  const [shipmentMedia, setShipmentMedia] = useState<ShipmentMediaInfo | null>(null);
  const [linkedDepositMedia, setLinkedDepositMedia] = useState<LinkedDepositMediaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingFabrics, setLoadingFabrics] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerPermissions, setViewerPermissions] = useState<UserPermissionSettings>({});
  const { markClean, allowNextNavigation } = useUnsavedChangesGuard({ scopeRef: pageRef, enabled: !loading });

  const [orderDate, setOrderDate] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("");
  const [orderNo, setOrderNo] = useState("");
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
  const [collarType, setCollarType] = useState<"none" | "polo" | "mandarin">("none");
  const [collarQty, setCollarQty] = useState(0);
  const [pantsItems, setPantsItems] = useState<PantsOrderItemDraft[]>([]);
  const [extraCharge, setExtraCharge] = useState(0);
  const [designDeposit, setDesignDeposit] = useState(0);
  const [initialDeposit, setInitialDeposit] = useState(0);
  const [factoryCost, setFactoryCost] = useState(0);
  const [factoryPaidFullDate, setFactoryPaidFullDate] = useState("");
  const [productionCompletedDate, setProductionCompletedDate] = useState("");
  const { options: orderTypeOptions } = useOrderTypeOptions(true);
  const [pendingOrderImageFiles, setPendingOrderImageFiles] = useState<File[]>([]);
  const [pendingOrderImagePreviewUrls, setPendingOrderImagePreviewUrls] = useState<string[]>([]);
  const [savedOrderImageUrls, setSavedOrderImageUrls] = useState<string[]>([]);
  const [orderTransferSlipFile, setOrderTransferSlipFile] = useState<File | null>(null);
  const [orderTransferSlipPreviewUrl, setOrderTransferSlipPreviewUrl] = useState<string | null>(null);

  const [showCustomerPayModal, setShowCustomerPayModal] = useState(false);
  const [customerPayAmount, setCustomerPayAmount] = useState(0);
  const [customerPayNote, setCustomerPayNote] = useState("");
  const [customerPayDate, setCustomerPayDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [showFactoryPayModal, setShowFactoryPayModal] = useState(false);
  const [factoryPayAmount, setFactoryPayAmount] = useState(0);
  const [factoryPayNote, setFactoryPayNote] = useState("");
  const [factoryPayDate, setFactoryPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cancelingImport, setCancelingImport] = useState(false);
  const [syncingFactory, setSyncingFactory] = useState(false);
  const orderImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const orderImageCameraInputRef = useRef<HTMLInputElement | null>(null);
  const orderTransferSlipFileInputRef = useRef<HTMLInputElement | null>(null);
  const orderTransferSlipCameraInputRef = useRef<HTMLInputElement | null>(null);

  const toDateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
  const dateInputToIso = (value: string) => (value ? new Date(`${value}T12:00:00`).toISOString() : null);
  const isCustomOrderType = useMemo(() => Boolean(orderType) && !orderTypeOptions.includes(orderType), [orderType, orderTypeOptions]);
  const orderTypeSelectValue = isCustomOrderType ? CUSTOM_ORDER_TYPE_VALUE : orderType;

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
    depositCollarFallbackAppliedRef.current = false;
    const { data: itemData, error: itemError } = await supabase
      .from("order_items")
      .select("id,order_id,line_no,product_type,product_name,fabric_id,fabric_name,qty,free_qty,unit_price,extra_charge,line_discount,gross_total,net_total,factory_cost_total,size_breakdown,attributes,notes,created_at,updated_at")
      .eq("order_id", orderId)
      .order("line_no", { ascending: true });
    if (itemError && !isMissingOrderItemsTableError(itemError)) throw itemError;
    const itemRows = ((itemData ?? []) as OrderItemRow[]) || [];
    const shirtItem = itemRows.find((row) => row.product_type === "shirt_printed") || null;

    const parsedOrderCode = parseOrderCode(o.order_code);
    setOrder(o);
    setOrderDate(o.order_date);
    setOrderType(parsedOrderCode.orderType);
    setOrderNo(parsedOrderCode.orderNo);
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
    setCollarType(o.collar_type || "none");
    setCollarQty(Math.max(0, Number(o.collar_qty) || 0));
    setExtraCharge(o.extra_charge);
    setDesignDeposit(o.design_deposit);
    setInitialDeposit(o.initial_deposit);
    setFactoryCost(shirtItem ? Math.max(0, Number(shirtItem.factory_cost_total) || 0) : itemRows.length > 0 ? 0 : o.factory_cost);
    pantsItems.forEach((item) => {
      if (item.mockupPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.mockupPreviewUrl);
    });
    setPantsItems(
      parsePantsOrderItems(itemRows).map((item) => ({
        ...item,
        mockupUrl: toDisplayMediaUrl(item.mockupUrl) || item.mockupUrl || null,
        mockupPreviewUrl: toDisplayMediaUrl(item.mockupUrl) || item.mockupUrl || null,
      }))
    );
    setFactoryPaidFullDate(toDateInput(o.factory_paid_full_at));
    setProductionCompletedDate(toDateInput(o.production_completed_at));
    pendingOrderImagePreviewUrls.forEach((url) => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
    setPendingOrderImageFiles([]);
    setPendingOrderImagePreviewUrls([]);
    const imageFolderPath = `order-image/${o.order_code}`;
    const fallbackOrderImageUrl = toDisplayMediaUrl(o.order_image_url) || null;
    const { data: imageEntries, error: imageListError } = await supabase.storage.from(ORDER_MEDIA_BUCKET).list(imageFolderPath, { limit: 100 });
    if (imageListError) {
      setSavedOrderImageUrls(fallbackOrderImageUrl ? [fallbackOrderImageUrl] : []);
    } else {
      const galleryUrls = (imageEntries ?? [])
        .filter((entry) => isImageFileName(entry.name))
        .sort((left, right) => {
          const leftTime = Date.parse(left.created_at || left.updated_at || "");
          const rightTime = Date.parse(right.created_at || right.updated_at || "");
          return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
        })
        .map((entry) => supabase.storage.from(ORDER_MEDIA_BUCKET).getPublicUrl(`${imageFolderPath}/${entry.name}`).data.publicUrl);
      setSavedOrderImageUrls(galleryUrls.length > 0 ? galleryUrls : fallbackOrderImageUrl ? [fallbackOrderImageUrl] : []);
    }
    setOrderTransferSlipFile(null);
    if (orderTransferSlipPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(orderTransferSlipPreviewUrl);
    setOrderTransferSlipPreviewUrl(toDisplayMediaUrl(o.order_transfer_slip_url) || null);
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    const { data, error } = await supabase.from("users").select("id,full_name,role,is_active").eq("is_active", true).in("role", ORDER_ASSIGNABLE_USER_ROLES).order("full_name", { ascending: true });
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

  const loadShipmentMedia = async () => {
    const { data, error } = await supabase
      .from("shipment_delivery_requests")
      .select("delivery_scheduled_at,transfer_slip_url,handoff_photo_url,status")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    setShipmentMedia((data as ShipmentMediaInfo | null) ?? null);
  };

  const loadLinkedDepositMedia = async () => {
    const { data, error } = await supabase
      .from("factory_deposit_orders")
      .select("production_items,transfer_slip_url,sleeve_type,collar_type,collar_qty,extra_charge")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      setLinkedDepositMedia(null);
      return;
    }

    const row = data as {
      production_items?: unknown;
      transfer_slip_url?: string | null;
      sleeve_type?: "short" | "long" | "mixed" | null;
      collar_type?: "none" | "polo" | "mandarin" | null;
      collar_qty?: number | null;
      extra_charge?: number | null;
    };
    setLinkedDepositMedia({
      mockup_urls: extractProductionMockupUrls(row.production_items),
      transfer_slip_url: toDisplayMediaUrl(row.transfer_slip_url) || null,
      sleeve_type: row.sleeve_type || null,
      collar_type: row.collar_type || null,
      collar_qty: Math.max(0, Number(row.collar_qty) || 0),
      extra_charge: Math.max(0, Number(row.extra_charge) || 0),
    });
  };

  useEffect(() => {
    if (!order || !linkedDepositMedia) return;
    if (depositCollarFallbackAppliedRef.current) return;
    if (collarType !== "none" || collarQty !== 0) return;
    if (linkedDepositMedia.collar_type && linkedDepositMedia.collar_type !== "none") {
      depositCollarFallbackAppliedRef.current = true;
      setCollarType(linkedDepositMedia.collar_type);
      setCollarQty(linkedDepositMedia.collar_qty);
      setExtraCharge(linkedDepositMedia.extra_charge);
    }
  }, [collarQty, collarType, linkedDepositMedia, order]);

  const handleOrderImageSelected = (fileList: FileList | null) => {
    const nextFiles = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
    if (nextFiles.length === 0) return;

    const nextPreviewUrls = nextFiles.map((file) => URL.createObjectURL(file));
    setPendingOrderImageFiles((prev) => [...prev, ...nextFiles]);
    setPendingOrderImagePreviewUrls((prev) => [...prev, ...nextPreviewUrls]);
  };

  const removePendingOrderImageAt = (index: number) => {
    setPendingOrderImageFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setPendingOrderImagePreviewUrls((prev) =>
      prev.filter((url, itemIndex) => {
        if (itemIndex === index && url.startsWith("blob:")) URL.revokeObjectURL(url);
        return itemIndex !== index;
      })
    );
  };

  const handleOrderTransferSlipSelected = (file: File | null) => {
    setOrderTransferSlipFile(file);
    if (orderTransferSlipPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(orderTransferSlipPreviewUrl);
    setOrderTransferSlipPreviewUrl(
      file && file.type.startsWith("image/") ? URL.createObjectURL(file) : toDisplayMediaUrl(order?.order_transfer_slip_url) || null
    );
  };

  const uploadOrderAsset = async (kind: "order-image" | "order-transfer-slip", currentOrderCode: string, file: File | null) => {
    if (!file) {
      return {
        path: null,
        url: null,
        fileName: null,
      };
    }

    const safeName = buildSafeStorageFileName(file.name, kind);
    const path = `${kind}/${currentOrderCode}/${safeName}`;
    const { error: uploadError } = await supabase.storage.from(ORDER_MEDIA_BUCKET).upload(path, file, { upsert: true });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(ORDER_MEDIA_BUCKET).getPublicUrl(path);
    return {
      path,
      url: data.publicUrl,
      fileName: file.name,
    };
  };

  const uploadOrderImages = async (currentOrderCode: string, files: File[]) => {
    const uploaded: Array<{ path: string; url: string; fileName: string }> = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const safeName = buildSafeStorageFileName(file.name, `order-image-${index + 1}`);
      const path = `order-image/${currentOrderCode}/${safeName}`;
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

  const reloadAll = async () => {
    setLoading(true);
    setErr(null);
    try {
      await Promise.all([loadOrder(), loadUsers(), loadFabrics()]);
      await Promise.all([loadCustomerPayments(), loadFactoryPayments(), loadImportReceipt(), loadShipmentMedia(), loadLinkedDepositMedia()]);
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
    return () => {
      pendingOrderImagePreviewUrls.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
      if (orderTransferSlipPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(orderTransferSlipPreviewUrl);
      pantsItems.forEach((item) => {
        if (item.mockupPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.mockupPreviewUrl);
      });
    };
  }, [pendingOrderImagePreviewUrls, orderTransferSlipPreviewUrl, pantsItems]);

  useEffect(() => {
    const loadViewerRole = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user.id;
      if (!authUserId) return;
      const { data } = await supabase.from("users").select("role,permission_settings").eq("auth_user_id", authUserId).maybeSingle();
      if (data?.role) setViewerRole(data.role as AppRole);
      setViewerPermissions(normalizeUserPermissionSettings((data as { permission_settings?: UserPermissionSettings | null } | null)?.permission_settings));
    };
    void loadViewerRole();
  }, []);

  const adminOptions = useMemo(() => users.filter((u) => isAdminRole(u.role)), [users]);
  const graphicOptions = useMemo(() => users.filter((u) => isGraphicRole(u.role)), [users]);
  const selectedFabric = useMemo(() => fabrics.find((f) => f.id === fabricId) ?? null, [fabrics, fabricId]);
  const fabricsById = useMemo(() => new Map(fabrics.map((fabric) => [fabric.id, fabric])), [fabrics]);

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
  const collarTotal = useMemo(() => (collarType === "none" ? 0 : Math.max(0, collarQty) * 20000), [collarQty, collarType]);
  const pantsSummary = useMemo(() => getPantsItemsSummary(pantsItems), [pantsItems]);
  const grossTotal = useMemo(
    () => shirtsTotal + plusSizeTotal + pantsSummary.grossTotal + collarTotal + extraCharge,
    [shirtsTotal, plusSizeTotal, pantsSummary.grossTotal, collarTotal, extraCharge]
  );
  const netTotal = useMemo(() => Math.max(0, grossTotal - designDeposit), [grossTotal, designDeposit]);

  const customerReceived = useMemo(() => {
    const paymentHistoryTotal = customerPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const savedDeposit = Number(initialDeposit || 0);
    const receivedFromBalance = order ? Math.max(0, Number(order.net_total || 0) - Number(order.balance || 0)) : 0;
    return Math.max(paymentHistoryTotal, savedDeposit, receivedFromBalance);
  }, [customerPayments, initialDeposit, order]);

  const customerOutstanding = useMemo(() => Math.max(0, netTotal - customerReceived), [netTotal, customerReceived]);
  const factoryPaid = useMemo(() => factoryPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0), [factoryPayments]);
  const totalFactoryCost = useMemo(() => Math.max(0, Number(factoryCost || 0)) + pantsSummary.factoryCostTotal, [factoryCost, pantsSummary.factoryCostTotal]);
  const factoryOutstanding = useMemo(() => Math.max(0, totalFactoryCost - factoryPaid), [totalFactoryCost, factoryPaid]);
  const profitPreview = useMemo(() => netTotal - totalFactoryCost, [netTotal, totalFactoryCost]);
  const totalOrderBillableQty = useMemo(() => shortQty + longQty + pantsSummary.billableQty, [shortQty, longQty, pantsSummary.billableQty]);
  const totalOrderFreeQty = useMemo(() => freeQty + pantsSummary.freeQty, [freeQty, pantsSummary.freeQty]);
  const totalOrderQty = useMemo(() => shortQty + longQty + freeQty + pantsSummary.billableQty + pantsSummary.freeQty, [shortQty, longQty, freeQty, pantsSummary.billableQty, pantsSummary.freeQty]);
  const sleeveType = useMemo<"short" | "long" | "mixed">(
    () => (shortQty > 0 && longQty > 0 ? "mixed" : longQty > 0 ? "long" : "short"),
    [shortQty, longQty]
  );

  const productionStatusLabel = order?.production_completed_at ? "ຜະລິດສຳເລັດ" : "ກຳລັງຜະລິດ";
  const closeStatusLabel = order?.status === "completed" ? "ປິດງານແລ້ວ" : "ຍັງບໍ່ປິດງານ";
  const isReadOnlyAdmin = !canEditWithPermissions(viewerPermissions, "orders", viewerRole !== "admin");
  const canViewProfitDetails = viewerRole !== "admin" && viewerRole !== "staff";
  const latestShipmentDeliveryDate = shipmentMedia?.delivery_scheduled_at ? toDateInput(shipmentMedia.delivery_scheduled_at) : "";
  const oldFactoryFallbackImageUrl = useMemo(() => {
    if (savedOrderImageUrls.length > 0 || pendingOrderImagePreviewUrls.length > 0 || (linkedDepositMedia?.mockup_urls.length || 0) > 0) return null;
    return buildFactoryDesignFallbackUrl(factoryBillCode);
  }, [factoryBillCode, linkedDepositMedia?.mockup_urls.length, pendingOrderImagePreviewUrls.length, savedOrderImageUrls.length]);

  const renderMediaPreview = (url: string | null, alt: string, fallbackLabel: string) => {
    if (!url) {
      return (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-xs font-bold text-slate-500">
          {fallbackLabel}
        </div>
      );
    }

    if (isImageFileName(url)) {
      return (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="h-44 w-full rounded-xl border border-slate-200 object-cover transition hover:opacity-95" />
        </a>
      );
    }

    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex h-44 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-center text-sm font-black text-blue-700 hover:bg-blue-50"
      >
        ເປີດໄຟລ໌
      </a>
    );
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
      if (current.mockupPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(current.mockupPreviewUrl);
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
      if (current.mockupPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(current.mockupPreviewUrl);
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

  const handleUpdate = async () => {
    if (!order || isReadOnlyAdmin) return;
    if (!orderType) return toast.error("ກະລຸນາເລືອກ TYPE");
    if (!orderNo) return toast.error("ກະລຸນາປ້ອນ ORDER No.");
    if (!adminUserId) return toast.error("ກະລຸນາເລືອກ Admin");
    if (!graphicUserId) return toast.error("ກະລຸນາເລືອກ Graphic");
    if (!fabricId) return toast.error("ກະລຸນາເລືອກປະເພດຜ້າ");

    const hasShirtLine = shortQty > 0 || longQty > 0 || freeQty > 0 || qty3XL > 0 || qty4XL > 0 || qty5XL > 0 || qty6XL > 0;
    const hasPantsLine = pantsItems.some((item) => getPantsTotalQty(item) > 0);
    if (!hasShirtLine && !hasPantsLine) return toast.error("ກະລຸນາປ້ອນຢ່າງໜ້ອຍ 1 ລາຍການສິນຄ້າ");

    for (const item of pantsItems) {
      if (getPantsTotalQty(item) <= 0) return toast.error("ລາຍການໂສ້ງແຕ່ລະອັນຕ້ອງມີຈຳນວນຫຼາຍກວ່າ 0");
      if (!item.fabricId) return toast.error("ກະລຸນາເລືອກຜ້າໃຫ້ລາຍການໂສ້ງ");
      if ((Number(item.unitPrice) || 0) <= 0) return toast.error("ກະລຸນາປ້ອນລາຄາຂາຍຂອງລາຍການໂສ້ງ");
    }

    try {
      const fabric = selectedFabric ?? { id: order.fabric_id, name: order.fabric_name, short_price: order.fabric_short_price, long_add: 0, long_price: order.fabric_long_price, is_active: true };
      const currentOrderCode = buildOrderCode(orderType, orderNo);
      const uploadedOrderImages = await uploadOrderImages(currentOrderCode, pendingOrderImageFiles);
      const orderTransferSlipAsset = await uploadOrderAsset("order-transfer-slip", currentOrderCode, orderTransferSlipFile);
      const uploadedPantsItems = await uploadPantsMockupsIfNeeded(currentOrderCode);
      const primaryOrderImage =
        uploadedOrderImages[0] ||
        (savedOrderImageUrls[0]
          ? {
              path: order.order_image_path ?? null,
              url: savedOrderImageUrls[0],
              fileName: order.order_image_file_name ?? null,
            }
          : null);
      const payload = {
        order_code: currentOrderCode,
        order_date: orderDate,
        customer_phone: customerPhone.trim() || null,
        customer_whatsapp: customerWhatsapp.trim() || null,
        factory_bill_code: factoryBillCode.trim() || null,
        order_image_path: primaryOrderImage?.path ?? order.order_image_path ?? null,
        order_image_url: primaryOrderImage?.url ?? order.order_image_url ?? null,
        order_image_file_name: primaryOrderImage?.fileName ?? order.order_image_file_name ?? null,
        order_transfer_slip_path: orderTransferSlipAsset.path ?? order.order_transfer_slip_path ?? null,
        order_transfer_slip_url: orderTransferSlipAsset.url ?? order.order_transfer_slip_url ?? null,
        order_transfer_slip_file_name: orderTransferSlipAsset.fileName ?? order.order_transfer_slip_file_name ?? null,
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
        collar_type: collarType,
        collar_qty: Math.max(0, collarQty),
        extra_charge: Math.max(0, extraCharge),
        design_deposit: Math.max(0, designDeposit),
        factory_cost: totalFactoryCost,
        gross_total: grossTotal,
        net_total: netTotal,
        initial_deposit: customerReceived,
        balance: customerOutstanding,
        customer_paid_full_at: customerOutstanding === 0 ? order.customer_paid_full_at || new Date().toISOString() : null,
        factory_paid_full_at: dateInputToIso(factoryPaidFullDate),
        production_completed_at: dateInputToIso(productionCompletedDate),
      };

      const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
      if (error) {
        setErr(error.message);
        return toast.error(isMissingOrderCollarFieldsError(error) ? getMissingOrderCollarFieldsMessage() : `ບັນທຶກບໍ່ສຳເລັດ: ${error.message}`);
      }

      let orderItemsUnavailable = false;
      const { error: deleteItemsError } = await supabase.from("order_items").delete().eq("order_id", orderId);
      if (deleteItemsError) {
        if (isMissingOrderItemsTableError(deleteItemsError)) {
          orderItemsUnavailable = true;
        } else {
          setErr(deleteItemsError.message);
          return toast.error(`ບັນທຶກລາຍການສິນຄ້າບໍ່ສຳເລັດ: ${deleteItemsError.message}`);
        }
      }

      const itemPayloads = [
        ...(hasShirtLine
          ? [
              buildShirtOrderItemPayload({
                orderId,
                lineNo: 1,
                fabric: {
                  id: fabric.id,
                  name: fabric.name,
                  shortPrice: fabric.short_price,
                  longPrice: fabric.long_price,
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
            orderId,
            lineNo: index + 2,
            item,
            fabricsById,
          })
        ),
      ];

      if (!orderItemsUnavailable && itemPayloads.length > 0) {
        const { error: insertItemsError } = await supabase.from("order_items").insert(itemPayloads);
        if (insertItemsError) {
          if (isMissingOrderItemsTableError(insertItemsError)) {
            orderItemsUnavailable = true;
          } else {
            setErr(insertItemsError.message);
            return toast.error(`ບັນທຶກລາຍການສິນຄ້າບໍ່ສຳເລັດ: ${insertItemsError.message}`);
          }
        }
      }

      await safeInsertAction("update_order", "Updated order details");
      await reloadAll();
      markClean();
      if (orderItemsUnavailable && hasPantsLine) {
        toast("ບັນທຶກອໍເດີແລ້ວ ແຕ່ຂໍ້ມູນໂສ້ງຍັງບໍ່ຖືກ sync ເນື່ອງຈາກ `order_items` ຍັງບໍ່ພ້ອມ");
      }
      toast.success("ບັນທຶກແລ້ວ");
    } catch (error) {
      const message = error instanceof Error ? error.message : "save_failed";
      setErr(message);
      toast.error(isMissingOrderCollarFieldsError(message) ? getMissingOrderCollarFieldsMessage() : `ບັນທຶກບໍ່ສຳເລັດ: ${message}`);
    }
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

  const handleSyncFactoryStatus = async () => {
    if (!order) return;
    const savedFactoryBillCode = String(order.factory_bill_code || "").trim();
    const currentFactoryBillCode = String(factoryBillCode || "").trim();

    if (!currentFactoryBillCode) {
      toast.error("ກະລຸນາໃສ່ບິນໂຮງງານກ່ອນ");
      return;
    }

    if (savedFactoryBillCode !== currentFactoryBillCode) {
      toast.error("ກະລຸນາກົດບັນທຶກກ່ອນ sync ສະຖານະໂຮງງານ");
      return;
    }

    setSyncingFactory(true);
    setErr(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error("no_session");
      }

      const response = await fetch(`/api/orders/${orderId}/factory-production`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "factory_sync_failed");
      }

      await reloadAll();
      toast.success("ດຶງສະຖານະຈາກໂຮງງານແລ້ວ");
    } catch (error) {
      const message = error instanceof Error ? error.message : "factory_sync_failed";
      setErr(message);
      toast.error(message);
    } finally {
      setSyncingFactory(false);
    }
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
    allowNextNavigation();
    router.push("/orders");
  };

  if (loading) return <div className="font-bold text-slate-900">ກຳລັງໂຫຼດ...</div>;
  if (!order) return <div className="font-bold text-red-700">ບໍ່ພົບຂໍ້ມູນອໍເດີ.</div>;

  const factoryStatuses = Array.isArray(order.factory_production_payload?.statuses)
    ? order.factory_production_payload?.statuses?.filter((item): item is string => Boolean(item))
    : [];
  const factoryEvents = Array.isArray(order.factory_production_payload?.events)
    ? order.factory_production_payload?.events?.filter(Boolean).slice().reverse().slice(0, 6)
    : [];
  const factoryStatusText = order.factory_production_status?.trim()
    ? `${Number(order.factory_production_status_index || 0) > 0 ? `#${order.factory_production_status_index} ` : ""}${order.factory_production_status}`
    : "-";

  return (
    <div ref={pageRef} className="space-y-4">
      {err && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 font-bold">ຂໍ້ຜິດພາດ: {err}</div>}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">ແກ້ໄຂອໍເດີ: {order.order_code}</h1>
          <div className="text-sm text-slate-800 font-medium">ສ້າງເມື່ອ: {new Date(order.created_at).toLocaleString("en-US")}</div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={handleSyncFactoryStatus}
            disabled={syncingFactory || !factoryBillCode.trim()}
            className={`${actionButtonClassName} border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100`}
          >
            <RefreshCcw size={16} className={syncingFactory ? "animate-spin" : ""} />
            {syncingFactory ? "ກຳລັງດຶງສະຖານະ..." : "Sync ສະຖານະໂຮງງານ"}
          </button>
          {!isReadOnlyAdmin ? (
            <button
              onClick={handleCancelImport}
              disabled={cancelingImport || !order.production_completed_at}
              className={`${actionButtonClassName} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`}
            >
              <Undo2 size={16} />
              {cancelingImport ? "ກຳລັງຍົກເລີກ..." : "ຍົກເລີກນຳເຂົ້າ"}
            </button>
          ) : null}
          <Link href="/orders" className={`${actionButtonClassName} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
            <ArrowLeft size={16} />
            ກັບຄືນ
          </Link>
          {!isReadOnlyAdmin ? (
            <button
              onClick={handleMarkProductionCompleted}
              className={`${actionButtonClassName} border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}
            >
              <CheckCheck size={16} />
              ຜະລິດສຳເລັດ
            </button>
          ) : null}
          {!isReadOnlyAdmin ? (
            <button
              onClick={handleCloseOrder}
              className={`${actionButtonClassName} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
            >
              <CheckCheck size={16} />
              ປິດງານແລ້ວ
            </button>
          ) : null}
          {!isReadOnlyAdmin ? (
            <button
              onClick={handleUpdate}
              className={`${actionButtonClassName} border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100`}
            >
              <Save size={16} />
              ບັນທຶກ
            </button>
          ) : null}
          {!isReadOnlyAdmin ? (
            <button
              onClick={handleDelete}
              className={`${actionButtonClassName} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}
            >
              <Trash2 size={16} />
              ລຶບ
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-3 border-b border-slate-50 pb-2 text-xs font-bold uppercase tracking-wider text-slate-800">1) ກ່ຽວກັບອໍເດີ</div>
            <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-black uppercase tracking-wide text-slate-700">ຮູບອໍເດີ</div>
                  <label className="cursor-pointer rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-black text-white">
                    ເລືອກຮູບ
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handleOrderImageSelected(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className="mb-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => orderImageFileInputRef.current?.click()}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-black text-white"
                  >
                    ເລືອກຮູບ
                  </button>
                  <button
                    type="button"
                    onClick={() => orderImageCameraInputRef.current?.click()}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700"
                  >
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
                <div className="mb-2 text-xs font-semibold text-slate-500">
                  {savedOrderImageUrls.length + pendingOrderImageFiles.length > 0
                    ? `ມີຮູບທັງໝົດ ${savedOrderImageUrls.length + pendingOrderImageFiles.length} ຮູບ`
                    : "ຍັງບໍ່ມີຮູບອໍເດີ"}
                </div>
                {savedOrderImageUrls.length > 0 || pendingOrderImagePreviewUrls.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {savedOrderImageUrls.map((url, index) => (
                      <div key={`saved-${url}-${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <a href={url} target="_blank" rel="noreferrer" className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`${order.order_code}-order-image-${index + 1}`} className="h-44 w-full object-cover transition hover:opacity-95" />
                        </a>
                        <div className="border-t border-slate-100 px-3 py-2 text-[11px] font-bold text-slate-500">ຮູບທີ່ບັນທຶກແລ້ວ #{index + 1}</div>
                      </div>
                    ))}
                    {pendingOrderImagePreviewUrls.map((url, index) => (
                      <div key={`pending-${url}-${index}`} className="overflow-hidden rounded-xl border border-blue-200 bg-white">
                        <a href={url} target="_blank" rel="noreferrer" className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`${order.order_code}-pending-order-image-${index + 1}`} className="h-44 w-full object-cover transition hover:opacity-95" />
                        </a>
                        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
                          <div className="truncate text-[11px] font-bold text-blue-600">{pendingOrderImageFiles[index]?.name || `ຮູບໃໝ່ ${index + 1}`}</div>
                          <button
                            type="button"
                            onClick={() => removePendingOrderImageAt(index)}
                            className="shrink-0 rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-black text-rose-600"
                          >
                            ລຶບ
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  renderMediaPreview(oldFactoryFallbackImageUrl, `${order.order_code}-order-image`, "ຍັງບໍ່ມີຮູບອໍເດີ")
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-700">ຮູບແບບຈາກໃບສັ່ງຜະລິດ</div>
                {linkedDepositMedia?.mockup_urls.length ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {linkedDepositMedia.mockup_urls.map((url, index) => (
                      <div key={`${url}-${index}`}>{renderMediaPreview(url, `${order.order_code}-mockup-${index + 1}`, "ບໍ່ມີຮູບແບບ")}</div>
                    ))}
                  </div>
                ) : (
                  renderMediaPreview(null, `${order.order_code}-mockup-empty`, "ບໍ່ມີຮູບແບບ")
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">ວັນທີມັດຈຳສັ່ງຜະລິດ</label>
                <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={inputClassName} />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-700">ລະຫັດອໍເດີ</label>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">ປະເພດລະຫັດ</label>
                    <select
                      value={orderTypeSelectValue}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        setOrderType(nextType === CUSTOM_ORDER_TYPE_VALUE ? "" : nextType);
                      }}
                      className={`${inputClassName} bg-white`}
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
                      <label className="mb-1 block text-xs font-bold text-slate-700">ປະເພດລະຫັດໃໝ່</label>
                      <input
                        type="text"
                        value={orderType}
                        onChange={(e) => setOrderType(normalizeOrderType(e.target.value))}
                        placeholder="ຕົວຢ່າງ PK27"
                        className={`${inputClassName} font-bold uppercase`}
                      />
                    </div>
                  ) : null}
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">ORDER No.</label>
                    <input
                      type="text"
                      value={orderNo}
                      onChange={(e) => setOrderNo(normalizeOrderNo(e.target.value))}
                      placeholder="ຕົວຢ່າງ 5001 ຫຼື 5001+1"
                      inputMode="text"
                      className={inputClassName}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">ເບີໂທລູກຄ້າ ຫຼື FB (ຖ້າມີ)</label>
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="020xxxxxxxx" className={inputClassName} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">ເບີ WhatsApp (ຖ້າມີ)</label>
                <input value={customerWhatsapp} onChange={(e) => setCustomerWhatsapp(e.target.value)} placeholder="020xxxxxxxx" className={inputClassName} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">ບິນໂຮງງານ (ບໍ່ບັງຄັບ)</label>
                <input value={factoryBillCode} onChange={(e) => setFactoryBillCode(e.target.value)} placeholder="ສາມາດເພີ່ມພາຍຫຼັງໄດ້" className={inputClassName} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Admin</label>
                <select value={adminUserId} onChange={(e) => setAdminUserId(e.target.value)} className={`${inputClassName} bg-white font-bold`} disabled={loadingUsers}>
                  <option value="">ເລືອກ admin</option>
                  {adminOptions.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Graphic</label>
                <select value={graphicUserId} onChange={(e) => setGraphicUserId(e.target.value)} className={`${inputClassName} bg-white font-bold`} disabled={loadingUsers}>
                  <option value="">ເລືອກ graphic</option>
                  {graphicOptions.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-700">ປະເພດຜ້າ</label>
                <select value={fabricId} onChange={(e) => setFabricId(e.target.value)} className={`${inputClassName} bg-white font-bold`} disabled={loadingFabrics}>
                  <option value="">{loadingFabrics ? "ກຳລັງໂຫຼດ..." : "ເລືອກປະເພດຜ້າ"}</option>
                  {fabrics.map((fabric) => <option key={fabric.id} value={fabric.id}>{fabric.name} (ແຂນສັ້ນ:{fabric.short_price.toLocaleString()})</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-black uppercase tracking-wide text-slate-700">ສະລິບມັດຈຳອໍເດີ</div>
                  </div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => orderTransferSlipFileInputRef.current?.click()}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-black text-white"
                    >
                      ເລືອກໄຟລ໌
                    </button>
                    <button
                      type="button"
                      onClick={() => orderTransferSlipCameraInputRef.current?.click()}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700"
                    >
                      ຖ່າຍຮູບ
                    </button>
                    <input
                      ref={orderTransferSlipFileInputRef}
                      type="file"
                      accept="image/*,.pdf"
                      className="sr-only"
                      onChange={(e) => handleOrderTransferSlipSelected(e.target.files?.[0] ?? null)}
                    />
                    <input
                      ref={orderTransferSlipCameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => handleOrderTransferSlipSelected(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  {renderMediaPreview(orderTransferSlipPreviewUrl, `${order.order_code}-order-slip`, "ຍັງບໍ່ມີສະລິບຂອງອໍເດີ")}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-3 border-b border-slate-50 pb-2 text-xs font-bold uppercase tracking-wider text-slate-800">2) ເສື້ອພິມລາຍ</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">ແຂນສັ້ນ</label>
                <input type="number" min={0} value={shortQty} onChange={(e) => setShortQty(Number(e.target.value))} className={`${inputClassName} font-bold`} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">ແຂນຍາວ</label>
                <input type="number" min={0} value={longQty} onChange={(e) => setLongQty(Number(e.target.value))} className={`${inputClassName} font-bold`} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">ຈຳນວນແຖມ (ບໍ່ຄິດເງິນ)</label>
                <input type="number" min={0} value={freeQty} onChange={(e) => setFreeQty(Number(e.target.value))} className={`${inputClassName} font-bold text-orange-600`} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">3XL (+20,000)</label>
                <input type="number" min={0} value={qty3XL} onChange={(e) => setQty3XL(Number(e.target.value))} className={inputClassName} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">4XL (+25,000)</label>
                <input type="number" min={0} value={qty4XL} onChange={(e) => setQty4XL(Number(e.target.value))} className={inputClassName} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">5XL (+35,000)</label>
                <input type="number" min={0} value={qty5XL} onChange={(e) => setQty5XL(Number(e.target.value))} className={inputClassName} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">6XL (+35,000)</label>
                <input type="number" min={0} value={qty6XL} onChange={(e) => setQty6XL(Number(e.target.value))} className={inputClassName} />
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-slate-50 p-2 text-[11px] font-bold uppercase tracking-tight text-slate-500">
              ຈຳນວນຜະລິດ (ລວມແຖມ): <span className="text-slate-900">{shortQty + longQty + freeQty}</span> | ຈຳນວນຄິດເງິນ: <span className="text-blue-600">{shortQty + longQty}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between border-b border-slate-50 pb-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-800">3) ໂສ້ງພິມລາຍ</div>
              {!isReadOnlyAdmin ? (
                <button onClick={addPantsItem} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-black text-white hover:bg-slate-800">
                  ເພີ່ມລາຍການໂສ້ງ
                </button>
              ) : null}
            </div>

            {pantsItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-500">
                ຍັງບໍ່ມີລາຍການໂສ້ງ
              </div>
            ) : (
              <div className="space-y-4">
                {pantsItems.map((item, index) => (
                  <div key={item.clientId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-black text-slate-800">ລາຍການໂສ້ງ {index + 1}</div>
                      {!isReadOnlyAdmin ? (
                        <button onClick={() => removePantsItem(item.clientId)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-100">
                          ລົບ
                        </button>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-bold text-slate-700">ຮູບໂສ້ງ</label>
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-3">
                          {!isReadOnlyAdmin ? (
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
                          ) : (
                            <div className="text-xs font-medium text-slate-500">{item.mockupFileName || "ຍັງບໍ່ມີຮູບ"}</div>
                          )}
                          {(item.mockupPreviewUrl || item.mockupUrl) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.mockupPreviewUrl || item.mockupUrl || ""}
                              alt={`pants-mockup-${index + 1}`}
                              className="mt-3 h-40 w-full rounded-xl border border-slate-200 object-contain bg-white"
                            />
                          ) : (
                            <div className="mt-3 flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-xs font-bold text-slate-500">
                              ຍັງບໍ່ມີຮູບໂສ້ງ
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">ຊື່ລາຍການ</label>
                        <input value={item.productName} onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, productName: e.target.value }))} className={inputClassName} readOnly={isReadOnlyAdmin} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">ຜ້າ</label>
                        <select value={item.fabricId} onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, fabricId: e.target.value }))} className={`${inputClassName} bg-white font-bold`} disabled={isReadOnlyAdmin}>
                          <option value="">ເລືອກຜ້າ</option>
                          {fabrics.map((fabric) => <option key={fabric.id} value={fabric.id}>{fabric.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">ຈຳນວນຄິດເງິນ</label>
                        <input type="number" min={0} value={item.qty} onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, qty: Number(e.target.value) }))} className={inputClassName} readOnly={isReadOnlyAdmin} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">ຈຳນວນແຖມ</label>
                        <input type="number" min={0} value={item.freeQty} onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, freeQty: Number(e.target.value) }))} className={`${inputClassName} text-orange-600`} readOnly={isReadOnlyAdmin} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">ລາຄາຂາຍ/ຕົວ</label>
                        <input type="number" min={0} value={item.unitPrice} onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, unitPrice: Number(e.target.value) }))} className={inputClassName} readOnly={isReadOnlyAdmin} />
                      </div>
                      {canViewProfitDetails ? (
                        <div>
                          <label className="mb-1 block text-xs font-bold text-slate-700">ຕົ້ນທຶນໂຮງງານຂອງລາຍການ</label>
                          <input type="number" min={0} value={item.factoryCost} onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, factoryCost: Number(e.target.value) }))} className={inputClassName} readOnly={isReadOnlyAdmin} />
                        </div>
                      ) : null}
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-bold text-slate-700">ໝາຍເຫດ</label>
                        <textarea value={item.notes} onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, notes: e.target.value }))} rows={2} className={inputClassName} readOnly={isReadOnlyAdmin} />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <div className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600">ຜະລິດລວມ: <span className="text-slate-900">{getPantsTotalQty(item).toLocaleString()}</span></div>
                      <div className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600">ຍອດຂາຍ: <span className="text-slate-900">{getPantsLineGross(item).toLocaleString()}</span></div>
                      {canViewProfitDetails ? (
                        <div className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600">ຕົ້ນທຶນ: <span className="text-slate-900">{Math.max(0, Number(item.factoryCost) || 0).toLocaleString()}</span></div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-3 border-b border-slate-50 pb-2 text-xs font-bold uppercase tracking-wider text-slate-800">4) ຮູບແບບມັດຈຳ & ລາຍການບວກເພີ່ມ</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">ຄໍເສື້ອ/ແຂນເສື້ອ</label>
                <select
                  value={collarType}
                  onChange={(e) => {
                    const nextValue = e.target.value as "none" | "polo" | "mandarin";
                    setCollarType(nextValue);
                    if (nextValue === "none") setCollarQty(0);
                  }}
                  disabled={isReadOnlyAdmin}
                  className={`${inputClassName} bg-white font-bold ${isReadOnlyAdmin ? "cursor-not-allowed bg-slate-50 text-slate-600" : ""}`}
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
                <label className="mb-1 block text-xs font-bold text-slate-700">ຈຳນວນຄໍທີ່ບວກເພີ່ມ</label>
                <input
                  type="number"
                  value={collarQty}
                  onChange={(e) => setCollarQty(Number(e.target.value))}
                  min={0}
                  disabled={isReadOnlyAdmin || collarType === "none"}
                  className={`${inputClassName} font-bold ${(isReadOnlyAdmin || collarType === "none") ? "bg-slate-50 text-slate-600" : ""}`}
                />
                <div className="mt-1 text-[11px] font-bold text-slate-500">
                  ລວມຄ່າບວກ: {collarTotal.toLocaleString()} ກີບ
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">ບວກເພີ່ມ (ງານດ່ວນ, ອື່ນໆ)</label>
                <input type="number" min={0} value={extraCharge} onChange={(e) => setExtraCharge(Number(e.target.value))} className={`${inputClassName} font-bold`} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">ຫັກຄ່າແບບ-ສ່ວນຫຼຸດ</label>
                <input type="number" min={0} value={designDeposit} onChange={(e) => setDesignDeposit(Number(e.target.value))} className={`${inputClassName} font-bold text-red-600`} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">ເງິນມັດຈຳສັ່ງຜະລິດ</label>
                <input type="number" min={0} value={initialDeposit} onChange={(e) => setInitialDeposit(Number(e.target.value))} className={`${inputClassName} font-bold text-emerald-600`} />
              </div>
              {canViewProfitDetails ? (
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">ຕົ້ນທຶນໂຮງງານສ່ວນເສື້ອ</label>
                  <input type="number" min={0} value={factoryCost} onChange={(e) => setFactoryCost(Number(e.target.value))} className={`${inputClassName} font-bold`} />
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">ວັນທີຝາກເຄື່ອງໃຫ້ລູກຄ້າ</label>
                <input type="date" value={latestShipmentDeliveryDate} readOnly className={`${inputClassName} bg-slate-50 text-slate-500`} />
                <div className="mt-1 text-[11px] font-bold text-slate-500">ດຶງຈາກຂໍ້ມູນຈັດສົ່ງລ່າສຸດ</div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">ວັນທີຊຳລະໂຮງງານ</label>
                <input type="date" value={factoryPaidFullDate} onChange={(e) => setFactoryPaidFullDate(e.target.value)} className={inputClassName} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">ວັນທີຜະລິດສຳເລັດ</label>
                <input type="date" value={productionCompletedDate} onChange={(e) => setProductionCompletedDate(e.target.value)} className={inputClassName} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 border-b border-slate-50 pb-2 text-xs font-bold uppercase tracking-wider text-slate-800">4) ຮູບຈາກຂັ້ນຕອນອື່ນໆ</div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-wide text-slate-700">ສະລິບຈາກໃບສັ່ງຜະລິດ</div>
                {renderMediaPreview(linkedDepositMedia?.transfer_slip_url || null, `${order.order_code}-deposit-slip`, "ບໍ່ມີສະລິບຈາກໃບສັ່ງຜະລິດ")}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-wide text-slate-700">ຮູບຝາກເຄື່ອງຈາກ shipments</div>
                {renderMediaPreview(shipmentMedia?.handoff_photo_url || null, `${order.order_code}-handoff`, "ບໍ່ມີຮູບຝາກເຄື່ອງ")}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-wide text-slate-700">ສະລິບການໂອນຕອນຈັດສົ່ງ</div>
                {renderMediaPreview(shipmentMedia?.transfer_slip_url || null, `${order.order_code}-shipment-slip`, "ບໍ່ມີສະລິບຈາກ shipments")}
              </div>

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
          <OrderSummaryPanel
            title="ສະຫຼຸບອໍເດີ"
            fabricName={selectedFabric?.name ?? order.fabric_name ?? "—"}
            totalOrderBillableQty={totalOrderBillableQty}
            totalOrderQty={totalOrderQty}
            shirtBillableQty={shortQty + longQty}
            pantsBillableQty={pantsSummary.billableQty}
            totalOrderFreeQty={totalOrderFreeQty}
            shirtFreeQty={freeQty}
            pantsFreeQty={pantsSummary.freeQty}
            shirtsTotal={shirtsTotal}
            pantsTotal={pantsSummary.grossTotal}
            plusSizeTotal={plusSizeTotal}
            collarTotal={collarTotal}
            extraCharge={extraCharge}
            designDiscount={designDeposit}
            primaryPaidLabel="ຮັບແລ້ວ"
            primaryPaidValue={customerReceived}
            secondaryPaidLabel="ເງິນມັດຈຳສັ່ງຜະລິດ"
            secondaryPaidValue={initialDeposit}
            outstandingLabel="ຄ້າງຊຳລະ"
            outstandingValue={customerOutstanding}
            netTotal={netTotal}
            totalFactoryCost={totalFactoryCost}
            profitPreview={profitPreview}
            showProfitDetails={canViewProfitDetails}
            footerNote={`ລາຍການລວມ ${totalOrderQty.toLocaleString()} ຊິ້ນ`}
          />
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-900 shadow-sm space-y-1">
            <div><span className="font-black">ສະຖານະຜະລິດ:</span> <span className="font-bold">{productionStatusLabel}</span></div>
            <div><span className="font-black">ສະຖານະປິດງານ:</span> <span className="font-bold">{closeStatusLabel}</span></div>
            <div><span className="font-black">ລູກຄ້າຊຳລະຄົບ:</span> <span className="font-bold">{order.customer_paid_full_at ? new Date(order.customer_paid_full_at).toLocaleString("en-US") : "-"}</span></div>
            <div><span className="font-black">ຊຳລະໂຮງງານຄົບ:</span> <span className="font-bold">{order.factory_paid_full_at ? new Date(order.factory_paid_full_at).toLocaleString("en-US") : "-"}</span></div>
            <div><span className="font-black">ປິດອໍເດີເມື່ອ:</span> <span className="font-bold">{order.closed_at ? new Date(order.closed_at).toLocaleString("en-US") : "-"}</span></div>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-xs text-slate-900 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-violet-100 pb-2">
              <div className="font-black text-violet-900">ສະຖານະຈາກໂຮງງານ</div>
              <div className="text-[11px] font-bold text-violet-700">{order.factory_bill_code?.trim() || "-"}</div>
            </div>
            <div><span className="font-black">ຂັ້ນຕອນປັດຈຸບັນ:</span> <span className="font-bold text-violet-800">{factoryStatusText}</span></div>
            <div><span className="font-black">ສະຖານະຈັດສົ່ງຂອງໂຮງງານ:</span> <span className="font-bold">{order.factory_production_shipping_status?.trim() || "-"}</span></div>
            <div><span className="font-black">ກຳນົດສົ່ງ:</span> <span className="font-bold">{order.factory_production_payload?.due_date_display?.trim() || formatDateTime(order.factory_production_due_date)}</span></div>
            <div><span className="font-black">ງານດ່ວນ:</span> <span className="font-bold">{order.factory_production_is_rush ? "ແມ່ນ" : "ບໍ່"}</span></div>
            <div><span className="font-black">ໂຮງງານອັບເດດລ່າສຸດ:</span> <span className="font-bold">{formatDateTime(order.factory_production_source_updated_at)}</span></div>
            <div><span className="font-black">ລະບົບ sync ລ່າສຸດ:</span> <span className="font-bold">{formatDateTime(order.factory_production_synced_at)}</span></div>
            {order.factory_production_sync_error?.trim() ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700">
                <span className="font-black">Sync error:</span> <span className="font-bold">{order.factory_production_sync_error}</span>
              </div>
            ) : null}
            {factoryStatuses.length > 0 ? (
              <div className="space-y-2">
                <div className="font-black text-slate-900">ລຳດັບຂັ້ນຕອນ</div>
                <div className="space-y-1">
                  {factoryStatuses.map((status, index) => {
                    const stepNo = index + 1;
                    const isActive = stepNo === Number(order.factory_production_status_index || 0);
                    return (
                      <div
                        key={`${stepNo}-${status}`}
                        className={`rounded-lg border px-3 py-2 ${isActive ? "border-violet-300 bg-white text-violet-800" : "border-violet-100 bg-white/60 text-slate-700"}`}
                      >
                        <span className="font-black">{stepNo}.</span> <span className="font-bold">{status}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {factoryEvents.length > 0 ? (
              <div className="space-y-2">
                <div className="font-black text-slate-900">ປະຫວັດຈາກໂຮງງານ</div>
                <div className="space-y-2">
                  {factoryEvents.map((event, index) => (
                    <div key={`${event.ts || event.ts_display || event.status || index}`} className="rounded-lg border border-violet-100 bg-white/80 p-2">
                      <div className="font-black text-slate-900">{event.status || "-"}</div>
                      <div className="text-slate-500">{event.ts_display || formatDateTime(event.ts || null)}</div>
                      {event.note?.trim() ? <div className="mt-1 font-medium text-slate-700">{event.note}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
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
