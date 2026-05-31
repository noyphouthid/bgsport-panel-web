"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Search, Phone, PackageCheck, RefreshCcw, ChevronRight, ShieldCheck } from "lucide-react";

type TrackingResult = {
  id: string;
  orderCode: string;
  orderDate: string;
  customerPhoneMasked: string | null;
  fabricName: string | null;
  totalQty: number;
  designImageUrl: string | null;
  currentStatus: string;
  currentStageIndex: number | null;
  currentStageSource: "factory" | "shop";
  shipmentStatus: string | null;
  dueDateDisplay: string | null;
  lastUpdatedDisplay: string | null;
  isRush: boolean;
  steps: string[];
  activeStepIndex: number | null;
  factoryBillCode: string | null;
};

type SearchResponse = {
  ok?: boolean;
  error?: string;
  count?: number;
  results?: TrackingResult[];
};

const pageShell =
  "min-h-screen bg-[linear-gradient(180deg,#cfd9c2_0%,#f6efe4_26%,#f8f8f5_54%,#ece3d2_100%)] text-slate-900";

function buildStepTone(active: boolean, passed: boolean) {
  if (active) return "border-[#224734] bg-[#224734] text-white shadow-[0_14px_30px_rgba(34,71,52,.24)]";
  if (passed) return "border-[#d2dbc6] bg-[#edf3e4] text-[#224734]";
  return "border-white/70 bg-white/80 text-slate-500";
}

