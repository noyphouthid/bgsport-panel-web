"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type RowActionMenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
};

const MENU_WIDTH_PX = 232;
const VIEWPORT_GAP_PX = 8;

// Fixed positioning keeps the menu from being clipped by the table's horizontal scroll container.
export function RowActionMenu({ items }: { items: RowActionMenuItem[] }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = position !== null;

  const close = (restoreFocus = false) => {
    setPosition(null);
    if (restoreFocus) buttonRef.current?.focus();
  };

  useLayoutEffect(() => {
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!open || !button || !menu) return;
    const anchor = button.getBoundingClientRect();
    const fitsBelow = anchor.bottom + menu.offsetHeight + VIEWPORT_GAP_PX <= window.innerHeight;
    const top = fitsBelow ? anchor.bottom + 4 : Math.max(VIEWPORT_GAP_PX, anchor.top - menu.offsetHeight - 4);
    if (top !== position?.top) setPosition((current) => (current ? { ...current, top } : current));
    menu.querySelector<HTMLElement>("[role='menuitem']:not([aria-disabled='true'])")?.focus();
    // Measured once per open; the menu closes on scroll and resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setPosition(null);
    };
    const handleViewportChange = () => setPosition(null);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [open]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const options = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not([aria-disabled='true'])") ?? []);
    if (options.length === 0) return;
    const current = options.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    options[(current + step + options.length) % options.length]?.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) return close();
          const anchor = buttonRef.current?.getBoundingClientRect();
          if (!anchor) return;
          const left = Math.max(VIEWPORT_GAP_PX, Math.min(anchor.right - MENU_WIDTH_PX, window.innerWidth - MENU_WIDTH_PX - VIEWPORT_GAP_PX));
          setPosition({ left, top: anchor.bottom + 4 });
        }}
        className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
      >
        ຈັດການ
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {position ? (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          style={{ left: position.left, top: position.top, width: MENU_WIDTH_PX }}
          className="fixed z-40 rounded-xl border border-slate-200 bg-white p-1 text-left shadow-xl"
        >
          {items.map((item) => {
            const tone = item.disabled
              ? "cursor-not-allowed text-slate-300"
              : item.danger
                ? "text-rose-700 hover:bg-rose-50 focus:bg-rose-50"
                : "text-slate-700 hover:bg-slate-100 focus:bg-slate-100";
            const className = `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold outline-none transition ${tone}`;
            return (
              <div key={item.key} className={item.separatorBefore ? "mt-1 border-t border-slate-100 pt-1" : ""}>
                {item.href && !item.disabled ? (
                  <Link role="menuitem" href={item.href} onClick={() => close()} className={className}>
                    {item.icon}
                    {item.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    aria-disabled={item.disabled || undefined}
                    onClick={() => {
                      if (item.disabled) return;
                      close();
                      item.onSelect?.();
                    }}
                    className={className}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
