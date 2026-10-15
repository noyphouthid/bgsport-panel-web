import { NextRequest, NextResponse } from "next/server";
import { getActorFromAuthHeader } from "@/lib/admin-api-auth";
import { isBranchProvider } from "@/lib/transport-branches";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  loadImportedTransportBranches,
  ShippingBranchDirectoryError,
} from "@/lib/shipping-branches";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const actor = await getActorFromAuthHeader(
    request.headers.get("authorization"),
  );
  if (!actor)
    return NextResponse.json(
      { message: "ກະລຸນາເຂົ້າລະບົບໃໝ່" },
      { status: 401 },
    );
  const provider = request.nextUrl.searchParams.get("provider") || "";
  if (!isBranchProvider(provider))
    return NextResponse.json(
      { message: "ບໍ່ຮອງຮັບຂົນສົ່ງນີ້" },
      { status: 400 },
    );
  try {
    const directory = await loadImportedTransportBranches(
      getSupabaseAdmin(),
      provider,
    );
    return NextResponse.json(directory, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof ShippingBranchDirectoryError)
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    return NextResponse.json(
      { message: "ໂຫຼດສາຂາບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່ ຫຼືປ້ອນທີ່ຢູ່ເອງ" },
      { status: 502 },
    );
  }
}
