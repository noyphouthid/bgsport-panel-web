import { NextRequest, NextResponse } from "next/server";
import { fetchFactoryProductionSnapshot } from "@/lib/factory-production";
import { normalizeFactoryAssetUrl } from "@/lib/order-media";

export async function GET(req: NextRequest) {
  const factoryBillCode = String(req.nextUrl.searchParams.get("factoryBillCode") || "").trim();
  if (!factoryBillCode) {
    return NextResponse.json({ error: "missing_factory_bill_code" }, { status: 400 });
  }

  try {
    const snapshot = await fetchFactoryProductionSnapshot(factoryBillCode);
    const designImageUrl = normalizeFactoryAssetUrl(snapshot.payload.design_image_url);
    if (!designImageUrl) {
      return NextResponse.json({ error: "design_image_not_found" }, { status: 404 });
    }

    const upstream = await fetch(designImageUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "BGSportPanel/1.0",
        Referer: "https://www.tracklifefootball.com/",
      },
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: `image_http_${upstream.status}` }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await upstream.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "factory_design_fetch_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
