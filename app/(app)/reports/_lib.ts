"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { ORDER_TYPES, matchOrderPrefix, type OrderPrefixFilter } from "@/lib/order-code";

export const PREFIXES = ORDER_TYPES;
export type PrefixFilter = OrderPrefixFilter;
export type MonthFilter = number | "ALL";

export const prefixOptions: PrefixFilter[] = ["ALL", ...PREFIXES, "OTHER"];
export type WorkflowStatusFilter = "all" | "in_progress" | "production_completed" | "shipment_completed" | "completed";

export function matchPrefix(orderCode: string, prefix: PrefixFilter) {
  return matchOrderPrefix(orderCode, prefix);
}

export function matchSelectedPrefixes(orderCode: string, prefixes: PrefixFilter[]) {
  if (prefixes.length === 0) return true;
  return prefixes.some((prefix) => matchPrefix(orderCode, prefix));
}

export function togglePrefix(prefixes: PrefixFilter[], nextPrefix: PrefixFilter) {
  return prefixes.includes(nextPrefix) ? prefixes.filter((item) => item !== nextPrefix) : [...prefixes, nextPrefix];
}

export function getWorkflowStatus(order: {
  status: "in_progress" | "completed";
  closed_at?: string | null;
  production_completed_at?: string | null;
  shipment_status?: "pending" | "shipped" | null;
  shipment_completed_at?: string | null;
}): Exclude<WorkflowStatusFilter, "all"> {
  const isClosed = order.status === "completed" || Boolean(order.closed_at);
  if (isClosed) return "completed";
  const isShipmentCompleted = order.shipment_status === "shipped" || Boolean(order.shipment_completed_at);
  if (isShipmentCompleted) return "shipment_completed";
  if (order.production_completed_at) return "production_completed";
  return "in_progress";
}

export function matchesWorkflowStatus(
  order: Parameters<typeof getWorkflowStatus>[0],
  filter: WorkflowStatusFilter
) {
  if (filter === "all") return true;
  return getWorkflowStatus(order) === filter;
}

export function getWorkflowStatusLabel(status: Exclude<WorkflowStatusFilter, "all">) {
  if (status === "in_progress") return "ກຳລັງຜະລິດ";
  if (status === "production_completed") return "ຜະລິດສຳເລັດ";
  if (status === "shipment_completed") return "ຈັດສົ່ງສຳເລັດ";
  return "ສຳເລັດແລ້ວ";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function openReportPrintWindow(params: {
  title: string;
  subtitle?: string;
  summary: Array<{ label: string; value: string }>;
  headers: string[];
  rows: string[][];
}) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
  if (!popup) return false;

  const summaryHtml = params.summary
    .map(
      (item) =>
        `<div class="card"><div class="label">${escapeHtml(item.label)}</div><div class="value">${escapeHtml(item.value)}</div></div>`
    )
    .join("");

  const headerHtml = params.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const bodyHtml = params.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");

  popup.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(params.title)}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #0f172a; }
      h1 { margin: 0 0 6px; font-size: 28px; }
      p { margin: 0 0 16px; color: #475569; }
      .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
      .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; }
      .label { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #64748b; }
      .value { margin-top: 8px; font-size: 22px; font-weight: 800; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 12px; }
      th { background: #f8fafc; font-weight: 800; }
      @media print { body { padding: 0; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(params.title)}</h1>
    <p>${escapeHtml(params.subtitle || "")}</p>
    <div class="summary">${summaryHtml}</div>
    <table>
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
    <script>window.onload = () => { window.print(); };</script>
  </body>
</html>`);
  popup.document.close();
  return true;
}

export async function exportReportElementAsPdf(element: HTMLElement, fileName: string) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    onclone: (clonedDocument) => {
      const style = clonedDocument.createElement("style");
      style.textContent = `
        * {
          color: #0f172a !important;
          border-color: #cbd5e1 !important;
          box-shadow: none !important;
          text-shadow: none !important;
        }
        body, div, section, article, aside, main, table, thead, tbody, tr, td, th, button, span, p, h1, h2, h3, h4, h5, h6 {
          background-image: none !important;
        }
        body, div, section, article, aside, main, table, thead, tbody, tr, td, th {
          background-color: #ffffff !important;
        }
        button {
          background-color: #f8fafc !important;
        }
      `;
      clonedDocument.head.appendChild(style);
    },
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(fileName);
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
