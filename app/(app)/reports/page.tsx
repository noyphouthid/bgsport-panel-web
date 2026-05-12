"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Palette, TrendingUp, UserRound, CalendarCheck2, Database, Wallet, Phone, HandCoins } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { canAccessPath, type AppRole } from "@/lib/access-control";
import { normalizeUserPermissionSettings, type UserPermissionSettings } from "@/lib/user-permissions";

type ViewerProfile = {
  role: AppRole;
  permission_settings?: UserPermissionSettings | null;
};

const cards = [
  {
    href: "/reports/sales-profit",
    title: "ລາຍງານຍອດຂາຍ-ກຳໄລ",
    desc: "ສະຫຼຸບຍອດຂາຍ, ກຳໄລ, ຈຳນວນເສື້ອ, ຈຳນວນອໍເດີ້",
    icon: TrendingUp,
    iconBg: "bg-emerald-100 text-emerald-700",
  },
  {
    href: "/reports/orders",
    title: "ລາຍງານອໍເດີ້",
    desc: "ຕິດຕາມການຊຳລະ ແລະ ສະຖານະການຜະລິດໃນແຕ່ລະເດືອນ",
    icon: ClipboardList,
    iconBg: "bg-blue-100 text-blue-700",
  },
  {
    href: "/reports/factory-payments",
    title: "ລາຍງານຈ່າຍໂຮງງານ",
    desc: "ສະຫຼຸບຍອດຈ່າຍໂຮງງານ, batch ການຈ່າຍ ແລະ ຍອດຄ້າງຕາມອໍເດີ",
    icon: Wallet,
    iconBg: "bg-emerald-100 text-emerald-700",
  },
  {
    href: "/reports/payroll",
    title: "ລາຍງານເງິນເດືອນພະນັກງານ",
    desc: "ສະຫຼຸບລາຍຮັບ, ລາຍການຫັກ, ເງິນສຸດທິ ແລະ ສະຖານະການຈ່າຍຂອງພະນັກງານ",
    icon: HandCoins,
    iconBg: "bg-orange-100 text-orange-700",
  },
  {
    href: "/reports/admin-sales",
    title: "ລາຍງານສະຫຼຸບຍອດຂາຍແອັດມິນ",
    desc: "ສະຫຼຸບຈຳນວນເສື້ອ, ອໍເດີ້, ແລະ ຍອດຂາຍ ຕາມ admin",
    icon: UserRound,
    iconBg: "bg-violet-100 text-violet-700",
  },
  {
    href: "/reports/graphic-work",
    title: "ລາຍງານສະຫຼຸບວຽກ Graphic",
    desc: "ສະຫຼຸບວຽກອອກແບບ, ຈຳນວນອໍເດີ້ ແລະ ມູນຄ່າງານຕາມ graphic",
    icon: Palette,
    iconBg: "bg-amber-100 text-amber-700",
  },
  {
    href: "/reports/design-phone-status",
    title: "ລາຍງານເບີລູກຄ້າຄິວອອກແບບ",
    desc: "ຈັດກຸ່ມຕາມເບີລູກຄ້າ ເພື່ອເບິ່ງວ່າອອກແບບແລ້ວ, ຍັງບໍ່ທັນ ຫຼື ອອກແບບບາງສ່ວນ",
    icon: Phone,
    iconBg: "bg-sky-100 text-sky-700",
  },
  {
    href: "/reports/monthly-close",
    title: "ປິດຍອດຂາຍ-ກຳໄລປະຈໍາເດືອນ",
    desc: "ສະຫຼຸບຍອດຂາຍ, ກຳໄລ, ຈຳນວນອໍເດີ້ ແລະ ບັນທຶກປິດຍອດຝັ່ງຂາຍ",
    icon: CalendarCheck2,
    iconBg: "bg-rose-100 text-rose-700",
  },
  {
    href: "/reports/data-export",
    title: "ລາຍງານດຶງຂໍ້ມູນ",
    desc: "ເລືອກ column ແບບ multi select ເພື່ອ export ຂໍ້ມູນຕາມທີ່ຕ້ອງການ",
    icon: Database,
    iconBg: "bg-cyan-100 text-cyan-700",
  },
];

export default function ReportsHomePage() {
  const [profile, setProfile] = useState<ViewerProfile | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user.id;
      if (!authUserId || !mounted) return;

      const { data, error } = await supabase
        .from("users")
        .select("role,permission_settings")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (!mounted || error || !data?.role) return;

      setProfile({
        role: data.role as AppRole,
        permission_settings: normalizeUserPermissionSettings(
          (data as { permission_settings?: UserPermissionSettings | null }).permission_settings
        ),
      });
    };

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  const visibleCards = useMemo(() => {
    if (!profile) return [];
    return cards.filter((card) => canAccessPath(card.href, profile.role, profile.permission_settings));
  }, [profile]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">ຫນ້າລາຍງານ</h1>
        <div className="text-sm text-slate-500 font-medium">ເລືອກປະເພດລາຍງານທີ່ຕ້ອງການ</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:border-blue-300 hover:shadow transition-all"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${card.iconBg}`}>
              <card.icon size={20} />
            </div>
            <div className="font-black text-slate-900">{card.title}</div>
            <div className="text-sm text-slate-600 mt-2">{card.desc}</div>
          </Link>
        ))}
      </div>

      {profile && visibleCards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm font-bold text-slate-400">
          ບໍ່ມີລາຍງານທີ່ທ່ານມີສິດເຂົ້າເບິ່ງ
        </div>
      ) : null}
    </div>
  );
}
