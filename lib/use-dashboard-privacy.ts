"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "bgsport:dashboard-hide-totals";
const CHANGE_EVENT = "bgsport:dashboard-privacy-change";
let fallbackHidden: boolean | null = null;

function readHidden() {
  if (fallbackHidden !== null) return fallbackHidden;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
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

// Keep totals hidden during server rendering and hydration until the saved preference is known.
const serverHidden = () => true;

export function useDashboardPrivacy() {
  const hideTotals = useSyncExternalStore(subscribe, readHidden, serverHidden);

  const toggleTotals = () => {
    const nextHidden = !hideTotals;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(nextHidden));
      fallbackHidden = null;
    } catch {
      // The toggle still works for this session when browser storage is unavailable.
      fallbackHidden = nextHidden;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return { hideTotals, toggleTotals };
}
