"use client";
import { useEffect, useState } from "react";
import { DEFAULT_SHOP_SETTINGS, fetchShopSettings, type ShopSettings } from "@/lib/shop-settings";

// Keeps the last result so reopening a preview does not flash the defaults.
let lastLoaded: ShopSettings | null = null;

export function rememberShopSettings(settings: ShopSettings) {
  lastLoaded = settings;
}

export function useShopSettings() {
  const [settings, setSettings] = useState<ShopSettings>(() => lastLoaded ?? DEFAULT_SHOP_SETTINGS);
  useEffect(() => {
    let active = true;
    void fetchShopSettings().then(({ data }) => {
      if (!data) return;
      lastLoaded = data;
      if (active) setSettings(data);
    });
    return () => { active = false; };
  }, []);
  return settings;
}
