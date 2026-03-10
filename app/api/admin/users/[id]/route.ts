import { NextRequest, NextResponse } from "next/server";
import { getAdminActorFromAuthHeader } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Role = "admin" | "manager" | "staff" | "graphic" | "accountant";

type UpdateUserBody = {
  full_name?: string;
  email?: string;
  role?: Role;
  phone?: string | null;
  notes?: string | null;
  is_active?: boolean;
  password?: string;
};

const ALLOWED_ROLES = new Set<Role>(["admin", "manager", "staff", "graphic", "accountant"]);

async function findAuthUserIdByEmail(email: string) {
  let page = 1;
  const perPage = 200;
  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const found = data.users.find((u) => String(u.email || "").toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < perPage) break;
    page += 1;
  }
  return null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActorFromAuthHeader(req.headers.get("authorization"));
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = (await req.json()) as UpdateUserBody;

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("users")
    .select("id,full_name,email,role,is_active,auth_user_id")
    .eq("id", id)
    .single();

  if (existingErr || !existing) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const fullName = String(body.full_name ?? existing.full_name).trim();
  const email = String(body.email ?? existing.email ?? "")
    .trim()
    .toLowerCase();
  const role = (body.role ?? existing.role) as Role;
  const isActive = body.is_active ?? existing.is_active;
  const password = String(body.password || "").trim();

  if (!fullName) return NextResponse.json({ error: "missing_full_name" }, { status: 400 });
  if (!ALLOWED_ROLES.has(role)) return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  if (password && password.length < 6) return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  if (password && !email) return NextResponse.json({ error: "missing_email_for_password_reset" }, { status: 400 });

  if (email && email !== String(existing.email || "").toLowerCase()) {
    const { data: dup } = await supabaseAdmin
      .from("users")
      .select("id")
      .ilike("email", email)
      .neq("id", id)
      .limit(1)
      .maybeSingle();
    if (dup) return NextResponse.json({ error: "email_exists_in_users" }, { status: 409 });
  }

  let authUserId = existing.auth_user_id as string | null;
  if (!authUserId && email) {
    authUserId = await findAuthUserIdByEmail(String(existing.email || email).toLowerCase());
  }

  const { data: updatedProfile, error: updateErr } = await supabaseAdmin
    .from("users")
    .update({
      full_name: fullName,
      email: email || null,
      role,
      is_active: isActive,
      phone: body.phone?.trim() || null,
      notes: body.notes?.trim() || null,
      auth_user_id: authUserId,
    })
    .eq("id", id)
    .select("id,full_name,email,role,is_active")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  if (authUserId) {
    if (!email) return NextResponse.json({ error: "missing_email_for_auth_user" }, { status: 400 });
    const authPayload: {
      email?: string;
      password?: string;
      user_metadata?: Record<string, string>;
      ban_duration?: string;
    } = {
      email,
      user_metadata: { full_name: fullName },
      ban_duration: isActive ? "none" : "876000h",
    };
    if (password) authPayload.password = password;

    const { error: authUpdateErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, authPayload);
    if (authUpdateErr) {
      return NextResponse.json({ error: authUpdateErr.message }, { status: 400 });
    }
  }

  return NextResponse.json({ user: updatedProfile }, { status: 200 });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActorFromAuthHeader(req.headers.get("authorization"));
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("users")
    .select("id,email,auth_user_id")
    .eq("id", id)
    .single();

  if (existingErr || !existing) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  let authUserId = existing.auth_user_id as string | null;
  if (!authUserId && existing.email) {
    authUserId = await findAuthUserIdByEmail(String(existing.email).toLowerCase());
  }

  const { error: deleteProfileErr } = await supabaseAdmin.from("users").delete().eq("id", id);
  if (deleteProfileErr) {
    return NextResponse.json({ error: deleteProfileErr.message }, { status: 400 });
  }

  if (authUserId) {
    const { error: deleteAuthErr } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
    if (deleteAuthErr) {
      return NextResponse.json({ error: deleteAuthErr.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

