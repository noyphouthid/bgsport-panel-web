export type FactoryProductionQueueVisibleStatus = "queued" | "in_production" | "awaiting_factory" | "sent_to_factory";
export type FactoryProductionQueueStatus = FactoryProductionQueueVisibleStatus | "pattern_laid" | "all_sizes_laid" | "ready_for_print";

export type FactoryProductionQueueActorFields = {
  assigned_by_user_id: string | null;
  pattern_laid_by_user_id: string | null;
  all_sizes_laid_by_user_id: string | null;
  ready_for_print_by_user_id: string | null;
  sent_to_factory_by_user_id: string | null;
  last_status_updated_by_user_id: string | null;
};
export type FactoryProductionQueueStatusTimestamps = {
  pattern_laid_at: string | null; all_sizes_laid_at: string | null;
  ready_for_print_at: string | null; sent_to_factory_at: string | null;
};
export const FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_ORDER: FactoryProductionQueueVisibleStatus[] = [
  "queued", "in_production", "awaiting_factory", "sent_to_factory",
];
export const FACTORY_PRODUCTION_QUEUE_STATUS_ORDER = FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_ORDER;
export const FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_LABELS: Record<FactoryProductionQueueVisibleStatus, string> = {
  queued: "ລໍຖ້າວາງ", in_production: "ກຳລັງວາງຜະລິດ", awaiting_factory: "ລໍຖ້າສົ່ງໂຮງງານ", sent_to_factory: "ສົ່ງໂຮງງານແລ້ວ",
};
export const FACTORY_PRODUCTION_QUEUE_STATUS_LABELS = {
  ...FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_LABELS,
  pattern_laid: "ກຳລັງວາງຜະລິດ", all_sizes_laid: "ກຳລັງວາງຜະລິດ", ready_for_print: "ກຳລັງວາງຜະລິດ",
};
export const FACTORY_PRODUCTION_QUEUE_STATUS_STYLES: Record<FactoryProductionQueueVisibleStatus, string> = {
  queued: "border border-amber-200 bg-amber-50 text-amber-700",
  in_production: "border border-sky-200 bg-sky-50 text-sky-700",
  awaiting_factory: "border border-violet-200 bg-violet-50 text-violet-700",
  sent_to_factory: "border border-emerald-200 bg-emerald-50 text-emerald-700",
};
export function normalizeFactoryProductionQueueStatus(status: FactoryProductionQueueStatus): FactoryProductionQueueVisibleStatus {
  return status === "pattern_laid" || status === "all_sizes_laid" || status === "ready_for_print" ? "in_production" : status;
}
export function getFactoryProductionQueueStatusIndex(status: FactoryProductionQueueStatus) {
  return FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_ORDER.indexOf(normalizeFactoryProductionQueueStatus(status));
}
export function isFactoryProductionQueueCompleted(status: FactoryProductionQueueStatus) { return status === "sent_to_factory"; }
export function getFactoryProductionQueueNextStatus(status: FactoryProductionQueueStatus) {
  return FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_ORDER[getFactoryProductionQueueStatusIndex(status) + 1] ?? null;
}
export function getFactoryProductionQueuePreviousStatus(status: FactoryProductionQueueStatus) {
  return FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_ORDER[getFactoryProductionQueueStatusIndex(status) - 1] ?? null;
}
export function getFactoryProductionQueueListHref(status: FactoryProductionQueueVisibleStatus) {
  return status === "queued" ? "/factory-production-queue" : `/factory-production-queue/${status === "in_production" ? "in-production" : status === "awaiting_factory" ? "awaiting-factory" : "sent-to-factory"}`;
}

export type ProductionQueueUser = { id: string; full_name: string; role: string; is_active: boolean };
export type ProductionQueueDeposit = {
  id: string; status: string; production_queue_legacy: boolean; production_queue_entered_at: string | null;
  deposit_no: string; order_code: string | null; customer_name: string; team_name: string | null;
  production_priority: "normal" | "urgent" | null; production_sent_date: string | null; delivery_date: string | null;
  customer_phone?: string; fabric_name?: string; graphic_user_id?: string | null; admin_user_id?: string | null;
  factory_bill_code?: string | null; notes?: string | null; warning_note?: string | null;
};
export type ProductionQueueRow = {
  id: string; queue_date: string; queue_year: number; queue_month: number; queue_sequence: number;
  queue_number: string; order_no: string; planner_user_id: string | null; workload_piece_qty: number;
  pattern_user_id?: string | null; print_user_id?: string | null; dispatch_user_id?: string | null;
  pattern_completed_at?: string | null; pattern_completed_by_user_id?: string | null;
  print_started_at?: string | null; print_started_by_user_id?: string | null;
  status: FactoryProductionQueueStatus; planner_reassigned_at: string | null; planner_reassigned_by_user_id?: string | null;
  production_started_at: string | null; production_completed_at: string | null; sent_to_factory_at: string | null;
  production_started_by_user_id?: string | null; production_completed_by_user_id?: string | null;
  sent_to_factory_by_user_id?: string | null; last_status_updated_by_user_id?: string | null;
  assigned_by_user_id?: string | null; notes?: string; updated_at: string;
  deposit: ProductionQueueDeposit | ProductionQueueDeposit[] | null;
};
export function getProductionQueueDeposit(row: ProductionQueueRow) { return Array.isArray(row.deposit) ? row.deposit[0] ?? null : row.deposit; }

