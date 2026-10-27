"use client";

import JsBarcode from "jsbarcode";
import { useMemo } from "react";
import {
  getTransportNoteCardHtml,
  TRANSPORT_NOTE_STYLES,
  type TransportNotePrintRow,
} from "@/lib/transport-notes";

export function TransportNotePreview({ row, className }: {
  row: Partial<TransportNotePrintRow>;
  className?: string;
}) {
  const barcodeMarkup = useMemo(() => {
    if (!row.note_no || typeof document === "undefined") return null;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, row.note_no.trim(), {
      format: "CODE128", displayValue: false, margin: 0, height: 44, width: 1.35,
    });
    svg.setAttribute("preserveAspectRatio", "none");
    return svg.outerHTML;
  }, [row.note_no]);
  const html = getTransportNoteCardHtml({ ...row, barcode_svg_markup: barcodeMarkup });

  return <>
    <style>{TRANSPORT_NOTE_STYLES}</style>
    <div
      data-transport-note-preview
      className={`transport-note-sheet ${className || ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  </>;
}
