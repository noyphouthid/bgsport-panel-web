"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Banknote, Camera, FileUp, PackageCheck, RotateCcw, ScanLine, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import {
  formatCurrency,
  formatDateOnly,
  formatDateTime,
  getTotalUnits,
  ORDER_QR_LABEL_SELECT,
  ORDER_QR_ORDER_SELECT,
  parseQrInput,
  type OrderSummary,
  type QrLabelRow,
} from "@/lib/inventory-qr";
import {
  SHIPMENT_DELIVERY_METHOD_LABELS,
  SHIPMENT_DELIVERY_STATUS_LABELS,
  type ShipmentDeliveryMethod,
  type ShipmentDeliveryRequestRow,
} from "@/lib/shipment-delivery-requests";
import { buildFactoryDesignFallbackUrl, extractProductionMockupUrls, isImageFileName, toDisplayMediaUrl } from "@/lib/order-media";
import { MobileQrScanner } from "../_components/mobile-qr-scanner";

type PaymentMethod = "cash" | "transfer";
type TransportChargeMode = "destination" | "origin";

type ShipmentInfo = {
  label: QrLabelRow;
  order: OrderSummary;
  existingShipmentId: string | null;
  existingShipmentAt: string | null;
  existingShipmentBy: string | null;
};

type ShipmentRow = {
  id: string;
  order_id: string;
  order_code: string | null;
  shipped_at: string;
  shipped_by: string;
  collected_amount: number;
  payment_method: PaymentMethod | null;
};

type DepositVisualRow = {
  production_items: unknown;
  transfer_slip_url: string | null;
};

type ShipmentVisualState = {
  orderImageUrl: string | null;
  designImageUrls: string[];
  depositTransferSlipUrl: string | null;
  scheduledAt: string | null;
  requestTransferSlipUrl: string | null;
  handoffPhotoUrl: string | null;
};

const EMPTY_SHIPMENT_VISUALS: ShipmentVisualState = {
  orderImageUrl: null,
  designImageUrls: [],
  depositTransferSlipUrl: null,
  scheduledAt: null,
  requestTransferSlipUrl: null,
  handoffPhotoUrl: null,
};

function buildShipmentRequestNo() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `SDR${yy}-${mm}${dd}${hh}${min}`;
}

function toLocalDateTimeInputValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function getShipmentBlockReason(
  order: Pick<OrderSummary, "order_code" | "production_completed_at" | "status">,
  label: Pick<QrLabelRow, "label_status" | "received_at"> | null
) {
  if (order.status === "completed") {
    return `ອໍເດີ ${order.order_code} ຖືກປິດງານແລ້ວ`;
  }
  if (!order.production_completed_at) {
    return `ອໍເດີ ${order.order_code} ຍັງບໍ່ຜ່ານການນຳເຂົ້າຈາກ factory-receipts`;
  }
  if (!label?.received_at || label.label_status === "created") {
    return `ອໍເດີ ${order.order_code} ຍັງບໍ່ໄດ້ນຳເຂົ້າຈາກ factory-receipts`;
  }
  return null;
}