export default function PublicTrackingPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TrackingResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const topResult = results[0] || null;
  const secondaryResults = results.slice(1);

  const handleSearch = (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setErr("ກະລຸນາໃສ່ລະຫັດອໍເດີ ຫຼື ເບີໂທລູກຄ້າ");
      setHasSearched(true);
      setResults([]);
      return;
    }

    startTransition(async () => {
      setErr(null);
      setHasSearched(true);
      setResults([]);

      try {
        const response = await fetch(`/api/public/order-tracking?q=${encodeURIComponent(trimmed)}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as SearchResponse;
        if (!response.ok) {
          const message =
            payload.error === "query_too_short"
              ? "ກະລຸນາໃສ່ຢ່າງນ້ອຍ 3 ຕົວອັກສອນ ຫຼື 4 ຕົວເລກ"
              : payload.error === "missing_query"
                ? "ກະລຸນາໃສ່ລະຫັດອໍເດີ ຫຼື ເບີໂທລູກຄ້າ"
                : payload.error || "ບໍ່ສາມາດຄົ້ນຫາສະຖານະໄດ້";
          setErr(message);
          setResults([]);
          return;
        }

        setResults(Array.isArray(payload.results) ? payload.results : []);
      } catch {
        setErr("ເຊື່ອມຕໍ່ລະບົບບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່");
        setResults([]);
      }
    });
  };

  const summaryText = useMemo(() => {
    if (!hasSearched) return "ຄົ້ນຫາດ້ວຍລະຫັດອໍເດີຂອງຮ້ານ ຫຼື ເບີໂທລູກຄ້າ";
    if (err) return err;
    if (results.length === 0) return "ບໍ່ພົບລາຍການທີ່ກົງກັບຂໍ້ມູນທີ່ຄົ້ນຫາ";
    if (results.length === 1) return "ພົບ 1 ລາຍການ";
    return `ພົບ ${results.length} ລາຍການ`;
  }, [err, hasSearched, results.length]);

  return (
    <div className={pageShell}>
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-12 pt-5">
        <div className="rounded-[28px] border border-white/70 bg-white/72 p-4 shadow-[0_22px_55px_rgba(80,72,41,.12)] backdrop-blur">
          <div className="rounded-[24px] bg-[linear-gradient(135deg,#204834_0%,#58744f_48%,#d6b165_100%)] px-5 py-6 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25)]">
            <div className="text-[11px] font-black uppercase tracking-[0.35em] text-white/70">BG SPORT</div>
            <h1 className="mt-3 text-3xl font-black leading-none">ຕິດຕາມສະຖານະ</h1>
            <p className="mt-3 max-w-[18rem] text-sm font-medium text-white/80">
              ພຽງແຕ່ລູກຄ້າໄສ່ເລກລະຫັດອໍເດີ້ ເຊັ່ນ: PK26-5001 ໄສ່ພຽງເລກທ້າຍ 5001 ຫຼື ໄສ່ເບີໂທລູກຄ້າກໍ່ໄດ້
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-3 py-2 text-[11px] font-bold text-white/90">
              <ShieldCheck size={14} />
              ໃຊ້ຄົ້ນຫາດ້ວຍລະຫັດອໍເດີຂອງຮ້ານ ຫຼື ເບີໂທລູກຄ້າເທົ່ານັ້ນ
            </div>
          </div>

          <form onSubmit={handleSearch} className="mt-4 space-y-3">
            <label className="block text-xs font-black uppercase tracking-[0.2em] text-slate-500">ຄົ້ນຫາຂໍ້ມູນ</label>
            <div className="rounded-[22px] border border-[#d8dfd1] bg-[#f8faf4] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,.8)]">
              <div className="flex items-center gap-3 rounded-[18px] bg-white px-4 py-3">
                <div className="rounded-2xl bg-[#edf3e4] p-2 text-[#224734]">
                  <Search size={18} />
                </div>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ຕົວຢ່າງ PK26-0123, 0123 ຫຼື 020xxxxxxxx"
                  className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                  inputMode="search"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-[#224734] px-4 py-3 text-sm font-black text-white shadow-[0_18px_30px_rgba(34,71,52,.2)] transition hover:bg-[#183424] disabled:opacity-55"
              >
                <Search size={16} />
                {isPending ? "ກຳລັງຄົ້ນຫາ..." : "ຄົ້ນຫາ"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setErr(null);
                  setHasSearched(false);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-white/80 bg-white/80 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-white"
              >
                <RefreshCcw size={16} />
                ລ້າງຂໍ້ມູນ
              </button>
            </div>
          </form>

          <div className="mt-4 rounded-[22px] border border-[#e6decd] bg-[#f7f2e8] px-4 py-3 text-sm font-semibold text-[#6a5c3d]">
            {summaryText}
          </div>
        </div>

        {topResult ? (
          <section className="mt-5">
            <div className="rounded-[30px] border border-white/80 bg-white/82 p-5 shadow-[0_24px_60px_rgba(65,51,30,.12)] backdrop-blur">
              {topResult.designImageUrl ? (
                <div className="mb-4 overflow-hidden rounded-[24px] border border-[#e5dccb] bg-[#f7f3eb]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={`${topResult.id}-${topResult.designImageUrl || "no-image"}`}
                    src={topResult.designImageUrl}
                    alt={`ແບບເສື້ອ ${topResult.orderCode}`}
                    className="h-auto w-full object-cover"
                    loading="eager"
                  />
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">ສະຖານະລ່າສຸດ</div>
                  <div className="mt-2 text-2xl font-black leading-tight text-slate-900">{topResult.currentStatus}</div>
                </div>
                <div className="rounded-full border border-[#cfdbc6] bg-[#edf3e4] px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#224734]">
                  {topResult.currentStageSource === "factory" ? "ອັບເດດຈາກໂຮງງານ" : "ອັບເດດຈາກຮ້ານ"}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[20px] bg-[#f8faf6] p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">ລະຫັດອໍເດີ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{topResult.orderCode}</div>
                </div>
                <div className="rounded-[20px] bg-[#fbf6ed] p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">ເບີໂທລູກຄ້າ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{topResult.customerPhoneMasked || "-"}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[20px] border border-[#ebe3d2] bg-[#fffaf1] p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">ຜ້າ / ຈຳນວນ</div>
                  <div className="mt-2 text-sm font-bold text-slate-800">{topResult.fabricName || "-"}</div>
                  <div className="mt-1 text-xl font-black text-[#8a6332]">{topResult.totalQty.toLocaleString()} ຕົວ</div>
                </div>
                <div className="rounded-[20px] border border-[#dfe8d7] bg-[#f6fbef] p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">ອັບເດດລ່າສຸດ</div>
                  <div className="mt-2 text-sm font-bold text-slate-800">{topResult.lastUpdatedDisplay || "-"}</div>
                  <div className="mt-1 text-xs font-bold text-slate-500">
                    {topResult.dueDateDisplay ? `ກຳນົດສົ່ງ ${topResult.dueDateDisplay}` : "ຍັງບໍ່ມີກຳນົດສົ່ງ"}
                  </div>
                </div>
              </div>

              {topResult.isRush ? (
                <div className="mt-4 rounded-[20px] border border-[#e2c78d] bg-[#fff2cb] px-4 py-3 text-sm font-black text-[#7a581f]">
                  ອໍເດີນີ້ຖືກຕັ້ງເປັນງານດ່ວນ
                </div>
              ) : null}

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">ຂັ້ນຕອນການເຮັດວຽກ</div>
                  <div className="text-xs font-bold text-slate-400">
                    {topResult.activeStepIndex ? `ຂັ້ນ ${topResult.activeStepIndex}/${topResult.steps.length}` : `${topResult.steps.length} ຂັ້ນຕອນ`}
                  </div>
                </div>
                <div className="space-y-2">
                  {topResult.steps.map((step, index) => {
                    const stepNo = index + 1;
                    const activeIndex = topResult.activeStepIndex || 0;
                    const active = stepNo === activeIndex;
                    const passed = activeIndex > 0 && stepNo < activeIndex;
                    return (
                      <div key={`${topResult.id}-${stepNo}-${step}`} className={`rounded-[20px] border px-4 py-3 ${buildStepTone(active, passed)}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-sm font-black">
                              {stepNo}
                            </div>
                            <div className="text-sm font-black">{step}</div>
                          </div>
                          {active ? <ChevronRight size={18} /> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {secondaryResults.length > 0 ? (
          <section className="mt-5 space-y-3">
            <div className="px-1 text-sm font-black uppercase tracking-[0.2em] text-slate-500">ລາຍການທີ່ພົບ</div>
            {secondaryResults.map((item) => (
              <article key={item.id} className="rounded-[26px] border border-white/80 bg-white/82 p-4 shadow-[0_20px_48px_rgba(68,58,44,.1)] backdrop-blur">
                {item.designImageUrl ? (
                  <div className="mb-3 overflow-hidden rounded-[20px] border border-[#e5dccb] bg-[#f7f3eb]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={`${item.id}-${item.designImageUrl || "no-image"}`}
                      src={item.designImageUrl}
                      alt={`ແບບເສື້ອ ${item.orderCode}`}
                      className="h-auto w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : null}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-black text-slate-900">{item.orderCode}</div>
                    <div className="mt-1 text-xs font-bold text-slate-400">
                      {item.orderDate} {item.customerPhoneMasked ? `• ${item.customerPhoneMasked}` : ""}
                    </div>
                  </div>
                  <div className="rounded-full bg-[#edf3e4] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#224734]">
                    {item.currentStageSource === "factory" ? "ໂຮງງານ" : "ຮ້ານ"}
                  </div>
                </div>
                <div className="mt-3 rounded-[18px] bg-[#f8faf6] px-4 py-3">
                  <div className="text-sm font-black text-slate-900">{item.currentStatus}</div>
                  <div className="mt-1 text-xs font-medium text-slate-500">{item.lastUpdatedDisplay || "ຍັງບໍ່ມີເວລາອັບເດດ"}</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-slate-500">
                  <div className="rounded-2xl bg-[#fbf7ef] px-3 py-2">
                    ຈຳນວນ
                    <div className="mt-1 text-base font-black text-[#8a6332]">{item.totalQty.toLocaleString()} ຕົວ</div>
                  </div>
                  <div className="rounded-2xl bg-[#f5f8fb] px-3 py-2">
                    ຂົນສົ່ງ
                    <div className="mt-1 text-base font-black text-slate-900">{item.shipmentStatus || "-"}</div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : null}

        <div className="mt-6 rounded-[24px] border border-white/75 bg-white/72 p-4 text-sm text-slate-600 shadow-[0_16px_44px_rgba(75,63,40,.09)]">
          <div className="flex items-center gap-2 font-black text-slate-900">
            <Phone size={16} />
            ຄຳແນະນຳ
          </div>
          <div className="mt-2 font-medium">
            ຖ້າຄົ້ນຫາດ້ວຍເບີໂທ ລະບົບອາດຈະສະແດງຫຼາຍອໍເດີທີ່ຢູ່ພາຍໃຕ້ເບີດຽວກັນ
          </div>
          <Link href="/login" className="mt-4 inline-flex items-center gap-2 font-black text-[#224734]">
            <PackageCheck size={16} />
            ສຳລັບພະນັກງານ ເຂົ້າລະບົບທີ່ນີ້
          </Link>
        </div>
      </div>
    </div>
  );
}
