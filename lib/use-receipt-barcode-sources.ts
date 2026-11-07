"use client";

import { useMemo, useSyncExternalStore } from "react";
import { normalizeReceiptBarcodeSources, type ReceiptBarcodeSource } from "@/lib/factory-receipt-barcode";

const STORAGE_KEY = "bgsport:receipt-barcode-sources";
const CHANGE_EVENT = "bgsport:receipt-barcode-sources-change";
const ALL = "factory,shop";
let fallbackValue: string | null = null;

function readValue() {
  if (fallbackValue !== null) return fallbackValue;
  try {
    return window.localStorage.getItem(STORAGE_KEY) || ALL;
  } catch {
    return ALL;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const serverValue = () => ALL;

// Which barcodes the receipt scanner accepts, remembered per browser.
export function useReceiptBarcodeSources() {
  const raw = useSyncExternalStore(subscribe, readValue, serverValue);
  const sources = useMemo(() => normalizeReceiptBarcodeSources(raw), [raw]);

  // Turning off the last selected type is ignored so at least one stays on.
  const toggleSource = (source: ReceiptBarcodeSource) => {
    const next = sources.includes(source) ? sources.filter((item) => item !== source) : [...sources, source];
    if (next.length === 0) return;
    const value = normalizeReceiptBarcodeSources(next).join(",");
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
      fallbackValue = null;
    } catch {
      fallbackValue = value;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return { sources, toggleSource };
}
