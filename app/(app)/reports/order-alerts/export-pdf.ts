"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

type OrderAlertPdfParams = {
  title: string;
  summary: string[];
  headers: string[];
  rows: string[][];
  // Column indexes shown right-aligned (numbers).
  numericColumns?: number[];
};

// A4 landscape: 297 x 210 mm with 10 mm margins. The page is laid out at a
// fixed pixel width, and each page holds whole rows, so no row is cut in half.
const PAGE_MM = { width: 297, height: 210, margin: 10 };
const PAGE_PX_WIDTH = 1400;
const PAGE_PX_HEIGHT = Math.floor(
  (PAGE_PX_WIDTH * (PAGE_MM.height - PAGE_MM.margin * 2)) / (PAGE_MM.width - PAGE_MM.margin * 2)
);
const BORDER = "1px solid #334155";

function cell(tag: "th" | "td", text: string, alignRight: boolean) {
  const element = document.createElement(tag);
  element.textContent = text;
  Object.assign(element.style, {
    border: BORDER,
    padding: "8px 10px",
    fontSize: "15px",
    lineHeight: "1.5",
    textAlign: alignRight ? "right" : "left",
    verticalAlign: "top",
    wordBreak: "break-word",
    fontWeight: tag === "th" ? "700" : "400",
    background: tag === "th" ? "#e2e8f0" : "transparent",
  });
  return element;
}

function createPage(params: OrderAlertPdfParams, withHeading: boolean) {
  const page = document.createElement("div");
  Object.assign(page.style, {
    width: `${PAGE_PX_WIDTH}px`,
    background: "#ffffff",
    color: "#0f172a",
    boxSizing: "border-box",
  });
  if (withHeading) {
    const title = document.createElement("h1");
    title.textContent = params.title;
    Object.assign(title.style, { margin: "0 0 8px", fontSize: "26px", fontWeight: "800" });
    page.appendChild(title);
    for (const line of params.summary) {
      const text = document.createElement("p");
      text.textContent = line;
      Object.assign(text.style, { margin: "0 0 4px", fontSize: "17px", fontWeight: "600" });
      page.appendChild(text);
    }
  }
  const table = document.createElement("table");
  Object.assign(table.style, { width: "100%", borderCollapse: "collapse", marginTop: withHeading ? "14px" : "0" });
  const headRow = table.createTHead().insertRow();
  params.headers.forEach((header, index) => headRow.appendChild(cell("th", header, params.numericColumns?.includes(index) ?? false)));
  const body = table.createTBody();
  page.appendChild(table);
  return { page, body };
}

export async function exportOrderAlertReportPdf(params: OrderAlertPdfParams, fileName: string) {
  const host = document.createElement("div");
  Object.assign(host.style, { position: "fixed", left: "-100000px", top: "0", zIndex: "-1", pointerEvents: "none" });
  document.body.appendChild(host);

  try {
    // Fill each page row by row; a row that overflows starts the next page.
    const pages: HTMLElement[] = [];
    let current = createPage(params, true);
    host.appendChild(current.page);
    for (const row of params.rows) {
      const tr = current.body.insertRow();
      row.forEach((text, index) => tr.appendChild(cell("td", text, params.numericColumns?.includes(index) ?? false)));
      if (current.page.scrollHeight > PAGE_PX_HEIGHT && current.body.rows.length > 1) {
        tr.remove();
        pages.push(current.page);
        current = createPage(params, false);
        host.appendChild(current.page);
        current.body.appendChild(tr);
      }
    }
    pages.push(current.page);

    const pdf = new jsPDF("l", "mm", "a4");
    const contentWidth = PAGE_MM.width - PAGE_MM.margin * 2;
    for (const [index, page] of pages.entries()) {
      const canvas = await html2canvas(page, { scale: 2, backgroundColor: "#ffffff", logging: false });
      if (index > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", PAGE_MM.margin, PAGE_MM.margin, contentWidth, (canvas.height * contentWidth) / canvas.width);
      if (pages.length > 1) {
        pdf.setFontSize(9);
        pdf.text(`${index + 1} / ${pages.length}`, PAGE_MM.width - PAGE_MM.margin, PAGE_MM.height - 4, { align: "right" });
      }
    }
    pdf.save(fileName);
  } finally {
    host.remove();
  }
}
