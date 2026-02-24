"use client";

import Link from "next/link";
import { ClipboardList, Palette, TrendingUp, UserRound } from "lucide-react";

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
];

export default function ReportsHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">ຫນ້າລາຍງານ</h1>
        <div className="text-sm text-slate-500 font-medium">ເລືອກປະເພດລາຍງານທີ່ຕ້ອງການ</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((card) => (
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
    </div>
  );
}

