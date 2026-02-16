"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";
// นำเข้า Icon จาก Lucide
import { 
  LayoutDashboard, 
  ClipboardList, 
  Search, 
  Banknote, 
  Users 
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "ໜ້າຫຼັກ", icon: LayoutDashboard },
  { href: "/orders", label: "ອໍເດີ້", icon: ClipboardList },
  { href: "/search", label: "ຄົ້ນຫາ", icon: Search },
  { href: "/fabric", label: "ລາຄາຜ້າ", icon: Banknote },
  { href: "/users", label: "ຜູ້ໃຊ້", icon: Users },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-800 text-white flex flex-col">
        <div className="h-16 flex items-center px-6 text-xl font-bold border-b border-slate-700 tracking-wider">
          BG SPORT
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 text-sm font-medium">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon; // ดึง Icon component ออกมา

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200
                  ${active 
                    ? "bg-slate-700 text-white shadow-lg" 
                    : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
                  }`}
              >
                <Icon size={18} className={active ? "text-blue-400" : "text-slate-400"} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-700 text-[10px] text-slate-500 font-bold uppercase tracking-widest text-center">
          © 2026 BG SPORT System
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="h-16 bg-white border-b flex items-center justify-between px-6 shadow-sm">
          <div className="font-bold text-slate-700 uppercase text-sm tracking-tight">
            ລະບົບຈັດການຂໍ້ມູນ
          </div>

          <div className="flex items-center gap-6">
            <div className="relative">
              <input
                type="text"
                placeholder="ຄົ້ນຫາ..."
                className="border border-slate-200 bg-slate-50 rounded-full px-4 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none w-48 transition-all focus:w-64"
              />
              <Search className="absolute right-3 top-2 text-slate-400" size={14} />
            </div>
            
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs border border-blue-200">
                    JN
                </div>
                <div className="text-sm font-bold text-slate-700">Jarn Noy</div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}