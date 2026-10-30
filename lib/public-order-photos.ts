import type { SupabaseClient } from "@supabase/supabase-js";

export function publicOrderPhotoUrl(value: unknown, supabaseUrl: string): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value), origin = new URL(supabaseUrl);
    const path = decodeURIComponent(url.pathname);
    if (url.protocol !== "https:" || url.origin !== origin.origin || url.username || url.password || url.search || url.hash) return null;
    if (path.includes("\\") || path.split("/").some(part => part === ".." || part === ".")) return null;
    if (!/^\/storage\/v1\/object\/public\/(?:order-media\/order-image\/|factory-production-mockups\/).+\.(?:jpe?g|png|webp|gif|avif)$/i.test(path)) return null;
    return url.href;
  } catch { return null; }
}

type PhotoOrder = { id: string; order_code: string; order_image_url?: string | null };

export async function fetchPublicOrderPhotosWithClient(client: SupabaseClient, rows: PhotoOrder[], supabaseUrl: string) {
  const photos = new Map<string, string[]>();
  if (!rows.length) return photos;
  // Read only production mockups from the newest linked active deposit.
  const { data: deposits, error } = await client.from("factory_deposit_orders")
    .select("order_id,production_items").in("order_id", rows.map(row => row.id))
    .in("status", ["submitted", "approved", "converted"]).order("created_at", { ascending: false }).limit(100);
  const mockups = new Map<string, unknown[]>();
  if (!error) for (const deposit of deposits ?? []) {
    if (typeof deposit.order_id === "string" && !mockups.has(deposit.order_id)) {
      mockups.set(deposit.order_id, Array.isArray(deposit.production_items) ? deposit.production_items.map(item => item?.mockup_url) : []);
    }
  }
  for (let offset = 0; offset < rows.length; offset += 5) {
    await Promise.all(rows.slice(offset, offset + 5).map(async row => {
      const urls: unknown[] = [row.order_image_url];
      // Never list the payment-slip or other order-media folders.
      if (/^[A-Za-z0-9_-]{1,100}$/.test(row.order_code)) {
        const folder = `order-image/${row.order_code}`;
        try {
          const storage = client.storage.from("order-media");
          const { data, error: listError } = await storage.list(folder, { limit: 20, sortBy: { column: "created_at", order: "asc" } });
          if (!listError) for (const entry of data ?? []) {
            if (/^[^/\\]+\.(?:jpe?g|png|webp|gif|avif)$/i.test(entry.name)) urls.push(storage.getPublicUrl(`${folder}/${entry.name}`).data.publicUrl);
          }
        } catch { /* The saved primary image remains available during a listing failure. */ }
      }
      urls.push(...(mockups.get(row.id) ?? []));
      photos.set(row.id, [...new Set(urls.map(value => publicOrderPhotoUrl(value, supabaseUrl)).filter((url): url is string => Boolean(url)))].slice(0, 20));
    }));
  }
  return photos;
}
