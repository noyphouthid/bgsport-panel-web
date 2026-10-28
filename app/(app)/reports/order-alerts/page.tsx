"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Download, FileSpreadsheet, RefreshCw, Search, TriangleAlert } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { getOrderAlertErrorMessage, getOrderAlertToday } from "@/lib/order-alerts";
import { fetchOrderAlertReportWithClient, formatOrderAlertReportDate, getOrderAlertReportCells, ORDER_ALERT_REPORT_HEADERS, type OrderAlertReportRow } from "@/lib/order-alert-report";

export default function OrderAlertReportPage() {
  const [rows, setRows] = useState<OrderAlertReportRow[]>([]);
  const [reportDate, setReportDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("all");
  const [dateField, setDateField] = useState<"deliveryDate" | "productionSentDate">("deliveryDate");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minDays, setMinDays] = useState("");
  const [maxDays, setMaxDays] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());
    try {
      const today = getOrderAlertToday();
      const data = await fetchOrderAlertReportWithClient(supabase, today);
      setRows(data);
      setReportDate(today);
    } catch (err) {
      setRows([]);
      setError(getOrderAlertErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadReport(); }, [loadReport]);

  const filterError = fromDate && toDate && fromDate > toDate
    ? "ວັນທີ່ເລີ່ມຕົ້ນຕ້ອງບໍ່ເກີນວັນທີ່ສິ້ນສຸດ"
    : [minDays, maxDays].some(value => value !== "" && (!Number.isInteger(Number(value)) || Number(value) < 1))
      ? "ຈຳນວນວັນເກີນກຳນົດຕ້ອງເປັນເລກເຕັມຕັ້ງແຕ່ 1 ຂຶ້ນໄປ"
      : minDays && maxDays && Number(minDays) > Number(maxDays)
        ? "ຈຳນວນວັນຕ່ຳສຸດຕ້ອງບໍ່ເກີນຈຳນວນວັນສູງສຸດ" : null;

  const filteredRows = useMemo(() => {
    if (filterError) return [];
    const term = search.trim().toLowerCase();
    return rows.filter(row => (priority === "all" || row.priority === priority) &&
      (!term || row.orderCode.toLowerCase().includes(term) || row.factoryBillCode.toLowerCase().includes(term)) &&
      (!fromDate || row[dateField] >= fromDate) && (!toDate || row[dateField] <= toDate) &&
      (!minDays || row.overdueDays >= Number(minDays)) && (!maxDays || row.overdueDays <= Number(maxDays)));
  }, [rows, search, priority, dateField, fromDate, toDate, minDays, maxDays, filterError]);
  const totalQuantity = filteredRows.reduce((sum, row) => sum + row.quantity, 0);
  // Export is always limited to the current filters, even when other rows were selected earlier.
  const selectedRows = useMemo(() => filteredRows.filter(row => selectedIds.has(row.id)), [filteredRows, selectedIds]);
  const allSelected = filteredRows.length > 0 && selectedRows.length === filteredRows.length;

  const toggleRow = (id: string) => setSelectedIds(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const toggleAllFiltered = () => setSelectedIds(current => {
    const next = new Set(current);
    for (const row of filteredRows) {
      if (allSelected) next.delete(row.id);
      else next.add(row.id);
    }
    return next;
  });

  const resetFilters = () => {
    setSearch("");
    setPriority("all");
    setDateField("deliveryDate");
    setFromDate("");
    setToDate("");
    setMinDays("");
    setMaxDays("");
  };

  const exportExcel = () => {
    if (loading || error || filterError || !selectedRows.length) return;
    try {
      const sheet = XLSX.utils.aoa_to_sheet([ORDER_ALERT_REPORT_HEADERS, ...selectedRows.map(getOrderAlertReportCells)]);
      sheet["!cols"] = [8, 24, 24, 12, 22, 22, 22, 38].map(wch => ({ wch }));
      sheet["!autofilter"] = { ref: sheet["!ref"]! };
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Order Alerts");
      XLSX.writeFile(workbook, `order-alerts-report-${reportDate}.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ດາວໂຫຼດ Excel ບໍ່ສຳເລັດ");
    }
  };

  return (
    <div className="min-w-0 space-y-5 text-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-rose-600"><FileSpreadsheet size={18} /> Order Alerts</div>
          <h1 className="text-2xl font-black">ລາຍງານອໍເດີ້ເກີນກຳນົດ</h1>
          <p className="mt-2 text-sm text-slate-500">ອໍເດີ້ທີ່ເກີນກຳນົດສົ່ງລູກຄ້າ ແລະ ຍັງບໍ່ຮັບຈາກໂຮງງານ ຫຼື ຜະລິດສຳເລັດ</p>
        </div>
        <Link href="/order-alerts" className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold hover:bg-slate-50"><BellRing size={16} /> ແຈ້ງເຕືອນອໍເດີ</Link>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
            <input aria-label="ຄົ້ນຫາອໍເດີ້" value={search} onChange={event => setSearch(event.target.value)} placeholder="ຄົ້ນຫາລະຫັດອໍເດີ້ BG / ບິນໂຮງງານ" className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400" />
          </div>
          <select aria-label="ປະເພດງານ" value={priority} onChange={event => setPriority(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
            <option value="all">ປະເພດງານທັງໝົດ</option>
            <option value="urgent">ງານດ່ວນ</option>
            <option value="normal">ປົກກະຕິ</option>
          </select>
          <button type="button" onClick={() => void loadReport()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> ໂຫຼດໃໝ່</button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1.5 text-xs font-bold text-slate-600">
            <span>ກອງຕາມວັນທີ່</span>
            <select aria-label="ກອງຕາມວັນທີ່" value={dateField} onChange={event => setDateField(event.target.value as typeof dateField)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900">
              <option value="deliveryDate">ກຳນົດສົ່ງລູກຄ້າ</option>
              <option value="productionSentDate">ວັນທີ່ສົ່ງຜະລິດ</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-600"><span>ຕັ້ງແຕ່ວັນທີ່</span><input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="block w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900" /></label>
          <label className="space-y-1.5 text-xs font-bold text-slate-600"><span>ເຖິງວັນທີ່</span><input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="block w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900" /></label>
          <label className="space-y-1.5 text-xs font-bold text-slate-600"><span>ເກີນກຳນົດຕ່ຳສຸດ (ວັນ)</span><input type="number" min={1} step={1} value={minDays} onChange={event => setMinDays(event.target.value)} placeholder="ບໍ່ຈຳກັດ" className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900" /></label>
          <label className="space-y-1.5 text-xs font-bold text-slate-600"><span>ເກີນກຳນົດສູງສຸດ (ວັນ)</span><input type="number" min={1} step={1} value={maxDays} onChange={event => setMaxDays(event.target.value)} placeholder="ບໍ່ຈຳກັດ" className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900" /></label>
        </div>
        {filterError && <p role="alert" className="text-sm font-semibold text-rose-600">{filterError}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={resetFilters} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">ລ້າງຕົວກອງ</button>
          <span className="text-xs text-slate-500">ຊ່ວງວັນທີ່ ແລະ ຈຳນວນວັນ ລວມຄ່າເລີ່ມຕົ້ນ-ສິ້ນສຸດ</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm text-slate-500">
          <span>ວັນທີ່ລາຍງານ: <strong className="text-slate-900">{reportDate ? formatOrderAlertReportDate(reportDate) : "-"}</strong></span>
          <span>ອໍເດີ້: <strong className="text-rose-600">{loading || error ? "-" : filteredRows.length.toLocaleString()}</strong> ລາຍການ</span>
          <span>ຈຳນວນລວມ: <strong className="text-slate-900">{loading || error ? "-" : totalQuantity.toLocaleString()}</strong> ຕົວ (ລວມເສື້ອແຖມ)</span>
        </div>
      </div>

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><TriangleAlert size={18} /> {error}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p aria-live="polite" className="text-sm font-bold text-slate-900">ເລືອກແລ້ວ {loading || error ? 0 : selectedRows.length} / {loading || error ? 0 : filteredRows.length} ລາຍການ</p>
            <p className="mt-1 text-xs text-slate-500">Export ສະເພາະລາຍການທີ່ເລືອກໃນຕົວກອງປັດຈຸບັນ</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSelectedIds(new Set())} disabled={!selectedIds.size || loading} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">ຍົກເລີກການເລືອກ</button>
            <button type="button" onClick={exportExcel} disabled={loading || !!error || !!filterError || !selectedRows.length} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Download size={16} /> ດາວໂຫຼດ Excel ({loading || error ? 0 : selectedRows.length})</button>
          </div>
        </div>
        <div role="region" aria-label="ຕາລາງອໍເດີ້ເກີນກຳນົດ" tabIndex={0} className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-sm">
            <caption className="sr-only">ລາຍງານອໍເດີ້ເກີນກຳນົດ</caption>
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th scope="col" className="w-12 border-b border-r border-slate-200 px-4 py-3">
                  <input type="checkbox" aria-label="ເລືອກທັງໝົດຕາມຕົວກອງ" checked={allSelected} ref={element => { if (element) element.indeterminate = selectedRows.length > 0 && !allSelected; }} onChange={toggleAllFiltered} disabled={loading || !!error || !filteredRows.length} className="h-4 w-4 cursor-pointer accent-emerald-600 disabled:cursor-default" />
                </th>
                {ORDER_ALERT_REPORT_HEADERS.map((header, index) => <th key={header} scope="col" className={`border-b border-r border-slate-200 px-4 py-3 text-left font-bold last:border-r-0 ${index === 3 || index === 6 ? "text-right" : ""}`}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading || error || !filteredRows.length ? (
                <tr><td colSpan={9} className="px-4 py-14 text-center text-slate-500" role="status">{loading ? "ກຳລັງໂຫຼດລາຍງານ..." : error ? "ໂຫຼດລາຍງານບໍ່ສຳເລັດ — ກົດໂຫຼດໃໝ່" : filterError ? "ກະລຸນາກວດສອບຕົວກອງ" : rows.length ? "ບໍ່ພົບລາຍການທີ່ຄົ້ນຫາ" : "ບໍ່ມີອໍເດີ້ເກີນກຳນົດ"}</td></tr>
              ) : filteredRows.map((row, index) => (
                <tr key={row.id} className="odd:bg-white even:bg-slate-50/60 hover:bg-blue-50/50">
                  <td className="border-b border-r border-slate-200 px-4 py-3 text-center"><input type="checkbox" aria-label={`ເລືອກ ${row.orderCode}`} checked={selectedIds.has(row.id)} onChange={() => toggleRow(row.id)} className="h-4 w-4 cursor-pointer accent-emerald-600" /></td>
                  {getOrderAlertReportCells(row, index).map((cell, column) => (
                    <td key={column} className={`border-b border-r border-slate-200 px-4 py-3 last:border-r-0 ${column === 3 || column === 6 ? "text-right font-semibold tabular-nums" : ""} ${column === 6 ? "text-rose-600" : ""}`}>
                      {column === 1 ? <Link href={`/orders/${row.orderId}/edit`} className="font-mono font-bold text-blue-700 hover:underline">{cell}</Link> : column === 7 ? <span className={`inline-block whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold ${row.priority === "urgent" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{cell}</span> : typeof cell === "number" ? cell.toLocaleString() : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {!loading && !error && filteredRows.length > 0 && <tfoot className="bg-slate-100 font-bold"><tr><td colSpan={4} className="border-r border-slate-200 px-4 py-3">ລວມ {filteredRows.length.toLocaleString()} ລາຍການ</td><td className="border-r border-slate-200 px-4 py-3 text-right tabular-nums">{totalQuantity.toLocaleString()}</td><td colSpan={4} /></tr></tfoot>}
          </table>
        </div>
      </div>
    </div>
  );
}
