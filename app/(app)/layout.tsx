"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import {
  LayoutDashboard,
  ClipboardList,
  Search,
  FileSpreadsheet,
  Wallet,
  Banknote,
  Users,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  LogOut,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AppRole, canAccessPath } from "@/lib/access-control";

type UserProfile = {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  is_active: boolean;
};

const nav = [
  { href: "/dashboard", label: "ໜ້າຫຼັກ", icon: LayoutDashboard },
  { href: "/orders", label: "ລາຍການອໍເດີ", icon: ClipboardList },
  { href: "/search", label: "ຄົ້ນຫາອໍເດີທັງໝົດ", icon: Search },
  { href: "/reports", label: "ໜ້າຫຼັກລາຍງານ", icon: FileSpreadsheet },
  { href: "/reports/sales-profit", label: "ລາຍງານຍອດຂາຍ-ກຳໄລ", icon: FileSpreadsheet },
  { href: "/reports/orders", label: "ລາຍງານອໍເດີ້", icon: FileSpreadsheet },
  { href: "/reports/admin-sales", label: "ລາຍງານຍອດຂາຍແອັດມິນ", icon: FileSpreadsheet },
  { href: "/reports/graphic-work", label: "ລາຍງານກຣາຟິກ", icon: FileSpreadsheet },
  { href: "/payments", label: "ບັນຊີການຊຳລະເງິນ", icon: Wallet },
  { href: "/imports", label: "ນຳເຂົ້າ Excel", icon: FileSpreadsheet },
  { href: "/fabric", label: "ລາຄາຜ້າ", icon: Banknote },
  { href: "/users", label: "ຕັ້ງຄ່າຜູ້ໃຊ້", icon: Users },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let active = true;

    const loadAuth = async () => {
      setAuthChecking(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        if (active) {
          setProfile(null);
          setAuthChecking(false);
        }
        router.replace("/login");
        return;
      }

      const email = String(session.user.email || "").trim().toLowerCase();
      const authUserId = session.user.id;
      if (!email) {
        await supabase.auth.signOut();
        if (active) {
          setProfile(null);
          setAuthChecking(false);
        }
        router.replace("/login");
        return;
      }

      const { data: byAuthId, error: byAuthIdErr } = await supabase
        .from("users")
        .select("id,full_name,email,role,is_active,auth_user_id")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (byAuthIdErr) {
        await supabase.auth.signOut();
        if (active) {
          setProfile(null);
          setAuthChecking(false);
        }
        toast.error("ເກີດຂໍ້ຜິດພາດການກວດສອບຜູ້ໃຊ້");
        router.replace("/login");
        return;
      }

      let userRow = byAuthId;
      if (!userRow) {
        const { data: byEmail, error: byEmailErr } = await supabase
          .from("users")
          .select("id,full_name,email,role,is_active,auth_user_id")
          .ilike("email", email)
          .maybeSingle();
        if (byEmailErr) {
          await supabase.auth.signOut();
          if (active) {
            setProfile(null);
            setAuthChecking(false);
          }
          toast.error("ເກີດຂໍ້ຜິດພາດການກວດສອບຜູ້ໃຊ້");
          router.replace("/login");
          return;
        }
        userRow = byEmail;
      }

      if (!userRow || !userRow.is_active) {
        await supabase.auth.signOut();
        if (active) {
          setProfile(null);
          setAuthChecking(false);
        }
        toast.error("ບັນຊີນີ້ບໍ່ມີສິດເຂົ້າໃຊ້ລະບົບ");
        router.replace("/login");
        return;
      }

      if (active) {
        setProfile(userRow as UserProfile);
        setAuthChecking(false);
      }
    };

    void loadAuth();

    const { data: authState } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setProfile(null);
        router.replace("/login");
      }
    });

    return () => {
      active = false;
      authState.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!profile) return;
    if (!canAccessPath(pathname, profile.role)) {
      toast.error("ທ່ານບໍ່ມີສິດເຂົ້າເບິ່ງໜ້ານີ້");
      router.replace("/dashboard");
    }
  }, [pathname, profile, router]);

  const availableNav = useMemo(() => {
    if (!profile) return [];
    return nav.filter((item) => canAccessPath(item.href, profile.role));
  }, [profile]);

  const userInitials = useMemo(() => {
    const name = String(profile?.full_name || "").trim();
    if (!name) return "BG";
    const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "BG";
  }, [profile]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast("ອອກຈາກລະບົບແລ້ວ");
    router.replace("/login");
  };

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-sm font-bold text-slate-600">ກຳລັງກວດສອບສິດເຂົ້າໃຊ້...</div>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 2800,
            style: { fontWeight: 700 },
          }}
        />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="h-screen md:flex bg-gray-100 overflow-hidden">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
        />
      )}

      <aside
        onWheel={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={`fixed inset-y-0 left-0 z-40 bg-slate-800 text-white h-screen flex flex-col transition-all duration-300 md:sticky md:top-0 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarCollapsed ? "md:w-20" : "md:w-64"} w-64`}
      >
        <div
          className={`h-16 flex items-center border-b border-slate-700 tracking-wider ${
            sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"
          }`}
        >
          {!sidebarCollapsed && <div className="text-xl font-bold">BG SPORT</div>}
          {sidebarCollapsed && <div className="text-sm font-black">BG</div>}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="hidden md:inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-700 text-slate-300"
              aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-700 text-slate-300"
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-hidden px-3 py-6 space-y-1 text-sm font-medium">
          {availableNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 ${
                  active ? "bg-slate-700 text-white shadow-lg" : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
                } ${sidebarCollapsed ? "md:justify-center md:px-2" : ""}`}
              >
                <Icon size={18} className={active ? "text-blue-400" : "text-slate-400"} />
                <span className={sidebarCollapsed ? "md:hidden" : ""}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div
          className={`p-4 border-t border-slate-700 text-[10px] text-slate-500 font-bold uppercase tracking-widest text-center ${
            sidebarCollapsed ? "md:hidden" : ""
          }`}
        >
          © 2026 BG SPORT System
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b flex items-center justify-between px-6 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="hidden md:inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <div className="font-bold text-slate-700 uppercase text-sm tracking-tight">BG Sport Management</div>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                className="border border-slate-200 bg-slate-50 rounded-full px-4 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none w-48 transition-all focus:w-64"
              />
              <Search className="absolute right-3 top-2 text-slate-400" size={14} />
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs border border-blue-200">
                {userInitials}
              </div>
              <div className="text-sm font-bold text-slate-700">{profile.full_name}</div>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700"
              >
                <LogOut size={14} />
                ອອກລະບົບ
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 2800,
          style: { fontWeight: 700 },
        }}
      />
    </div>
  );
}
