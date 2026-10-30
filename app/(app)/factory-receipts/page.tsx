"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Barcode, CheckCheck, Factory, MessageCircleMore, PackagePlus, RotateCcw, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getTotalShirtQty } from "@/lib/order-quantities";
import {
  buildOrderLookupOrFilter,
  buildOrderQrCode,
  formatDateOnly,
  formatDateTime,
  formatTimeOnly,
  getTotalUnits,
  ORDER_QR_LABEL_SELECT,
  parseQrInput,
  type OrderSummary,
  type QrLabelRow,
} from "@/lib/inventory-qr";
import { WhatsappMessageModal } from "../_components/whatsapp-message-modal";
import { buildProductionCompletedWhatsappMessage, getWhatsappContactOptions } from "@/lib/whatsapp";
import { FactoryBarcodeScanner } from "../_components/factory-barcode-scanner";
import { findFactoryBarcodeOrder, normalizeFactoryBarcode } from "@/lib/factory-receipt-barcode";

type QueueItem = QrLabelRow & {
  customer_phone: string | null;
  customer_whatsapp: string | null;
  balance: number;
  total_qty: number;
};

type ReceiptRow = {
  id: string;
  received_at: string;
  received_by: string;
  note: string | null;
  created_at: string;
};

type ReceiptDetailItem = {
  qr_label_id: string;
  order_id: string;
  qr_code: string;
  order_code: string;
  customer_phone: string | null;
  customer_whatsapp: string | null;
  balance: number;
  total_qty: number;
  factory_bill_code: string | null;
  label_status: QrLabelRow["label_status"];
};

type SearchSuggestion = OrderSummary & {
  existingLabel: QrLabelRow | null;
};

const ORDER_SELECT =
  "id,order_code,customer_phone,customer_whatsapp,factory_bill_code,production_completed_at,status,short_qty,long_qty,free_qty,qty_3xl,qty_4xl,qty_5xl,balance";
let suggestionSearchTimer: ReturnType<typeof setTimeout> | null = null;
let suggestionRequestId = 0;

function toLocalDateTimeInputValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function getImportBlockReason(
  order: Pick<OrderSummary, "order_code" | "production_completed_at" | "status">,
  label: Pick<QrLabelRow, "label_status"> | null
) {
  if (order.status === "completed") {
    return `ອໍເດີ ${order.order_code} ຖືກປິດງານແລ້ວ`;
  }
  if (order.production_completed_at) {
    return `ອໍເດີ ${order.order_code} ຖືກບັນທຶກວ່າຜະລິດສຳເລັດແລ້ວ`;
  }
  if (label?.label_status === "received") {
    return `ອໍເດີ ${order.order_code} ຮັບເຂົ້າແລ້ວ`;
  }
  if (label?.label_status === "shipped") {
    return `ອໍເດີ ${order.order_code} ຖືກຈັດສົ່ງແລ້ວ`;
  }
  return null;
}

function getLabelStatusBadgeStyles(status: QrLabelRow["label_status"] | null | undefined) {
  if (status === "received") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "shipped") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function hasFactoryBillCode(order: Pick<OrderSummary, "factory_bill_code">) {
  return Boolean(order.factory_bill_code?.trim());
}

function showMissingFactoryBillNotification(orderCode: string) {
  toast.error(`ອໍເດີ ${orderCode} ບໍ່ມີລະຫັດບິນໂຮງງານ ແລະ ຍັງບໍ່ສາມາດນຳເຂົ້າໄດ້`);
}

async function searchSimilarOrders(rawValue: string) {
  const term = rawValue.trim();
  if (term.length < 2) return [] as SearchSuggestion[];

  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .or(buildOrderLookupOrFilter(term))
    .order("order_date", { ascending: false })
    .limit(8);

  if (error) throw new Error(error.message);

  const orders = (data ?? []) as OrderSummary[];
  if (orders.length === 0) return [] as SearchSuggestion[];

  const { data: labelData, error: labelError } = await supabase
    .from("order_qr_labels")
    .select(ORDER_QR_LABEL_SELECT)
    .in("order_id", orders.map((order) => order.id));

  if (labelError) throw new Error(labelError.message);

  const labelByOrderId = new Map(((labelData ?? []) as QrLabelRow[]).map((label) => [label.order_id, label]));
  return orders.map((order) => ({
    ...order,
    existingLabel: labelByOrderId.get(order.id) || null,
  }));
}

