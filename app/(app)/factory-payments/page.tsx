"use client";

import Link from "next/link";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";
import { ArrowRight, CheckCheck, FileUp, RefreshCw, Search, Trash2, Wallet } from "lucide-react";
import { isMissingOrderItemsTableError, type OrderItemRow } from "@/lib/order-items";
import { supabase } from "@/lib/supabase";

type OrderRow = {
  id: string;
  order_code: string;
  factory_bill_code: string | null;
  production_completed_at: string | null;
  short_qty: number;
  long_qty: number;
  free_qty: number;
  factory_cost: number;
  factory_paid_full_at: string | null;
};

type FactoryPaymentRow = {
  id: string;
  order_id: string;
  amount: number;
  paid_at: string;
  note: string | null;
  batch_id: string | null;
  created_at?: string | null;
};

type CandidateRow = OrderRow & {
  pants_qty: number;
  total_qty: number;
  paid_amount: number;
  outstanding_amount: number;
};

type PaymentHistoryRow = FactoryPaymentRow & {
  order_code: string;
  factory_bill_code: string | null;
};

type PaymentBatchSummary = {
  batch_id: string;
  paid_at: string;
  note: string | null;
  orders: number;
  amount: number;
};

type SearchPaidResult = {
  order_code: string;
  factory_bill_code: string | null;
  factory_paid_full_at: string | null;
};

type ImportedFactoryCodeStatus = "matched" | "already_selected" | "not_found" | "ambiguous";

type ImportedFactoryCodeResult = {
  code: string;
  raw_value: string;
  status: ImportedFactoryCodeStatus;
  order_id?: string;
  order_code?: string;
  factory_bill_code?: string | null;
  candidates?: number;
};

const FACTORY_PAYMENT_DRAFT_STORAGE_KEY = "bgsport.factory-payments.draft-selection";

