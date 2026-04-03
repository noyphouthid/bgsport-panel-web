"use client";

import { ORDER_TYPES, matchOrderPrefix, type OrderPrefixFilter } from "@/lib/order-code";

export const PREFIXES = ORDER_TYPES;
export type PrefixFilter = OrderPrefixFilter;
export type MonthFilter = number | "ALL";

export const prefixOptions: PrefixFilter[] = ["ALL", ...PREFIXES, "OTHER"];

export function matchPrefix(orderCode: string, prefix: PrefixFilter) {
  return matchOrderPrefix(orderCode, prefix);
}

export function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).toISOString();
  const endExclusive = new Date(Date.UTC(year, month, 1, 0, 0, 0)).toISOString();
  return { start, endExclusive };
}

export function periodRange(year: number, month: MonthFilter) {
  if (month === "ALL") {
    const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0)).toISOString();
    const endExclusive = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0)).toISOString();
    return { start, endExclusive };
  }
  return monthRange(year, month);
}

export function toDateOnly(input: string | null) {
  if (!input) return "";
  return new Date(input).toISOString().slice(0, 10);
}

export function buildMonthOptions() {
  return [
    { value: "ALL" as const, label: "ALL MONTHS" },
    ...Array.from({ length: 12 }, (_, i) => ({
      value: i + 1,
      label: String(i + 1).padStart(2, "0"),
    })),
  ];
}

export function buildYearOptions(back = 4, forward = 1) {
  const now = new Date().getFullYear();
  const out: number[] = [];
  for (let y = now - back; y <= now + forward; y += 1) out.push(y);
  return out;
}
