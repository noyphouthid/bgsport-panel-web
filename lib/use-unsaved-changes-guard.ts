"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";

type UseUnsavedChangesGuardOptions = {
  enabled?: boolean;
  scopeRef?: RefObject<HTMLElement | null>;
  message?: string;
};

const DEFAULT_MESSAGE = "ຂໍ້ມູນຍັງບໍ່ໄດ້ບັນທຶກ. ຕ້ອງການອອກຈາກໜ້ານີ້ແທ້ບໍ?";

export function useUnsavedChangesGuard({
  enabled = true,
  scopeRef,
  message = DEFAULT_MESSAGE,
}: UseUnsavedChangesGuardOptions = {}) {
  const [isDirty, setIsDirty] = useState(false);
  const bypassRef = useRef(false);
  const popstateBypassRef = useRef(false);
  const pushedGuardRef = useRef(false);
  const pendingDirtyRef = useRef<number | null>(null);

  const clearPendingDirty = useCallback(() => {
    if (pendingDirtyRef.current !== null) window.clearTimeout(pendingDirtyRef.current);
    pendingDirtyRef.current = null;
  }, []);

  const confirmIfDirty = useCallback(() => {
    if (!enabled || !isDirty || bypassRef.current) return true;
    return window.confirm(message);
  }, [enabled, isDirty, message]);

  const allowNextNavigation = useCallback(() => {
    bypassRef.current = true;
    popstateBypassRef.current = true;
    window.setTimeout(() => {
      bypassRef.current = false;
      popstateBypassRef.current = false;
    }, 0);
  }, []);

  const markClean = useCallback(() => {
    clearPendingDirty();
    setIsDirty(false);
    pushedGuardRef.current = false;
    allowNextNavigation();
  }, [allowNextNavigation, clearPendingDirty]);

  useEffect(() => {
    if (enabled && isDirty) return;
    pushedGuardRef.current = false;
  }, [enabled, isDirty]);

  useEffect(() => {
    if (!enabled) return;
    const target = scopeRef?.current ?? document.body;
    if (!target) return;

    const markDirtyFromEvent = (event: Event) => {
      const source = event.target as HTMLElement | null;
      if (!source) return;
      if (source.closest("[data-unsaved-ignore='true']")) return;
      // A capture listener must wait for React onChange to commit the value.
      // Updating synchronously can restore the old value before onChange runs.
      if (pendingDirtyRef.current !== null) return;
      pendingDirtyRef.current = window.setTimeout(() => {
        pendingDirtyRef.current = null;
        setIsDirty(true);
      }, 0);
    };

    target.addEventListener("input", markDirtyFromEvent, true);
    target.addEventListener("change", markDirtyFromEvent, true);

    return () => {
      clearPendingDirty();
      target.removeEventListener("input", markDirtyFromEvent, true);
      target.removeEventListener("change", markDirtyFromEvent, true);
    };
  }, [clearPendingDirty, enabled, scopeRef]);

  useEffect(() => {
    if (!enabled || !isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [enabled, isDirty, message]);

  useEffect(() => {
    if (!enabled || !isDirty) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (bypassRef.current) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (anchor.dataset.unsavedIgnore === "true") return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.href === window.location.href) return;

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      allowNextNavigation();
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [allowNextNavigation, enabled, isDirty, message]);

  useEffect(() => {
    if (!enabled || !isDirty || pushedGuardRef.current) return;

    const marker = { ...(window.history.state ?? {}), __unsaved_guard: Date.now() };
    window.history.pushState(marker, "", window.location.href);
    pushedGuardRef.current = true;

    const handlePopState = () => {
      if (popstateBypassRef.current) return;

      const shouldLeave = window.confirm(message);
      if (shouldLeave) {
        popstateBypassRef.current = true;
        window.removeEventListener("popstate", handlePopState);
        window.history.back();
        return;
      }

      window.history.pushState(marker, "", window.location.href);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [enabled, isDirty, message]);

  return {
    isDirty,
    setDirty: setIsDirty,
    markClean,
    confirmIfDirty,
    allowNextNavigation,
  };
}
