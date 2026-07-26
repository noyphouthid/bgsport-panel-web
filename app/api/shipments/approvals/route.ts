import { NextRequest, NextResponse } from "next/server";
import type { AppRole } from "@/lib/access-control";
import { getAdminActorFromAuthHeader } from "@/lib/admin-api-auth";
import type { ShipmentDeliveryRequestRow } from "@/lib/shipment-delivery-requests";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isTransportNoteDeposited } from "@/lib/transport-notes";

type UserRow = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  role: AppRole;
  is_active?: boolean;
};

type OrderRow = {
  id: string;
  order_code: string;
  factory_bill_code: string | null;
  status: "in_progress" | "completed";
  shipment_status: "pending" | "shipped";
  shipment_completed_at: string | null;
  production_completed_at: string | null;
  balance: number;
  customer_paid_full_at: string | null;
};

type TransportNoteApprovalRow = {
  id: string;
  delivery_request_id: string | null;
  transport_deposited_at: string | null;
  transport_deposited_by: string | null;
  transport_deposit_receipt_id: string | null;
};

const QUERY_BATCH_SIZE = 100;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  const raw = String(error ?? "").trim();
  return raw && raw !== "[object Object]" ? raw : fallback;
}

function toStepError(step: string, error: unknown) {
  return new Error(`${step}: ${getErrorMessage(error, "unknown_error")}`);
}

function chunkValues<T>(values: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

function shouldShowApprovalRow(
  request: ShipmentDeliveryRequestRow,
  transportNote: TransportNoteApprovalRow | undefined
) {
  if (request.delivery_method !== "transport") return true;
  return Boolean(transportNote && isTransportNoteDeposited(transportNote));
}

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "missing_server_env", message: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const actor = await getAdminActorFromAuthHeader(req.headers.get("authorization"));
  if (!actor) {
    return NextResponse.json({ error: "forbidden", message: "forbidden" }, { status: 403 });
  }

  try {
    let requestData: ShipmentDeliveryRequestRow[] | null = null;
    let usersData: UserRow[] | null = null;

    try {
      const result = await supabaseAdmin.from("shipment_delivery_requests").select("*").order("updated_at", { ascending: false });
      if (result.error) throw result.error;
      requestData = (result.data ?? []) as ShipmentDeliveryRequestRow[];
    } catch (error) {
      throw toStepError("load_requests", error);
    }

    try {
      const result = await supabaseAdmin.from("users").select("id,auth_user_id,full_name,role,is_active").eq("is_active", true);
      if (result.error) throw result.error;
      usersData = (result.data ?? []) as UserRow[];
    } catch (error) {
      throw toStepError("load_users", error);
    }
    const requestRows = requestData ?? [];
    const userRows = usersData ?? [];
    const usersById = Object.fromEntries(userRows.map((user) => [user.id, user]));

    const requestIds = [...new Set(requestRows.map((row) => row.id).filter(Boolean))];
    let transportNotesByRequestId: Record<string, TransportNoteApprovalRow> = {};

    if (requestIds.length > 0) {
      try {
        const chunks = chunkValues(requestIds, QUERY_BATCH_SIZE);
        const rows: TransportNoteApprovalRow[] = [];
        for (const chunk of chunks) {
          const result = await supabaseAdmin
            .from("transport_notes")
            .select("id,delivery_request_id,transport_deposited_at,transport_deposited_by,transport_deposit_receipt_id")
            .in("delivery_request_id", chunk);
          if (result.error) throw result.error;
          rows.push(...((result.data ?? []) as TransportNoteApprovalRow[]));
        }
        transportNotesByRequestId = Object.fromEntries(
          rows
            .filter((row) => row.delivery_request_id)
            .map((row) => [String(row.delivery_request_id), row])
        );
      } catch (error) {
        throw toStepError("load_transport_notes", error);
      }
    }

    const rows = requestRows.filter((row) => shouldShowApprovalRow(row, transportNotesByRequestId[row.id]));
    const orderIds = [...new Set(requestRows.map((row) => row.order_id).filter(Boolean))];
    let ordersById: Record<string, OrderRow> = {};

    if (orderIds.length > 0) {
      try {
        const chunks = chunkValues(orderIds, QUERY_BATCH_SIZE);
        const rows: OrderRow[] = [];
        for (const chunk of chunks) {
          const result = await supabaseAdmin
            .from("orders")
            .select("id,order_code,factory_bill_code,status,shipment_status,shipment_completed_at,production_completed_at,balance,customer_paid_full_at")
            .in("id", chunk);
          if (result.error) throw result.error;
          rows.push(...((result.data ?? []) as OrderRow[]));
        }
        ordersById = Object.fromEntries(rows.map((order) => [order.id, order]));
      } catch (error) {
        throw toStepError("load_orders", error);
      }
    }

    return NextResponse.json({
      ok: true,
      viewerRole: actor.role,
      viewerUserId: actor.profileId,
      rows,
      usersById,
      ordersById,
      transportNotesByRequestId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "load_shipment_approvals_failed",
        message: getErrorMessage(error, "load_shipment_approvals_failed"),
      },
      { status: 500 }
    );
  }
}
