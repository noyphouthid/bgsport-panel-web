"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import {
  LayoutDashboard,
  ClipboardList,
  ClipboardCheck,
  ReceiptText,
  Search,
  FileSpreadsheet,
  Settings2,
  Wallet,
  Banknote,
  Users,
  PackagePlus,
  QrCode,
  Truck,
  Factory,
  BellRing,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  LogOut,
  ChevronDown,
  HandCoins,
  Palette,
  Images,
  ScanLine,
  CheckCheck,
  PackageCheck,
  Clock3,
} from "lucide-react";
import ThemeToggle from "@/components/theme-toggle";
import { supabase } from "@/lib/supabase";
import { AppRole, canAccessPath, getDefaultPathForRole } from "@/lib/access-control";
import { type NavBadgeCounts, type NavBadgePath } from "@/lib/nav-badge-counts";
import { normalizeUserPermissionSettings, type UserPermissionSettings } from "@/lib/user-permissions";

type UserProfile = {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  is_active: boolean;
  permission_settings?: UserPermissionSettings | null;
};

type NavLinkItem = {
  type: "link";
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

type NavGroupItem = {
  type: "group";
  label: string;
  icon: typeof LayoutDashboard;
  items: NavLinkItem[];
};

type NavItem = NavLinkItem | NavGroupItem;

const nav: NavItem[] = [
  { type: "link", href: "/dashboard", label: "ໜ້າຫຼັກ", icon: LayoutDashboard },
  { type: "link", href: "/orders", label: "ລາຍການອໍເດີ", icon: ClipboardList },
  { type: "link", href: "/order-alerts", label: "ແຈ້ງເຕືອນອໍເດີ", icon: BellRing },
  { type: "link", href: "/design-queue", label: "ຄິວອອກແບບ", icon: Palette },
  { type: "link", href: "/design-queue/assets", label: "ຄັງຮູບເສື້ອ", icon: Images },
  { type: "link", href: "/quotations", label: "ໃບປະເມີນລາຄາ", icon: ReceiptText },
  { type: "link", href: "/factory-deposit-orders", label: "ມັດຈຳສັ່ງຜະລິດ", icon: ReceiptText },
  { type: "link", href: "/factory-production-queue", label: "ຄິວວາງຜະລິດ", icon: Factory },
  { type: "link", href: "/factory-production-status", label: "ສະຖານະໂຮງງານ", icon: Factory },
  { type: "link", href: "/search", label: "ຄົ້ນຫາອໍເດີທັງໝົດ", icon: Search },
  {
    type: "group",
    label: "ໜ້າລາຍງານ",
    icon: FileSpreadsheet,
    items: [
      { type: "link", href: "/reports/sales-profit", label: "ລາຍງານຍອດຂາຍ-ກຳໄລ", icon: FileSpreadsheet },
      { type: "link", href: "/reports/income-expense", label: "ບັນຊີລາຍຮັບ-ລາຍຈ່າຍ", icon: FileSpreadsheet },
      { type: "link", href: "/reports/monthly-close", label: "ປິດຍອດຂາຍ-ກຳໄລປະຈໍາເດືອນ", icon: FileSpreadsheet },
      { type: "link", href: "/reports/order-status-payments", label: "ລາຍງານຕິດຕາມອໍເດີ-ການຊຳລະ", icon: FileSpreadsheet },
      { type: "link", href: "/reports/orders", label: "ລາຍງານອໍເດີ", icon: FileSpreadsheet },
      { type: "link", href: "/reports/order-activity", label: "Statement ການແກ້ໄຂອໍເດີ", icon: FileSpreadsheet },
      { type: "link", href: "/reports/customer-delivery", label: "ລາຍງານຈັດສົ່ງລູກຄ້າ", icon: FileSpreadsheet },
      { type: "link", href: "/reports/transport-bills", label: "ລາຍງານໃບບິນຂົນສົ່ງ", icon: FileSpreadsheet },
      { type: "link", href: "/reports/factory-payments", label: "ລາຍງານຈ່າຍໂຮງງານ", icon: FileSpreadsheet },
      { type: "link", href: "/reports/payroll", label: "ລາຍງານເງິນເດືອນພະນັກງານ", icon: FileSpreadsheet },
      { type: "link", href: "/reports/data-export", label: "ລາຍງານດຶງຂໍ້ມູນ", icon: FileSpreadsheet },
      { type: "link", href: "/reports/admin-sales", label: "ລາຍງານຍອດຂາຍແອັດມິນ", icon: FileSpreadsheet },
      { type: "link", href: "/reports/graphic-work", label: "ລາຍງານກຣາຟິກ", icon: FileSpreadsheet },
      { type: "link", href: "/reports/design-phone-status", label: "ລາຍງານເບີຄິວອອກແບບ", icon: FileSpreadsheet },
    ],
  },
  { type: "link", href: "/payments", label: "ບັນຊີການຊຳລະເງິນ", icon: Wallet },
  { type: "link", href: "/payroll", label: "ລະບົບເງິນເດືອນພະນັກງານ", icon: HandCoins },
  { type: "link", href: "/factory-payments", label: "ຊຳລະຄ່າໂຮງງານແບບກຸ່ມ", icon: Wallet },
  { type: "link", href: "/payroll/monthly-close", label: "ປິດຍອດເງິນເດືອນພະນັກງານ", icon: Banknote },
  {
    type: "group",
    label: "ຕັ້ງຄ່າ",
    icon: Settings2,
    items: [
      { type: "link", href: "/imports", label: "ນຳເຂົ້າ Excel", icon: FileSpreadsheet },
      { type: "link", href: "/users", label: "ຕັ້ງຄ່າຜູ້ໃຊ້", icon: Users },
      { type: "link", href: "/fabric", label: "ລາຄາຜ້າ", icon: Banknote },
      { type: "link", href: "/order-code-types", label: "ປະເພດລະຫັດ", icon: Settings2 },
    ],
  },
  { type: "link", href: "/inventory-qr", label: "ສ້າງ QR", icon: QrCode },
  { type: "link", href: "/factory-receipts", label: "ຮັບສິນຄ້າເຂົ້າ", icon: PackagePlus },
  { type: "link", href: "/factory-receipts/orders", label: "ລາຍການອໍເດີນຳເຂົ້າ", icon: ClipboardList },
  { type: "link", href: "/shipments", label: "ຈັດສົ່ງສິນຄ້າ", icon: Truck },
  { type: "link", href: "/shipments/notes", label: "ລາຍການໃບຝາກເຄື່ອງ", icon: ReceiptText },
  { type: "link", href: "/shipments/deposits/scan", label: "ສະແກນຢືນຢັນຝາກ", icon: ScanLine },
  { type: "link", href: "/shipments/deposits", label: "ລາຍການຝາກສຳເລັດ", icon: PackageCheck },
  { type: "link", href: "/shipments/approvals", label: "ອະນຸມັດສົ່ງມອບ", icon: CheckCheck },
  { type: "link", href: "/shipments/orders", label: "ລາຍການອໍເດີຈັດສົ່ງ", icon: ClipboardCheck },
  { type: "link", href: "/change-requests", label: "ຄຳຂໍລໍຖ້າອະນຸມັດ", icon: Clock3 },
];

function formatNavBadgeCount(count: number) {
  return count > 99 ? "99+" : count.toLocaleString();
}

function NavCountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full border border-rose-200 bg-rose-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-white shadow-sm">
      {formatNavBadgeCount(count)}
    </span>
  );
}

function isNavBadgeRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getSeenNavBadgeStorageKey(userId: string) {
  return `bgsport:seen-nav-badges:${userId}`;
}

async function fetchNavBadgeCountsViaApi() {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("no_session");
  }

  const response = await fetch("/api/nav-badge-counts", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as { counts?: NavBadgeCounts; error?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload.message || payload.error || "load_nav_badge_counts_failed");
  }

  return payload.counts || {};
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [navBadgeCounts, setNavBadgeCounts] = useState<NavBadgeCounts>({});
  const [seenNavBadgeSignatures, setSeenNavBadgeSignatures] = useState<Partial<Record<NavBadgePath, string>>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Reports: false,
    Setting: false,
  });

  useEffect(() => {
    let active = true;

    const loadAuth = async () => {
      setAuthChecking(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        if (active) {
          setProfile(null);
          setSeenNavBadgeSignatures({});
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
          setSeenNavBadgeSignatures({});
          setAuthChecking(false);
        }
        router.replace("/login");
        return;
      }

      const { data: byAuthId, error: byAuthIdErr } = await supabase
        .from("users")
        .select("id,full_name,email,role,is_active,auth_user_id,permission_settings")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (byAuthIdErr) {
        await supabase.auth.signOut();
        if (active) {
          setProfile(null);
          setSeenNavBadgeSignatures({});
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
          .select("id,full_name,email,role,is_active,auth_user_id,permission_settings")
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
          setSeenNavBadgeSignatures({});
          setAuthChecking(false);
        }
        toast.error("ບັນຊີນີ້ບໍ່ມີສິດເຂົ້າໃຊ້ລະບົບ");
        router.replace("/login");
        return;
      }

      if (active) {
        let storedSeenBadges: Partial<Record<NavBadgePath, string>> = {};
        try {
          const raw = window.localStorage.getItem(getSeenNavBadgeStorageKey((userRow as UserProfile).id));
          storedSeenBadges = raw ? ((JSON.parse(raw) as Partial<Record<NavBadgePath, string>>) || {}) : {};
        } catch {
          storedSeenBadges = {};
        }

        setProfile({
          ...(userRow as UserProfile),
          permission_settings: normalizeUserPermissionSettings((userRow as UserProfile).permission_settings),
        });
        setSeenNavBadgeSignatures(storedSeenBadges);
        setAuthChecking(false);
      }
    };

    void loadAuth();

    const { data: authState } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setProfile(null);
        setSeenNavBadgeSignatures({});
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
    if (!canAccessPath(pathname, profile.role, profile.permission_settings)) {
      toast.error("ທ່ານບໍ່ມີສິດເຂົ້າເບິ່ງໜ້ານີ້");
      router.replace(getDefaultPathForRole(profile.role));
    }
  }, [pathname, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;

    let active = true;

    const loadNavBadgeCounts = async () => {
      try {
        const nextCounts = await fetchNavBadgeCountsViaApi();
        if (active) {
          const activeEntry = (Object.keys(nextCounts) as NavBadgePath[]).find((href) => isNavBadgeRouteActive(pathname, href));
          if (activeEntry) {
            const activeSignature = nextCounts[activeEntry]?.signature || "";
            if (activeSignature && seenNavBadgeSignatures[activeEntry] !== activeSignature) {
              const nextSeen = {
                ...seenNavBadgeSignatures,
                [activeEntry]: activeSignature,
              };
              setSeenNavBadgeSignatures(nextSeen);
              window.localStorage.setItem(getSeenNavBadgeStorageKey(profile.id), JSON.stringify(nextSeen));
            }
          }
          setNavBadgeCounts(nextCounts);
        }
      } catch (error) {
        console.error("Failed to load navigation badge counts", error);
      }
    };

    void loadNavBadgeCounts();

    const intervalId = window.setInterval(() => {
      void loadNavBadgeCounts();
    }, 30_000);

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        void loadNavBadgeCounts();
      }
    };

    window.addEventListener("focus", handleVisibilityRefresh);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
    };
  }, [pathname, profile?.id, profile?.role, seenNavBadgeSignatures]);

  const availableNav = useMemo(() => {
    if (!profile) return [];
    return nav
      .map((item) => {
        if (item.type === "link") {
          return canAccessPath(item.href, profile.role, profile.permission_settings) ? item : null;
        }

        const availableItems = item.items.filter((subItem) => canAccessPath(subItem.href, profile.role, profile.permission_settings));
        if (availableItems.length === 0) return null;

        return {
          ...item,
          items: availableItems,
        } satisfies NavGroupItem;
      })
      .filter((item): item is NavItem => item !== null);
  }, [profile]);

  const userInitials = useMemo(() => {
    const name = String(profile?.full_name || "").trim();
    if (!name) return "BG";
    const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "BG";
  }, [profile]);

  const getNavBadgeCount = (href: string) => {
    const path = href as NavBadgePath;
    const entry = navBadgeCounts[path];
    if (!entry || entry.count <= 0) return 0;
    if (isNavBadgeRouteActive(pathname, href)) return 0;
    if (seenNavBadgeSignatures[path] === entry.signature) return 0;
    return entry.count;
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast("ອອກຈາກລະບົບແລ້ວ");
    router.replace("/login");
  };

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--theme-surface-muted)]">
        <div className="text-sm font-bold text-[var(--theme-foreground)]">ກຳລັງກວດສອບສິດເຂົ້າໃຊ້...</div>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 2800,
            style: { fontWeight: 700, background: "var(--theme-surface)", color: "var(--theme-foreground)", border: "1px solid var(--theme-border)" },
          }}
        />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="app-shell min-h-screen min-h-[100dvh] md:h-screen md:flex bg-transparent overflow-x-hidden overscroll-none text-[var(--theme-foreground)]">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-[2px] md:hidden"
        />
      )}

      <aside
        className={`app-sidebar fixed inset-y-0 left-0 z-40 h-[100dvh] overflow-y-auto overscroll-contain flex flex-col border-r transition-all duration-300 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarCollapsed ? "md:w-20" : "md:w-64"} w-64`}
        style={{
          background: "var(--app-sidebar-bg)",
          color: "var(--app-sidebar-fg)",
          borderColor: "var(--app-sidebar-border)",
        }}
      >
        <div
          className={`h-16 flex items-center border-b tracking-wider ${
            sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"
          }`}
          style={{ borderColor: "var(--app-sidebar-border)" }}
        >
          {!sidebarCollapsed && <div className="text-xl font-bold">BG SPORT</div>}
          {sidebarCollapsed && <div className="text-sm font-black">BG</div>}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="hidden md:inline-flex items-center justify-center w-8 h-8 rounded-lg transition"
              style={{ color: "var(--app-sidebar-muted)" }}
              aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = "var(--app-sidebar-hover)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded-lg transition"
              style={{ color: "var(--app-sidebar-muted)" }}
              aria-label="Close navigation"
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = "var(--app-sidebar-hover)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-1 text-sm font-medium">
          {availableNav.map((item) => {
            if (item.type === "link") {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              const badgeCount = getNavBadgeCount(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 ${
                    active ? "text-white shadow-lg" : "hover:text-white"
                  } ${sidebarCollapsed ? "md:justify-center md:px-2" : ""}`}
                  style={{
                    backgroundColor: active ? "var(--app-sidebar-active)" : "transparent",
                    color: active ? "var(--app-sidebar-fg)" : "var(--app-sidebar-muted)",
                  }}
                  onMouseEnter={(event) => {
                    if (!active) event.currentTarget.style.backgroundColor = "var(--app-sidebar-hover)";
                  }}
                  onMouseLeave={(event) => {
                    if (!active) event.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div className="relative flex items-center justify-center">
                    <Icon size={18} className={active ? "text-blue-400" : ""} style={active ? undefined : { color: "var(--app-sidebar-muted)" }} />
                    {sidebarCollapsed && badgeCount > 0 ? (
                      <span className="absolute -right-2.5 -top-2.5">
                        <NavCountBadge count={badgeCount} />
                      </span>
                    ) : null}
                  </div>
                  <span className={`flex-1 ${sidebarCollapsed ? "md:hidden" : ""}`}>{item.label}</span>
                  {!sidebarCollapsed && badgeCount > 0 ? <NavCountBadge count={badgeCount} /> : null}
                </Link>
              );
            }

            const Icon = item.icon;
            const groupActive = item.items.some((subItem) => pathname === subItem.href || pathname.startsWith(subItem.href + "/"));
            const isOpen = sidebarCollapsed ? false : groupActive || openGroups[item.label] === true;

            return (
              <div key={item.label} className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    if (sidebarCollapsed) {
                      setSidebarCollapsed(false);
                      setOpenGroups((prev) => ({ ...prev, [item.label]: true }));
                      return;
                    }
                    setOpenGroups((prev) => ({ ...prev, [item.label]: !prev[item.label] }));
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left transition-all duration-200 ${
                    groupActive ? "text-white shadow-lg" : "hover:text-white"
                  } ${sidebarCollapsed ? "md:justify-center md:px-2" : ""}`}
                  style={{
                    backgroundColor: groupActive ? "var(--app-sidebar-active)" : "transparent",
                    color: groupActive ? "var(--app-sidebar-fg)" : "var(--app-sidebar-muted)",
                  }}
                  onMouseEnter={(event) => {
                    if (!groupActive) event.currentTarget.style.backgroundColor = "var(--app-sidebar-hover)";
                  }}
                  onMouseLeave={(event) => {
                    if (!groupActive) event.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <Icon size={18} className={groupActive ? "text-blue-400" : ""} style={groupActive ? undefined : { color: "var(--app-sidebar-muted)" }} />
                  <span className={`flex-1 ${sidebarCollapsed ? "md:hidden" : ""}`}>{item.label}</span>
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""} ${
                      sidebarCollapsed ? "md:hidden" : ""
                    }`}
                  />
                </button>

                {!sidebarCollapsed && isOpen ? (
                  <div className="space-y-1 pl-4">
                    {item.items.map((subItem) => {
                      const subActive = pathname === subItem.href || pathname.startsWith(subItem.href + "/");
                      const SubIcon = subItem.icon;

                      return (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center gap-3 rounded-lg px-4 py-2.5 transition-all duration-200 ${
                            subActive ? "text-white" : "hover:text-white"
                          }`}
                          style={{
                            backgroundColor: subActive ? "var(--app-sidebar-active)" : "transparent",
                            color: subActive ? "var(--app-sidebar-fg)" : "var(--app-sidebar-muted)",
                          }}
                          onMouseEnter={(event) => {
                            if (!subActive) event.currentTarget.style.backgroundColor = "var(--app-sidebar-hover)";
                          }}
                          onMouseLeave={(event) => {
                            if (!subActive) event.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          <SubIcon size={16} className={subActive ? "text-blue-400" : ""} style={subActive ? undefined : { color: "var(--app-sidebar-muted)" }} />
                          <span>{subItem.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div
          className={`p-4 border-t text-[10px] font-bold uppercase tracking-widest text-center ${
            sidebarCollapsed ? "md:hidden" : ""
          }`}
          style={{ borderColor: "var(--app-sidebar-border)", color: "var(--app-sidebar-muted)" }}
        >
          Â© 2026 BG SPORT System
        </div>
      </aside>

      <div className="app-content min-h-screen min-h-[100dvh] md:flex-1 flex flex-col min-w-0">
        <header
          className="app-header sticky top-0 z-20 flex min-h-16 items-center justify-between border-b px-4 py-3 shadow-sm backdrop-blur md:px-6"
          style={{ background: "var(--app-header-bg)", borderColor: "var(--theme-border)" }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border text-[var(--theme-foreground)] transition hover:bg-[var(--theme-surface-muted)]"
              style={{ borderColor: "var(--theme-border)" }}
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="hidden md:inline-flex items-center justify-center w-9 h-9 rounded-lg border text-[var(--theme-foreground)] transition hover:bg-[var(--theme-surface-muted)]"
              style={{ borderColor: "var(--theme-border)" }}
              aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <div className="font-bold uppercase text-xs md:text-sm tracking-tight text-[var(--theme-foreground)]">BG Sport Management</div>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            <ThemeToggle compactLabel className="px-2.5 py-1.5 md:px-3 md:py-2" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs border border-blue-200 shadow-sm">
                {userInitials}
              </div>
              <div className="hidden md:block text-sm font-bold text-[var(--theme-foreground)]">{profile.full_name}</div>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 md:w-auto w-8 overflow-hidden"
              >
                <LogOut size={14} />
                ອອກລະບົບ
              </button>
            </div>
          </div>
        </header>

        <main className="app-main min-w-0 flex-1 overflow-x-hidden p-4 overscroll-none md:overflow-auto md:p-6">{children}</main>
      </div>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 2800,
          style: { fontWeight: 700, background: "var(--theme-surface)", color: "var(--theme-foreground)", border: "1px solid var(--theme-border)" },
        }}
      />
    </div>
  );
}
