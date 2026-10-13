"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function CatalogDialog({ label, busy, onClose, children, width = "max-w-4xl" }: { label: string; busy: boolean; onClose: () => void; children: ReactNode; width?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog ref={ref} role="dialog" aria-modal="true" aria-label={label} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className={`fixed m-auto w-[calc(100%-24px)] ${width} max-h-none overflow-visible rounded-2xl border-0 bg-transparent p-0 backdrop:bg-black/60`}>{children}</dialog>;
}
