import { NextRequest, NextResponse } from "next/server";
import { getAdminActorFromAuthHeader } from "@/lib/admin-api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type Role = "admin" | "manager" | "staff" | "graphic" | "accountant";

type CreateUserBody = {
  full_name?: string;
  email?: string;
  password?: string;
  role?: Role;
  phone?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

const ALLOWED_ROLES = new Set<Role>(["admin", "manager", "staff", "graphic", "accountant"]);

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "missing_server_env", message: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const actor = await getAdminActorFromAuthHeader(req.headers.get("authorization"));
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as CreateUserBody;
  const fullName = String(body.full_name || "").trim();
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const password = String(body.password || "");
  const role = body.role;

  if (!fullName) {
    return NextResponse.json({ error: "missing_full_name" }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  const { data: dupProfile } = await supabaseAdmin
    .from("users")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (dupProfile) {
    return NextResponse.json({ error: "email_exists_in_users" }, { status: 409 });
  }

  const { data: authCreated, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authErr || !authCreated.user) {
    return NextResponse.json({ error: authErr?.message || "create_auth_failed" }, { status: 400 });
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("users")
    .insert({
      full_name: fullName,
      email,
      role,
      phone: body.phone?.trim() || null,
      notes: body.notes?.trim() || null,
      is_active: body.is_active ?? true,
      auth_user_id: authCreated.user.id,
    })
    .select("id,full_name,email,role,is_active")
    .single();

  if (insertErr) {
    await supabaseAdmin.auth.admin.deleteUser(authCreated.user.id);
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
  }

  return NextResponse.json({ user: inserted }, { status: 201 });
}
