"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FilePlus2, PencilLine, Printer, Search, Trash2 } from "lucide-react";
import { deleteQuotationDraft, getQuotationDrafts, type QuotationDraft } from "@/lib/quotation-drafts";

const badgeStyles: Record<QuotationDraft["status"], string> = {
  draft: "bg-amber-100 text-amber-700 border border-amber-200",
  confirmed: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  cancelled: "bg-rose-100 text-rose-700 border border-rose-200",
};

const badgeLabels: Record<QuotationDraft["status"], string> = {
  draft: "ຮ່າງ",
  confirmed: "ຢືນຢັນແລ້ວ",
  cancelled: "ຍົກເລີກ",
};

export default function QuotationsPage() {
  const [rows, setRows] = useState<QuotationDraft[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const loadRows = async () => {
    setLoading(true);
    try {
      setRows(await getQuotationDrafts());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ໂຫຼດໃບປະເມີນລາຄາບໍ່ສຳເລັດ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      [row.quoteNo, row.customerName, row.customerPhone, row.customerWhatsapp, row.fabricName]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [query, rows]);

  const handleDelete = async (id: string) => {
    const ok = window.confirm("ຢືນຢັນລົບໃບປະເມີນລາຄານີ້?");
    if (!ok) return;
    try {
      await deleteQuotationDraft(id);
      await loadRows();
      toast.success("ລົບຮ່າງໃບປະເມີນລາຄາແລ້ວ");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ລົບໃບປະເມີນລາຄາບໍ່ສຳເລັດ");
    }
  };

  return (
    <div className="text-slate-900">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">ໃບແຈ້ງລາຄາປະເມີນ</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            ຈັດການໃບປະເມີນລາຄາແບບຮ່າງ ແລະ ເຂົ້າໄປແກ້ໄຂໄດ້ທັນທີ
          </p>
        </div>

        <Link
          href="/quotations/new"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
        >
          <FilePlus2 size={18} />
          ສ້າງໃບປະເມີນລາຄາໃໝ່
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-4">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-700">ລາຍການຮ່າງ</div>
          <div className="text-xs font-bold text-slate-500">ສະແດງ {filteredRows.length} / {rows.length} ລາຍການ</div>
        </div>

        <div className="border-b border-slate-100 p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ຄົ້ນຫາລະຫັດອໍເດີ / ເລກທີ່ / ຊື່ລູກຄ້າ / ເບີໂທ"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none transition focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
              <tr>
                <th className="p-4 text-left text-[11px] font-black uppercase tracking-wider">ວັນທີ</th>
                <th className="p-4 text-left text-[11px] font-black uppercase tracking-wider">ເລກທີ່</th>
                <th className="p-4 text-left text-[11px] font-black uppercase tracking-wider">ລູກຄ້າ</th>
                <th className="p-4 text-left text-[11px] font-black uppercase tracking-wider">ຜ້າ</th>
                <th className="p-4 text-right text-[11px] font-black uppercase tracking-wider">ຍອດມັດຈຳ</th>
                <th className="p-4 text-center text-[11px] font-black uppercase tracking-wider">ສະຖານະ</th>
                <th className="p-4 text-center text-[11px] font-black uppercase tracking-wider">ຈັດການ</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-sm font-medium text-slate-400">
                    ກຳລັງໂຫຼດ...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-sm font-medium text-slate-400">
                    {rows.length === 0 ? "ຍັງບໍ່ມີໃບປະເມີນລາຄາທີ່ບັນທຶກໄວ້" : "ບໍ່ພົບຂໍ້ມູນຕາມຄຳຄົ້ນຫາ"}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50/60">
                    <td className="p-4 font-medium text-slate-700">{row.quoteDate}</td>
                    <td className="p-4 font-black text-slate-900">{row.quoteNo}</td>
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{row.customerName || "-"}</div>
                      <div className="mt-1 text-xs text-slate-500">{row.customerPhone || "-"}</div>
                    </td>
                    <td className="p-4 font-medium text-slate-700">{row.fabricName || "-"}</td>
                    <td className="p-4 text-right font-black text-emerald-700">{row.deposit.toLocaleString()}</td>
                    <td className="p-4 text-center">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${badgeStyles[row.status]}`}>
                        {badgeLabels[row.status]}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          href={`/factory-deposit-orders/new?draftId=${row.id}`}
                          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-50"
                        >
                          <FilePlus2 size={14} />
                          ສ້າງໃບມັດຈຳ
                        </Link>
                        <Link
                          href={`/quotations/new?draftId=${row.id}`}
                          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black text-blue-700 transition hover:bg-blue-50"
                        >
                          <PencilLine size={14} />
                          ແກ້ໄຂ
                        </Link>
                        <Link
                          href={`/quotations/new?draftId=${row.id}`}
                          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                        >
                          <Printer size={14} />
                          ພິມ
                        </Link>
                        <button
                          onClick={() => void handleDelete(row.id!)}
                          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-50"
                        >
                          <Trash2 size={14} />
                          ລົບ
                        </button>
                      </div>
                    </td>
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