export default function ShipmentsPage() {
  const [scanValue, setScanValue] = useState("");
  const [shippedBy, setShippedBy] = useState("");
  const [shippedAt, setShippedAt] = useState(() => toLocalDateTimeInputValue());
  const [paymentDate, setPaymentDate] = useState(() => toLocalDateTimeInputValue());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("transfer");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [note, setNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [active, setActive] = useState<ShipmentInfo | null>(null);
  const [recentShipments, setRecentShipments] = useState<ShipmentRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<ShipmentDeliveryMethod>("pickup");
  const [activeRequest, setActiveRequest] = useState<ShipmentDeliveryRequestRow | null>(null);
  const [transferSlipFile, setTransferSlipFile] = useState<File | null>(null);
  const [transferSlipPreviewUrl, setTransferSlipPreviewUrl] = useState<string | null>(null);
  const [handoffPhotoFile, setHandoffPhotoFile] = useState<File | null>(null);
  const [handoffPhotoPreviewUrl, setHandoffPhotoPreviewUrl] = useState<string | null>(null);
  const [transportReceiverName, setTransportReceiverName] = useState("");
  const [transportReceiverPhone, setTransportReceiverPhone] = useState("");
  const [transportBranch, setTransportBranch] = useState("");
  const [transportCity, setTransportCity] = useState("");
  const [transportProvince, setTransportProvince] = useState("");
  const [transportProviders, setTransportProviders] = useState<string[]>([]);
  const [transportChargeMode, setTransportChargeMode] = useState<TransportChargeMode>("destination");
  const [shipmentVisuals, setShipmentVisuals] = useState<ShipmentVisualState>(EMPTY_SHIPMENT_VISUALS);
  const transferSlipFileInputRef = useRef<HTMLInputElement | null>(null);
  const transferSlipCameraInputRef = useRef<HTMLInputElement | null>(null);
  const handoffPhotoFileInputRef = useRef<HTMLInputElement | null>(null);
  const handoffPhotoCameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (transferSlipPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(transferSlipPreviewUrl);
      if (handoffPhotoPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(handoffPhotoPreviewUrl);
    };
  }, [handoffPhotoPreviewUrl, transferSlipPreviewUrl]);

  const safeInsertAction = async (orderId: string, action: string, detail: string) => {
    const { error } = await supabase.from("order_status_history").insert({
      order_id: orderId,
      action,
      detail,
      action_at: new Date().toISOString(),
    });
    if (error && !error.message.includes("Could not find the table")) {
      toast.error(`ບັນທຶກປະຫວັດບໍ່ສຳເລັດ: ${error.message}`);
    }
  };

  const loadCurrentUser = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id;
    if (!authUserId) return;

    const { data } = await supabase.from("users").select("id,full_name,role").eq("auth_user_id", authUserId).maybeSingle();
    if (data?.full_name) setShippedBy(data.full_name);
    if (data?.role) setViewerRole(data.role as AppRole);
    if (data?.id) setViewerUserId(String(data.id));
  };

  const loadRecentShipments = async () => {
    const { data, error } = await supabase
      .from("shipment_records")
      .select("id,order_id,shipped_at,shipped_by,collected_amount,payment_method")
      .order("shipped_at", { ascending: false })
      .limit(8);

    if (error) {
      toast.error(`ໂຫຼດປະຫວັດຈັດສົ່ງບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    const shipmentRows = (data ?? []) as ShipmentRow[];
    const orderIds = Array.from(new Set(shipmentRows.map((row) => row.order_id).filter(Boolean)));
    const orderCodes = new Map<string, string>();

    if (orderIds.length > 0) {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("id,order_code")
        .in("id", orderIds);

      if (orderError) {
        toast.error(`ໂຫຼດລະຫັດອໍເດີຂອງປະຫວັດຈັດສົ່ງບໍ່ສຳເລັດ: ${orderError.message}`);
      } else {
        for (const row of (orderData ?? []) as Array<{ id: string; order_code: string }>) {
          orderCodes.set(row.id, row.order_code);
        }
      }
    }

    setRecentShipments(
      shipmentRows.map((row) => ({
        ...row,
        order_code: orderCodes.get(row.order_id) || null,
      }))
    );
  };

  const resetDeliveryDraftState = () => {
    setActiveRequest(null);
    setDeliveryMethod("pickup");
    setTransferSlipFile(null);
    if (transferSlipPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(transferSlipPreviewUrl);
    }
    setTransferSlipPreviewUrl(null);
    setHandoffPhotoFile(null);
    if (handoffPhotoPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(handoffPhotoPreviewUrl);
    }
    setHandoffPhotoPreviewUrl(null);
    setTransportReceiverName("");
    setTransportReceiverPhone("");
    setTransportBranch("");
    setTransportCity("");
    setTransportProvince("");
    setTransportProviders([]);
    setTransportChargeMode("destination");
    setShipmentVisuals(EMPTY_SHIPMENT_VISUALS);
  };

  const applyExistingRequest = (request: ShipmentDeliveryRequestRow | null) => {
    setActiveRequest(request);
    if (!request) {
      resetDeliveryDraftState();
      return;
    }

    setDeliveryMethod(request.delivery_method);
    setTransportReceiverName(request.transport_receiver_name || "");
    setTransportReceiverPhone(request.transport_receiver_phone || "");
    setTransportBranch(request.transport_branch || "");
    setTransportCity(request.transport_city || "");
    setTransportProvince(request.transport_province || "");
    setTransportProviders(Array.isArray(request.transport_providers) ? request.transport_providers : []);
    setTransportChargeMode(request.transport_charge_mode === "origin" ? "origin" : "destination");
    setTransferSlipFile(null);
    if (transferSlipPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(transferSlipPreviewUrl);
    setTransferSlipPreviewUrl(toDisplayMediaUrl(request.transfer_slip_url) || null);
    setHandoffPhotoFile(null);
    if (handoffPhotoPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(handoffPhotoPreviewUrl);
    setHandoffPhotoPreviewUrl(toDisplayMediaUrl(request.handoff_photo_url) || null);
  };

  const uploadTransferSlipIfNeeded = async (orderId: string, qrLabelId: string) => {
    if (!transferSlipFile) {
      return {
        path: activeRequest?.transfer_slip_path || null,
        url: activeRequest?.transfer_slip_url || null,
      };
    }

    const safeName = transferSlipFile.name.replace(/\s+/g, "-");
    const path = `${orderId}/${qrLabelId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("shipment-delivery-slips")
      .upload(path, transferSlipFile, { upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("shipment-delivery-slips").getPublicUrl(path);
    return {
      path,
      url: data.publicUrl,
    };
  };

  const uploadHandoffPhotoIfNeeded = async (orderId: string, qrLabelId: string) => {
    if (!handoffPhotoFile) {
      return {
        path: activeRequest?.handoff_photo_path || null,
        url: activeRequest?.handoff_photo_url || null,
        fileName: activeRequest?.handoff_photo_file_name || null,
      };
    }

    const safeName = handoffPhotoFile.name.replace(/\s+/g, "-");
    const path = `${orderId}/${qrLabelId}/handoff-${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("shipment-delivery-slips")
      .upload(path, handoffPhotoFile, { upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("shipment-delivery-slips").getPublicUrl(path);
    return {
      path,
      url: data.publicUrl,
      fileName: handoffPhotoFile.name,
    };
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCurrentUser();
      void loadRecentShipments();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const findOrderAndLabel = async (rawValue: string) => {
    const parsed = parseQrInput(rawValue);
    if (!parsed.normalized) return null;

    let existingLabel: QrLabelRow | null = null;
    let order: OrderSummary | null = null;

    if (parsed.kind === "shop_qr") {
      const { data, error } = await supabase
        .from("order_qr_labels")
        .select(ORDER_QR_LABEL_SELECT)
        .eq("qr_code", parsed.normalized)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      existingLabel = data as QrLabelRow;

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select(ORDER_QR_ORDER_SELECT)
        .eq("id", existingLabel.order_id)
        .maybeSingle();
      if (orderError) throw new Error(orderError.message);
      order = (orderData as OrderSummary | null) || null;
    } else {
      let orderQuery = supabase.from("orders").select(ORDER_QR_ORDER_SELECT).limit(1);
      if ((parsed.kind === "factory_qr" || parsed.kind === "factory_bill_code") && parsed.factoryBillCode) {
        orderQuery = orderQuery.eq("factory_bill_code", parsed.factoryBillCode);
      } else {
        orderQuery = orderQuery.eq("order_code", parsed.normalized);
      }

      const { data: orders, error: orderError } = await orderQuery;
      if (orderError) throw new Error(orderError.message);
      order = (((orders ?? [])[0] as OrderSummary | undefined) || null);
      if (!order) return null;

      const { data: labelData, error: labelError } = await supabase
        .from("order_qr_labels")
        .select(ORDER_QR_LABEL_SELECT)
        .eq("order_id", order.id)
        .maybeSingle();
      if (labelError) throw new Error(labelError.message);
      existingLabel = (labelData as QrLabelRow | null) || null;
    }

    if (!order) return null;

    if (!existingLabel) {
      throw new Error(`ອໍເດີ ${order.order_code} ຍັງບໍ່ໄດ້ນຳເຂົ້າຈາກ factory-receipts`);
    }

    const blockReason = getShipmentBlockReason(order, existingLabel);
    if (blockReason) {
      throw new Error(blockReason);
    }

    return { order, label: existingLabel };
  };

  const openShipmentByCode = async (rawValue: string) => {
    try {
      const resolved = await findOrderAndLabel(rawValue);
      if (!resolved) {
        toast.error("ບໍ່ພົບອໍເດີທີ່ກົງກັນ");
        return;
      }

      const { data: existingShipmentData, error: existingShipmentError } = await supabase
        .from("shipment_records")
        .select("id,shipped_at,shipped_by")
        .eq("order_id", resolved.order.id)
        .order("shipped_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingShipmentError) {
        toast.error(`ກວດສອບປະຫວັດຈັດສົ່ງບໍ່ສຳເລັດ: ${existingShipmentError.message}`);
        return;
      }

      setActive({
        label: resolved.label,
        order: resolved.order,
        existingShipmentId: existingShipmentData?.id || null,
        existingShipmentAt: existingShipmentData?.shipped_at || resolved.label.shipped_at || null,
        existingShipmentBy: existingShipmentData?.shipped_by || resolved.label.shipped_by || null,
      });
      setScanValue("");
      setPaymentAmount(0);
      setNote("");
      setCancelReason("");
      setShippedAt(toLocalDateTimeInputValue());
      setPaymentDate(toLocalDateTimeInputValue());
      resetDeliveryDraftState();

      if (existingShipmentData?.shipped_at || resolved.label.label_status === "shipped") {
        toast.error(`ອໍເດີ ${resolved.order.order_code} ຖືກຈັດສົ່ງແລ້ວ`);
        return;
      }

      const { data: requestData, error: requestError } = await supabase
        .from("shipment_delivery_requests")
        .select("*")
        .eq("order_id", resolved.order.id)
        .in("status", ["draft", "submitted", "rejected"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (requestError) {
        toast.error(`ໂຫຼດຂໍ້ມູນຮ່າງການຈັດສົ່ງບໍ່ສຳເລັດ: ${requestError.message}`);
        return;
      }

      const latestRequest = (requestData as ShipmentDeliveryRequestRow | null) ?? null;
      if (latestRequest) {
        setDeliveryMethod(latestRequest.delivery_method);
        setShippedAt(toLocalDateTimeInputValue(new Date(latestRequest.delivery_scheduled_at)));
        setPaymentAmount(Number(latestRequest.payment_amount) || 0);
        setPaymentMethod(latestRequest.payment_method === "cash" ? "cash" : "transfer");
        setPaymentDate(
          latestRequest.payment_paid_at ? toLocalDateTimeInputValue(new Date(latestRequest.payment_paid_at)) : toLocalDateTimeInputValue()
        );
        setNote(latestRequest.note || "");
        applyExistingRequest(latestRequest);
      }

      const { data: depositData, error: depositError } = await supabase
        .from("factory_deposit_orders")
        .select("production_items,transfer_slip_url")
        .eq("order_id", resolved.order.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (depositError) {
        toast.error(`ໂຫຼດຮູບແບບອໍເດີບໍ່ສຳເລັດ: ${depositError.message}`);
      }

      const depositRow = (depositData as DepositVisualRow | null) ?? null;
      const designImageUrls = extractProductionMockupUrls(depositRow?.production_items);
      const orderImageUrl =
        toDisplayMediaUrl(resolved.order.order_image_url) ||
        (designImageUrls.length === 0 ? buildFactoryDesignFallbackUrl(resolved.order.factory_bill_code) : null);

      setShipmentVisuals({
        orderImageUrl,
        designImageUrls,
        depositTransferSlipUrl: toDisplayMediaUrl(depositRow?.transfer_slip_url) || null,
        scheduledAt: latestRequest?.delivery_scheduled_at || null,
        requestTransferSlipUrl: toDisplayMediaUrl(latestRequest?.transfer_slip_url) || null,
        handoffPhotoUrl: toDisplayMediaUrl(latestRequest?.handoff_photo_url) || null,
      });

      toast.success(`ໂຫຼດ ${resolved.order.order_code} ສຳເລັດ`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ກວດສອບຂໍ້ມູນບໍ່ສຳເລັດ");
    }
  };

  const handleTransferSlipSelected = (file: File | null) => {
    setTransferSlipFile(file);
    if (transferSlipPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(transferSlipPreviewUrl);

    if (file && file.type.startsWith("image/")) {
      setTransferSlipPreviewUrl(URL.createObjectURL(file));
      return;
    }

    setTransferSlipPreviewUrl(toDisplayMediaUrl(activeRequest?.transfer_slip_url) || shipmentVisuals.requestTransferSlipUrl || null);
  };

  const handleHandoffPhotoSelected = (file: File | null) => {
    setHandoffPhotoFile(file);
    if (handoffPhotoPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(handoffPhotoPreviewUrl);

    if (file && file.type.startsWith("image/")) {
      setHandoffPhotoPreviewUrl(URL.createObjectURL(file));
      return;
    }

    setHandoffPhotoPreviewUrl(toDisplayMediaUrl(activeRequest?.handoff_photo_url) || shipmentVisuals.handoffPhotoUrl || null);
  };

  const renderClickableImage = (url: string, alt: string, className: string) => (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className={className} />
    </a>
  );

  const customerOutstanding = useMemo(() => Math.max(0, Number(active?.order.balance || 0)), [active]);
  const hasOutstandingBalance = customerOutstanding > 0;
  const shipmentLocked = Boolean(active?.existingShipmentAt || active?.label.label_status === "shipped");
  const canCancelShipment = viewerRole === "superadmin" || viewerRole === "accountant";
  const requestSubmitted = activeRequest?.status === "submitted";

  const saveDeliveryRequest = async (nextStatus: "draft" | "submitted") => {
    if (!active) {
      toast.error("ກະລຸນາສະແກນ QR ກ່ອນ");
      return;
    }
    const blockReason = getShipmentBlockReason(active.order, active.label);
    if (blockReason) {
      toast.error(blockReason);
      return;
    }
    if (shipmentLocked) {
      toast.error("ອໍເດີນີ້ຖືກຈັດສົ່ງແລ້ວ");
      return;
    }
    if (activeRequest?.status === "submitted") {
      toast.error("ຄຳຂໍນີ້ຖືກສົ່ງຂໍອະນຸມັດແລ້ວ");
      return;
    }
    if (!shippedBy.trim()) {
      toast.error("ກະລຸນາປ້ອນຊື່ຜູ້ຈັດສົ່ງ");
      return;
    }
    if (paymentAmount < 0) {
      toast.error("ຈຳນວນເງິນຕ້ອງບໍ່ຕິດລົບ");
      return;
    }
    if (paymentAmount > customerOutstanding) {
      toast.error("ຈຳນວນເງິນເກີນຍອດຄ້າງຊຳລະ");
      return;
    }
    if (paymentAmount > 0 && paymentMethod === "transfer" && !transferSlipFile && !activeRequest?.transfer_slip_url) {
      toast.error("ກະລຸນາແນບສະລິບການໂອນເງິນ");
      return;
    }
    if (deliveryMethod === "transport") {
      if (!transportReceiverName.trim()) {
        toast.error("ກະລຸນາປ້ອນຊື່ຜູ້ຮັບ");
        return;
      }
      if (!transportReceiverPhone.trim()) {
        toast.error("ກະລຸນາປ້ອນເບີຜູ້ຮັບ");
        return;
      }
      if (transportProviders.length === 0) {
        toast.error("ກະລຸນາເລືອກຂົນສົ່ງ");
        return;
      }
    }

    setSaving(true);
    try {
      const scheduledAtIso = new Date(shippedAt).toISOString();
      const paymentAtIso = paymentAmount > 0 ? new Date(paymentDate).toISOString() : null;
      const uploadedSlip = await uploadTransferSlipIfNeeded(active.order.id, active.label.id);
      const uploadedHandoff = await uploadHandoffPhotoIfNeeded(active.order.id, active.label.id);

      const payload = {
        request_no: activeRequest?.request_no || buildShipmentRequestNo(),
        order_id: active.order.id,
        qr_label_id: active.label.id,
        delivery_method: deliveryMethod,
        status: nextStatus,
        requested_by_user_id: viewerUserId,
        delivery_scheduled_at: scheduledAtIso,
        delivery_person_name: shippedBy.trim(),
        note: note.trim() || null,
        payment_outstanding_amount: customerOutstanding,
        payment_amount: paymentAmount,
        payment_method: paymentAmount > 0 ? paymentMethod : null,
        payment_paid_at: paymentAmount > 0 ? paymentAtIso : null,
        transfer_slip_path: paymentAmount > 0 ? uploadedSlip.path : null,
        transfer_slip_url: paymentAmount > 0 ? uploadedSlip.url : null,
        transfer_slip_uploaded_at: paymentAmount > 0 && uploadedSlip.path ? new Date().toISOString() : null,
        transfer_slip_uploaded_by_user_id: paymentAmount > 0 && uploadedSlip.path ? viewerUserId : null,
        handoff_photo_path: uploadedHandoff.path,
        handoff_photo_url: uploadedHandoff.url,
        handoff_photo_file_name: uploadedHandoff.fileName,
        handoff_photo_uploaded_at: uploadedHandoff.path ? new Date().toISOString() : null,
        handoff_photo_uploaded_by_user_id: uploadedHandoff.path ? viewerUserId : null,
        transport_receiver_name: deliveryMethod === "transport" ? transportReceiverName.trim() : null,
        transport_receiver_phone: deliveryMethod === "transport" ? transportReceiverPhone.trim() : null,
        transport_branch: deliveryMethod === "transport" ? transportBranch.trim() : null,
        transport_city: deliveryMethod === "transport" ? transportCity.trim() : null,
        transport_province: deliveryMethod === "transport" ? transportProvince.trim() : null,
        transport_providers: deliveryMethod === "transport" ? transportProviders : [],
        transport_charge_mode: deliveryMethod === "transport" ? transportChargeMode : null,
        updated_at: new Date().toISOString(),
      };

      let savedRequest: ShipmentDeliveryRequestRow | null = null;
      if (activeRequest?.id) {
        const { data, error } = await supabase
          .from("shipment_delivery_requests")
          .update(payload)
          .eq("id", activeRequest.id)
          .select("*")
          .single();
        if (error) throw error;
        savedRequest = data as ShipmentDeliveryRequestRow;
      } else {
        const { data, error } = await supabase
          .from("shipment_delivery_requests")
          .insert(payload)
          .select("*")
          .single();
        if (error) throw error;
        savedRequest = data as ShipmentDeliveryRequestRow;
      }

      if (savedRequest) {
        applyExistingRequest(savedRequest);
        setShipmentVisuals((prev) => ({
          ...prev,
          scheduledAt: savedRequest?.delivery_scheduled_at || prev.scheduledAt,
          requestTransferSlipUrl: savedRequest?.transfer_slip_url || prev.requestTransferSlipUrl,
          handoffPhotoUrl: savedRequest?.handoff_photo_url || prev.handoffPhotoUrl,
        }));

        if (deliveryMethod === "transport") {
          const transportNotePayload = {
            note_no: active.order.order_code,
            source_type: "shipment_request",
            order_id: active.order.id,
            delivery_request_id: savedRequest.id,
            receiver_name: transportReceiverName.trim(),
            receiver_phone: transportReceiverPhone.trim(),
            branch: transportBranch.trim() || null,
            city: transportCity.trim() || null,
            province: transportProvince.trim() || null,
            transporters: transportProviders,
            shipping_charge_mode: transportChargeMode,
            status: "saved",
            created_by_user_id: viewerUserId,
            updated_at: new Date().toISOString(),
          };

          const { data: linkedTransportNote } = await supabase
            .from("transport_notes")
            .select("id,note_no")
            .eq("delivery_request_id", savedRequest.id)
            .maybeSingle();

          if (linkedTransportNote?.id) {
            const { error: updateTransportNoteError } = await supabase
              .from("transport_notes")
              .update({
                ...transportNotePayload,
                note_no: linkedTransportNote.note_no || transportNotePayload.note_no,
              })
              .eq("id", linkedTransportNote.id);
            if (updateTransportNoteError) throw updateTransportNoteError;
          } else {
            const { error: insertTransportNoteError } = await supabase.from("transport_notes").insert(transportNotePayload);
            if (insertTransportNoteError) throw insertTransportNoteError;
          }
        } else if (savedRequest.id) {
          const { error: deleteTransportNoteError } = await supabase
            .from("transport_notes")
            .delete()
            .eq("delivery_request_id", savedRequest.id);
          if (deleteTransportNoteError) throw deleteTransportNoteError;
        }
      }
      toast.success(
        nextStatus === "submitted"
          ? `ສົ່ງຄຳຂໍອະນຸມັດສຳລັບ ${active.order.order_code} ແລ້ວ`
          : deliveryMethod === "transport"
            ? `ບັນທຶກບິນ ແລະ ຮ່າງການຈັດສົ່ງສຳລັບ ${active.order.order_code} ແລ້ວ`
            : `ບັນທຶກຮ່າງການຈັດສົ່ງສຳລັບ ${active.order.order_code} ແລ້ວ`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ບັນທຶກຮ່າງການຈັດສົ່ງບໍ່ສຳເລັດ");
    } finally {
      setSaving(false);
    }
  };

  const cancelShipment = async () => {
    if (!canCancelShipment) {
      toast.error("ສິດນີ້ສຳລັບ accountant ຫຼື superadmin ເທົ່ານັ້ນ");
      return;
    }
    if (!cancelReason.trim()) {
      toast.error("ກະລຸນາລະບຸເຫດຜົນການຍົກເລີກກ່ອນ");
      return;
    }
    if (!active?.existingShipmentId) {
      toast.error("ບໍ່ພົບລາຍການຈັດສົ່ງທີ່ຈະຍົກເລີກ");
      return;
    }

    const ok = confirm(`ຢືນຢັນຍົກເລີກຈັດສົ່ງ ${active.order.order_code}?`);
    if (!ok) return;

    const { data: latestShipment, error: latestShipmentError } = await supabase
      .from("shipment_records")
      .select("id,shipped_at")
      .eq("order_id", active.order.id)
      .order("shipped_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestShipmentError) {
      toast.error(`ກວດສອບລາຍການຈັດສົ່ງລ່າສຸດບໍ່ສຳເລັດ: ${latestShipmentError.message}`);
      return;
    }

    if (!latestShipment || latestShipment.id !== active.existingShipmentId) {
      toast.error("ສາມາດຍົກເລີກໄດ້ສະເພາະລາຍການຈັດສົ່ງລ່າສຸດເທົ່ານັ້ນ");
      return;
    }

    setSaving(true);

    const { data: shipmentPayments, error: shipmentPaymentsError } = await supabase
      .from("shipment_payments")
      .select("id,amount")
      .eq("shipment_id", active.existingShipmentId);

    if (shipmentPaymentsError) {
      setSaving(false);
      toast.error(`ໂຫຼດລາຍການຮັບເງິນຕອນຈັດສົ່ງບໍ່ສຳເລັດ: ${shipmentPaymentsError.message}`);
      return;
    }

    const rollbackAmount = ((shipmentPayments ?? []) as Array<{ amount: number }>).reduce(
      (sum, row) => sum + (Number(row.amount) || 0),
      0
    );
    const nextBalance = Math.max(0, Number(active.order.balance || 0) + rollbackAmount);
    const revertedLabelStatus = active.label.received_at ? "received" : "created";

    const confirmedDetail = confirm(
      [
        `ກຳລັງຍົກເລີກ ${active.order.order_code}`,
        `ວັນທີຈັດສົ່ງ: ${formatDateTime(active.existingShipmentAt)}`,
        `ຜູ້ຈັດສົ່ງ: ${active.existingShipmentBy || "-"}`,
        `ຈະຍ້ອນການຮັບເງິນຈາກ shipment ຈຳນວນ ${formatCurrency(rollbackAmount)}`,
        `ເຫດຜົນ: ${cancelReason.trim()}`,
      ].join("\n")
    );
    if (!confirmedDetail) {
      setSaving(false);
      return;
    }

    const { error: deleteShipmentPaymentsError } = await supabase
      .from("shipment_payments")
      .delete()
      .eq("shipment_id", active.existingShipmentId);

    if (deleteShipmentPaymentsError) {
      setSaving(false);
      toast.error(`ລຶບບັນທຶກການຮັບເງິນຕອນຈັດສົ່ງບໍ່ສຳເລັດ: ${deleteShipmentPaymentsError.message}`);
      return;
    }

    const { error: deletePaymentTransactionsError } = await supabase
      .from("payment_transactions")
      .delete()
      .eq("shipment_id", active.existingShipmentId);

    if (deletePaymentTransactionsError) {
      setSaving(false);
      toast.error(`ລຶບ payment log ຂອງການຈັດສົ່ງບໍ່ສຳເລັດ: ${deletePaymentTransactionsError.message}`);
      return;
    }

    const { error: deleteShipmentError } = await supabase
      .from("shipment_records")
      .delete()
      .eq("id", active.existingShipmentId);

    if (deleteShipmentError) {
      setSaving(false);
      toast.error(`ລຶບປະຫວັດຈັດສົ່ງບໍ່ສຳເລັດ: ${deleteShipmentError.message}`);
      return;
    }

    const { error: updateLabelError } = await supabase
      .from("order_qr_labels")
      .update({
        label_status: revertedLabelStatus,
        shipped_at: null,
        shipped_by: null,
        last_scanned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.label.id);

    if (updateLabelError) {
      setSaving(false);
      toast.error(`ຍ້ອນສະຖານະ QR ບໍ່ສຳເລັດ: ${updateLabelError.message}`);
      return;
    }

    const { error: updateOrderError } = await supabase
      .from("orders")
      .update({
        balance: nextBalance,
        customer_paid_full_at: nextBalance === 0 ? active.order.customer_paid_full_at : null,
        shipment_status: "pending",
        shipment_completed_at: null,
      })
      .eq("id", active.order.id);

    setSaving(false);

    if (updateOrderError) {
      toast.error(`ຍ້ອນສະຖານະອໍເດີບໍ່ສຳເລັດ: ${updateOrderError.message}`);
      return;
    }

    setActive((prev) =>
      prev
        ? {
            ...prev,
            label: {
              ...prev.label,
              label_status: revertedLabelStatus,
              shipped_at: null,
              shipped_by: null,
            },
            order: {
              ...prev.order,
              balance: nextBalance,
              shipment_status: "pending",
              shipment_completed_at: null,
              customer_paid_full_at: nextBalance === 0 ? prev.order.customer_paid_full_at : null,
            },
            existingShipmentId: null,
            existingShipmentAt: null,
            existingShipmentBy: null,
          }
        : prev
    );

    await safeInsertAction(
      active.order.id,
      "cancel_shipment",
      `Canceled shipment ${active.existingShipmentId}; rollback_amount=${rollbackAmount}; reason=${cancelReason.trim()}`
    );
    setCancelReason("");

    await loadRecentShipments();
    toast.success(`ຍົກເລີກຈັດສົ່ງ ${active.order.order_code} ສຳເລັດ`);
  };

  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-[2rem] bg-gradient-to-br from-orange-950 via-orange-900 to-amber-900 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.25em]">
              <Truck size={14} />
              ຈັດສົ່ງ
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">ຈັດສົ່ງດ້ວຍ QR ໂຮງງານ ຫຼື QR ຂອງຮ້ານ</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-orange-50">
              ໜ້າຈັດສົ່ງຍັງໃຊ້ລະບົບການຊຳລະແບບເກົ່າ ແຕ່ຮອງຮັບທັງ QR ໂຮງງານ, QR ຂອງຮ້ານ, ລະຫັດບິນໂຮງງານ ແລະ ລະຫັດອໍເດີ.
            </p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-orange-50">
            ກຳໄລຈະນັບຕາມວັນຈັດສົ່ງສຳເລັດ
          </div>
          <Link
            href="/shipments/orders"
            className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/20"
          >
            ເບິ່ງລາຍການອໍເດີຈັດສົ່ງ
          </Link>
          <Link
            href="/shipments/transport-note"
            className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/20"
          >
            ອອກໃບຝາກເຄື່ອງ
          </Link>
          <Link
            href="/shipments/notes"
            className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/20"
          >
            ລາຍການໃບຝາກເຄື່ອງ
          </Link>
          <Link
            href="/shipments/approvals"
            className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/20"
          >
            ອະນຸມັດສົ່ງມອບ
          </Link>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <MobileQrScanner onDetected={(value) => void openShipmentByCode(value)} />

          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-black text-slate-900">
              <ScanLine size={20} />
              ສະແກນ ຫຼື ວາງຄ່າ QR
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void openShipmentByCode(scanValue);
                }}
                placeholder="ວາງ QR ໂຮງງານ, QR ຂອງຮ້ານ, ລະຫັດບິນໂຮງງານ ຫຼື ລະຫັດອໍເດີ"
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="button"
                onClick={() => void openShipmentByCode(scanValue)}
                className="rounded-2xl bg-orange-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-orange-700"
              >
                ເປີດອໍເດີ
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          {active ? (
            <>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{active.label.label_status}</div>
                  <div className="mt-2 text-3xl font-black tracking-tight text-slate-900">{active.order.order_code}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">ລະຫັດບິນໂຮງງານ: {active.order.factory_bill_code?.trim() || "-"}</div>
                </div>
                <div className="rounded-3xl border border-amber-100 bg-amber-50 px-4 py-3 text-right">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">ຍອດຄ້າງຊຳລະ</div>
                  <div className="mt-1 text-2xl font-black text-amber-900">{formatCurrency(active.order.balance)}</div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ວັນທີອໍເດີ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{formatDateOnly(active.order.order_date)}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ຜະລິດສຳເລັດ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{formatDateTime(active.order.production_completed_at)}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ສະຖານະຈັດສົ່ງ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">
                    {active.order.shipment_status === "shipped" ? "ຈັດສົ່ງສຳເລັດ" : "ຍັງບໍ່ສຳເລັດ"}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ຈຳນວນ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{getTotalUnits(active.order)}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ວັນທີຝາກເຄື່ອງໃຫ້ລູກຄ້າ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{formatDateTime(shipmentVisuals.scheduledAt)}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ວັນທີຈັດສົ່ງສຳເລັດ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{formatDateTime(active.order.shipment_completed_at)}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ຊຳລະໂຮງງານ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{active.order.factory_paid_full_at ? "ຊຳລະແລ້ວ" : "ຍັງຄ້າງ"}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ຍອດສຸດທິ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{formatCurrency(active.order.net_total)}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ເງິນມັດຈຳທີ່ຮັບແລ້ວ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{formatCurrency(active.order.initial_deposit)}</div>
                </div>
              </div>

              {shipmentVisuals.orderImageUrl || shipmentVisuals.designImageUrls.length > 0 ? (
                <div className="mt-5 rounded-[2rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-black text-slate-900">ຮູບແບບເສື້ອຂອງອໍເດີ</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {shipmentVisuals.orderImageUrl ? (
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="border-b border-slate-100 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">ຮູບອໍເດີ</div>
                        {renderClickableImage(shipmentVisuals.orderImageUrl, `${active.order.order_code}-order`, "h-56 w-full object-cover")}
                      </div>
                    ) : null}
                    {shipmentVisuals.designImageUrls.map((url, index) => (
                      <div key={`${url}-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="border-b border-slate-100 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">ແບບທີ {index + 1}</div>
                        {renderClickableImage(url, `${active.order.order_code}-design-${index + 1}`, "h-56 w-full object-contain bg-white")}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-5 rounded-[2rem] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <Banknote size={18} />
                  ບັນທຶກຄຳຂໍຈັດສົ່ງ
                </div>
                {activeRequest ? (
                  <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
                    ລາຍການລ່າສຸດ: {activeRequest.request_no} • {SHIPMENT_DELIVERY_METHOD_LABELS[activeRequest.delivery_method]} •{" "}
                    {SHIPMENT_DELIVERY_STATUS_LABELS[activeRequest.status]}
                  </div>
                ) : null}

                {requestSubmitted ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    ຄຳຂໍນີ້ຖືກສົ່ງລໍຖ້າ super admin ອະນຸມັດແລ້ວ ຈະຍັງແກ້ໄຂບໍ່ໄດ້ຈົນກວ່າຖືກປະຕິເສດ.
                  </div>
                ) : null}

                {activeRequest?.status === "rejected" && activeRequest.rejection_note ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    ຖືກປະຕິເສດ: {activeRequest.rejection_note}
                  </div>
                ) : null}

                {shipmentLocked ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    ອໍເດີ {active.order.order_code} ຖືກຈັດສົ່ງແລ້ວ
                    {active.existingShipmentAt ? ` ໃນວັນທີ ${formatDateTime(active.existingShipmentAt)}` : ""}.
                  </div>
                ) : null}

                {shipmentLocked ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    {canCancelShipment
                      ? "ຖ້າກົດຜິດ ຫຼື ສະແກນຜິດ ສາມາດຍົກເລີກໄດ້ ແຕ່ຕ້ອງລະບຸເຫດຜົນ."
                      : "ການຍົກເລີກການຈັດສົ່ງສະຫງວນໃຫ້ accountant ຫຼື superadmin ເທົ່ານັ້ນ."}
                  </div>
                ) : null}

                {!shipmentLocked ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!requestSubmitted) setDeliveryMethod("pickup");
                      }}
                      className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${
                        deliveryMethod === "pickup"
                          ? "border-orange-300 bg-orange-50 text-orange-800"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      } ${requestSubmitted ? "opacity-60" : ""}`}
                    >
                      ລູກຄ້າເຂົ້າມາຮັບເອງ
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!requestSubmitted) setDeliveryMethod("transport");
                      }}
                      className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${
                        deliveryMethod === "transport"
                          ? "border-orange-300 bg-orange-50 text-orange-800"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      } ${requestSubmitted ? "opacity-60" : ""}`}
                    >
                      ຝາກຂົນສົ່ງ
                    </button>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold text-slate-700">
                    ວັນທີ/ເວລາຈັດສົ່ງ
                    <input
                      type="datetime-local"
                      value={shippedAt}
                      onChange={(e) => setShippedAt(e.target.value)}
                      disabled={requestSubmitted}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </label>
                  <label className="text-sm font-bold text-slate-700">
                    ຜູ້ຈັດສົ່ງ
                    <input
                      value={shippedBy}
                      onChange={(e) => setShippedBy(e.target.value)}
                      disabled={requestSubmitted}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </label>
                </div>

                {hasOutstandingBalance ? (
                  <>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="text-sm font-bold text-slate-700">
                        {deliveryMethod === "transport" ? "ຈຳນວນເງິນຄ້າງມັດຈຳທີ່ເກັບຕອນຝາກຂົນສົ່ງ" : "ຈຳນວນເງິນທີ່ຮັບຕອນນີ້"}
                        <input
                          type="number"
                          min={0}
                          max={customerOutstanding}
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(Number(e.target.value))}
                          disabled={requestSubmitted}
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </label>
                      <label className="text-sm font-bold text-slate-700">
                        ຮູບແບບການຊຳລະ
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                          disabled={requestSubmitted}
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          <option value="transfer">ໂອນເງິນ</option>
                          <option value="cash">ເງິນສົດ</option>
                        </select>
                      </label>
                    </div>

                    <label className="mt-4 block text-sm font-bold text-slate-700">
                      ວັນທີ/ເວລາຊຳລະ
                      <input
                        type="datetime-local"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        disabled={requestSubmitted}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </label>

                    <label className="mt-4 block text-sm font-bold text-slate-700">
                      ແນບສະລິບການໂອນເງິນ
                      <div className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={requestSubmitted} onClick={() => transferSlipFileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                            <FileUp size={16} />
                            ເລືອກໄຟລ໌
                          </button>
                          <button type="button" disabled={requestSubmitted} onClick={() => transferSlipCameraInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-50">
                            <Camera size={16} />
                            ຖ່າຍຮູບ
                          </button>
                          <input
                            ref={transferSlipFileInputRef}
                            type="file"
                            accept="image/*,.pdf"
                            className="sr-only"
                            disabled={requestSubmitted}
                            onChange={(e) => handleTransferSlipSelected(e.target.files?.[0] || null)}
                          />
                          <input
                            ref={transferSlipCameraInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="sr-only"
                            disabled={requestSubmitted}
                            onChange={(e) => handleTransferSlipSelected(e.target.files?.[0] || null)}
                          />
                        </div>
                        <div className="mt-3 text-xs font-semibold text-slate-500">
                          {transferSlipFile?.name || activeRequest?.transfer_slip_path || shipmentVisuals.depositTransferSlipUrl || "ຍັງບໍ່ໄດ້ແນບໄຟລ໌"}
                        </div>
                        {transferSlipPreviewUrl ? (
                          renderClickableImage(transferSlipPreviewUrl, "transfer slip", "mt-3 h-48 w-full rounded-2xl border border-slate-200 object-cover")
                        ) : shipmentVisuals.depositTransferSlipUrl ? (
                          isImageFileName(shipmentVisuals.depositTransferSlipUrl) ? (
                            renderClickableImage(shipmentVisuals.depositTransferSlipUrl, "deposit transfer slip", "mt-3 h-48 w-full rounded-2xl border border-slate-200 object-cover")
                          ) : (
                            <a
                              href={shipmentVisuals.depositTransferSlipUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700"
                            >
                              ເປີດສະລິບຈາກໃບສັ່ງຜະລິດ
                            </a>
                          )
                        ) : null}
                      </div>
                    </label>
                  </>
                ) : (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                    ອໍເດີນີ້ບໍ່ມີຍອດຄ້າງຊຳລະແລ້ວ ສາມາດບັນທຶກຄຳຂໍຈັດສົ່ງໄດ້ເລີຍ.
                  </div>
                )}

                {deliveryMethod === "transport" ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-bold text-slate-700">
                      ຊື່ຜູ້ຮັບ
                      <input
                        value={transportReceiverName}
                        onChange={(e) => setTransportReceiverName(e.target.value)}
                        disabled={requestSubmitted}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </label>
                    <label className="text-sm font-bold text-slate-700">
                      ເບີຜູ້ຮັບ
                      <input
                        value={transportReceiverPhone}
                        onChange={(e) => setTransportReceiverPhone(e.target.value)}
                        disabled={requestSubmitted}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </label>
                    <label className="text-sm font-bold text-slate-700">
                      ຝາກສາຂາ
                      <input
                        value={transportBranch}
                        onChange={(e) => setTransportBranch(e.target.value)}
                        disabled={requestSubmitted}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </label>
                    <label className="text-sm font-bold text-slate-700">
                      ເມືອງ
                      <input
                        value={transportCity}
                        onChange={(e) => setTransportCity(e.target.value)}
                        disabled={requestSubmitted}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </label>
                    <label className="text-sm font-bold text-slate-700 sm:col-span-2">
                      ແຂວງ
                      <input
                        value={transportProvince}
                        onChange={(e) => setTransportProvince(e.target.value)}
                        disabled={requestSubmitted}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </label>
                    <div className="sm:col-span-2">
                      <label className="mb-2 block text-sm font-bold text-slate-700">ຝາກຂົນສົ່ງ</label>
                      <div className="flex flex-wrap gap-2">
                        {["Anousith Express", "HAL Logistic", "Mixay Express"].map((provider) => {
                          const checked = transportProviders.includes(provider);
                          return (
                            <label
                              key={provider}
                              className={`flex cursor-pointer items-center rounded-xl border px-3 py-2 text-sm font-bold ${
                                checked ? "border-orange-300 bg-orange-50 text-orange-800" : "border-slate-200 bg-white text-slate-600"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={requestSubmitted}
                                onChange={() =>
                                  setTransportProviders((prev) =>
                                    prev.includes(provider) ? prev.filter((item) => item !== provider) : [...prev, provider]
                                  )
                                }
                                className="mr-2"
                              />
                              {provider}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-2 block text-sm font-bold text-slate-700">ຄ່າຂົນສົ່ງ</label>
                      <div className="flex flex-wrap gap-2">
                        <label className={`flex cursor-pointer items-center rounded-xl border px-3 py-2 text-sm font-bold ${transportChargeMode === "destination" ? "border-orange-300 bg-orange-50 text-orange-800" : "border-slate-200 bg-white text-slate-600"}`}>
                          <input type="radio" checked={transportChargeMode === "destination"} disabled={requestSubmitted} onChange={() => setTransportChargeMode("destination")} className="mr-2" />
                          ຈ່າຍປາຍທາງ
                        </label>
                        <label className={`flex cursor-pointer items-center rounded-xl border px-3 py-2 text-sm font-bold ${transportChargeMode === "origin" ? "border-orange-300 bg-orange-50 text-orange-800" : "border-slate-200 bg-white text-slate-600"}`}>
                          <input type="radio" checked={transportChargeMode === "origin"} disabled={requestSubmitted} onChange={() => setTransportChargeMode("origin")} className="mr-2" />
                          ຈ່າຍຕົ້ນທາງ
                        </label>
                      </div>
                    </div>
                  </div>
                ) : null}

                <label className="mt-4 block text-sm font-bold text-slate-700">
                  ຮູບພາບການຮັບເຄື່ອງ
                  <div className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={requestSubmitted} onClick={() => handoffPhotoFileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                        <FileUp size={16} />
                        ເລືອກຮູບ
                      </button>
                      <button type="button" disabled={requestSubmitted} onClick={() => handoffPhotoCameraInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-50">
                        <Camera size={16} />
                        ຖ່າຍຮູບ
                      </button>
                      <input
                        ref={handoffPhotoFileInputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={requestSubmitted}
                        onChange={(e) => handleHandoffPhotoSelected(e.target.files?.[0] || null)}
                      />
                      <input
                        ref={handoffPhotoCameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        disabled={requestSubmitted}
                        onChange={(e) => handleHandoffPhotoSelected(e.target.files?.[0] || null)}
                      />
                    </div>
                    <div className="mt-3 text-xs font-semibold text-slate-500">
                      {handoffPhotoFile?.name || activeRequest?.handoff_photo_file_name || "ຍັງບໍ່ມີຮູບ"}
                    </div>
                    {handoffPhotoPreviewUrl ? (
                      renderClickableImage(handoffPhotoPreviewUrl, "handoff", "mt-3 h-48 w-full rounded-2xl border border-slate-200 object-cover")
                    ) : shipmentVisuals.handoffPhotoUrl ? (
                      renderClickableImage(shipmentVisuals.handoffPhotoUrl, "handoff", "mt-3 h-48 w-full rounded-2xl border border-slate-200 object-cover")
                    ) : null}
                  </div>
                </label>

                <label className="mt-4 block text-sm font-bold text-slate-700">
                  ໝາຍເຫດ
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    disabled={requestSubmitted}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </label>

                {shipmentLocked ? (
                  <label className="mt-4 block text-sm font-bold text-slate-700">
                    ເຫດຜົນການຍົກເລີກ
                    <textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      rows={3}
                      placeholder="ຕົວຢ່າງ: ສະແກນຜິດ, ກົດຈັດສົ່ງຜິດ, ລູກຄ້າຍັງບໍ່ຮັບສິນຄ້າ"
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void saveDeliveryRequest("draft")}
                    disabled={saving || shipmentLocked || requestSubmitted}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    <PackageCheck size={18} />
                    {saving
                      ? "ກຳລັງບັນທຶກ..."
                      : shipmentLocked
                        ? "ອໍເດີນີ້ສົ່ງແລ້ວ"
                        : requestSubmitted
                          ? "ສົ່ງຂໍອະນຸມັດແລ້ວ"
                          : deliveryMethod === "transport"
                          ? "ບັນທຶກບິນ ແລະ ການຈັດສົ່ງ"
                          : "ບັນທຶກຮ່າງການຈັດສົ່ງ"}
                  </button>

                  {!shipmentLocked ? (
                    <button
                      type="button"
                      onClick={() => void saveDeliveryRequest("submitted")}
                      disabled={saving || requestSubmitted}
                      className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-black text-amber-800 shadow-sm transition hover:bg-amber-100 disabled:opacity-50"
                    >
                      <PackageCheck size={18} />
                      {requestSubmitted ? "ລໍຖ້າອະນຸມັດ" : "ສົ່ງຂໍອະນຸມັດ"}
                    </button>
                  ) : null}

                  {shipmentLocked ? (
                    <button
                      type="button"
                      onClick={() => void cancelShipment()}
                      disabled={saving || !canCancelShipment || !cancelReason.trim()}
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-5 py-3 text-sm font-black text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      <RotateCcw size={18} />
                      ຍົກເລີກຈັດສົ່ງ
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-16 text-center text-sm font-medium text-slate-500">
              ສະແກນ QR ໂຮງງານ, QR ຂອງຮ້ານ, ລະຫັດບິນໂຮງງານ ຫຼື ລະຫັດອໍເດີ ເພື່ອເປີດໜ້າຈັດສົ່ງ.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-black text-slate-900">
          <Truck size={20} />
          ປະຫວັດຈັດສົ່ງລ່າສຸດ
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {recentShipments.map((shipment) => (
            <div key={shipment.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ຈັດສົ່ງແລ້ວ</div>
              <div className="mt-2 text-lg font-black text-slate-900">{shipment.order_code || "-"}</div>
              <div className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-slate-400">{formatDateTime(shipment.shipped_at)}</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">{shipment.shipped_by}</div>
              <div className="mt-3 text-sm font-black text-slate-900">{formatCurrency(shipment.collected_amount)}</div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                {shipment.payment_method === "cash" ? "ເງິນສົດ" : shipment.payment_method === "transfer" ? "ໂອນເງິນ" : "ບໍ່ມີການຮັບເງິນ"}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