function toDateOnly(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function normalizeCode(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function normalizeDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function getImportCodeKey(value: string | null | undefined) {
  const digitKey = normalizeDigits(value);
  if (digitKey) return digitKey;
  return normalizeCode(value);
}

function getOrderShirtQty(order: Pick<OrderRow, "short_qty" | "long_qty" | "free_qty">) {
  return (Number(order.short_qty) || 0) + (Number(order.long_qty) || 0) + (Number(order.free_qty) || 0);
}

function formatMoney(value: number) {
  return (Number(value) || 0).toLocaleString();
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  return fallback;
}

export default function FactoryPaymentsPage() {
  const [searchCode, setSearchCode] = useState("");
  const [searchPaidResult, setSearchPaidResult] = useState<SearchPaidResult | null>(null);
  const [availableRows, setAvailableRows] = useState<CandidateRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<CandidateRow[]>([]);
  const [availableLoaded, setAvailableLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [importingCodes, setImportingCodes] = useState(false);
  const [importedFileName, setImportedFileName] = useState("");
  const [importResults, setImportResults] = useState<ImportedFactoryCodeResult[]>([]);
  const [cancellingPaymentId, setCancellingPaymentId] = useState<string | null>(null);
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const restoredSelectedIdsRef = useRef<string[] | null>(null);
  const storageReadyRef = useRef(false);
  const restorePendingRef = useRef(false);

  const enrichOrders = async (orders: OrderRow[]) => {
    if (orders.length === 0) return [] as CandidateRow[];

    const ids = orders.map((order) => order.id);
    const [{ data: paymentData, error: paymentError }, { data: pantsItemData, error: pantsItemError }] = await Promise.all([
      supabase.from("factory_payments").select("id,order_id,amount,paid_at,note,batch_id,created_at").in("order_id", ids),
      supabase.from("order_items").select("order_id,product_type,qty,free_qty").in("order_id", ids).eq("product_type", "pants_printed"),
    ]);

    if (paymentError && !paymentError.message.includes("Could not find the table")) {
      throw paymentError;
    }
    if (pantsItemError && !isMissingOrderItemsTableError(pantsItemError)) {
      throw pantsItemError;
    }

    const paidByOrder = new Map<string, number>();
    ((paymentData ?? []) as FactoryPaymentRow[]).forEach((row) => {
      paidByOrder.set(row.order_id, (paidByOrder.get(row.order_id) || 0) + (Number(row.amount) || 0));
    });

    const pantsQtyByOrder = ((pantsItemData ?? []) as Pick<OrderItemRow, "order_id" | "qty" | "free_qty">[]).reduce<Map<string, number>>(
      (acc, item) => {
        const total = (Number(item.qty) || 0) + (Number(item.free_qty) || 0);
        acc.set(item.order_id, (acc.get(item.order_id) || 0) + total);
        return acc;
      },
      new Map<string, number>()
    );

    return orders
      .map((order) => {
        const shirtQty = getOrderShirtQty(order);
        const pantsQty = pantsQtyByOrder.get(order.id) || 0;
        const paidAmount = paidByOrder.get(order.id) || 0;
        const outstandingAmount = Math.max(0, (Number(order.factory_cost) || 0) - paidAmount);

        return {
          ...order,
          pants_qty: pantsQty,
          total_qty: shirtQty + pantsQty,
          paid_amount: paidAmount,
          outstanding_amount: outstandingAmount,
        } satisfies CandidateRow;
      })
      .filter((order) => order.outstanding_amount > 0)
      .sort((a, b) => {
        const amountDiff = b.outstanding_amount - a.outstanding_amount;
        if (amountDiff !== 0) return amountDiff;
        return a.order_code.localeCompare(b.order_code);
      });
  };

  const refreshFactoryPaidStatus = async (orderIds: string[]) => {
    const uniqueIds = Array.from(new Set(orderIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;

    const [{ data: ordersData, error: ordersError }, { data: paymentsData, error: paymentsError }] = await Promise.all([
      supabase.from("orders").select("id,factory_cost").in("id", uniqueIds),
      supabase.from("factory_payments").select("order_id,amount,paid_at").in("order_id", uniqueIds),
    ]);

    if (ordersError) throw ordersError;
    if (paymentsError && !paymentsError.message.includes("Could not find the table")) {
      throw paymentsError;
    }

    const paymentRows = (paymentsData ?? []) as Array<{ order_id: string; amount: number; paid_at: string }>;
    const paymentSummary = new Map<string, { totalPaid: number; latestPaidAt: string | null }>();

    paymentRows.forEach((row) => {
      const current = paymentSummary.get(row.order_id) || { totalPaid: 0, latestPaidAt: null };
      const amount = Number(row.amount) || 0;
      const latestPaidAt =
        !current.latestPaidAt || row.paid_at > current.latestPaidAt ? row.paid_at : current.latestPaidAt;
      paymentSummary.set(row.order_id, { totalPaid: current.totalPaid + amount, latestPaidAt });
    });

    await Promise.all(
      ((ordersData ?? []) as Array<{ id: string; factory_cost: number }>).map((order) => {
        const summary = paymentSummary.get(order.id);
        const fullyPaid = (summary?.totalPaid || 0) >= (Number(order.factory_cost) || 0) && Number(order.factory_cost) > 0;
        return supabase
          .from("orders")
          .update({ factory_paid_full_at: fullyPaid ? summary?.latestPaidAt ?? new Date().toISOString() : null })
          .eq("id", order.id);
      })
    );
  };

  const loadAvailableOrders = async () => {
    setLoading(true);
    setErr(null);

    try {
      const { data, error } = await supabase
        .from("orders")
        .select("id,order_code,factory_bill_code,production_completed_at,short_qty,long_qty,free_qty,factory_cost,factory_paid_full_at")
        .not("production_completed_at", "is", null)
        .is("factory_paid_full_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const enriched = await enrichOrders((data ?? []) as OrderRow[]);
      setAvailableRows(enriched);
      setAvailableLoaded(true);
    } catch (error) {
      const message = getErrorMessage(error, "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ");
      setErr(message);
      setAvailableRows([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPaymentHistory = async () => {
    setHistoryLoading(true);

    try {
      const { data: paymentData, error: paymentError } = await supabase
        .from("factory_payments")
        .select("id,order_id,amount,paid_at,note,batch_id,created_at")
        .order("paid_at", { ascending: false })
        .limit(200);

      if (paymentError) {
        if (paymentError.message.includes("Could not find the table")) {
          setPaymentHistory([]);
          return;
        }
        throw paymentError;
      }

      const rows = (paymentData ?? []) as FactoryPaymentRow[];
      if (rows.length === 0) {
        setPaymentHistory([]);
        return;
      }

      const orderIds = Array.from(new Set(rows.map((row) => row.order_id)));
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("id,order_code,factory_bill_code")
        .in("id", orderIds);

      if (orderError) throw orderError;

      const ordersById = new Map(
        ((orderData ?? []) as Array<{ id: string; order_code: string; factory_bill_code: string | null }>).map((row) => [
          row.id,
          row,
        ])
      );

      setPaymentHistory(
        rows.map((row) => ({
          ...row,
          order_code: ordersById.get(row.order_id)?.order_code || "-",
          factory_bill_code: ordersById.get(row.order_id)?.factory_bill_code || null,
        }))
      );
    } catch (error) {
      const message = getErrorMessage(error, "ໂຫຼດປະຫວັດການຈ່າຍບໍ່ສຳເລັດ");
      setErr(message);
      setPaymentHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadAll = async () => {
    await Promise.all([loadAvailableOrders(), loadPaymentHistory()]);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(FACTORY_PAYMENT_DRAFT_STORAGE_KEY);
      if (!raw) {
        restorePendingRef.current = false;
        storageReadyRef.current = true;
        return;
      }

      const parsed = JSON.parse(raw) as {
        selectedOrderIds?: unknown;
        searchCode?: unknown;
        savedAt?: unknown;
      };

      restoredSelectedIdsRef.current = Array.isArray(parsed.selectedOrderIds)
        ? parsed.selectedOrderIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
      restorePendingRef.current = restoredSelectedIdsRef.current.length > 0;

      if (typeof parsed.searchCode === "string" && parsed.searchCode.trim()) {
        setSearchCode(parsed.searchCode);
      }

      if (typeof parsed.savedAt === "string" && parsed.savedAt.trim()) {
        setDraftSavedAt(parsed.savedAt);
      }
    } catch {
      window.localStorage.removeItem(FACTORY_PAYMENT_DRAFT_STORAGE_KEY);
    } finally {
      storageReadyRef.current = true;
    }
  }, []);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!availableLoaded) return;

    const restoredIds = restoredSelectedIdsRef.current ?? [];
    if (restoredIds.length === 0 && selectedRows.length === 0) {
      restorePendingRef.current = false;
      return;
    }

    setSelectedRows((prev) => {
      const preservedOrder = prev.length > 0 ? prev.map((row) => row.id) : restoredIds;
      const nextIds = Array.from(new Set(preservedOrder));
      const availableById = new Map(availableRows.map((row) => [row.id, row]));

      return nextIds.map((id) => availableById.get(id)).filter((row): row is CandidateRow => Boolean(row));
    });
    restoredSelectedIdsRef.current = null;
    restorePendingRef.current = false;
  }, [availableLoaded, availableRows, selectedRows.length]);

  useEffect(() => {
    if (typeof window === "undefined" || !storageReadyRef.current || restorePendingRef.current) return;

    const savedAt = new Date().toISOString();
    const payload = {
      selectedOrderIds: selectedRows.map((row) => row.id),
      searchCode,
      savedAt,
    };

    window.localStorage.setItem(FACTORY_PAYMENT_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    setDraftSavedAt(savedAt);
  }, [searchCode, selectedRows]);

  const selectedIds = useMemo(() => new Set(selectedRows.map((row) => row.id)), [selectedRows]);

  const availableFactoryCodeMaps = useMemo(() => {
    const exact = new Map<string, CandidateRow>();
    const digits = new Map<string, CandidateRow[]>();

    availableRows.forEach((row) => {
      const exactKey = normalizeCode(row.factory_bill_code);
      if (exactKey && !exact.has(exactKey)) {
        exact.set(exactKey, row);
      }

      const digitKey = normalizeDigits(row.factory_bill_code);
      if (!digitKey) return;
      digits.set(digitKey, [...(digits.get(digitKey) ?? []), row]);
    });

    return { exact, digits };
  }, [availableRows]);

  const filteredAvailableRows = useMemo(() => {
    const keyword = normalizeCode(searchCode);
    if (!keyword) return availableRows;

    return availableRows.filter((row) => {
      const orderCode = normalizeCode(row.order_code);
      const factoryCode = normalizeCode(row.factory_bill_code);
      return orderCode.includes(keyword) || factoryCode.includes(keyword);
    });
  }, [availableRows, searchCode]);

  const availableSummary = useMemo(() => {
    return availableRows.reduce(
      (acc, row) => {
        acc.orders += 1;
        acc.shirts += row.total_qty;
        acc.outstanding += row.outstanding_amount;
        return acc;
      },
      { orders: 0, shirts: 0, outstanding: 0 }
    );
  }, [availableRows]);

  const filteredSummary = useMemo(() => {
    return filteredAvailableRows.reduce(
      (acc, row) => {
        acc.orders += 1;
        acc.outstanding += row.outstanding_amount;
        return acc;
      },
      { orders: 0, outstanding: 0 }
    );
  }, [filteredAvailableRows]);

  const selectedSummary = useMemo(() => {
    return selectedRows.reduce(
      (acc, row) => {
        acc.orders += 1;
        acc.shirts += row.total_qty;
        acc.amount += row.outstanding_amount;
        return acc;
      },
      { orders: 0, shirts: 0, amount: 0 }
    );
  }, [selectedRows]);

  const paymentBatches = useMemo(() => {
    const grouped = new Map<string, PaymentBatchSummary>();

    paymentHistory.forEach((row) => {
      if (!row.batch_id) return;
      const current = grouped.get(row.batch_id) || {
        batch_id: row.batch_id,
        paid_at: row.paid_at,
        note: row.note,
        orders: 0,
        amount: 0,
      };

      current.orders += 1;
      current.amount += Number(row.amount) || 0;
      if (row.paid_at > current.paid_at) current.paid_at = row.paid_at;
      if (!current.note && row.note) current.note = row.note;
      grouped.set(row.batch_id, current);
    });

    return Array.from(grouped.values()).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  }, [paymentHistory]);

  const importSummary = useMemo(() => {
    return importResults.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.status] += 1;
        return acc;
      },
      { total: 0, matched: 0, already_selected: 0, not_found: 0, ambiguous: 0 }
    );
  }, [importResults]);

  const addToSelection = (row: CandidateRow) => {
    if (selectedIds.has(row.id)) {
      toast("ອໍເດີນີ້ຢູ່ໃນລາຍການແລ້ວ");
      return;
    }

    setSelectedRows((prev) => [...prev, row]);
  };

  const removeFromSelection = (id: string) => {
    setSelectedRows((prev) => prev.filter((row) => row.id !== id));
  };

  const lookupPaidOrderByCode = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return null;

    const [{ data: orderCodeMatches, error: orderCodeError }, { data: factoryCodeMatches, error: factoryCodeError }] =
      await Promise.all([
        supabase
          .from("orders")
          .select("order_code,factory_bill_code,factory_paid_full_at")
          .ilike("order_code", code)
          .limit(1),
        supabase
          .from("orders")
          .select("order_code,factory_bill_code,factory_paid_full_at")
          .ilike("factory_bill_code", code)
          .limit(1),
      ]);

    if (orderCodeError) throw orderCodeError;
    if (factoryCodeError) throw factoryCodeError;

    const matches = [...((orderCodeMatches ?? []) as SearchPaidResult[]), ...((factoryCodeMatches ?? []) as SearchPaidResult[])];
    const found = matches.find(
      (row) =>
        normalizeCode(row.order_code) === normalizeCode(code) || normalizeCode(row.factory_bill_code) === normalizeCode(code)
    );

    if (!found?.factory_paid_full_at) return null;
    return found;
  };

  const handleSelectAllFiltered = () => {
    const unselectedRows = filteredAvailableRows.filter((row) => !selectedIds.has(row.id));
    if (unselectedRows.length === 0) {
      toast("ລາຍການທີ່ຄົ້ນຫາຖືກເລືອກຄົບແລ້ວ");
      return;
    }

    setSelectedRows((prev) => [...prev, ...unselectedRows]);
    toast.success(`ເລືອກເພີ່ມ ${unselectedRows.length} ລາຍການ`);
  };

  const clearSelection = () => {
    setSelectedRows([]);
  };

  const handleImportFactoryCodes = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (loading) {
      toast.error("ກຳລັງໂຫຼດລາຍການຄ້າງຈ່າຍ, ກະລຸນາລໍຖ້າກ່ອນ");
      e.target.value = "";
      return;
    }

    setImportingCodes(true);
    setErr(null);
    setImportResults([]);
    setImportedFileName(file.name);

    try {
      const rawText = await file.text();
      const workbook = XLSX.read(rawText, { type: "string", raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      });

      const candidates: Array<{ rawValue: string; key: string }> = [];
      const seen = new Set<string>();

      matrix.forEach((row) => {
        row.forEach((cell) => {
          const rawValue = String(cell ?? "").trim();
          if (!rawValue) return;

          const key = getImportCodeKey(rawValue);
          if (!key || seen.has(key)) return;

          seen.add(key);
          candidates.push({ rawValue, key });
        });
      });

      if (candidates.length === 0) {
        const message = "CSV ບໍ່ພົບລະຫັດໂຮງງານສຳລັບນຳເຂົ້າ";
        setErr(message);
        setImportedFileName(file.name);
        toast.error(message);
        return;
      }

      const matchedRows: CandidateRow[] = [];
      const matchedIds = new Set<string>();
      const results: ImportedFactoryCodeResult[] = candidates.map(({ rawValue }) => {
        const exactMatch = availableFactoryCodeMaps.exact.get(normalizeCode(rawValue));
        const digitMatches = availableFactoryCodeMaps.digits.get(normalizeDigits(rawValue)) ?? [];
        const matchedRow = exactMatch ?? (digitMatches.length === 1 ? digitMatches[0] : null);
        const displayCode = normalizeDigits(rawValue) || rawValue.trim();

        if (matchedRow) {
          if (selectedIds.has(matchedRow.id) || matchedIds.has(matchedRow.id)) {
            return {
              code: displayCode,
              raw_value: rawValue,
              status: "already_selected",
              order_id: matchedRow.id,
              order_code: matchedRow.order_code,
              factory_bill_code: matchedRow.factory_bill_code,
            } satisfies ImportedFactoryCodeResult;
          }

          matchedRows.push(matchedRow);
          matchedIds.add(matchedRow.id);
          return {
            code: displayCode,
            raw_value: rawValue,
            status: "matched",
            order_id: matchedRow.id,
            order_code: matchedRow.order_code,
            factory_bill_code: matchedRow.factory_bill_code,
          } satisfies ImportedFactoryCodeResult;
        }

        if (!exactMatch && digitMatches.length > 1) {
          return {
            code: displayCode,
            raw_value: rawValue,
            status: "ambiguous",
            candidates: digitMatches.length,
          } satisfies ImportedFactoryCodeResult;
        }

        return {
          code: displayCode,
          raw_value: rawValue,
          status: "not_found",
        } satisfies ImportedFactoryCodeResult;
      });

      if (matchedRows.length > 0) {
        setSelectedRows((prev) => [...prev, ...matchedRows]);
      }

      setImportResults(results);

      const matchedCount = results.filter((row) => row.status === "matched").length;
      const duplicateCount = results.filter((row) => row.status === "already_selected").length;
      const notFoundCount = results.filter((row) => row.status === "not_found").length;
      const ambiguousCount = results.filter((row) => row.status === "ambiguous").length;

      if (matchedCount > 0) {
        toast.success(
          `ນຳເຂົ້າສຳເລັດ: ເພີ່ມ ${matchedCount} ລາຍການ` +
            (duplicateCount > 0 ? `, ມີຊ້ຳ ${duplicateCount}` : "") +
            (notFoundCount > 0 ? `, ບໍ່ພົບ ${notFoundCount}` : "") +
            (ambiguousCount > 0 ? `, ກົງຫຼາຍລາຍການ ${ambiguousCount}` : "")
        );
      } else if (duplicateCount > 0 && notFoundCount === 0 && ambiguousCount === 0) {
        toast("ລາຍການໃນ CSV ຖືກເລືອກໄວ້ແລ້ວທັງໝົດ");
      } else {
        toast("ອ່ານ CSV ສຳເລັດ ແຕ່ບໍ່ມີລາຍການໃໝ່ຖືກເພີ່ມ");
      }
    } catch (error) {
      const message = getErrorMessage(error, "ອ່ານໄຟລ໌ CSV ບໍ່ສຳເລັດ");
      setErr(message);
      setImportResults([]);
      toast.error(message);
    } finally {
      setImportingCodes(false);
      e.target.value = "";
    }
  };

  useEffect(() => {
    const keyword = searchCode.trim();
    if (!keyword) {
      setSearchPaidResult(null);
      return;
    }

    const exactUnpaidMatch = availableRows.some((row) => {
      const orderCode = normalizeCode(row.order_code);
      const factoryCode = normalizeCode(row.factory_bill_code);
      const normalizedKeyword = normalizeCode(keyword);
      return orderCode === normalizedKeyword || factoryCode === normalizedKeyword;
    });

    if (exactUnpaidMatch) {
      setSearchPaidResult(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const found = await lookupPaidOrderByCode(keyword);
          if (!cancelled) setSearchPaidResult(found);
        } catch {
          if (!cancelled) setSearchPaidResult(null);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [availableRows, searchCode]);

  useEffect(() => {
    const keyword = normalizeCode(searchCode);
    if (!keyword) return;

    const exactMatches = availableRows.filter((row) => {
      const orderCode = normalizeCode(row.order_code);
      const factoryCode = normalizeCode(row.factory_bill_code);
      return orderCode === keyword || factoryCode === keyword;
    });

    if (exactMatches.length !== 1) return;
    if (selectedIds.has(exactMatches[0].id)) return;

    addToSelection(exactMatches[0]);
    setSearchCode("");
    setSearchPaidResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableRows, searchCode, selectedIds]);

  const handlePayAll = async () => {
    if (selectedRows.length === 0) {
      toast.error("ຍັງບໍ່ມີລາຍການໃຫ້ຈ່າຍ");
      return;
    }

    const confirmed = window.confirm(`ຢືນຢັນຈ່າຍຄ່າໂຮງງານ ${selectedRows.length} ລາຍການ ຫຼື ບໍ່?`);
    if (!confirmed) return;

    setPaying(true);
    setErr(null);

    try {
      const paidAt = new Date().toISOString();
      const batchId = crypto.randomUUID();
      const payload = selectedRows.map((row) => ({
        order_id: row.id,
        amount: row.outstanding_amount,
        paid_at: paidAt,
        batch_id: batchId,
        note: "ຈ່າຍຄ່າໂຮງງານແບບກຸ່ມ",
      }));

      const { error: insertError } = await supabase.from("factory_payments").insert(payload);
      if (insertError) throw insertError;

      const completedIds = selectedRows.map((row) => row.id);
      await refreshFactoryPaidStatus(completedIds);

      toast.success(`ບັນທຶກການຈ່າຍແລ້ວ ${selectedRows.length} ລາຍການ`);
      setSelectedRows([]);
      setSearchCode("");
      await loadAll();
    } catch (error) {
      const message = getErrorMessage(error, "ຈ່າຍທັງໝົດບໍ່ສຳເລັດ");
      setErr(message);
      toast.error(message);
    } finally {
      setPaying(false);
    }
  };

  const handleCancelPayment = async (payment: PaymentHistoryRow) => {
    const confirmed = window.confirm(
      `ຢືນຢັນຍົກເລີກການຈ່າຍຂອງ ${payment.order_code} ຈຳນວນ ${formatMoney(payment.amount)} ຫຼື ບໍ່?`
    );
    if (!confirmed) return;

    setCancellingPaymentId(payment.id);
    setErr(null);

    try {
      const { error } = await supabase.from("factory_payments").delete().eq("id", payment.id);
      if (error) throw error;

      await refreshFactoryPaidStatus([payment.order_id]);
      toast.success(`ຍົກເລີກການຈ່າຍຂອງ ${payment.order_code} ແລ້ວ`);
      await loadAll();
    } catch (error) {
      const message = getErrorMessage(error, "ຍົກເລີກການຈ່າຍບໍ່ສຳເລັດ");
      setErr(message);
      toast.error(message);
    } finally {
      setCancellingPaymentId(null);
    }
  };

  const handleCancelBatch = async (batch: PaymentBatchSummary) => {
    const relatedRows = paymentHistory.filter((row) => row.batch_id === batch.batch_id);
    if (relatedRows.length === 0) {
      toast.error("ບໍ່ພົບລາຍການຈ່າຍຂອງກຸ່ມນີ້");
      return;
    }

    const confirmed = window.confirm(
      `ຢືນຢັນຍົກເລີກການຈ່າຍແບບກຸ່ມ ${relatedRows.length} ລາຍການ ລວມ ${formatMoney(batch.amount)} ຫຼື ບໍ່?`
    );
    if (!confirmed) return;

    setCancellingBatchId(batch.batch_id);
    setErr(null);

    try {
      const { error } = await supabase.from("factory_payments").delete().eq("batch_id", batch.batch_id);
      if (error) throw error;

      await refreshFactoryPaidStatus(relatedRows.map((row) => row.order_id));
      toast.success(`ຍົກເລີກການຈ່າຍແບບກຸ່ມແລ້ວ ${relatedRows.length} ລາຍການ`);
      await loadAll();
    } catch (error) {
      const message = getErrorMessage(error, "ຍົກເລີກການຈ່າຍແບບກຸ່ມບໍ່ສຳເລັດ");
      setErr(message);
      toast.error(message);
    } finally {
      setCancellingBatchId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-100">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.3fr,0.7fr] lg:p-7">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-white/90">
              <Wallet size={14} />
              Factory Payments
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">ອໍເດີ້ຄ້າງຈ່າຍໂຮງງານ</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-emerald-50/95">
              ໜ້ານີ້ຈະສະແດງສະເພາະອໍເດີ້ທີ່ຍັງບໍ່ຈ່າຍຄ່າໂຮງງານຄົບ ເພື່ອໃຫ້ຄົ້ນຫາ, ເລືອກ ແລະ ບັນທຶກການຈ່າຍໄດ້ງ່າຍຂຶ້ນ.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="rounded-2xl bg-white/14 p-4 backdrop-blur">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-50/80">ອໍເດີ້ຄ້າງຈ່າຍ</div>
              <div className="mt-2 text-3xl font-black">{availableSummary.orders.toLocaleString()}</div>
              <div className="mt-1 text-sm font-medium text-emerald-50/90">ລາຍການທີ່ພ້ອມຈ່າຍ</div>
            </div>
            <div className="rounded-2xl bg-slate-950/18 p-4 backdrop-blur">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/75">ຍອດຄ້າງທັງໝົດ</div>
              <div className="mt-2 text-3xl font-black">{formatMoney(availableSummary.outstanding)}</div>
              <div className="mt-1 text-sm font-medium text-white/80">ຍັງບໍ່ໄດ້ຈ່າຍຄ່າໂຮງງານ</div>
            </div>
          </div>
        </div>
      </section>

      {err && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">ຂໍ້ຜິດພາດ: {err}</div>}

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr,auto] lg:items-end">
          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-500">
              ຄົ້ນຫາອໍເດີ / ລະຫັດໂຮງງານ
            </label>
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchCode}
                onChange={(e) => {
                  setSearchCode(e.target.value);
                  if (!e.target.value.trim()) setSearchPaidResult(null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const firstRow = filteredAvailableRows.find((row) => !selectedIds.has(row.id));
                  if (firstRow) {
                    addToSelection(firstRow);
                    setSearchPaidResult(null);
                  }
                }}
                placeholder="ພິມ PK26-001 / PKF26-001 / FACTORY-001"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div className="mt-2 text-xs font-medium text-slate-500">
              ຖ້າພິມລະຫັດແລ້ວກົງກັບອໍເດີພຽງ 1 ລາຍການ ລະບົບຈະເລືອກໃຫ້ອັດຕະໂນມັດ
            </div>
            {searchPaidResult && (
              <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                ອໍເດີ້ {searchPaidResult.order_code}
                {searchPaidResult.factory_bill_code ? ` (${searchPaidResult.factory_bill_code})` : ""} ຈ່າຍຄ່າໂຮງງານແລ້ວ
                {searchPaidResult.factory_paid_full_at ? ` ໃນວັນທີ ${toDateOnly(searchPaidResult.factory_paid_full_at)}` : ""}
              </div>
            )}

            <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Import CSV ລະຫັດໂຮງງານ</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    ອ່ານທຸກ cell ໃນ CSV ແລະດຶງສະເພາະເລກລະຫັດໄປຈັບຄູ່ກັບ `factory_bill_code`
                  </div>
                  <div className="mt-1 text-xs font-medium text-slate-500">
                    ແນະນຳໃຫ້ CSV ມີສະເພາະຄໍລຳລະຫັດໂຮງງານ ເພື່ອຫຼຸດການຈັບຄູ່ຜິດ
                  </div>
                </div>

                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-50">
                  <FileUp size={16} />
                  {importingCodes ? "ກຳລັງອ່ານ CSV..." : "ເລືອກໄຟລ໌ CSV"}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleImportFactoryCodes}
                    disabled={importingCodes || loading}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="mt-3 text-xs font-medium text-slate-500">ໄຟລ໌ລ່າສຸດ: {importedFileName || "-"}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadAll}
              disabled={loading || historyLoading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading || historyLoading ? "animate-spin" : ""} />
              {loading || historyLoading ? "ກຳລັງໂຫຼດ..." : "ໂຫຼດໃໝ່"}
            </button>
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              disabled={filteredAvailableRows.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              <CheckCheck size={16} />
              ເລືອກທັງໝົດ
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedRows.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
            >
              <Trash2 size={16} />
              ລ້າງລາຍການ
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">ຜົນຄົ້ນຫາ</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{filteredSummary.orders.toLocaleString()}</div>
            <div className="mt-1 text-sm font-medium text-slate-500">ຈາກ {availableSummary.orders.toLocaleString()} ອໍເດີ້ຄ້າງຈ່າຍ</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">ຍອດຄ້າງທີ່ກຳລັງເຫັນ</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{formatMoney(filteredSummary.outstanding)}</div>
            <div className="mt-1 text-sm font-medium text-slate-500">ຫຼັງຈາກ filter ປັດຈຸບັນ</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">ເລືອກໄວ້</div>
            <div className="mt-2 text-2xl font-black text-amber-900">{selectedSummary.orders.toLocaleString()}</div>
            <div className="mt-1 text-sm font-medium text-amber-700">{selectedSummary.shirts.toLocaleString()} ຕົວ</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">ຍອດຈ່າຍຮອບນີ້</div>
            <div className="mt-2 text-2xl font-black text-emerald-800">{formatMoney(selectedSummary.amount)}</div>
            <div className="mt-1 text-sm font-medium text-emerald-700">ກົດປຸ່ມດ້ານລຸ່ມເພື່ອບັນທຶກ</div>
          </div>
        </div>

        {importResults.length > 0 && (
          <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">ຜົນການ Import CSV</div>
                <div className="mt-1 text-lg font-black text-slate-900">{importSummary.total.toLocaleString()} ລະຫັດ</div>
              </div>
              <div className="text-xs font-medium text-slate-500">ໄຟລ໌: {importedFileName || "-"}</div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">ເພີ່ມໄດ້</div>
                <div className="mt-2 text-2xl font-black text-emerald-800">{importSummary.matched.toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">ມີຢູ່ໃນ selection</div>
                <div className="mt-2 text-2xl font-black text-amber-800">{importSummary.already_selected.toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-rose-700">ບໍ່ພົບ</div>
                <div className="mt-2 text-2xl font-black text-rose-800">{importSummary.not_found.toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">ກົງຫຼາຍລາຍການ</div>
                <div className="mt-2 text-2xl font-black text-blue-800">{importSummary.ambiguous.toLocaleString()}</div>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-3xl border border-slate-100">
              <div className="max-h-[320px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="p-3 text-left text-[11px] font-black uppercase">ລະຫັດທີ່ອ່ານໄດ້</th>
                      <th className="p-3 text-left text-[11px] font-black uppercase">ສະຖານະ</th>
                      <th className="p-3 text-left text-[11px] font-black uppercase">ອໍເດີທີ່ຈັບຄູ່ໄດ້</th>
                      <th className="p-3 text-left text-[11px] font-black uppercase">ລະຫັດໂຮງງານໃນຖານຂໍ້ມູນ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {importResults.map((row) => (
                      <tr key={`${row.code}-${row.raw_value}`} className="hover:bg-slate-50/70">
                        <td className="p-3 font-black text-slate-900">{row.code}</td>
                        <td className="p-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                              row.status === "matched"
                                ? "bg-emerald-100 text-emerald-700"
                                : row.status === "already_selected"
                                  ? "bg-amber-100 text-amber-700"
                                  : row.status === "ambiguous"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {row.status === "matched"
                              ? "ເພີ່ມແລ້ວ"
                              : row.status === "already_selected"
                                ? "ເລືອກໄວ້ແລ້ວ"
                                : row.status === "ambiguous"
                                  ? `ກົງ ${row.candidates?.toLocaleString() || 0} ລາຍການ`
                                  : "ບໍ່ພົບ"}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-slate-700">{row.order_code || "-"}</td>
                        <td className="p-3 font-medium text-slate-600">{row.factory_bill_code?.trim() || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">ລາຍການທີ່ເລືອກ</div>
            <div className="mt-2 text-xl font-black text-slate-900">
              {selectedSummary.orders.toLocaleString()} ອໍເດີ້ / {formatMoney(selectedSummary.amount)}
            </div>
            <div className="mt-2 text-xs font-medium text-slate-500">
              Draft ຖືກບັນທຶກອັດຕະໂນມັດ{draftSavedAt ? ` • ລ່າສຸດ ${toDateOnly(draftSavedAt)}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={handlePayAll}
            disabled={paying || selectedRows.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            <Wallet size={18} />
            {paying ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກການຈ່າຍທີ່ເລືອກ"}
          </button>
        </div>

        {selectedRows.length === 0 ? (
          <div className="py-10 text-center text-sm font-medium text-slate-400">ຍັງບໍ່ມີອໍເດີ້ທີ່ເລືອກ</div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-3xl border border-slate-100">
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ລຳດັບ</th>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ອໍເດີ</th>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ລະຫັດໂຮງງານ</th>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ຈຳນວນເສື້ອ</th>
                    <th className="p-3 text-right text-[11px] font-black uppercase">ຈຳນວນເງິນ</th>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ວັນຜະລິດສຳເລັດ</th>
                    <th className="p-3 text-center text-[11px] font-black uppercase">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {selectedRows.map((row, index) => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-black text-slate-900">{index + 1}</td>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{row.order_code}</div>
                        <div className="mt-1 text-xs font-medium text-slate-500">ຈ່າຍແລ້ວ {formatMoney(row.paid_amount)}</div>
                      </td>
                      <td className="p-3 font-medium text-slate-600">{row.factory_bill_code?.trim() || "-"}</td>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{row.total_qty.toLocaleString()} ຕົວ</div>
                      </td>
                      <td className="p-3 text-right font-black text-emerald-700">{formatMoney(row.outstanding_amount)}</td>
                      <td className="p-3 font-medium text-slate-600">{toDateOnly(row.production_completed_at)}</td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeFromSelection(row.id)}
                          className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-black text-rose-600 transition hover:bg-rose-50"
                        >
                          ຍົກເລີກ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">ລາຍຊຳລະແຕ່ລະງວດ</div>
              <div className="mt-1 text-lg font-black text-slate-900">{paymentBatches.length.toLocaleString()} ງວດ</div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {historyLoading && paymentBatches.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-500">ກຳລັງໂຫຼດ...</div>
            ) : paymentBatches.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-400">ຍັງບໍ່ມີລາຍຊຳລະແຕ່ລະງວດ</div>
            ) : (
              paymentBatches.slice(0, 12).map((batch) => (
                <div key={batch.batch_id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-black text-slate-900">{toDateOnly(batch.paid_at)}</div>
                      <div className="mt-1 text-xs font-medium text-slate-500">{batch.note || "ຈ່າຍຄ່າໂຮງງານແບບກຸ່ມ"}</div>
                      <div className="mt-2 text-sm font-bold text-slate-700">
                        {batch.orders.toLocaleString()} ອໍເດີ້ / {formatMoney(batch.amount)}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Link
                          href={`/factory-payments/batches/${batch.batch_id}`}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                        >
                          ເບິ່ງລາຍການ
                          <ArrowRight size={15} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleCancelBatch(batch)}
                          disabled={cancellingBatchId === batch.batch_id}
                          className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                        >
                          {cancellingBatchId === batch.batch_id ? "ກຳລັງຍົກເລີກ..." : "ຍົກເລີກ"}
                        </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">ປະຫວັດການຈ່າຍລາຍອໍເດີ</div>
              <div className="mt-1 text-lg font-black text-slate-900">{paymentHistory.length.toLocaleString()} ລາຍການຫຼ້າສຸດ</div>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
            <div className="max-h-[540px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ອໍເດີ</th>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ລະຫັດໂຮງງານ</th>
                    <th className="p-3 text-right text-[11px] font-black uppercase">ຈຳນວນເງິນ</th>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ວັນທີຈ່າຍ</th>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ປະເພດ</th>
                    <th className="p-3 text-center text-[11px] font-black uppercase">ຍົກເລີກ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {!historyLoading && paymentHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center font-medium text-slate-400">
                        ຍັງບໍ່ມີປະຫວັດການຈ່າຍ
                      </td>
                    </tr>
                  ) : (
                    paymentHistory.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="p-3 font-black text-slate-900">{row.order_code}</td>
                        <td className="p-3 font-medium text-slate-600">{row.factory_bill_code?.trim() || "-"}</td>
                        <td className="p-3 text-right font-black text-emerald-700">{formatMoney(row.amount)}</td>
                        <td className="p-3 font-medium text-slate-600">{toDateOnly(row.paid_at)}</td>
                        <td className="p-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                              row.batch_id ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {row.batch_id ? "ກຸ່ມ" : "ດ່ຽວ"}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleCancelPayment(row)}
                            disabled={cancellingPaymentId === row.id}
                            className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-black text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                          >
                            {cancellingPaymentId === row.id ? "ກຳລັງຍົກເລີກ..." : "ຍົກເລີກ"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
