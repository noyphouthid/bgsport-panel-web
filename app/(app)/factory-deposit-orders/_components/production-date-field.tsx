"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  LAO_MONTH_LABELS,
  LAO_WEEKDAY_LABELS,
  buildCalendarCells,
  formatCalendarDate,
  getCalendarMonth,
  shiftCalendarMonth,
  type CalendarMonth,
} from "@/lib/production-calendar";

type ProductionDateFieldProps = {
  label: string;
  value: string;
  today: string;
  disabled?: boolean;
  onChange: (date: string) => void;
};

const NAV_BUTTON_CLASS = "inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100";

export function ProductionDateField({ label, value, today, disabled, onChange }: ProductionDateFieldProps) {
  const [month, setMonth] = useState<CalendarMonth | null>(null);
  const open = month !== null;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMonth(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const commit = (date: string) => {
    onChange(date);
    setMonth(null);
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`${label}: ${formatCalendarDate(value) || "ຍັງບໍ່ໄດ້ເລືອກ"}`}
        disabled={disabled}
        onClick={() => setMonth(getCalendarMonth(value) || getCalendarMonth(today))}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-900 outline-none transition hover:bg-slate-50 focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50"
      >
        <span className={value ? "" : "text-slate-400"}>{formatCalendarDate(value) || "ເລືອກວັນທີ"}</span>
        <CalendarDays size={16} className="shrink-0 text-slate-500" />
      </button>

      {month ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setMonth(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[92vh] w-full max-w-[400px] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-black text-slate-900">{label}</h2>
              <button type="button" aria-label="ປິດ" onClick={() => setMonth(null)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button type="button" aria-label="ເດືອນກ່ອນ" onClick={() => setMonth(shiftCalendarMonth(month, -1))} className={NAV_BUTTON_CLASS}>
                <ChevronLeft size={18} />
              </button>
              <div className="text-sm font-black text-slate-900">{LAO_MONTH_LABELS[month.month]} {month.year}</div>
              <button type="button" aria-label="ເດືອນຖັດໄປ" onClick={() => setMonth(shiftCalendarMonth(month, 1))} className={NAV_BUTTON_CLASS}>
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs font-black text-slate-500">
              {LAO_WEEKDAY_LABELS.map((weekday) => (
                <div key={weekday} className="py-1.5">{weekday}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {buildCalendarCells(month).map((date, index) => {
                if (!date) return <div key={`blank-${index}`} />;
                const selected = date === value;
                const isToday = date === today;
                return (
                  <button
                    key={date}
                    type="button"
                    aria-label={formatCalendarDate(date)}
                    aria-pressed={selected}
                    aria-current={isToday ? "date" : undefined}
                    onClick={() => commit(date)}
                    className={`h-11 rounded-lg text-sm font-bold transition ${
                      selected ? "bg-slate-900 text-white" : "text-slate-800 hover:bg-slate-100"
                    } ${isToday && !selected ? "border border-slate-400" : ""}`}
                  >
                    {Number(date.slice(8))}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-black">
              <button type="button" onClick={() => commit(today)} className="h-9 rounded-lg px-3 text-slate-700 transition hover:bg-slate-100">
                ມື້ນີ້
              </button>
              {value ? (
                <button type="button" onClick={() => commit("")} className="h-9 rounded-lg px-3 text-slate-500 transition hover:bg-slate-100">
                  ລ້າງວັນທີ
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
