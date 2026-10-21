const DEFAULT_STOREFRONT_ORIGIN = "https://bg-sport-store.famousmaple1.chatgpt.site";

function storefrontOrigin() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_STOREFRONT_URL || DEFAULT_STOREFRONT_ORIGIN);
    if (url.protocol !== "https:" || url.username || url.password) return DEFAULT_STOREFRONT_ORIGIN;
    return url.origin;
  } catch { return DEFAULT_STOREFRONT_ORIGIN; }
}

export const STOREFRONT_TRACKING_URL = `${storefrontOrigin()}/track/`;
