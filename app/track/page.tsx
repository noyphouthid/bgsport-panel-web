import { redirect } from "next/navigation";
import { STOREFRONT_TRACKING_URL } from "@/lib/storefront-url";

export default async function PublicTrackingPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const destination = new URL(STOREFRONT_TRACKING_URL);
  if (raw && raw.length <= 120) destination.searchParams.set("q", raw);
  redirect(destination.href);
}