// Urgent work leads each planner's queue; original sequence breaks ties.
export function compareProductionQueuePriority(a: ProductionQueueRow, b: ProductionQueueRow) {
  const priorityDifference = Number(getProductionQueueDeposit(b)?.production_priority === "urgent")
    - Number(getProductionQueueDeposit(a)?.production_priority === "urgent");
  return priorityDifference || a.queue_sequence - b.queue_sequence;
}

export type ProductionStageAssignments = { patternUserId: string | null; printUserId: string | null; dispatchUserId: string | null };
export function getProductionStageAssignments(row: Pick<ProductionQueueRow, "planner_user_id" | "pattern_user_id" | "print_user_id" | "dispatch_user_id">): ProductionStageAssignments {
  return {
    patternUserId: row.pattern_user_id === undefined ? row.planner_user_id : row.pattern_user_id,
    printUserId: row.print_user_id === undefined ? row.planner_user_id : row.print_user_id,
    dispatchUserId: row.dispatch_user_id === undefined ? row.planner_user_id : row.dispatch_user_id,
  };
}
export function getProductionParticipants(row: ProductionQueueRow) {
  return [...new Set(Object.values(getProductionStageAssignments(row)).filter((id): id is string => Boolean(id)))];
}
// Dispatch retains order access, but production credit belongs to the two layout roles.
export function getProductionCreditParticipants(row: ProductionQueueRow) {
  const assigned = getProductionStageAssignments(row);
  return [...new Set([assigned.patternUserId, assigned.printUserId].filter((id): id is string => Boolean(id)))];
}
export function getProductionCredit(row: ProductionQueueRow, userId: string) {
  const participants = getProductionCreditParticipants(row);
  return participants.includes(userId) ? Number(row.workload_piece_qty) / participants.length : 0;
}
export function getProductionTaskWorker(row: ProductionQueueRow) {
  const assigned = getProductionStageAssignments(row);
  const status = normalizeFactoryProductionQueueStatus(row.status);
  return status === "queued" ? assigned.patternUserId : status === "in_production"
    ? row.pattern_completed_at ? assigned.printUserId : assigned.patternUserId : status === "awaiting_factory" ? assigned.dispatchUserId : null;
}
export function getProductionActiveWorker(row: ProductionQueueRow) {
  return normalizeFactoryProductionQueueStatus(row.status) === "in_production" && (!row.pattern_completed_at || row.print_started_at) ? getProductionTaskWorker(row) : null;
}
export function getProductionReadyWorker(row: ProductionQueueRow) {
  return row.status === "queued" || (row.status === "in_production" && row.pattern_completed_at && !row.print_started_at) ? getProductionTaskWorker(row) : null;
}
export function isProductionOrderCompleted(row: ProductionQueueRow) { return ["awaiting_factory", "sent_to_factory"].includes(row.status); }
export function formatProductionCredit(value: number) { return value.toLocaleString("en-US", { maximumFractionDigits: 2 }); }

// Production reports use the business date in Laos (UTC+7), independently of queue dates.
export function getProductionCompletionPeriod(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const localDate = new Date(timestamp + 7 * 60 * 60 * 1000);
  return { year: localDate.getUTCFullYear(), month: localDate.getUTCMonth() + 1 };
}
export function getProductionCompletionDateRange(year: number, month?: number) {
  const offset = 7 * 60 * 60 * 1000;
  const startMonth = month === undefined ? 0 : month - 1;
  const endMonth = month === undefined ? 12 : month;
  return { start: new Date(Date.UTC(year, startMonth, 1) - offset).toISOString(), end: new Date(Date.UTC(year, endMonth, 1) - offset).toISOString() };
}
