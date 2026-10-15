"use client";

import { useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabase";
import { queueOrderCode, workflowErrorMessage, type QueueCustomer } from "@/lib/queue-customers";
import { getOrderWorkCategoryLabel } from "@/lib/order-work-category";

export function QueueCustomerSearch({ onSelect, disabled = false }: {
  onSelect: (customer: QueueCustomer) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QueueCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setResults([]);
      setError("");
      if (query.trim().length < 2 || disabled) { setLoading(false); return; }
      setLoading(true);
      const response = await supabase.rpc("search_design_queue_customers", { p_search: query.trim() });
      if (!active) return;
      setLoading(false);
      if (response.error) setError(`ຄົ້ນຫາບໍ່ສຳເລັດ: ${workflowErrorMessage(response.error)}`);
      else setResults((response.data || []) as QueueCustomer[]);
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query, disabled]);

  return (
    <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
      <label htmlFor={id} className="mb-2 block text-sm font-bold text-sky-900">ຄົ້ນຫາລູກຄ້າຈາກຄິວອອກແບບ</label>
      <input id={id} type="search" value={query} onChange={(event) => { setQuery(event.target.value); setResults([]); setLoading(event.target.value.trim().length >= 2); }} disabled={disabled} placeholder="ຊື່, ເບີໂທ, ເລກຄິວ ຫຼື ລະຫັດອໍເດີ (ຢ່າງໜ້ອຍ 2 ຕົວ)" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900" />
      <div aria-live="polite" className="mt-2 text-sm text-slate-600">
        {loading ? "ກຳລັງຄົ້ນຫາ..." : error || (query.trim().length >= 2 && results.length === 0 ? "ບໍ່ພົບຂໍ້ມູນ" : "ເລືອກຄິວເພື່ອດຶງເບີໂທ, ປະເພດງານ ແລະ ລະຫັດອໍເດີ")}
      </div>
      {results.length > 0 && <ul className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white">
        {results.map((row) => <li key={row.id} className="border-b border-slate-100 last:border-0">
          <button type="button" disabled={disabled} onClick={() => { onSelect(row); setQuery(""); setResults([]); }} className="w-full px-3 py-3 text-left text-sm hover:bg-sky-50">
            <div className="font-bold text-slate-900">{row.customer_name || row.customer_phone} · {queueOrderCode(row)} · #{row.queue_number}</div>
            <div className="mt-1 text-slate-500">{row.customer_phone} · {getOrderWorkCategoryLabel(row.work_category)}</div>
          </button>
        </li>)}
      </ul>}
    </div>
  );
}
