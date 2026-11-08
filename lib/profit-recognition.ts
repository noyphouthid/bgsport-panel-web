export const PROFIT_RECOGNITION_MIGRATION = "20261106_cod_profit_recognition.sql";
export const PROFIT_RECOGNITION_BASIS = "cod_receipt_v1";
export const EXCLUDE_PROFIT_MIGRATION = "20261116_order_exclude_profit.sql";
export type ProfitRecognitionFields = {
  profit_recognized_at: string | null;
  // Sponsorship shirts and remakes of faulty work: produced and paid for, but never counted as profit.
  exclude_profit?: boolean | null;
  has_transport_cod?: boolean;
  cod_pending_count?: number;
};

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Vientiane", year: "numeric", month: "2-digit", day: "2-digit" });

export function profitDateKey(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return businessDateFormatter.format(date);
}

export function profitPeriodDates(year: number, month: number | "ALL") {
  return month === "ALL"
    ? { start: `${year}-01-01`, endExclusive: `${year + 1}-01-01` }
    : { start: `${year}-${String(month).padStart(2,"0")}-01`, endExclusive: new Date(Date.UTC(year,month,1)).toISOString().slice(0,10) };
}

/** Whether an order's sales and cost belong in profit figures at all. */
export function countsTowardProfit(row: Pick<ProfitRecognitionFields, "exclude_profit">) {
  return !row.exclude_profit;
}

export function isProfitInPeriod(row: ProfitRecognitionFields, year: number, month: number | "ALL") {
  if (!countsTowardProfit(row)) return false;
  const day = profitDateKey(row.profit_recognized_at);
  const { start, endExclusive } = profitPeriodDates(year,month);
  return Boolean(day && day >= start && day < endExclusive);
}

export function profitTimestampRange(from: string, to: string) {
  const next = to ? new Date(`${to}T00:00:00Z`) : null;
  if (next) next.setUTCDate(next.getUTCDate()+1);
  return { start: from ? `${from}T00:00:00+07:00` : "", endExclusive: next ? `${next.toISOString().slice(0,10)}T00:00:00+07:00` : "" };
}

export function recognizedProfit(row: ProfitRecognitionFields & { net_total: number; factory_cost: number }, year?: number, month?: number | "ALL") {
  if (!countsTowardProfit(row) || !row.profit_recognized_at || (year !== undefined && month !== undefined && !isProfitInPeriod(row,year,month))) return 0;
  return (Number(row.net_total)||0) - (Number(row.factory_cost)||0);
}

export function profitRecognitionError(error: { code?: string; message?: string }) {
  if (/exclude_profit/.test(error.message || "")) {
    return `ກະລຸນາລັນ ${EXCLUDE_PROFIT_MIGRATION} ໃນ Supabase SQL Editor ກ່ອນໂຫຼດລາຍງານກຳໄລ`;
  }
  if (/profit_recognized_at|has_transport_cod|cod_pending_count/.test(error.message || "")) {
    return `ກະລຸນາລັນ ${PROFIT_RECOGNITION_MIGRATION} ໃນ Supabase SQL Editor ກ່ອນໂຫຼດລາຍງານກຳໄລ`;
  }
  return error.message || "ໂຫຼດລາຍງານກຳໄລບໍ່ສຳເລັດ";
}
