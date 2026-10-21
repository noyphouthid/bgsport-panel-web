import { redirect } from "next/navigation";
import { STOREFRONT_TRACKING_URL } from "@/lib/storefront-url";

export default function Home() {
  redirect(STOREFRONT_TRACKING_URL);
}
