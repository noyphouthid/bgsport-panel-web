"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type FabricRow = {
  id: string;
  name: string;
  short_price: number;
  long_price: number;
};

type UserRow = {
  id: string;
  full_name: string;
  role: "admin" | "manager" | "staff" | "graphic" | "accountant";
  is_active: boolean;
};

type ImportMode = "insert_only" | "upsert";

type PreviewRow = {
  rowNo: number;
  valid: boolean;
  reason: string | null;
  orderCode: string;
  orderDate: string;
  adminName: string;
  graphicName: string;
  payload: Record<string, unknown> | null;
};

function parseDateOnly(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (Number.isFinite(serial) && serial >= 1) {
      const utcMs = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(utcMs);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function toOptionalIso(input: string) {
  const dateOnly = parseDateOnly(input);
  if (!dateOnly) return null;
  return new Date(`${dateOnly}T12:00:00`).toISOString();
}

function toNum(v: unknown) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function readFirst(row: Record<string, unknown>, keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

export default function ImportExcelPage() {
  const [fabrics, setFabrics] = useState<FabricRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [importMode, setImportMode] = useState<ImportMode>("insert_only");
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewFileName, setPreviewFileName] = useState("");
  const [importing, setImporting] = useState(false);

  const loadRefs = async () => {
    setLoading(true);
    setErr(null);
    const [{ data: fabricData, error: fabricError }, { data: userData, error: userError }] = await Promise.all([
      supabase.from("fabrics").select("id,name,short_price,long_price").order("name", { ascending: true }),
      supabase.from("users").select("id,full_name,role,is_active").eq("is_active", true).order("full_name", { ascending: true }),
    ]);

    if (fabricError) {
      setErr(fabricError.message);
      setLoading(false);
      return;
    }
    if (userError) {
      setErr(userError.message);
      setLoading(false);
      return;
    }

    setFabrics((fabricData ?? []) as FabricRow[]);
    setUsers((userData ?? []) as UserRow[]);
    setLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(() => void loadRefs(), 0);
    return () => clearTimeout(t);
  }, []);

  const adminByName = useMemo(
    () => new Map(users.filter((u) => u.role === "admin").map((u) => [u.full_name.toLowerCase(), u])),
    [users]
  );
  const graphicByName = useMemo(
    () => new Map(users.filter((u) => u.role === "graphic").map((u) => [u.full_name.toLowerCase(), u])),
    [users]
  );
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const fabricByName = useMemo(() => new Map(fabrics.map((f) => [f.name.toLowerCase(), f])), [fabrics]);
  const fabricById = useMemo(() => new Map(fabrics.map((f) => [f.id, f])), [fabrics]);

  const downloadTemplate = () => {
    const adminExample = users.find((u) => u.role === "admin")?.full_name ?? "Admin 1";
    const graphicExample = users.find((u) => u.role === "graphic")?.full_name ?? "Graphic 1";
    const fabricExample = fabrics[0]?.name ?? "Sport Fabric";

    const rows = [
      {
        order_date: new Date().toISOString().slice(0, 10),
        production_completed_at: "",
        customer_remaining_due_at: "",
        factory_payment_due_at: "",
        order_code: "PKF26-001",
        customer_phone: "020XXXXXXXX",
        factory_bill_code: "FB-001",
        fabric_name: fabricExample,
        fabric_id: "",
        short_qty: 10,
        long_qty: 5,
        free_qty: 0,
        qty_3xl: 0,
        qty_4xl: 0,
        qty_5xl: 0,
        extra_charge: 0,
        design_deposit: 0,
        initial_deposit: 500000,
        factory_cost: 700000,
        admin_name: adminExample,
        admin_user_id: "",
        graphic_name: graphicExample,
        graphic_user_id: "",
        status: "in_progress",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "orders_template");
    XLSX.writeFile(wb, "orders-import-template.xlsx");
  };

  const buildPreviewRows = (rawRows: Record<string, unknown>[]) => {
    return rawRows.map((row, idx) => {
      const orderDate = parseDateOnly(readFirst(row, ["order_date", "date"]));
      const orderCode = readFirst(row, ["order_code"]);
      const customerPhone = readFirst(row, ["customer_phone", "phone"]);
      const factoryBillCode = readFirst(row, ["factory_bill_code"]);
      const fabricName = readFirst(row, ["fabric_name"]);
      const fabricId = readFirst(row, ["fabric_id"]);
      const shortQty = Math.max(0, toNum(readFirst(row, ["short_qty"])));
      const longQty = Math.max(0, toNum(readFirst(row, ["long_qty"])));
      const freeQty = Math.max(0, toNum(readFirst(row, ["free_qty"])));
      const qty3xl = Math.max(0, toNum(readFirst(row, ["qty_3xl"])));
      const qty4xl = Math.max(0, toNum(readFirst(row, ["qty_4xl"])));
      const qty5xl = Math.max(0, toNum(readFirst(row, ["qty_5xl"])));
      const extraCharge = Math.max(0, toNum(readFirst(row, ["extra_charge"])));
      const designDeposit = Math.max(0, toNum(readFirst(row, ["design_deposit"])));
      const initialDeposit = Math.max(0, toNum(readFirst(row, ["initial_deposit"])));
      const factoryCost = Math.max(0, toNum(readFirst(row, ["factory_cost"])));

      const adminName = readFirst(row, ["admin_name"]);
      const adminUserId = readFirst(row, ["admin_user_id"]);
      const graphicName = readFirst(row, ["graphic_name"]);
      const graphicUserId = readFirst(row, ["graphic_user_id"]);

      const productionCompletedAt = toOptionalIso(readFirst(row, ["production_completed_at"]));
      const customerRemainingDueAt = toOptionalIso(readFirst(row, ["customer_remaining_due_at"]));
      const factoryPaymentDueAt = toOptionalIso(readFirst(row, ["factory_payment_due_at"]));
      const status = (readFirst(row, ["status"]) || "in_progress") as "in_progress" | "completed";

      if (!orderDate) {
        return { rowNo: idx + 2, valid: false, reason: "missing order_date", orderCode, orderDate, adminName, graphicName, payload: null } satisfies PreviewRow;
      }
      if (!orderCode) {
        return { rowNo: idx + 2, valid: false, reason: "missing order_code", orderCode, orderDate, adminName, graphicName, payload: null } satisfies PreviewRow;
      }

      const pickedFabric =
        (fabricId ? fabricById.get(fabricId) : null) ??
        (fabricName ? fabricByName.get(fabricName.toLowerCase()) : null) ??
        null;
      if (!pickedFabric) {
        return { rowNo: idx + 2, valid: false, reason: "fabric not found", orderCode, orderDate, adminName, graphicName, payload: null } satisfies PreviewRow;
      }

      const pickedAdmin =
        (adminUserId ? userById.get(adminUserId) : null) ??
        (adminName ? adminByName.get(adminName.toLowerCase()) : null) ??
        null;
      if (!pickedAdmin || pickedAdmin.role !== "admin") {
        return { rowNo: idx + 2, valid: false, reason: "admin not found", orderCode, orderDate, adminName, graphicName, payload: null } satisfies PreviewRow;
      }

      const pickedGraphic =
        (graphicUserId ? userById.get(graphicUserId) : null) ??
        (graphicName ? graphicByName.get(graphicName.toLowerCase()) : null) ??
        null;
      if (!pickedGraphic || pickedGraphic.role !== "graphic") {
        return { rowNo: idx + 2, valid: false, reason: "graphic not found", orderCode, orderDate, adminName, graphicName, payload: null } satisfies PreviewRow;
      }

      const sizeUpcharge = 20000;
      const shirtsTotal = shortQty * (Number(pickedFabric.short_price) || 0) + longQty * (Number(pickedFabric.long_price) || 0);
      const plusSizeTotal = (qty3xl + qty4xl + qty5xl) * sizeUpcharge;
      const grossTotal = shirtsTotal + plusSizeTotal + extraCharge;
      const netTotal = Math.max(0, grossTotal - designDeposit);
      const balance = Math.max(0, netTotal - initialDeposit);

      const payload: Record<string, unknown> = {
        order_date: orderDate,
        production_completed_at: productionCompletedAt,
        customer_remaining_due_at: customerRemainingDueAt,
        factory_payment_due_at: factoryPaymentDueAt,
        order_code: orderCode,
        customer_phone: customerPhone || null,
        factory_bill_code: factoryBillCode || null,
        admin_user_id: pickedAdmin.id,
        graphic_user_id: pickedGraphic.id,
        fabric_id: pickedFabric.id,
        fabric_name: pickedFabric.name,
        fabric_short_price: Number(pickedFabric.short_price) || 0,
        fabric_long_price: Number(pickedFabric.long_price) || 0,
        short_qty: shortQty,
        long_qty: longQty,
        free_qty: freeQty,
        qty_3xl: qty3xl,
        qty_4xl: qty4xl,
        qty_5xl: qty5xl,
        size_upcharge: sizeUpcharge,
        extra_charge: extraCharge,
        design_deposit: designDeposit,
        initial_deposit: initialDeposit,
        factory_cost: factoryCost,
        gross_total: grossTotal,
        net_total: netTotal,
        balance,
        status: status === "completed" ? "completed" : "in_progress",
      };

      return { rowNo: idx + 2, valid: true, reason: null, orderCode, orderDate, adminName: pickedAdmin.full_name, graphicName: pickedGraphic.full_name, payload } satisfies PreviewRow;
    });
  };

  const handleSelectExcel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setInfo(null);
    setPreviewRows([]);
    setPreviewFileName(file.name);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (rawRows.length === 0) {
        setErr("Excel has no rows");
        return;
      }
      setPreviewRows(buildPreviewRows(rawRows));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "read excel failed");
    } finally {
      e.target.value = "";
    }
  };

  const applyImport = async () => {
    if (previewRows.length === 0) {
      setErr("no preview rows");
      return;
    }
    const validPayloads = previewRows.filter((r) => r.valid && r.payload).map((r) => r.payload as Record<string, unknown>);
    if (validPayloads.length === 0) {
      setErr("no valid rows");
      return;
    }

    const dedup = new Map<string, Record<string, unknown>>();
    for (const p of validPayloads) {
      const code = String(p.order_code ?? "").trim();
      if (!code) continue;
      dedup.set(code, { ...p, order_code: code });
    }
    const payloads = [...dedup.values()];

    setImporting(true);
    setErr(null);
    setInfo(null);

    try {
      if (importMode === "upsert") {
        const { error } = await supabase.from("orders").upsert(payloads, { onConflict: "order_code" });
        if (error) {
          setErr(error.message);
          return;
        }
        setInfo(`Import success (upsert): ${payloads.length} rows`);
      } else {
        const codes = payloads.map((p) => String(p.order_code ?? "")).filter((s) => s.length > 0);
        const { data: exists, error: existError } = await supabase.from("orders").select("order_code").in("order_code", codes);
        if (existError) {
          setErr(existError.message);
          return;
        }
        const existing = new Set((exists ?? []).map((x) => x.order_code));
        const insertPayloads = payloads.filter((p) => !existing.has(String(p.order_code)));
        if (insertPayloads.length === 0) {
          setInfo("no new rows to insert");
          return;
        }
        const { error } = await supabase.from("orders").insert(insertPayloads);
        if (error) {
          setErr(error.message);
          return;
        }
        setInfo(`Import success (insert only): ${insertPayloads.length} rows`);
      }
    } finally {
      setImporting(false);
    }
  };

  const previewSummary = useMemo(() => {
    const valid = previewRows.filter((r) => r.valid).length;
    const invalid = previewRows.length - valid;
    return { total: previewRows.length, valid, invalid };
  }, [previewRows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Import Orders From Excel</h1>
        <div className="text-sm text-slate-500 font-medium">นำเข้าข้อมูลตาม schema ปัจจุบัน พร้อมตรวจสอบก่อนบันทึก</div>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm font-bold">Error: {err}</div>}
      {info && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm font-bold">{info}</div>}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <button
            onClick={downloadTemplate}
            disabled={loading}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-black hover:bg-indigo-700 disabled:opacity-50"
          >
            Download Template
          </button>

          <label className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-black hover:bg-emerald-700 cursor-pointer text-center">
            Select Excel
            <input type="file" accept=".xlsx,.xls" onChange={handleSelectExcel} className="hidden" />
          </label>

          <select
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as ImportMode)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-900"
          >
            <option value="insert_only">insert only</option>
            <option value="upsert">upsert (update + insert)</option>
          </select>

          <button
            onClick={applyImport}
            disabled={importing || previewSummary.valid === 0}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-black hover:bg-slate-800 disabled:opacity-50"
          >
            {importing ? "Importing..." : "Confirm Import"}
          </button>
        </div>

        <div className="text-xs font-bold text-slate-500">
          file: {previewFileName || "-"} | total: {previewSummary.total} | valid: {previewSummary.valid} | invalid: {previewSummary.invalid}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 text-sm font-black text-slate-700 uppercase">Preview</div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-600 sticky top-0">
              <tr>
                <th className="p-3 text-left text-xs font-black uppercase">row</th>
                <th className="p-3 text-left text-xs font-black uppercase">status</th>
                <th className="p-3 text-left text-xs font-black uppercase">order_code</th>
                <th className="p-3 text-left text-xs font-black uppercase">order_date</th>
                <th className="p-3 text-left text-xs font-black uppercase">admin</th>
                <th className="p-3 text-left text-xs font-black uppercase">graphic</th>
                <th className="p-3 text-left text-xs font-black uppercase">reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {previewRows.length === 0 ? (
                <tr>
                  <td className="p-8 text-center text-slate-400 font-medium" colSpan={7}>No preview data</td>
                </tr>
              ) : (
                previewRows.map((r) => (
                  <tr key={`${r.rowNo}-${r.orderCode}`}>
                    <td className="p-3 font-bold text-slate-600">{r.rowNo}</td>
                    <td className="p-3">
                      {r.valid ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black">PASS</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black">FAIL</span>
                      )}
                    </td>
                    <td className="p-3 font-black text-slate-900">{r.orderCode || "-"}</td>
                    <td className="p-3 text-slate-700">{r.orderDate || "-"}</td>
                    <td className="p-3 text-slate-700">{r.adminName || "-"}</td>
                    <td className="p-3 text-slate-700">{r.graphicName || "-"}</td>
                    <td className="p-3 text-xs font-bold text-rose-600">{r.reason ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