export default function FactoryReceiptsPage() {
  const [scannerInput, setScannerInput] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const lookupLockRef = useRef(false);
  const [lastBarcode, setLastBarcode] = useState<{ code: string; message: string; success: boolean } | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [receivedAt, setReceivedAt] = useState(() => toLocalDateTimeInputValue());
  const [receivedBy, setReceivedBy] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [cancelingReceiptId, setCancelingReceiptId] = useState<string | null>(null);
  const [recentReceipts, setRecentReceipts] = useState<ReceiptRow[]>([]);
  const [receiptItemCounts, setReceiptItemCounts] = useState<Record<string, number>>({});
  const [activeReceiptId, setActiveReceiptId] = useState<string | null>(null);
  const [activeReceiptItems, setActiveReceiptItems] = useState<ReceiptDetailItem[]>([]);
  const [loadingReceiptItems, setLoadingReceiptItems] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappPhones, setWhatsappPhones] = useState<ReturnType<typeof getWhatsappContactOptions>>([]);
  const [whatsappInitialPhone, setWhatsappInitialPhone] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [whatsappTitle, setWhatsappTitle] = useState("");

  const loadCurrentUser = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id;
    if (!authUserId) return;

    const { data } = await supabase.from("users").select("full_name").eq("auth_user_id", authUserId).maybeSingle();
    if (data?.full_name) setReceivedBy(data.full_name);
  };

  const loadRecentReceipts = async () => {
    const { data, error } = await supabase
      .from("factory_receipts")
      .select("id,received_at,received_by,note,created_at")
      .order("received_at", { ascending: false })
      .limit(8);

    if (error) {
      toast.error(`ໂຫຼດປະຫວັດຮັບເຂົ້າບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    const receipts = (data ?? []) as ReceiptRow[];
    setRecentReceipts(receipts);

    if (receipts.length === 0) {
      setReceiptItemCounts({});
      return;
    }

    const { data: itemData, error: itemError } = await supabase
      .from("factory_receipt_items")
      .select("receipt_id")
      .in("receipt_id", receipts.map((receipt) => receipt.id));

    if (itemError) {
      toast.error(`ໂຫຼດຈຳນວນລາຍການໃນໃບຮັບເຂົ້າບໍ່ສຳເລັດ: ${itemError.message}`);
      return;
    }

    const counts: Record<string, number> = {};
    ((itemData ?? []) as Array<{ receipt_id: string }>).forEach((item) => {
      counts[item.receipt_id] = (counts[item.receipt_id] || 0) + 1;
    });
    setReceiptItemCounts(counts);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCurrentUser();
      void loadRecentReceipts();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (suggestionSearchTimer) {
        clearTimeout(suggestionSearchTimer);
        suggestionSearchTimer = null;
      }
    };
  }, []);

  const loadReceiptItems = async (receiptId: string) => {
    setActiveReceiptId(receiptId);
    setLoadingReceiptItems(true);

    const { data: itemData, error: itemError } = await supabase
      .from("factory_receipt_items")
      .select("qr_label_id,order_id,qr_code")
      .eq("receipt_id", receiptId);

    if (itemError) {
      setLoadingReceiptItems(false);
      toast.error(`ໂຫຼດລາຍການໃນໃບຮັບເຂົ້າບໍ່ສຳເລັດ: ${itemError.message}`);
      return;
    }

    const labelIds = ((itemData ?? []) as Array<{ qr_label_id: string }>).map((item) => item.qr_label_id);
    if (labelIds.length === 0) {
      setActiveReceiptItems([]);
      setLoadingReceiptItems(false);
      return;
    }

    const { data: labelData, error: labelError } = await supabase
      .from("order_qr_labels")
      .select(ORDER_QR_LABEL_SELECT)
      .in("id", labelIds);

    if (labelError) {
      setLoadingReceiptItems(false);
      toast.error(`ໂຫຼດລາຍການ QR ບໍ່ສຳເລັດ: ${labelError.message}`);
      return;
    }

    const orderIds = ((itemData ?? []) as Array<{ order_id: string }>).map((item) => item.order_id);
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id,customer_phone,customer_whatsapp,short_qty,long_qty,free_qty,qty_3xl,qty_4xl,qty_5xl,balance")
      .in("id", orderIds);

    setLoadingReceiptItems(false);

    if (orderError) {
      toast.error(`ໂຫຼດເບີລູກຄ້າບໍ່ສຳເລັດ: ${orderError.message}`);
      return;
    }

    const labelMap = new Map(((labelData ?? []) as QrLabelRow[]).map((label) => [label.id, label]));
    const orderMap = new Map(
      ((orderData ?? []) as Array<{
        id: string;
        customer_phone: string | null;
        customer_whatsapp: string | null;
        short_qty: number;
        long_qty: number;
        free_qty: number;
        qty_3xl: number;
        qty_4xl: number;
        qty_5xl: number;
        balance: number;
      }>).map((order) => [order.id, order])
    );

    const details = ((itemData ?? []) as Array<{ qr_label_id: string; order_id: string; qr_code: string }>).map((item) => {
      const label = labelMap.get(item.qr_label_id);
      const order = orderMap.get(item.order_id);
      return {
        qr_label_id: item.qr_label_id,
        order_id: item.order_id,
        qr_code: item.qr_code,
        order_code: label?.order_code || "-",
        customer_phone: order?.customer_phone || null,
        customer_whatsapp: order?.customer_whatsapp || null,
        balance: Number(order?.balance) || 0,
        total_qty: getTotalShirtQty(order),
        factory_bill_code: label?.factory_bill_code || null,
        label_status: label?.label_status || "received",
      } satisfies ReceiptDetailItem;
    });

    setActiveReceiptItems(details);
  };

  const findOrderByInput = async (rawValue: string, factoryBarcodeOnly = false) => {
    if (factoryBarcodeOnly) {
      const order = await findFactoryBarcodeOrder(supabase, rawValue, ORDER_SELECT);
      if (!order) return null;
      const { data, error } = await supabase
        .from("order_qr_labels")
        .select(ORDER_QR_LABEL_SELECT)
        .eq("order_id", order.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { order, existingLabel: (data as QrLabelRow | null) || null };
    }

    const parsed = parseQrInput(rawValue);
    if (!parsed.normalized) return null;

    if (parsed.kind === "shop_qr") {
      const { data, error } = await supabase
        .from("order_qr_labels")
        .select(ORDER_QR_LABEL_SELECT)
        .eq("qr_code", parsed.normalized)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return null;

      const { data: orderData, error: orderError } = await supabase.from("orders").select(ORDER_SELECT).eq("id", data.order_id).maybeSingle();
      if (orderError) throw new Error(orderError.message);
      if (!orderData) return null;

      return {
        order: orderData as OrderSummary,
        existingLabel: data as QrLabelRow,
      };
    }

    let order: OrderSummary | null = null;
    if ((parsed.kind === "factory_qr" || parsed.kind === "factory_bill_code") && parsed.factoryBillCode) {
      const { data: factoryMatches, error } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("factory_bill_code", parsed.factoryBillCode)
        .limit(1);

      if (error) throw new Error(error.message);
      order = ((factoryMatches ?? [])[0] as OrderSummary | undefined) || null;
    } else {
      const [{ data: orderMatches, error: orderError }, { data: factoryMatches, error: factoryError }] = await Promise.all([
        supabase.from("orders").select(ORDER_SELECT).eq("order_code", parsed.normalized).limit(1),
        supabase.from("orders").select(ORDER_SELECT).eq("factory_bill_code", parsed.normalized).limit(1),
      ]);

      if (orderError) throw new Error(orderError.message);
      if (factoryError) throw new Error(factoryError.message);

      const matches = [...((orderMatches ?? []) as OrderSummary[]), ...((factoryMatches ?? []) as OrderSummary[])];
      order = matches.find((item, index) => matches.findIndex((candidate) => candidate.id === item.id) === index) || null;
    }

    if (!order) return null;

    const { data: labelData, error: labelError } = await supabase
      .from("order_qr_labels")
      .select(ORDER_QR_LABEL_SELECT)
      .eq("order_id", order.id)
      .maybeSingle();
    if (labelError) throw new Error(labelError.message);

    return {
      order,
      existingLabel: (labelData as QrLabelRow | null) || null,
    };
  };

  const ensureLabelForOrder = async (order: OrderSummary, existingLabel: QrLabelRow | null) => {
    if (existingLabel) {
      return {
        ...existingLabel,
        order_code: order.order_code,
        factory_bill_code: order.factory_bill_code || null,
      } as QrLabelRow;
    }

    if (!order.factory_bill_code?.trim()) {
      throw new Error(`ອໍເດີ ${order.order_code} ບໍ່ມີລະຫັດບິນໂຮງງານ ແລະ ຍັງບໍ່ສາມາດນຳເຂົ້າໄດ້`);
    }

    const qrCode = buildOrderQrCode(order);
    const { data, error } = await supabase
      .from("order_qr_labels")
      .upsert(
        {
          order_id: order.id,
          qr_code: qrCode,
          order_code: order.order_code,
          factory_bill_code: order.factory_bill_code.trim(),
          label_status: "created",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "order_id" }
      )
      .select(ORDER_QR_LABEL_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as QrLabelRow;
  };

  const addResolvedOrderToQueue = async (resolved: { order: OrderSummary; existingLabel: QrLabelRow | null }) => {
    if (!hasFactoryBillCode(resolved.order)) {
      showMissingFactoryBillNotification(resolved.order.order_code);
      return false;
    }

    const initialBlockReason = getImportBlockReason(resolved.order, resolved.existingLabel);
    if (initialBlockReason) {
      toast.error(initialBlockReason);
      return false;
    }
    if (queue.some((item) => item.order_id === resolved.order.id)) {
      toast("ອໍເດີນີ້ຢູ່ໃນລາຍການຮັບເຂົ້າແລ້ວ");
      return false;
    }
    const label = await ensureLabelForOrder(resolved.order, resolved.existingLabel);
    const blockedReason = getImportBlockReason(resolved.order, label);
    if (queue.some((item) => item.id === label.id || item.order_id === label.order_id)) {
      toast("ອໍເດີນີ້ຢູ່ໃນລາຍການຮັບເຂົ້າແລ້ວ");
      setScannerInput("");
      setSuggestions([]);
      setSuggestionsOpen(false);
      return false;
    }
    if (label.label_status === "received") {
      toast.error("ອໍເດີນີ້ຮັບເຂົ້າຄັງແລ້ວ");
      return false;
    }
    if (label.label_status === "shipped") {
      toast.error("ອໍເດີນີ້ຖືກຈັດສົ່ງແລ້ວ");
      return false;
    }

    if (blockedReason) {
      toast.error(blockedReason);
      return false;
    }

    setQueue((prev) => prev.some((item) => item.order_id === label.order_id) ? prev : [
      ...prev,
      {
        ...label,
        customer_phone: resolved.order.customer_phone || null,
        customer_whatsapp: resolved.order.customer_whatsapp || null,
        balance: Number(resolved.order.balance) || 0,
        total_qty: getTotalUnits(resolved.order),
      },
    ]);
    setReceivedAt(toLocalDateTimeInputValue());
    setScannerInput("");
    setSuggestions([]);
    setSuggestionsOpen(false);
    toast.success(`ເພີ່ມ ${label.order_code} ເຂົ້າລາຍການແລ້ວ`);
    return true;
  };

  const scheduleSuggestionSearch = (value: string) => {
    setScannerInput(value);

    const term = value.trim();
    suggestionRequestId += 1;
    const currentRequestId = suggestionRequestId;

    if (suggestionSearchTimer) {
      clearTimeout(suggestionSearchTimer);
      suggestionSearchTimer = null;
    }

    if (term.length < 2) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      setSuggestionsLoading(false);
      return;
    }

    setSuggestionsLoading(true);
    suggestionSearchTimer = setTimeout(() => {
      void searchSimilarOrders(term)
        .then((rows) => {
          if (currentRequestId !== suggestionRequestId) return;
          setSuggestions(rows);
          setSuggestionsOpen(true);
        })
        .catch(() => {
          if (currentRequestId !== suggestionRequestId) return;
          setSuggestions([]);
          setSuggestionsOpen(true);
        })
        .finally(() => {
          if (currentRequestId === suggestionRequestId) {
            setSuggestionsLoading(false);
          }
        });
    }, 220);
  };

  const lookupLabel = async (rawValue: string, factoryBarcodeOnly = false) => {
    const input = rawValue.trim();
    if (!input || saving || lookupLockRef.current) return;
    lookupLockRef.current = true;
    setLookingUp(true);
    // Invalidate any pending suggestions before resolving a scanned code.
    suggestionRequestId += 1;
    if (suggestionSearchTimer) clearTimeout(suggestionSearchTimer);
    setSuggestionsLoading(false);
    if (factoryBarcodeOnly) {
      setBarcodeInput(normalizeFactoryBarcode(input) || input);
      setLastBarcode(null);
    }

    try {
      const resolved = await findOrderByInput(input, factoryBarcodeOnly);
      if (!resolved) {
        if (factoryBarcodeOnly) {
          throw new Error(`ບໍ່ພົບອໍເດີທີ່ມີລະຫັດບິນໂຮງງານ ${normalizeFactoryBarcode(input)}`);
        }
        const nearby = await searchSimilarOrders(input);
        setSuggestions(nearby);
        setSuggestionsOpen(true);
        toast.error(nearby.length > 0 ? "ບໍ່ພົບແບບກົງ, ລອງເລືອກຈາກລາຍການທີ່ໃກ້ຄຽງ" : "ບໍ່ພົບອໍເດີທີ່ກົງກັນ");
        return;
      }

      const added = await addResolvedOrderToQueue(resolved);
      if (factoryBarcodeOnly) {
        const alreadyQueued = queue.some((item) => item.order_id === resolved.order.id);
        setLastBarcode({
          code: resolved.order.factory_bill_code || input,
          message: added
            ? `ເພີ່ມ ${resolved.order.order_code} ເຂົ້າລາຍການແລ້ວ`
            : alreadyQueued
              ? `ອໍເດີ ${resolved.order.order_code} ຢູ່ໃນລາຍການແລ້ວ`
              : getImportBlockReason(resolved.order, resolved.existingLabel) || "ບໍ່ສາມາດເພີ່ມອໍເດີນີ້ໄດ້",
          success: added || alreadyQueued,
        });
        if (added || alreadyQueued) setBarcodeInput("");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "ກວດສອບຂໍ້ມູນບໍ່ສຳເລັດ";
      toast.error(message);
      if (factoryBarcodeOnly) setLastBarcode({ code: input, message, success: false });
    } finally {
      lookupLockRef.current = false;
      setLookingUp(false);
    }
  };

  const selectSuggestedOrder = async (item: SearchSuggestion) => {
    if (saving || lookupLockRef.current) return;
    lookupLockRef.current = true;
    setLookingUp(true);
    try {
      await addResolvedOrderToQueue({ order: item, existingLabel: item.existingLabel });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ກວດສອບຂໍ້ມູນບໍ່ສຳເລັດ");
    } finally {
      lookupLockRef.current = false;
      setLookingUp(false);
    }
  };

  const submitImport = async () => {
    if (saving || lookupLockRef.current) return;
    if (queue.length === 0) {
      toast.error("ກະລຸນາເລືອກອໍເດີຢ່າງໜ້ອຍ 1 ລາຍການກ່ອນ");
      return;
    }
    if (!receivedBy.trim()) {
      toast.error("ກະລຸນາປ້ອນຊື່ຜູ້ຮັບເຂົ້າ");
      return;
    }

    setSaving(true);
    const isoReceivedAt = new Date(receivedAt).toISOString();
    const queueOrderIds = queue.map((item) => item.order_id);

    const { data: existingReceiptItems, error: existingReceiptError } = await supabase
      .from("factory_receipt_items")
      .select("order_id")
      .in("order_id", queueOrderIds);

    if (existingReceiptError) {
      setSaving(false);
      toast.error(`ກວດສອບລາຍການຮັບເຂົ້າຊ້ຳບໍ່ສຳເລັດ: ${existingReceiptError.message}`);
      return;
    }

    if ((existingReceiptItems ?? []).length > 0) {
      setSaving(false);
      toast.error("ມີບາງອໍເດີຖືກນຳເຂົ້າເຂົ້າຄັງແລ້ວ");
      return;
    }

    const { data: latestOrders, error: latestOrdersError } = await supabase
      .from("orders")
      .select("id,order_code,production_completed_at,status")
      .in("id", queueOrderIds);

    if (latestOrdersError) {
      setSaving(false);
      toast.error(`ກວດສອບສະຖານະອໍເດີກ່ອນນຳເຂົ້າບໍ່ສຳເລັດ: ${latestOrdersError.message}`);
      return;
    }

    const latestOrderMap = new Map(
      ((latestOrders ?? []) as Array<Pick<OrderSummary, "id" | "order_code" | "production_completed_at" | "status">>).map((order) => [order.id, order])
    );
    const blockedOrderReason = queue
      .map((item) => {
        const latestOrder = latestOrderMap.get(item.order_id);
        if (!latestOrder) return `ບໍ່ພົບຂໍ້ມູນອໍເດີ ${item.order_code}`;
        return getImportBlockReason(latestOrder, item);
      })
      .find((reason) => Boolean(reason));

    if (blockedOrderReason) {
      setSaving(false);
      toast.error(blockedOrderReason);
      return;
    }

    const { data: receipt, error: receiptError } = await supabase
      .from("factory_receipts")
      .insert({
        received_at: isoReceivedAt,
        received_by: receivedBy.trim(),
        note: note.trim() || null,
      })
      .select("id")
      .single();

    if (receiptError || !receipt) {
      setSaving(false);
      toast.error(`ສ້າງບັນທຶກຮັບເຂົ້າບໍ່ສຳເລັດ: ${receiptError?.message || "ບໍ່ຮູ້ສາເຫດ"}`);
      return;
    }

    const itemPayload = queue.map((item) => ({
      receipt_id: receipt.id,
      qr_label_id: item.id,
      order_id: item.order_id,
      qr_code: item.qr_code,
    }));

    const { error: itemError } = await supabase.from("factory_receipt_items").insert(itemPayload);
    if (itemError) {
      setSaving(false);
      toast.error(`ບັນທຶກລາຍການຮັບເຂົ້າບໍ່ສຳເລັດ: ${itemError.message}`);
      return;
    }

    const { error: labelError } = await supabase
      .from("order_qr_labels")
      .update({
        label_status: "received",
        received_at: isoReceivedAt,
        received_by: receivedBy.trim(),
        last_scanned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", queue.map((item) => item.id));

    if (labelError) {
      setSaving(false);
      toast.error(`ບັນທຶກຮັບເຂົ້າແລ້ວ ແຕ່ອັບເດດສະຖານະ QR ບໍ່ສຳເລັດ: ${labelError.message}`);
      return;
    }

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update({
        production_completed_at: isoReceivedAt,
      })
      .in("id", queueOrderIds)
      .is("production_completed_at", null);

    setSaving(false);

    if (orderUpdateError) {
      toast.error(`ນຳເຂົ້າແລ້ວ ແຕ່ອັບເດດສະຖານະອໍເດີບໍ່ສຳເລັດ: ${orderUpdateError.message}`);
      return;
    }

    setQueue([]);
    setNote("");
    setScannerInput("");
    setBarcodeInput("");
    setLastBarcode(null);
    setReceivedAt(toLocalDateTimeInputValue());
    await loadRecentReceipts();
    await loadReceiptItems(receipt.id);
    toast.success(`ນຳເຂົ້າ ${itemPayload.length} ລາຍການເຂົ້າຄັງຮ້ານສຳເລັດ`);
  };

  const cancelReceipt = async (receipt: ReceiptRow) => {
    const confirmed = window.confirm(`ຕ້ອງການຍົກເລີກໃບຮັບເຂົ້າຮອບ ${formatDateTime(receipt.received_at)} ແທ້ບໍ?`);
    if (!confirmed) return;

    setCancelingReceiptId(receipt.id);

    const { data: itemData, error: itemError } = await supabase
      .from("factory_receipt_items")
      .select("qr_label_id,order_id")
      .eq("receipt_id", receipt.id);

    if (itemError) {
      setCancelingReceiptId(null);
      toast.error(`ໂຫຼດລາຍການເພື່ອຍົກເລີກບໍ່ສຳເລັດ: ${itemError.message}`);
      return;
    }

    const qrLabelIds = ((itemData ?? []) as Array<{ qr_label_id: string }>).map((item) => item.qr_label_id);
    const orderIds = ((itemData ?? []) as Array<{ order_id: string }>).map((item) => item.order_id);

    if (qrLabelIds.length > 0) {
      const { data: labelData, error: labelError } = await supabase
        .from("order_qr_labels")
        .select("id,label_status,order_code")
        .in("id", qrLabelIds);

      if (labelError) {
        setCancelingReceiptId(null);
        toast.error(`ໂຫຼດສະຖານະ QR ບໍ່ສຳເລັດ: ${labelError.message}`);
        return;
      }

      const shippedLabels = ((labelData ?? []) as Array<{ id: string; label_status: string; order_code: string }>).filter(
        (label) => label.label_status === "shipped"
      );

      if (shippedLabels.length > 0) {
        setCancelingReceiptId(null);
        toast.error("ບໍ່ສາມາດຍົກເລີກໄດ້ ເພາະບາງອໍເດີຖືກຈັດສົ່ງແລ້ວ");
        return;
      }

      const { error: revertLabelError } = await supabase
        .from("order_qr_labels")
        .update({
          label_status: "created",
          received_at: null,
          received_by: null,
          last_scanned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in("id", qrLabelIds);

      if (revertLabelError) {
        setCancelingReceiptId(null);
        toast.error(`ຍ້ອນກັບສະຖານະ QR ບໍ່ສຳເລັດ: ${revertLabelError.message}`);
        return;
      }
    }

    if (orderIds.length > 0) {
      const { error: revertOrderError } = await supabase
        .from("orders")
        .update({ production_completed_at: null })
        .in("id", orderIds)
        .eq("production_completed_at", receipt.received_at);

      if (revertOrderError) {
        setCancelingReceiptId(null);
        toast.error(`ຍ້ອນກັບສະຖານະອໍເດີບໍ່ສຳເລັດ: ${revertOrderError.message}`);
        return;
      }
    }

    const { error: deleteReceiptError } = await supabase.from("factory_receipts").delete().eq("id", receipt.id);

    setCancelingReceiptId(null);

    if (deleteReceiptError) {
      toast.error(`ລຶບໃບຮັບເຂົ້າບໍ່ສຳເລັດ: ${deleteReceiptError.message}`);
      return;
    }

    if (activeReceiptId === receipt.id) {
      setActiveReceiptId(null);
      setActiveReceiptItems([]);
    }

    await loadRecentReceipts();
    toast.success("ຍົກເລີກໃບຮັບເຂົ້າສຳເລັດ");
  };

  const openWhatsappModal = (params: {
    orderCode: string;
    customerPhone: string | null;
    customerWhatsapp: string | null;
    totalQty: number;
    balance: number;
  }) => {
    const options = getWhatsappContactOptions(params.customerPhone, params.customerWhatsapp);
    if (options.length === 0) {
      toast.error("ບໍ່ພົບເບີ WhatsApp ສຳລັບລູກຄ້າ");
      return;
    }

    setWhatsappPhones(options);
    setWhatsappInitialPhone(options[0]?.value || "");
    setWhatsappTitle(`ແຈ້ງລູກຄ້າອໍເດີ ${params.orderCode}`);
    setWhatsappMessage(
      buildProductionCompletedWhatsappMessage({
        orderCode: params.orderCode,
        totalQty: params.totalQty,
        balance: params.balance,
      })
    );
    setWhatsappModalOpen(true);
  };

  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 p-5 text-white shadow-xl sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.25em]">
              <Factory size={14} />
              ຮັບສິນຄ້າເຂົ້າ
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">ສະແກນ Barcode ຮັບສິນຄ້າເຂົ້າ</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-emerald-50">
              ໃຊ້ກ້ອງຫຼັງໂທລະສັບຂອງພະນັກງານ ສະແກນ Barcode ໃນໃບໂຮງງານເພື່ອເພີ່ມອໍເດີ. ສະແກນໃຫ້ຄົບ ແລ້ວກວດສອບ ແລະ ກົດນຳເຂົ້າທັງໝົດ.
            </p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-emerald-50">ສຳລັບກ້ອງໂທລະສັບພະນັກງານ</div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <div className="rounded-[2rem] border border-emerald-100 bg-white p-5 shadow-sm">
            <FactoryBarcodeScanner onDetected={(value) => lookupLabel(value, true)} disabled={saving} />
            <details className="mt-5 border-t border-slate-100 pt-4">
              <summary className="cursor-pointer py-2 text-sm font-bold text-slate-600">ສະແກນບໍ່ໄດ້? ພິມລະຫັດດ້ວຍຕົນເອງ</summary>
              <form
                className="mt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void lookupLabel(barcodeInput, true);
                }}
              >
                <label htmlFor="factory-barcode-input" className="text-sm font-bold text-slate-700">ລະຫັດບິນໂຮງງານ</label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="factory-barcode-input"
                    value={barcodeInput}
                    onChange={(event) => setBarcodeInput(event.target.value)}
                    placeholder="26-184019"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    disabled={saving}
                    aria-describedby="factory-barcode-help"
                    className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-3 font-mono text-base font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                  />
                  <button type="submit" disabled={saving || lookingUp || !barcodeInput.trim()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50">
                    <Barcode size={18} /> ເພີ່ມອໍເດີ
                  </button>
                </div>
                <p id="factory-barcode-help" className="mt-2 text-xs font-medium leading-relaxed text-slate-500">ພິມລະຫັດເຕັມທີ່ຢູ່ໃຕ້ Barcode ແລ້ວກົດເພີ່ມອໍເດີ.</p>
              </form>
            </details>
            <div aria-live="polite" role="status" className="mt-4">
              {lookingUp ? <div className="text-sm font-bold text-emerald-700">ກຳລັງກວດສອບອໍເດີ...</div> : lastBarcode ? (
                <div className={`rounded-2xl border p-3 ${lastBarcode.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                  <div className="break-all font-mono text-base font-black">{lastBarcode.code}</div>
                  <div className="mt-1 text-sm font-bold">{lastBarcode.message}</div>
                </div>
              ) : null}
            </div>
            {queue.length > 0 ? (
              <a href="#factory-receipt-queue" className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white xl:hidden">
                <CheckCheck size={18} /> ກວດສອບ {queue.length} ອໍເດີທີ່ສະແກນແລ້ວ
              </a>
            ) : null}
          </div>
          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-black text-slate-900">
              <Search size={20} />
              ຄົ້ນຫາອໍເດີດ້ວຍລະຫັດ
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={scannerInput}
                disabled={saving || lookingUp}
                onChange={(e) => scheduleSuggestionSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void lookupLabel(scannerInput);
                }}
                placeholder="ພິມລະຫັດບິນໂຮງງານ ຫຼື ລະຫັດອໍເດີຂອງຮ້ານ"
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button type="button" disabled={saving || lookingUp} onClick={() => void lookupLabel(scannerInput)} className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50">
                ຄົ້ນຫາ
              </button>
            </div>

            {scannerInput.trim() ? (
              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">ລາຍການທີ່ໃກ້ຄຽງ</div>
                  <div className="text-xs font-bold text-slate-400">
                    {suggestionsLoading ? "ກຳລັງຄົ້ນຫາ..." : `${suggestions.length} ລາຍການ`}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {suggestionsOpen && suggestions.length > 0 ? (
                    suggestions.map((item) => {
                      const canImport = hasFactoryBillCode(item);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={saving || lookingUp}
                          onClick={() => void selectSuggestedOrder(item)}
                          className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                            canImport
                              ? "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50"
                              : "border-rose-200 bg-rose-50 hover:border-rose-300 hover:bg-rose-100"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-lg font-black text-slate-900">{item.order_code}</div>
                            <div className="truncate text-sm font-medium text-slate-500">ລະຫັດບິນໂຮງງານ: {item.factory_bill_code?.trim() || "-"}</div>
                            <div className="mt-1 text-xs font-semibold text-slate-400">ຈຳນວນ: {getTotalUnits(item)} • ຄ້າງຈ່າຍ: {(Number(item.balance) || 0).toLocaleString()} ກີບ</div>
                            {!canImport ? (
                              <div className="mt-2 rounded-2xl border border-rose-200 bg-white/80 px-3 py-2 text-xs font-bold text-rose-700">
                                ບໍ່ສາມາດນຳເຂົ້າໄດ້: ອໍເດີນີ້ຍັງບໍ່ມີລະຫັດບິນໂຮງງານ
                              </div>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.2em] ${getLabelStatusBadgeStyles(item.existingLabel?.label_status || "created")}`}>
                              {item.existingLabel?.label_status || "created"}
                            </span>
                            <span className={`text-xs font-black ${canImport ? "text-emerald-700" : "text-rose-700"}`}>
                              {canImport ? "ເລືອກ" : "ນຳເຂົ້າບໍ່ໄດ້"}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  ) : !suggestionsLoading ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center text-sm font-medium text-slate-500">
                      ບໍ່ພົບລາຍການທີ່ໃກ້ຄຽງ
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold text-slate-700">
                ວັນທີ/ເວລານຳເຂົ້າ
                <input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                ຜູ້ຮັບເຂົ້າ
                <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500" />
              </label>
            </div>

            <label className="mt-4 block text-sm font-bold text-slate-700">
              ໝາຍເຫດ
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500" />
            </label>
          </div>
        </div>

        <div id="factory-receipt-queue" className="scroll-mt-24 rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-lg font-black text-slate-900">ລາຍການຮັບເຂົ້າ</div>
              <div className="text-sm font-medium text-slate-500">ເລືອກຫຼາຍອໍເດີ ແລ້ວ ນຳເຂົ້າໃນຄັ້ງດຽວ</div>
            </div>
            <button type="button" onClick={() => void submitImport()} disabled={saving || lookingUp || queue.length === 0} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50">
              <PackagePlus size={16} />
              {saving ? "ກຳລັງບັນທຶກ..." : "ນຳເຂົ້າທັງໝົດ"}
            </button>
          </div>

          <div className="mt-3 text-sm font-bold text-emerald-700">{queue.length} ອໍເດີລໍຖ້າຮັບເຂົ້າ</div>
          <div className="mt-5 space-y-3">
            {queue.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm font-medium text-slate-500">ຍັງບໍ່ມີລາຍການທີ່ເລືອກ.</div>
            ) : (
              queue.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-lg font-black text-slate-900">{item.order_code}</div>
                    <div className="text-sm font-medium text-slate-500">ລະຫັດບິນໂຮງງານ: {item.factory_bill_code?.trim() || "-"}</div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">ສະຖານະ QR: {item.label_status}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                        {item.customer_phone?.trim() ? item.customer_phone : item.customer_whatsapp?.trim() ? item.customer_whatsapp : "ບໍ່ມີເບີ"}
                      </span>
                      {getWhatsappContactOptions(item.customer_phone, item.customer_whatsapp).length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            openWhatsappModal({
                              orderCode: item.order_code,
                              customerPhone: item.customer_phone,
                              customerWhatsapp: item.customer_whatsapp,
                              totalQty: item.total_qty,
                              balance: item.balance,
                            })
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                        >
                          <MessageCircleMore size={14} />
                          ເປີດແຊັດ
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-slate-400">ບໍ່ມີເບີ WhatsApp</span>
                      )}
                    </div>
                  </div>
                  <button type="button" disabled={saving || lookingUp} onClick={() => setQueue((prev) => prev.filter((row) => row.id !== item.id))} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100 disabled:opacity-50">
                    ລຶບອອກ
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-black text-slate-900">
          <CheckCheck size={20} />
          ປະຫວັດຮັບເຂົ້າລ່າສຸດ
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {recentReceipts.map((receipt) => (
            <button
              type="button"
              key={receipt.id}
              onClick={() => void loadReceiptItems(receipt.id)}
              className={`rounded-3xl border p-4 text-left transition ${activeReceiptId === receipt.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ນຳເຂົ້າແລ້ວ</div>
                <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-black text-slate-700">{receiptItemCounts[receipt.id] || 0} ລາຍການ</div>
              </div>
              <div className="mt-2 text-lg font-black text-slate-900">{formatDateOnly(receipt.received_at)}</div>
              <div className="mt-1 text-sm font-bold text-emerald-700">ເວລາ: {formatTimeOnly(receipt.received_at)}</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">{receipt.received_by}</div>
              <div className="mt-3 text-sm font-medium text-slate-500">{receipt.note?.trim() || "-"}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-lg font-black text-slate-900">ລາຍລະອຽດໃບຮັບເຂົ້າ</div>
            <div className="text-sm font-medium text-slate-500">{activeReceiptId ? `ສະແດງລາຍການໃນໃບຮັບເຂົ້າ ${activeReceiptId.slice(0, 8)}...` : "ເລືອກໃບຮັບເຂົ້າຈາກປະຫວັດດ້ານເທິງ"}</div>
          </div>
          {activeReceiptId ? (
            <button
              type="button"
              onClick={() => {
                const receipt = recentReceipts.find((item) => item.id === activeReceiptId);
                if (receipt) void cancelReceipt(receipt);
              }}
              disabled={cancelingReceiptId === activeReceiptId}
              className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
            >
              <RotateCcw size={16} />
              {cancelingReceiptId === activeReceiptId ? "ກຳລັງຍົກເລີກ..." : "ຍົກເລີກຮັບເຂົ້າ"}
            </button>
          ) : null}
        </div>

        {loadingReceiptItems ? (
          <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm font-medium text-slate-500">ກຳລັງໂຫຼດ...</div>
        ) : activeReceiptItems.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm font-medium text-slate-500">
            {activeReceiptId ? "ບໍ່ພົບລາຍການໃນໃບຮັບເຂົ້ານີ້" : "ຍັງບໍ່ໄດ້ເລືອກໃບຮັບເຂົ້າ"}
          </div>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeReceiptItems.map((item) => (
              <div key={item.qr_label_id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-lg font-black text-slate-900">{item.order_code}</div>
                <div className="mt-1 text-sm font-medium text-slate-500">ລະຫັດບິນໂຮງງານ: {item.factory_bill_code?.trim() || "-"}</div>
                <div className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">ສະຖານະ QR: {item.label_status}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                    {item.customer_phone?.trim() ? item.customer_phone : item.customer_whatsapp?.trim() ? item.customer_whatsapp : "ບໍ່ມີເບີ"}
                  </span>
                  {getWhatsappContactOptions(item.customer_phone, item.customer_whatsapp).length > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        openWhatsappModal({
                          orderCode: item.order_code,
                          customerPhone: item.customer_phone,
                          customerWhatsapp: item.customer_whatsapp,
                          totalQty: item.total_qty,
                          balance: item.balance,
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                    >
                      <MessageCircleMore size={14} />
                      ເປີດແຊັດ
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-slate-400">ບໍ່ມີເບີ WhatsApp</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <WhatsappMessageModal
        key={whatsappTitle ? `${whatsappTitle}-${whatsappInitialPhone}` : "closed"}
        open={whatsappModalOpen}
        title={whatsappTitle}
        message={whatsappMessage}
        phoneOptions={whatsappPhones}
        initialPhone={whatsappInitialPhone}
        onClose={() => setWhatsappModalOpen(false)}
      />
    </div>
  );
}
