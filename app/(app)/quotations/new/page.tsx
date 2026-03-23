"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, FileText, Printer, ReceiptText, Save, Shirt } from "lucide-react";
import bgSportLogo from "@/app/BGSPORTLOGO.png";
import { supabase } from "@/lib/supabase";
import {
  getQuotationDraftById,
  saveQuotationDraft,
  type QuotationDraft,
  type QuotationDraftStatus,
} from "@/lib/quotation-drafts";

type FabricRow = {
  id: string;
  name: string;
  short_price: number;
  long_price: number;
  long_add: number;
  is_active: boolean;
};

type UserRow = {
  id: string;
  full_name: string;
  auth_user_id: string | null;
};

const COLLAR_PRICE = 20000;
const SIZE_UPCHARGES = {
  "3XL": 20000,
  "4XL": 25000,
  "5XL": 35000,
  "6XL": 35000,
} as const;
const DEFAULT_TERMS = "ມັດຈຳເຂົ້າຄິວກ່ອນຜະລິດ ແລະ ຊຳລະຍອດທີ່ເຫຼືອຕາມວັນນັດ.";

const formatMoney = (value: number) => `${Math.max(0, value || 0).toLocaleString()} ກີບ`;

const formatDate = (value: string) => {
  if (!value) return "-";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
};

const buildQuoteNo = () => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `QTF${yy}-${mm}${dd}${hh}${min}`;
};

function CardTitle({ icon: Icon, title, subtitle }: { icon: typeof FileText; title: string; subtitle: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="rounded-2xl bg-sky-100 p-2 text-sky-700">
        <Icon size={18} />
      </div>
      <div>
        <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-700">{title}</div>
        <div className="mt-1 text-sm font-medium text-slate-500">{subtitle}</div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">{children}</label>;
}

function NumberField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
    />
  );
}

