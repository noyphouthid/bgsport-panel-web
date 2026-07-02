export type FactoryProductionQueueStatus =
  | "queued"
  | "pattern_laid"
  | "all_sizes_laid"
  | "ready_for_print"
  | "sent_to_factory";

export type FactoryProductionQueueStatusTimestamps = {
  pattern_laid_at: string | null;
  all_sizes_laid_at: string | null;
  ready_for_print_at: string | null;
  sent_to_factory_at: string | null;
};

export type FactoryProductionQueueActorFields = {
  assigned_by_user_id: string | null;
  pattern_laid_by_user_id: string | null;
  all_sizes_laid_by_user_id: string | null;
  ready_for_print_by_user_id: string | null;
  sent_to_factory_by_user_id: string | null;
  last_status_updated_by_user_id: string | null;
};

export const FACTORY_PRODUCTION_QUEUE_STATUS_ORDER: FactoryProductionQueueStatus[] = [
  "queued",
  "pattern_laid",
  "all_sizes_laid",
  "ready_for_print",
  "sent_to_factory",
];

export const FACTORY_PRODUCTION_QUEUE_STATUS_LABELS: Record<FactoryProductionQueueStatus, string> = {
  queued: "ລໍຖ້າວາງ Pattern",
  pattern_laid: "ວາງແພທເທິນແລ້ວ",
  all_sizes_laid: "ວາງແພທເທິນຄົບໄຊທ໌",
  ready_for_print: "ວາງແພທເທິນພ້ອມພິມ",
  sent_to_factory: "ສົ່ງໂຮງງານແລ້ວ",
};

export const FACTORY_PRODUCTION_QUEUE_STATUS_STYLES: Record<FactoryProductionQueueStatus, string> = {
  queued: "border border-amber-200 bg-amber-50 text-amber-700",
  pattern_laid: "border border-sky-200 bg-sky-50 text-sky-700",
  all_sizes_laid: "border border-violet-200 bg-violet-50 text-violet-700",
  ready_for_print: "border border-cyan-200 bg-cyan-50 text-cyan-700",
  sent_to_factory: "border border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function getFactoryProductionQueueStatusIndex(status: FactoryProductionQueueStatus) {
  return FACTORY_PRODUCTION_QUEUE_STATUS_ORDER.indexOf(status);
}

export function isFactoryProductionQueueCompleted(status: FactoryProductionQueueStatus) {
  return status === "sent_to_factory";
}

export function buildFactoryProductionQueueStatusUpdate(
  status: FactoryProductionQueueStatus,
  current: FactoryProductionQueueStatusTimestamps & FactoryProductionQueueActorFields,
  actorUserId: string | null,
  now = new Date().toISOString()
) {
  const patternLaidAt =
    status === "queued" ? null : current.pattern_laid_at || now;
  const allSizesLaidAt =
    status === "queued" || status === "pattern_laid"
      ? null
      : current.all_sizes_laid_at || now;
  const readyForPrintAt =
    status === "queued" || status === "pattern_laid" || status === "all_sizes_laid"
      ? null
      : current.ready_for_print_at || now;
  const sentToFactoryAt =
    status === "sent_to_factory" ? current.sent_to_factory_at || now : null;
  const patternLaidByUserId =
    status === "queued" ? null : current.pattern_laid_by_user_id || actorUserId;
  const allSizesLaidByUserId =
    status === "queued" || status === "pattern_laid"
      ? null
      : current.all_sizes_laid_by_user_id || actorUserId;
  const readyForPrintByUserId =
    status === "queued" || status === "pattern_laid" || status === "all_sizes_laid"
      ? null
      : current.ready_for_print_by_user_id || actorUserId;
  const sentToFactoryByUserId =
    status === "sent_to_factory" ? current.sent_to_factory_by_user_id || actorUserId : null;

  return {
    status,
    pattern_laid_at: patternLaidAt,
    all_sizes_laid_at: allSizesLaidAt,
    ready_for_print_at: readyForPrintAt,
    sent_to_factory_at: sentToFactoryAt,
    pattern_laid_by_user_id: patternLaidByUserId,
    all_sizes_laid_by_user_id: allSizesLaidByUserId,
    ready_for_print_by_user_id: readyForPrintByUserId,
    sent_to_factory_by_user_id: sentToFactoryByUserId,
    last_status_updated_by_user_id: actorUserId,
    updated_at: now,
  };
}

export function getFactoryProductionQueueStatusActorId(
  status: FactoryProductionQueueStatus,
  current: Pick<
    FactoryProductionQueueActorFields,
    | "pattern_laid_by_user_id"
    | "all_sizes_laid_by_user_id"
    | "ready_for_print_by_user_id"
    | "sent_to_factory_by_user_id"
  >
) {
  if (status === "pattern_laid") return current.pattern_laid_by_user_id;
  if (status === "all_sizes_laid") return current.all_sizes_laid_by_user_id;
  if (status === "ready_for_print") return current.ready_for_print_by_user_id;
  if (status === "sent_to_factory") return current.sent_to_factory_by_user_id;
  return null;
}
