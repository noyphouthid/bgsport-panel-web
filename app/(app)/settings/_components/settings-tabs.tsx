import Link from "next/link";

const TABS = [
  ["shop", "ຂໍ້ມູນຮ້ານ"],
  ["collars", "ລາຍການຄໍເສື້ອບວກເພີ່ມ"],
  ["production-collars", "ເພີ່ມຄໍເສື້ອ"],
  ["work-categories", "ປະເພດງານ"],
];

export function SettingsTabs({ active }: { active: string }) {
  return (
    <nav aria-label="ຕັ້ງຄ່າເອກະສານ" className="flex flex-wrap gap-2">
      {TABS.map(([key, label]) => (
        <Link key={key} href={`/settings/${key}`} aria-current={active === key ? "page" : undefined} className={`rounded-xl border px-4 py-2 text-sm ${active === key ? "bg-blue-600 font-bold text-white" : ""}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
