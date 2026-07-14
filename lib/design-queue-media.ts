import { buildSafeStorageFileName, ORDER_MEDIA_BUCKET, toDisplayMediaUrl } from "@/lib/order-media";

export const DESIGN_QUEUE_MOCKUP_FOLDER = "design-queue-mockups";
export const DESIGN_QUEUE_MAX_IMAGE_SIZE = 2024;

export type DesignQueueMockupRow = {
  id: string;
  queue_entry_id: string;
  file_name: string;
  file_path: string;
  file_url: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  uploaded_by_user_id: string | null;
  uploaded_at: string;
  updated_at: string;
};

export type DesignQueueUploadTarget = {
  id: string;
  queue_number: string;
  order_no: string;
  type_code: string;
  style_name: string;
};

export function buildDesignQueueMockupStoragePath(queueEntryId: string, fileName: string) {
  return `${DESIGN_QUEUE_MOCKUP_FOLDER}/${queueEntryId}/${buildSafeStorageFileName(fileName, "shirt")}`;
}

export function getDesignQueueMockupUrl(row: Pick<DesignQueueMockupRow, "file_url">) {
  return toDisplayMediaUrl(row.file_url) || row.file_url || null;
}

export function buildDesignQueueOrderCode(row: Pick<DesignQueueUploadTarget, "type_code" | "order_no">) {
  const typeCode = String(row.type_code || "").trim().toUpperCase();
  const orderNo = String(row.order_no || "").trim().toUpperCase();
  if (!typeCode) return orderNo;
  return `${typeCode}-${orderNo}`;
}

export function buildDesignQueueMockupExportName(
  queue: Pick<DesignQueueUploadTarget, "queue_number" | "type_code" | "order_no">,
  fileName: string,
  index: number
) {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() || "jpg" : "jpg";
  const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "jpg";
  const orderCode = buildDesignQueueOrderCode(queue).replace(/[^A-Z0-9-]+/gi, "-");
  const queueNumber = String(queue.queue_number || "").replace(/[^0-9A-Z-]/gi, "") || "queue";
  return `${orderCode}-Q${queueNumber}-${String(index + 1).padStart(2, "0")}.${safeExtension}`;
}

export function getDesignQueueMockupPublicUrl(path: string, getPublicUrl: (path: string) => string) {
  return getPublicUrl(path);
}

export { ORDER_MEDIA_BUCKET };
