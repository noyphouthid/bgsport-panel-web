"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/dashboard", label: "ໜ້າຫຼັກ" },
  { href: "/orders", label: "ອໍເດີ້" },
  { href: "/search", label: "ຄົ້ນຫາ" },
  { href: "/fabric", label: "ລາຄາຜ້າ" },
  { href: "/users", label: "ຜູ້ໃຊ້" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-800 text-white flex flex-col">
        <div className="h-16 flex items-center px-6 text-xl font-bold border-b border-slate-700">
          BG SPORT
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2 text-sm">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-4 py-2 rounded transition
                  ${active ? "bg-slate-700 font-semibold" : "hover:bg-slate-700/70"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-700 text-xs text-gray-300">
          © 2026 BG SPORT
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="h-16 bg-white border-b flex items-center justify-between px-6">
          <div className="font-semibold text-gray-700">ລະບົບຈັດການ</div>

          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="ຄົ້ນຫາ..."
              className="border rounded px-3 py-1 text-sm"
            />
            <div className="text-sm font-medium text-gray-600">Jarn Noy</div>
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
