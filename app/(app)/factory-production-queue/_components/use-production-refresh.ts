"use client";

import { useEffect } from "react";

// Keep open worker tables current when another account changes assignments.
export function useProductionRefresh(refresh: () => Promise<void>) {
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible" && !document.querySelector("dialog[open]")) void refresh();
    };
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);
}
