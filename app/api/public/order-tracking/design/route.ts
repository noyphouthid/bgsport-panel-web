import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set(["www.tracklifefootball.com", "tracklifefootball.com"]);
export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeImageUrl(raw: string | null) {
  const value = String(raw || "").trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (!ALLOWED_HOSTS.has(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const normalizedUrl = normalizeImageUrl(req.nextUrl.searchParams.get("src"));
  if (!normalizedUrl) {
    return NextResponse.json({ error: "invalid_image_src" }, { status: 400 });
  }

  const upstream = await fetch(normalizedUrl, {
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
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      Vary: "Accept",
    },
  });
}
