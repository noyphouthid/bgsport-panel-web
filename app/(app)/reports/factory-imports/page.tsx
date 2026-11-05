"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { getTotalShirtQty } from "@/lib/order-quantities";
import { useOrderTypeOptions } from "@/lib/order-code-options";
import { fetchAllReportRows } from "@/lib/report-query";
import {
  dedupeImportsByOrder,
  getImporterKey,
  getLocalPeriodRange,
  summarizeImportsByEmployee,
  type FactoryImportRow,
} from "@/lib/factory-import-report";
import { MonthFilter, PrefixFilter, buildMonthOptions, buildYearOptions, matchPrefix } from "../_lib";

type ReceiptItemRow = {
  order_id: string;
  factory_receipts: { received_at: string; received_by: string } | null;
  orders: {
    order_code: string;
    factory_bill_code: string | null;
    net_total: number;
    short_qty: number;
    long_qty: number;
    free_qty: number;
  } | null;
};

const ALL_EMPLOYEES = "ALL";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function FactoryImportsReportPage() {
  const now = new Date();
  const [month, setMonth] = useState<MonthFilter>(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [prefix, setPrefix] = useState<PrefixFilter>("ALL");
  const [employeeFilter, setEmployeeFilter] = useState(ALL_EMPLOYEES);

  const [imports, setImports] = useState<FactoryImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const { options: orderTypeOptions } = useOrderTypeOptions(true);
  const prefixOptions = useMemo(() => ["ALL", ...orderTypeOptions, "OTHER"], [orderTypeOptions]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setErr(null);
      setImports([]);

      const { start, endExclusive } = getLocalPeriodRange(year, month);
      const { data, error } = await fetchAllReportRows<ReceiptItemRow>((from, to) =>
        supabase
          .from("factory_receipt_items")
          .select("order_id,factory_receipts!inner(received_at,received_by),orders!inner(order_code,factory_bill_code,net_total,short_qty,long_qty,free_qty)")
          .gte("factory_receipts.received_at", start)
          .lt("factory_receipts.received_at", endExclusive)
          .order("id", { ascending: true })
          .range(from, to)
          .returns<ReceiptItemRow[]>()
      );
      if (cancelled) return;

      if (error) {
        setErr(error.message);
        toast.error(`ໂຫຼດຂໍ້ມູນການນຳເຂົ້າບໍ່ສຳເລັດ: ${error.message}`);
        setLoading(false);
        return;
      }

      const rows = (data ?? []).flatMap((item) => {
        if (!item.factory_receipts || !item.orders) return [];
        return [{
          orderId: item.order_id,
          orderCode: item.orders.order_code,
          factoryBillCode: item.orders.factory_bill_code,
          receivedAt: item.factory_receipts.received_at,
          receivedBy: item.factory_receipts.received_by,
          shirts: getTotalShirtQty(item.orders),
          netTotal: Number(item.orders.net_total) || 0,
        } satisfies FactoryImportRow];
      });
      setImports(dedupeImportsByOrder(rows));
      setLoading(false);
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [year, month]);

  const employeeOptions = useMemo(() => summarizeImportsByEmployee(imports).sort((a, b) => a.employeeName.localeCompare(b.employeeName)), [imports]);
  // A name chosen for one period may not exist in the next one.
  const effectiveEmployee = employeeOptions.some((option) => option.employeeKey === employeeFilter) ? employeeFilter : ALL_EMPLOYEES;

  const detailRows = useMemo(
    () =>
      imports.filter(
        (row) =>
          matchPrefix(row.orderCode, prefix) &&
          (effectiveEmployee === ALL_EMPLOYEES || getImporterKey(row.receivedBy) === effectiveEmployee)
      ),
    [imports, prefix, effectiveEmployee]
  );
  const summaryRows = useMemo(() => summarizeImportsByEmployee(detailRows), [detailRows]);
  const totals = useMemo(
    () =>
      summaryRows.reduce(
        (acc, row) => ({
          orders: acc.orders + row.ordersTotal,
          shirts: acc.shirts + row.shirtsTotal,
          value: acc.value + row.valueTotal,
        }),
        { orders: 0, shirts: 0, value: 0 }
      ),
    [summaryRows]
  );

  const exportExcel = () => {
    if (summaryRows.length === 0) {
      toast.error("ບໍ່ມີຂໍ້ມູນສຳລັບດາວໂຫຼດ");
      return;
    }
    const periodLabel = month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`;
    const summarySheet = XLSX.utils.json_to_sheet([
      ...summaryRows.map((row) => ({
        "ຜູ້ນຳເຂົ້າ": row.employeeName,
        "ຈຳນວນອໍເດີ້ລວມ": row.ordersTotal,
        "ຈຳນວນເສື້ອລວມ": row.shirtsTotal,
        "ມູນຄ່າລວມ": row.valueTotal,
      })),
      { "ຜູ້ນຳເຂົ້າ": "ລວມທັງໝົດ", "ຈຳນວນອໍເດີ້ລວມ": totals.orders, "ຈຳນວນເສື້ອລວມ": totals.shirts, "ມູນຄ່າລວມ": totals.value },
    ]);
    const detailSheet = XLSX.utils.json_to_sheet(
      detailRows.map((row) => ({
        "ວັນທີຮັບເຂົ້າ": formatDateTime(row.receivedAt),
        "ຜູ້ນຳເຂົ້າ": row.receivedBy,
        "ລະຫັດອໍເດີ": row.orderCode,
        "ບິນໂຮງງານ": row.factoryBillCode?.trim() || "-",
        "ຈຳນວນເສື້ອ": row.shirts,
        "ຍອດສຸດທິ": row.netTotal,
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, summarySheet, "factory_import_summary");
    XLSX.utils.book_append_sheet(workbook, detailSheet, "factory_import_orders");
    XLSX.writeFile(workbook, `factory-import-summary-${periodLabel}.xlsx`);
    toast.success("ດາວໂຫຼດລາຍງານສຳເລັດ");
  };

  const selectClassName = "border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-900";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">ລາຍງານການນຳເຂົ້າສິນຄ້າ</h1>
        <div className="text-sm font-medium text-slate-500">ນັບຕາມວັນທີຮັບເຂົ້າ ແລະ ຊື່ຜູ້ນຳເຂົ້າ ຈາກລາຍການອໍເດີນຳເຂົ້າ</div>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm font-bold">Error: {err}</div>}

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select aria-label="ເດືອນ" value={month} onChange={(e) => setMonth(e.target.value === "ALL" ? "ALL" : Number(e.target.value))} className={selectClassName}>
            {buildMonthOptions().map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select aria-label="ປີ" value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectClassName}>
            {buildYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select aria-label="ປະເພດລະຫັດ" value={prefix} onChange={(e) => setPrefix(e.target.value as PrefixFilter)} className={selectClassName}>
            {prefixOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select aria-label="ຜູ້ນຳເຂົ້າ" value={effectiveEmployee} onChange={(e) => setEmployeeFilter(e.target.value)} className={selectClassName}>
            <option value={ALL_EMPLOYEES}>ຜູ້ນຳເຂົ້າທັງໝົດ</option>
            {employeeOptions.map((option) => (
              <option key={option.employeeKey} value={option.employeeKey}>{option.employeeName}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-xs text-slate-700 font-bold uppercase">ຈຳນວນອໍເດີ້ລວມ</div>
            <div className="text-xl font-black text-slate-900">{totals.orders.toLocaleString()}</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-xs text-slate-700 font-bold uppercase">ຈຳນວນເສື້ອລວມ</div>
            <div className="text-xl font-black text-emerald-600">{totals.shirts.toLocaleString()}</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-xs text-slate-700 font-bold uppercase">ມູນຄ່າລວມ</div>
            <div className="text-xl font-black text-sky-700">{totals.value.toLocaleString()}</div>
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={exportExcel} disabled={summaryRows.length === 0} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-black hover:bg-emerald-700 transition-colors disabled:opacity-50">
            <Download size={16} />
            ດາວໂຫຼດ Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50 text-sm font-black text-slate-800 uppercase">ສະຫຼຸບຕາມພະນັກງານ ({summaryRows.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 text-slate-700 border-b border-slate-100">
              <tr>
                <th className="p-3 text-left text-xs uppercase font-black">ຜູ້ນຳເຂົ້າ</th>
                <th className="p-3 text-right text-xs uppercase font-black">ຈຳນວນອໍເດີ້ລວມ</th>
                <th className="p-3 text-right text-xs uppercase font-black">ຈຳນວນເສື້ອລວມ</th>
                <th className="p-3 text-right text-xs uppercase font-black">ມູນຄ່າລວມ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {summaryRows.length === 0 ? (
                <tr>
                  <td className="p-8 text-center text-slate-500 font-bold" colSpan={4}>{loading ? "ກຳລັງໂຫຼດ..." : "ບໍ່ມີຂໍ້ມູນ"}</td>
                </tr>
              ) : (
                summaryRows.map((row) => (
                  <tr key={row.employeeKey}>
                    <td className="p-3 font-black text-slate-900">{row.employeeName}</td>
                    <td className="p-3 text-right text-slate-900 font-black">{row.ordersTotal.toLocaleString()}</td>
                    <td className="p-3 text-right text-slate-800">{row.shirtsTotal.toLocaleString()}</td>
                    <td className="p-3 text-right text-sky-700 font-bold">{row.valueTotal.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50 text-sm font-black text-slate-800 uppercase">ອໍເດີທີ່ນຳເຂົ້າ ({detailRows.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 text-slate-700 border-b border-slate-100">
              <tr>
                <th className="p-3 text-left text-xs uppercase font-black">ວັນທີຮັບເຂົ້າ</th>
                <th className="p-3 text-left text-xs uppercase font-black">ຜູ້ນຳເຂົ້າ</th>
                <th className="p-3 text-left text-xs uppercase font-black">ລະຫັດອໍເດີ</th>
                <th className="p-3 text-left text-xs uppercase font-black">ບິນໂຮງງານ</th>
                <th className="p-3 text-right text-xs uppercase font-black">ຈຳນວນເສື້ອ</th>
                <th className="p-3 text-right text-xs uppercase font-black">ຍອດສຸດທິ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {detailRows.length === 0 ? (
                <tr>
                  <td className="p-8 text-center text-slate-500 font-bold" colSpan={6}>{loading ? "ກຳລັງໂຫຼດ..." : "ບໍ່ມີຂໍ້ມູນ"}</td>
                </tr>
              ) : (
                detailRows.map((row) => (
                  <tr key={row.orderId}>
                    <td className="p-3 whitespace-nowrap text-slate-700">{formatDateTime(row.receivedAt)}</td>
                    <td className="p-3 font-bold text-slate-800">{row.receivedBy}</td>
                    <td className="p-3 font-black text-slate-900">{row.orderCode}</td>
                    <td className="p-3 text-slate-600">{row.factoryBillCode?.trim() || "-"}</td>
                    <td className="p-3 text-right text-slate-800">{row.shirts.toLocaleString()}</td>
                    <td className="p-3 text-right text-sky-700 font-bold">{row.netTotal.toLocaleString()}</td>
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
