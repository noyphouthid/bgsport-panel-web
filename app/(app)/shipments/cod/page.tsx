"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Banknote, CheckCircle2, Clock3, LoaderCircle, RefreshCw, Search } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { getTransportCodReceiptError, type TransportCodItem, type TransportCodList } from "@/lib/transport-cod-receipts";

const PAGE_SIZE = 50;
const money = (value: number) => `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })} ກີບ`;
const dateTime = (value: string) => new Date(value).toLocaleString("en-GB", {
  timeZone: "Asia/Vientiane", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const control = "w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2.5 text-sm disabled:opacity-50";

export default function TransportCodPage() {
  const [data, setData] = useState<TransportCodList | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const receiving = useRef(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await supabase.rpc("list_transport_cod", {
          p_query: query.trim(), p_status: status, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE,
        });
        if (!active) return;
        if (result.error) throw result.error;
        const next = result.data as TransportCodList;
        if (!next || !Array.isArray(next.rows) || !next.summary) throw new Error("ຂໍ້ມູນ COD ບໍ່ຖືກຕ້ອງ");
        if (page > 0 && next.total <= page * PAGE_SIZE) {
          setPage(Math.max(0, Math.ceil(next.total / PAGE_SIZE) - 1));
          return;
        }
        setData(next);
      } catch (failure) {
        if (active) {
          setData(null);
          setError(getTransportCodReceiptError(failure as { code?: string; message?: string }));
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [query, status, page, refresh]);

  const reload = () => { setLoading(true); setRefresh(value => value + 1); };

  async function receive(row: TransportCodItem) {
    if (receiving.current || loading || error || row.received_at) return;
    receiving.current = true;
    const confirmed = window.confirm(`ຢືນຢັນວ່າຮັບຍອດ COD ແລ້ວ?\n${row.order_code || row.note_no}\n${row.receiver_name}\nຈຳນວນ ${money(row.amount)}`);
    if (!confirmed) { receiving.current = false; return; }
    setWorkingId(`${row.source}:${row.source_id}`);
    try {
      const result = await supabase.rpc("receive_transport_cod", {
        p_source: row.source, p_source_id: row.source_id, p_expected_amount: Number(row.amount),
      });
      if (result.error) throw result.error;
      toast.success("ບັນທຶກຮັບຍອດ COD ແລ້ວ");
      reload();
    } catch (failure) {
      toast.error(getTransportCodReceiptError(failure as { code?: string; message?: string }));
      reload();
    } finally {
      receiving.current = false;
      setWorkingId(null);
    }
  }

  return (
    <div className="space-y-6 text-[var(--theme-foreground)]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Banknote className="text-emerald-600"/>ລາຍການ COD ທັງໝົດ</h1>
          <p className="mt-2 text-sm text-[var(--theme-muted)]">ຕິດຕາມຍອດເກັບເງິນປາຍທາງ ແລະ ຢືນຢັນຍອດທີ່ຮັບຈາກຂົນສົ່ງແລ້ວ</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/shipments/notes" className="rounded-xl border px-4 py-2 text-sm">ໃບຝາກເຄື່ອງ</Link>
          <button type="button" disabled={loading || !!workingId} onClick={reload} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm disabled:opacity-50"><RefreshCw size={16}/>ໂຫຼດໃໝ່</button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3" aria-label="ສະຫຼຸບ COD">
        {[
          { label: "ຍອດ COD ທັງໝົດ", amount: data?.summary.total, count: data?.summary.count, icon: Banknote, tone: "text-sky-600" },
          { label: "ຍັງບໍ່ຮັບຍອດ", amount: data?.summary.pending_amount, count: data?.summary.pending_count, icon: Clock3, tone: "text-amber-600" },
          { label: "ຮັບຍອດແລ້ວ", amount: data?.summary.received_amount, count: data?.summary.received_count, icon: CheckCircle2, tone: "text-emerald-600" },
        ].map(card => <section key={card.label} className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5">
          <div className={`flex items-center gap-2 text-sm font-bold ${card.tone}`}><card.icon size={18}/>{card.label}</div>
          <p className="mt-3 break-words text-xl font-black">{loading || card.amount === undefined ? "—" : money(card.amount)}</p>
          <p className="mt-1 text-xs text-[var(--theme-muted)]">{loading || card.count === undefined ? "—" : card.count.toLocaleString()} ລາຍການ</p>
        </section>)}
      </div>

      <section className="grid gap-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 md:grid-cols-[1fr_220px]">
        <label className="space-y-2 text-sm font-bold"><span className="flex items-center gap-2"><Search size={16}/>ຄົ້ນຫາ</span><input type="search" maxLength={200} disabled={!!workingId} value={query} onChange={event => { setQuery(event.target.value); setPage(0); setLoading(true); }} placeholder="ລະຫັດອໍເດີ / ໃບຝາກ / ຜູ້ຮັບ / ເບີໂທ / ຂົນສົ່ງ" className={control}/></label>
        <label className="space-y-2 text-sm font-bold">ສະຖານະ<select aria-label="ສະຖານະ" disabled={!!workingId} value={status} onChange={event => { setStatus(event.target.value); setPage(0); setLoading(true); }} className={control}><option value="all">ທັງໝົດ</option><option value="pending">ຍັງບໍ່ຮັບຍອດ</option><option value="received">ຮັບຍອດແລ້ວ</option></select></label>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">{error}<button type="button" onClick={reload} className="ml-3 font-bold underline">ລອງໃໝ່</button></div>}

      <section className="overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm" aria-label="ລາຍການ COD" aria-busy={loading}>
            <thead className="border-b border-[var(--theme-border)] bg-[var(--theme-surface-muted)]"><tr>{["ໃບຝາກ / ອໍເດີ", "ຜູ້ຮັບສິນຄ້າ", "ຂົນສົ່ງ", "ຍອດ COD", "ສະຖານະ / ຜູ້ຮັບຍອດ", "ຈັດການ"].map(label => <th key={label} className="p-4 font-bold">{label}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="p-12 text-center"><span role="status" className="inline-flex items-center gap-2"><LoaderCircle size={20} className="animate-spin"/>ກຳລັງໂຫຼດ…</span></td></tr> : error ? <tr><td colSpan={6} className="p-10 text-center text-[var(--theme-muted)]">ໂຫຼດລາຍການບໍ່ສຳເລັດ</td></tr> : !data?.rows.length ? <tr><td colSpan={6} className="p-10 text-center text-[var(--theme-muted)]">ບໍ່ພົບລາຍການ COD</td></tr> : data.rows.map(row => {
                const key = `${row.source}:${row.source_id}`;
                return <tr key={key} className="border-b border-[var(--theme-border)] last:border-b-0">
                  <td className="p-4"><p className="font-bold">{row.order_code || row.note_no}</p><p className="mt-1 text-xs text-[var(--theme-muted)]">{row.note_no}</p><p className="mt-1 text-xs text-[var(--theme-muted)]">{dateTime(row.created_at)}</p>{row.transport_note_id && <Link href={`/shipments/transport-note?id=${row.transport_note_id}`} className="mt-2 inline-block text-xs font-bold text-sky-600 underline">ເບິ່ງໃບຝາກ</Link>}</td>
                  <td className="p-4"><p className="font-bold">{row.receiver_name || "—"}</p><p className="mt-1 text-[var(--theme-muted)]">{row.receiver_phone || "—"}</p></td>
                  <td className="p-4"><p>{row.transporters.join(", ") || "—"}</p><p className="mt-1 text-xs text-[var(--theme-muted)]">{row.branch || "—"}</p></td>
                  <td className="whitespace-nowrap p-4 font-black">{money(row.amount)}</td>
                  <td className="p-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${row.received_at ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{row.received_at ? "ຮັບຍອດ COD ແລ້ວ" : "ຍັງບໍ່ຮັບຍອດ"}</span>{row.received_at && <div className="mt-2 space-y-1 text-xs text-[var(--theme-muted)]"><p>{row.received_by_name || "—"}</p><p>{dateTime(row.received_at)}</p></div>}</td>
                  <td className="p-4">{row.received_at ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 size={16}/>ບັນທຶກແລ້ວ</span> : <button type="button" disabled={!!workingId} onClick={() => void receive(row)} className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{workingId === key ? <LoaderCircle size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}ຮັບຍອດ COD ແລ້ວ</button>}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--theme-border)] p-4 text-sm">
          <p role="status">{loading ? "ກຳລັງໂຫຼດ…" : `${data?.total.toLocaleString() ?? 0} ລາຍການ · ໜ້າ ${page + 1}/${Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))}`}</p>
          <div className="flex gap-2"><button type="button" disabled={loading || !!workingId || page === 0} onClick={() => { setPage(value => value - 1); setLoading(true); }} className="rounded-lg border px-3 py-2 disabled:opacity-40">ໜ້າກ່ອນ</button><button type="button" disabled={loading || !!workingId || (page + 1) * PAGE_SIZE >= (data?.total ?? 0)} onClick={() => { setPage(value => value + 1); setLoading(true); }} className="rounded-lg border px-3 py-2 disabled:opacity-40">ໜ້າຖັດໄປ</button></div>
        </footer>
      </section>
    </div>
  );
}
