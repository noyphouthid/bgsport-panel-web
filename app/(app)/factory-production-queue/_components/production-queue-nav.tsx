import Link from "next/link";
import { FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_LABELS, FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_ORDER, getFactoryProductionQueueListHref } from "@/lib/factory-production-queue";

export function ProductionQueueNav({ active }: { active: string }) {
  const links = [
    ...FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_ORDER.map(status => ({ key: status, href: getFactoryProductionQueueListHref(status), label: FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_LABELS[status] })),
    { key: "records", href: "/factory-production-queue/records", label: "ລາຍການວາງຜະລິດ" },
    { key: "activity", href: "/factory-production-queue/activity", label: "ສະຫຼຸບການວາງຜະລິດ" },
  ];
  return <nav aria-label="ໜ້າວາງຜະລິດ" className="flex flex-wrap gap-2">{links.map(link =>
    <Link key={link.key} href={link.href} aria-current={active === link.key ? "page" : undefined}
      className={`rounded-xl px-4 py-2.5 text-sm font-black ${active === link.key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{link.label}</Link>)}</nav>;
}
