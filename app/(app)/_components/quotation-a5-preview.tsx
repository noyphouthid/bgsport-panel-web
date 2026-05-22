import Image from "next/image";
import bgSportLogo from "@/app/BGSPORTLOGO.png";
import { getPantsItemsSummary, getPantsLineGross } from "@/lib/order-items";
import type { QuotationDraft } from "@/lib/quotation-drafts";

const COLLAR_PRICE = 20000;
const SIZE_UPCHARGES = {
  "3XL": 20000,
  "4XL": 25000,
  "5XL": 35000,
  "6XL": 35000,
} as const;
const SLEEVE_PRICE = 20000;

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
}

export function QuotationA5Preview({ draft }: { draft: QuotationDraft }) {
  const billableQty = Math.max(0, draft.shortQty) + Math.max(0, draft.longQty);
  const totalQty = billableQty + Math.max(0, draft.freeQty);
  const collarTotal = draft.collarType === "none" ? 0 : Math.max(0, draft.collarQty) * COLLAR_PRICE;
  const sleeveChargeTotal = Math.max(0, draft.sleeveChargeQty) * SLEEVE_PRICE;
  const shirtTotal = Math.max(0, draft.shortQty) * Math.max(0, draft.fabricShortPrice) + Math.max(0, draft.longQty) * Math.max(0, draft.fabricLongPrice);
  const plusSizeTotal =
    Math.max(0, draft.qty3XL) * SIZE_UPCHARGES["3XL"] +
    Math.max(0, draft.qty4XL) * SIZE_UPCHARGES["4XL"] +
    Math.max(0, draft.qty5XL) * SIZE_UPCHARGES["5XL"] +
    Math.max(0, draft.qty6XL) * SIZE_UPCHARGES["6XL"];
  const pantsSummary = getPantsItemsSummary(draft.pantsItems || []);
  const grossTotal = shirtTotal + plusSizeTotal + pantsSummary.grossTotal + collarTotal + sleeveChargeTotal + Math.max(0, draft.extraCharge);
  const netTotal = Math.max(0, grossTotal - Math.max(0, draft.discount));
  const customerBillTotal = Math.max(0, netTotal - Math.max(0, draft.designDeposit));
  const outstanding = Math.max(0, customerBillTotal - Math.max(0, draft.deposit));
  const depositPercent = customerBillTotal > 0 ? (Math.max(0, draft.deposit) / customerBillTotal) * 100 : 0;
  const formattedDepositPercent = Number.isInteger(depositPercent) ? depositPercent.toFixed(0) : depositPercent.toFixed(1);

  const previewRows = [
    draft.fabricName ? { key: "fabric", label: draft.fabricName, qty: 0, price: 0, total: 0, muted: true } : null,
    draft.shortQty > 0
      ? { key: "short", label: "ແຂນສັ້ນ", qty: draft.shortQty, price: Math.max(0, draft.fabricShortPrice), total: draft.shortQty * Math.max(0, draft.fabricShortPrice) }
      : null,
    draft.longQty > 0
      ? { key: "long", label: "ແຂນຍາວ", qty: draft.longQty, price: Math.max(0, draft.fabricLongPrice), total: draft.longQty * Math.max(0, draft.fabricLongPrice) }
      : null,
    draft.qty3XL > 0 ? { key: "3xl", label: "ເພີ່ມ 3XL", qty: draft.qty3XL, price: SIZE_UPCHARGES["3XL"], total: draft.qty3XL * SIZE_UPCHARGES["3XL"] } : null,
    draft.qty4XL > 0 ? { key: "4xl", label: "ເພີ່ມ 4XL", qty: draft.qty4XL, price: SIZE_UPCHARGES["4XL"], total: draft.qty4XL * SIZE_UPCHARGES["4XL"] } : null,
    draft.qty5XL > 0 ? { key: "5xl", label: "ເພີ່ມ 5XL", qty: draft.qty5XL, price: SIZE_UPCHARGES["5XL"], total: draft.qty5XL * SIZE_UPCHARGES["5XL"] } : null,
    draft.qty6XL > 0 ? { key: "6xl", label: "ເພີ່ມ 6XL", qty: draft.qty6XL, price: SIZE_UPCHARGES["6XL"], total: draft.qty6XL * SIZE_UPCHARGES["6XL"] } : null,
    collarTotal > 0 ? { key: "collar", label: "ບວກຄໍເສື້ອ", qty: draft.collarQty, price: COLLAR_PRICE, total: collarTotal } : null,
    sleeveChargeTotal > 0 ? { key: "sleeve", label: "ບວກແຂນເສື້ອ", qty: draft.sleeveChargeQty, price: SLEEVE_PRICE, total: sleeveChargeTotal } : null,
    ...(draft.pantsItems || []).map((item, index) => ({
      key: `pants-${item.clientId}`,
      label: `${item.productName || `ໂສ້ງພິມລາຍ ${index + 1}`}${item.freeQty > 0 ? ` + ແຖມ ${item.freeQty}` : ""}${item.notes.trim() ? ` (${item.notes.trim()})` : ""}`,
      qty: Math.max(0, Number(item.qty) || 0),
      price: Math.max(0, Number(item.unitPrice) || 0),
      total: getPantsLineGross(item),
    })),
  ].filter(Boolean) as Array<{ key: string; label: string; qty: number; price: number; total: number; muted?: boolean }>;

  return (
    <div className='mx-auto aspect-[148/210] w-full max-w-[430px] overflow-hidden border border-slate-300 bg-white [font-family:"Noto_Sans_Lao_Looped","Noto_Sans_Lao",Tahoma,Arial,sans-serif]'>
      <div className="flex h-full flex-col bg-white p-4 text-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
          <div>
            <Image src={bgSportLogo} alt="BG Sport Logo" className="h-auto w-[78px]" priority />
            <div className="text-[18px] font-black text-slate-900">ຮ້ານ ບີຈີ ສປອຮ໌ດ</div>
            <div className="mt-1 max-w-[155px] text-[10px] font-medium leading-4 text-slate-500">
              ບ້ານ ສາຍນ້ຳເງິນ ເມືອງ ໄຊທານີ ນະຄອນຫຼວງວຽງຈັນ
            </div>
            <div className="mt-1 text-[10px] font-bold text-slate-600">20 9220 1288 - 20 9258 2288</div>
          </div>
          <div className="text-right">
            <div className="text-[19px] font-black tracking-tight text-sky-700">ໃບປະເມີນລາຄາ</div>
            <div className="mt-1 space-y-1 text-[12px]">
              <div>ວັນທີ: <span className="font-bold text-slate-900">{formatDate(draft.quoteDate)}</span></div>
              <div>ເລກທີ່: <span className="font-bold text-slate-900">{draft.quoteNo || "-"}</span></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 py-2 text-[11px]">
          <div className="space-y-1 leading-5">
            <div className="font-black text-sky-700">ຊ່ອງທາງຕິດຕໍ່</div>
            <div className="text-slate-600">ລູກຄ້າ: {draft.customerName || "-"}</div>
            <div className="text-slate-600">ເບີໂທ: {draft.customerPhone || "-"}</div>
            <div className="text-slate-600">WhatsApp: {draft.customerWhatsapp || "-"}</div>
            <div className="text-slate-600">Facebook: {draft.customerFacebook || "-"}</div>
          </div>
          <div className="space-y-1 text-right leading-5">
            <div className="font-black text-sky-700">ຂໍ້ມູນໃບປະເມີນ</div>
            <div className="text-slate-600">ຜູ້ອອກໃບປະເມີນ: <span className="font-bold text-slate-900">{draft.createdByName || "-"}</span></div>
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
              <div>{draft.paymentTerms || "-"}</div>
            </div>
            <div>
              <div className="font-black text-slate-700">ໝາຍເຫດ</div>
              <div>{draft.notes || "-"}</div>
            </div>
            <div>
              <div className="font-black text-slate-700">ຈຳນວນລວມ</div>
              <div>ເສື້ອ: ໄລ່ເງິນ {billableQty} ຜືນ / ຜະລິດລວມ {totalQty} ຜືນ</div>
              {draft.pantsItems.length > 0 ? (
                <div>ໂສ້ງ: ໄລ່ເງິນ {pantsSummary.billableQty} ຕົວ / ຜະລິດລວມ {(pantsSummary.billableQty + pantsSummary.freeQty).toLocaleString()} ຕົວ</div>
              ) : null}
            </div>
          </div>
          <div className="space-y-1.5 rounded-3xl bg-slate-50 p-2 text-[10px]">
            <div className="flex items-center justify-between"><span className="font-medium text-slate-500">ຍອດລວມ</span><span className="font-bold text-slate-900">{grossTotal.toLocaleString()}</span></div>
            <div className="flex items-center justify-between"><span className="font-medium text-slate-500">ຫັກຄ່າແບບ</span><span className="font-bold text-amber-700">{draft.designDeposit.toLocaleString()}</span></div>
            <div className="flex items-center justify-between"><span className="font-medium text-slate-500">ສ່ວນຫຼຸດ</span><span className="font-bold text-rose-600">- {draft.discount.toLocaleString()}</span></div>
            <div className="border-t border-slate-200 pt-2">
              <div className="flex items-center justify-between"><span className="font-black text-slate-800">ຄົງເຫຼືອ</span><span className="text-[13px] font-black text-slate-950">{customerBillTotal.toLocaleString()}</span></div>
            </div>
            <div className="flex items-center justify-between"><span className="font-medium text-slate-500">ມັດຈຳກ່ອນ</span><span className="font-bold text-emerald-600">{draft.deposit.toLocaleString()} {draft.deposit > 0 && customerBillTotal > 0 ? `(${formattedDepositPercent}%)` : ""}</span></div>
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
  );
}