export default function NewQuotationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId");

  const [fabrics, setFabrics] = useState<FabricRow[]>([]);
  const [loadingFabrics, setLoadingFabrics] = useState(true);
  const [saving, setSaving] = useState(false);

  const [quoteNo, setQuoteNo] = useState(buildQuoteNo());
  const [quoteDate, setQuoteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<QuotationDraftStatus>("draft");
  const [createdByName, setCreatedByName] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [customerFacebook, setCustomerFacebook] = useState("");

  const [fabricId, setFabricId] = useState("");
  const [styleName, setStyleName] = useState("");
  const [colorName, setColorName] = useState("");
  const [shortQty, setShortQty] = useState(0);
  const [longQty, setLongQty] = useState(0);
  const [freeQty, setFreeQty] = useState(0);
  const [qty3XL, setQty3XL] = useState(0);
  const [qty4XL, setQty4XL] = useState(0);
  const [qty5XL, setQty5XL] = useState(0);
  const [qty6XL, setQty6XL] = useState(0);
  const [collarType, setCollarType] = useState<"none" | "polo" | "mandarin">("none");
  const [collarQty, setCollarQty] = useState(0);
  const [extraCharge, setExtraCharge] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState(DEFAULT_TERMS);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const loadData = async () => {
      setLoadingFabrics(true);
      const [{ data: fabricsData, error: fabricsError }, { data: sessionData }] = await Promise.all([
        supabase
          .from("fabrics")
          .select("id,name,short_price,long_price,long_add,is_active")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase.auth.getSession(),
      ]);

      if (fabricsError) {
        toast.error(`ໂຫຼດລາຄາຜ້າບໍ່ສຳເລັດ: ${fabricsError.message}`);
      } else {
        const rows = (fabricsData ?? []) as FabricRow[];
        setFabrics(rows);
        if (rows.length > 0) setFabricId((prev) => prev || rows[0].id);
      }

      const authUserId = sessionData.session?.user.id;
      if (authUserId) {
        const { data: userData } = await supabase
          .from("users")
          .select("id,full_name,auth_user_id")
          .eq("auth_user_id", authUserId)
          .maybeSingle();
        if (userData) setCreatedByName((userData as UserRow).full_name);
      }

      if (draftId) {
        const draft = getQuotationDraftById(draftId);
        if (draft) {
          setQuoteNo(draft.quoteNo);
          setQuoteDate(draft.quoteDate);
          setStatus(draft.status);
          setCreatedByName(draft.createdByName);
          setCustomerName(draft.customerName);
          setCustomerPhone(draft.customerPhone);
          setCustomerWhatsapp(draft.customerWhatsapp);
          setCustomerFacebook(draft.customerFacebook);
          setFabricId(draft.fabricId);
          setStyleName(draft.styleName);
          setColorName(draft.colorName);
          setShortQty(draft.shortQty);
          setLongQty(draft.longQty);
          setFreeQty(draft.freeQty);
          setQty3XL(draft.qty3XL);
          setQty4XL(draft.qty4XL);
          setQty5XL(draft.qty5XL);
          setQty6XL(draft.qty6XL || 0);
          setCollarType(draft.collarType);
          setCollarQty(draft.collarQty);
          setExtraCharge(draft.extraCharge);
          setDiscount(draft.discount);
          setDeposit(draft.deposit);
          setPaymentDueDate(draft.paymentDueDate);
          setDeliveryDate(draft.deliveryDate);
          setPaymentTerms(draft.paymentTerms);
          setNotes(draft.notes);
        }
      }

      setLoadingFabrics(false);
    };

    void loadData();
  }, [draftId]);

  const selectedFabric = useMemo(() => fabrics.find((item) => item.id === fabricId) ?? null, [fabrics, fabricId]);
  const billableQty = useMemo(() => Math.max(0, shortQty) + Math.max(0, longQty), [shortQty, longQty]);
  const totalQty = useMemo(() => billableQty + Math.max(0, freeQty), [billableQty, freeQty]);
  const collarTotal = useMemo(() => (collarType === "none" ? 0 : Math.max(0, collarQty) * COLLAR_PRICE), [collarType, collarQty]);
  const shirtTotal = useMemo(() => {
    if (!selectedFabric) return 0;
    return Math.max(0, shortQty) * selectedFabric.short_price + Math.max(0, longQty) * selectedFabric.long_price;
  }, [selectedFabric, shortQty, longQty]);
  const plusSizeTotal = useMemo(
    () =>
      Math.max(0, qty3XL) * SIZE_UPCHARGES["3XL"] +
      Math.max(0, qty4XL) * SIZE_UPCHARGES["4XL"] +
      Math.max(0, qty5XL) * SIZE_UPCHARGES["5XL"] +
      Math.max(0, qty6XL) * SIZE_UPCHARGES["6XL"],
    [qty3XL, qty4XL, qty5XL, qty6XL]
  );
  const grossTotal = useMemo(
    () => shirtTotal + plusSizeTotal + collarTotal + Math.max(0, extraCharge),
    [shirtTotal, plusSizeTotal, collarTotal, extraCharge]
  );
  const netTotal = useMemo(() => Math.max(0, grossTotal - Math.max(0, discount)), [grossTotal, discount]);
  const outstanding = useMemo(() => Math.max(0, netTotal - Math.max(0, deposit)), [netTotal, deposit]);

  const resetForm = () => {
    setQuoteNo(buildQuoteNo());
    setQuoteDate(new Date().toISOString().slice(0, 10));
    setStatus("draft");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerWhatsapp("");
    setCustomerFacebook("");
    setStyleName("");
    setColorName("");
    setShortQty(0);
    setLongQty(0);
    setFreeQty(0);
    setQty3XL(0);
    setQty4XL(0);
    setQty5XL(0);
    setQty6XL(0);
    setCollarType("none");
    setCollarQty(0);
    setExtraCharge(0);
    setDiscount(0);
    setDeposit(0);
    setPaymentDueDate("");
    setDeliveryDate("");
    setPaymentTerms(DEFAULT_TERMS);
    setNotes("");
    if (fabrics.length > 0) setFabricId(fabrics[0].id);
  };

  const derivedSleeveType: "short" | "long" | "mixed" = shortQty > 0 && longQty > 0 ? "mixed" : longQty > 0 ? "long" : "short";

  const buildDraft = (): QuotationDraft => ({
    id: draftId || `quotation-${Date.now()}`,
    quoteNo,
    quoteDate,
    status,
    createdByName,
    customerName,
    customerPhone,
    customerWhatsapp,
    customerFacebook,
    fabricId: selectedFabric?.id || "",
    fabricName: selectedFabric?.name || "",
    fabricShortPrice: selectedFabric?.short_price || 0,
    fabricLongPrice: selectedFabric?.long_price || 0,
    styleName,
    colorName,
    sleeveType: derivedSleeveType,
    shortQty,
    longQty,
    freeQty,
    qty3XL,
    qty4XL,
    qty5XL,
    qty6XL,
    collarType,
    collarQty,
    extraCharge,
    discount,
    deposit,
    paymentDueDate,
    deliveryDate,
    paymentTerms,
    notes,
    warningNote: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const handleSaveDraft = () => {
    if (!quoteNo.trim()) {
      toast.error("ກະລຸນາປ້ອນເລກທີ່ໃບປະເມີນ");
      return;
    }
    if (!selectedFabric) {
      toast.error("ກະລຸນາເລືອກຜ້າ");
      return;
    }
    setSaving(true);
    saveQuotationDraft(buildDraft());
    setSaving(false);
    toast.success("ບັນທຶກຮ່າງໃບປະເມີນລາຄາແລ້ວ");
    router.push("/quotations");
  };

  const handlePrint = () => {
    window.print();
  };

  const previewRows = [
    selectedFabric
      ? { key: "fabric", label: selectedFabric.name, qty: 0, price: 0, total: 0, muted: true }
      : null,
    shortQty > 0 && selectedFabric
      ? {
        key: "short",
        label: "ແຂນສັ້ນ",
        qty: shortQty,
        price: selectedFabric.short_price,
        total: shortQty * selectedFabric.short_price,
      }
      : null,
    longQty > 0 && selectedFabric
      ? {
        key: "long",
        label: "ແຂນຍາວ",
        qty: longQty,
        price: selectedFabric.long_price,
        total: longQty * selectedFabric.long_price,
      }
      : null,
    qty3XL > 0
      ? { key: "3xl", label: "ເພີ່ມ 3XL", qty: qty3XL, price: SIZE_UPCHARGES["3XL"], total: qty3XL * SIZE_UPCHARGES["3XL"] }
      : null,
    qty4XL > 0
      ? { key: "4xl", label: "ເພີ່ມ 4XL", qty: qty4XL, price: SIZE_UPCHARGES["4XL"], total: qty4XL * SIZE_UPCHARGES["4XL"] }
      : null,
    qty5XL > 0
      ? { key: "5xl", label: "ເພີ່ມ 5XL", qty: qty5XL, price: SIZE_UPCHARGES["5XL"], total: qty5XL * SIZE_UPCHARGES["5XL"] }
      : null,
    qty6XL > 0
      ? { key: "6xl", label: "ເພີ່ມ 6XL", qty: qty6XL, price: SIZE_UPCHARGES["6XL"], total: qty6XL * SIZE_UPCHARGES["6XL"] }
      : null,
    collarTotal > 0
      ? { key: "collar", label: "ບວກຄໍເສື້ອ/ແຂນເສື້ອ", qty: collarQty, price: COLLAR_PRICE, total: collarTotal }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; qty: number; price: number; total: number; muted?: boolean }>;

  const summaryItems = [
    { label: "ຄ່າເສື້ອລວມ", value: shirtTotal, color: "text-slate-900" },
    { label: "ບວກໄຊສ໌ໃຫຍ່", value: plusSizeTotal, color: "text-amber-700" },
    { label: "ບວກຄໍເສື້ອ/ແຂນເສື້ອ", value: collarTotal, color: "text-sky-700" },
    { label: "ບວກເພີ່ມອື່ນໆ", value: extraCharge, color: "text-violet-700" },
  ];

  return (
    <div className="pb-8 text-slate-900">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between print:hidden">
        <div>
          <Link href="/quotations" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-slate-700">
            <ArrowLeft size={16} />
            ກັບໄປລາຍການໃບປະເມີນລາຄາ
          </Link>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-800">ສ້າງໃບແຈ້ງລາຄາປະເມີນ</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            ຟອມນີ້ມີ preview ຂະໜາດ A5, ປຸ່ມພິມ ແລະ ການບັນທຶກເປັນຮ່າງ
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSaveDraft}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={16} />
            {saving ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກຮ່າງ"}
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <Printer size={16} />
            ພິມ A5
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_420px] print:block">
        <div className="space-y-5 print:hidden">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <CardTitle icon={FileText} title="ເອກະສານ" subtitle="ຂໍ້ມູນເອກະສານ ແລະ ຜູ້ຈັດທຳ" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <FieldLabel>ວັນທີອອກໃບປະເມີນ</FieldLabel>
                <input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
              </div>
              <div>
                <FieldLabel>ເລກທີ່ໃບປະເມີນ</FieldLabel>
                <input value={quoteNo} onChange={(e) => setQuoteNo(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
              </div>
              <div>
                <FieldLabel>ຜູ້ອອກໃບປະເມີນ</FieldLabel>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700">{createdByName || "ກຳລັງໂຫຼດ..."}</div>
              </div>
              <div>
                <FieldLabel>ສະຖານະ</FieldLabel>
                <select value={status} onChange={(e) => setStatus(e.target.value as QuotationDraftStatus)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  <option value="draft">ຮ່າງ</option>
                  <option value="confirmed">ຢືນຢັນແລ້ວ</option>
                  <option value="cancelled">ຍົກເລີກ</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <CardTitle icon={FileText} title="ລູກຄ້າ" subtitle="ຂໍ້ມູນລູກຄ້າ ແລະ ຊ່ອງທາງຕິດຕໍ່" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
             
              <div>
                <FieldLabel>WhatsApp</FieldLabel>
                <input value={customerWhatsapp} onChange={(e) => setCustomerWhatsapp(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
              </div>
              <div>
                <FieldLabel>Facebook</FieldLabel>
                <input value={customerFacebook} onChange={(e) => setCustomerFacebook(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <CardTitle icon={Shirt} title="ລາຍການ" subtitle="ຂໍ້ມູນສິນຄ້າ, ຈຳນວນ, ແລະ ລາຄາ" />
            <div className="grid grid-cols-1 gap-4">
              <div>
                <FieldLabel>ຊື່ຜ້າ</FieldLabel>
                <select
                  value={fabricId}
                  onChange={(e) => setFabricId(e.target.value)}
                  disabled={loadingFabrics}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                >
                  {loadingFabrics ? <option>ກຳລັງໂຫຼດ...</option> : null}
                  {!loadingFabrics && fabrics.length === 0 ? <option>ບໍ່ມີຂໍ້ມູນຜ້າ</option> : null}
                  {fabrics.map((fabric) => (
                    <option key={fabric.id} value={fabric.id}>
                      {fabric.name} / ແຂນສັ້ນ {fabric.short_price.toLocaleString()} / ແຂນຍາວ {fabric.long_price.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
              <div><FieldLabel>ແຂນສັ້ນ</FieldLabel><NumberField value={shortQty} onChange={setShortQty} /></div>
              <div><FieldLabel>ແຂນຍາວ</FieldLabel><NumberField value={longQty} onChange={setLongQty} /></div>
              <div><FieldLabel>ຈຳນວນແຖມ</FieldLabel><NumberField value={freeQty} onChange={setFreeQty} /></div>
              <div><FieldLabel>3XL</FieldLabel><NumberField value={qty3XL} onChange={setQty3XL} /></div>
              <div><FieldLabel>4XL</FieldLabel><NumberField value={qty4XL} onChange={setQty4XL} /></div>
              <div><FieldLabel>5XL</FieldLabel><NumberField value={qty5XL} onChange={setQty5XL} /></div>
              <div><FieldLabel>6XL</FieldLabel><NumberField value={qty6XL} onChange={setQty6XL} /></div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <FieldLabel>ຄໍເສື້ອ/ແຂນເສື້ອ</FieldLabel>
                <select value={collarType} onChange={(e) => setCollarType(e.target.value as "none" | "polo" | "mandarin")} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  <option value="none">ຄໍປົກກະຕິ</option>
                  <option value="polo">ຄໍໂປໂລ +20,000</option>
                  <option value="mandarin">ແຂນຍາວ +20,000</option>
                </select>
              </div>
              <div>
                <FieldLabel>ຈຳນວນຄໍທີ່ບວກເພີ່ມ</FieldLabel>
                <NumberField value={collarQty} onChange={setCollarQty} />
              </div>
              <div>
                <FieldLabel>ຄ່າບວກເພີ່ມອື່ນໆ</FieldLabel>
                <NumberField value={extraCharge} onChange={setExtraCharge} />
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <CardTitle icon={ReceiptText} title="ສະຫຼຸບ" subtitle="ສ່ວນຫຼຸດ ແລະ ມັດຈຳ" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div><FieldLabel>ສ່ວນຫຼຸດ</FieldLabel><NumberField value={discount} onChange={setDiscount} /></div>
              <div><FieldLabel>ມັດຈຳ</FieldLabel><NumberField value={deposit} onChange={setDeposit} /></div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              {summaryItems.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.label}</div>
                  <div className={`mt-2 text-xl font-black ${item.color}`}>{formatMoney(item.value)}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-sky-700">ຍອດລວມ</div>
                <div className="mt-2 text-2xl font-black text-sky-900">{formatMoney(netTotal)}</div>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">ມັດຈຳສັ່ງຜະລິດກ່ອນ</div>
                <div className="mt-2 text-2xl font-black text-emerald-900">{formatMoney(deposit)}</div>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-rose-700">ຍອດຄ້າງຊຳລະ</div>
                <div className="mt-2 text-2xl font-black text-rose-900">{formatMoney(outstanding)}</div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <CardTitle icon={FileText} title="ໝາຍເຫດ" subtitle="ຂຽນລາຍລະອຽດເພີ່ມເຕີມສຳລັບເອກະສານ" />
            <div className="space-y-4">
              <div>
                <FieldLabel>ເງື່ອນໄຂການຊຳລະ</FieldLabel>
                <textarea rows={3} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
              </div>
              <div>
                <FieldLabel>ໝາຍເຫດ</FieldLabel>
                <textarea
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ພິມລາຍລະອຽດເພີ່ມ, ການນັດໝາຍ, ຫຼື ຂໍ້ຕົກລົງພິເສດ..."
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveDraft} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700">
                  <Save size={16} />
                  ບັນທຶກຮ່າງ
                </button>
                <button onClick={resetForm} className="rounded-xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-200">
                  ລ້າງຟອມ
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="print:mt-0">
          <div className="sticky top-4 rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm print:static print:rounded-none print:border-0 print:p-0 print:shadow-none">
            <div className="mb-3 flex items-center justify-between print:hidden">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">ໃບປະເມີນ Preview</div>
                <div className="mt-1 text-sm font-medium text-slate-500">ຕົວຢ່າງເອກະສານກ່ອນພິມ</div>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                {status === "draft" ? "ຮ່າງ" : status === "confirmed" ? "ຢືນຢັນແລ້ວ" : "ຍົກເລີກ"}
              </div>
            </div>

	            <div className='mx-auto aspect-[148/210] w-full max-w-[430px] overflow-hidden border border-slate-300 bg-white print:max-w-none print:border-0 [font-family:"Noto_Sans_Lao_Looped","Noto_Sans_Lao",Tahoma,Arial,sans-serif]'>
	              <div className="flex h-full flex-col bg-white p-4 text-slate-900">
	                <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
	                  <div>
	                    <Image
	                      src={bgSportLogo}
	                      alt="BG Sport Logo"
	                      className="h-auto w-[78px]"
	                      priority
	                    />
	                    <div className="text-[18px] font-black text-slate-900">ຮ້ານ ບີຈີ ສປອຮ໌ດ</div>
	                    <div className="mt-1 max-w-[155px] text-[10px] font-medium leading-4 text-slate-500">
	                      ບ້ານ ສາຍນ້ຳເງິນ ເມືອງ ໄຊທານີ ນະຄອນຫຼວງວຽງຈັນ
                    </div>
                    <div className="mt-1 text-[10px] font-bold text-slate-600">20 9220 1288 - 20 9258 2288</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[19px] font-black tracking-tight text-sky-700">ໃບປະເມີນລາຄາ</div>
                    <div className="mt-1 space-y-1 text-[12px]">
                      <div>ວັນທີ: <span className="font-bold text-slate-900">{formatDate(quoteDate)}</span></div>
                      <div>ເລກທີ່: <span className="font-bold text-slate-900">{quoteNo || "-"}</span></div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 py-2 text-[11px]">
                  <div className="space-y-1 leading-5">
                    <div className="font-black text-sky-700">ຊ່ອງທາງຕິດຕໍ່</div>
                    <div className="text-slate-600">WhatsApp: {customerWhatsapp || "-"}</div>
                    <div className="text-slate-600">Facebook: {customerFacebook || "-"}</div>
                  </div>
                  <div className="space-y-1 text-right leading-5">
                    <div className="font-black text-sky-700">ຂໍ້ມູນໃບປະເມີນ</div>
                    <div className="text-slate-600">ຜູ້ອອກໃບປະເມີນ: <span className="font-bold text-slate-900">{createdByName || "-"}</span></div>
                  </div>
                </div>

                <div className="py-2">
                  <table className="w-full border-collapse text-[10px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="border border-slate-300 px-1 py-1 text-center font-black">#</th>
                        <th className="border border-slate-300 px-1 py-1 text-left font-black">ລາຍການ</th>
                        <th className="border border-slate-300 px-1 py-1 text-center font-black">ຈຳນວນ</th>
                        <th className="border border-slate-300 px-1 py-1 text-right font-black">ລາຄາ</th>
                        <th className="border border-slate-300 px-1 py-1 text-right font-black">ລວມ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, index) => (
                        <tr key={row.key}>
                          <td className="border border-slate-300 px-1.5 py-1.5 text-center font-bold">{index + 1}</td>
                          <td className={`border border-slate-300 px-1.5 py-1.5 ${row.muted ? "font-bold text-slate-900" : ""}`}>{row.label}</td>
                          <td className="border border-slate-300 px-1.5 py-1.5 text-center font-bold">{row.qty > 0 ? row.qty : ""}</td>
                          <td className="border border-slate-300 px-1.5 py-1.5 text-right font-bold">{row.price > 0 ? row.price.toLocaleString() : ""}</td>
                          <td className="border border-slate-300 px-1.5 py-1.5 text-right font-black">{row.total > 0 ? row.total.toLocaleString() : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-[1fr_150px] gap-3">
                  <div className="space-y-2 text-[10px] leading-4 text-slate-600">
                    <div>
                      <div className="font-black text-slate-700">ເງື່ອນໄຂການຊຳລະ</div>
                      <div>{paymentTerms || "-"}</div>
                    </div>
                    <div>
                      <div className="font-black text-slate-700">ໝາຍເຫດ</div>
                      <div>{notes || "-"}</div>
                    </div>
                    <div>
                      <div className="font-black text-slate-700">ຈຳນວນລວມ</div>
                      <div>ໄລ່ເງິນ {billableQty} ຜືນ/ ຜະລິດລວມ {totalQty} ຜືນ</div>
                    </div>
                  </div>
                  <div className="space-y-1.5 rounded-3xl bg-slate-50 p-2 text-[10px]">
                    <div className="flex items-center justify-between"><span className="font-medium text-slate-500">ຍອດລວມ</span><span className="font-bold text-slate-900">{grossTotal.toLocaleString()}</span></div>
                    <div className="flex items-center justify-between"><span className="font-medium text-slate-500">ສ່ວນຫຼຸດ/ຄ່າແບບ</span><span className="font-bold text-rose-600">- {discount.toLocaleString()}</span></div>
                    <div className="flex items-center justify-between"><span className="font-medium text-slate-500">ມັດຈຳກ່ອນ</span><span className="font-bold text-emerald-600">{deposit.toLocaleString()}</span></div>
                    <div className="border-t border-slate-200 pt-2">
                        <div className="flex items-center justify-between"><span className="font-black text-slate-800">ຍອດສຸດທິ</span><span className="text-[13px] font-black text-slate-950">{netTotal.toLocaleString()}</span></div>
                      </div>
                    <div className="flex items-center justify-between"><span className="font-black text-slate-800">ຍອດຄ້າງຊຳລະ</span><span className="text-[13px] font-black text-sky-700">{outstanding.toLocaleString()}</span></div>

                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-center text-[10px]">
                  <div>
                    <div className="font-bold text-slate-800">ຜູ້ອອກໃບປະເມີນ</div>
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">ຜູ້ອະນຸມັດ</div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </aside>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A5 portrait;
            margin: 5mm;
          }

          .app-shell,
          .app-content {
            display: block !important;
            background: #ffffff !important;
          }

          .app-sidebar,
          .app-header {
            display: none !important;
          }

          .app-main {
            padding: 0 !important;
            overflow: visible !important;
          }

          body {
            background: #ffffff;
          }
        }
      `}</style>
    </div>
  );
}
