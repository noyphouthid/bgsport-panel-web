import type { FactoryProductionQueueVisibleStatus } from "@/lib/factory-production-queue";

export const FACTORY_PRODUCTION_QUEUE_FULL_SELECT =
  "id,factory_deposit_order_id,queue_date,queue_year,queue_month,queue_sequence,queue_number,workload_piece_qty,order_sequence,order_no,planner_user_id,status,notes,pattern_laid_at,all_sizes_laid_at,ready_for_print_at,sent_to_factory_at,assigned_by_user_id,pattern_laid_by_user_id,all_sizes_laid_by_user_id,ready_for_print_by_user_id,sent_to_factory_by_user_id,last_status_updated_by_user_id,created_by_user_id,updated_by_user_id,created_at,updated_at,deposit:factory_deposit_orders!factory_production_queue_entries_factory_deposit_order_id_fkey!inner(id,created_by_user_id,deposit_no,order_code,status,customer_name,customer_phone,team_name,style_name,color_name,fabric_name,notes,warning_note,graphic_user_id,admin_user_id,production_sent_date,delivery_date,production_priority,urgent_due_date,factory_bill_code,short_qty,long_qty,free_qty,qty_3xl,qty_4xl,qty_5xl,qty_6xl,production_items,pants_items)";

export const FACTORY_PRODUCTION_VISIBLE_STATUS_SET = new Set<FactoryProductionQueueVisibleStatus>([
  "queued", "pattern_laid", "ready_for_print", "sent_to_factory",
]);
