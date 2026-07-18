import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeRole } from "@/lib/role-groups";

export type AppRole = "superadmin" | "admin" | "manager" | "staff" | "graphic" | "production" | "accountant";

export type AdminActor = {
  authUserId: string;
  profileId: string;
  fullName: string;
  email: string;
  role: AppRole;
  isActive: boolean;
};

let cachedPublicClient: SupabaseClient | null = null;

function normalizeAppRole(role: string | null | undefined): AppRole | null {
  const normalized = normalizeRole(role);
  if (!normalized) return null;
  if (normalized === "superadmin" || normalized === "super-admin" || normalized === "super_admin") return "superadmin";
  if (normalized === "admin") return "admin";
  if (normalized === "manager") return "manager";
  if (normalized === "staff") return "staff";
  if (normalized === "graphic" || normalized === "graphics" || normalized === "designer") return "graphic";
  if (normalized === "production" || normalized === "factory-production" || normalized === "production-team") return "production";
  if (normalized === "accountant") return "accountant";
  return null;
}

function getPublicClient(): SupabaseClient | null {
  if (cachedPublicClient) return cachedPublicClient;

  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!supabaseUrl || !anonKey) return null;

  cachedPublicClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cachedPublicClient;
}

export async function getActorFromAuthHeader(
  authHeader: string | null,
  allowedRoles?: AppRole[]
): Promise<AdminActor | null> {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  const supabaseAdmin = getSupabaseAdmin();
  const publicClient = getPublicClient();
  if (!supabaseAdmin || !publicClient) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data: adminUserData, error: adminUserErr } = await supabaseAdmin.auth.getUser(token);
  const { data: publicUserData, error: publicUserErr } =
    adminUserData?.user || !publicClient ? { data: null, error: null } : await publicClient.auth.getUser(token);

  const authUser = adminUserData?.user || publicUserData?.user || null;
  if (adminUserErr && publicUserErr) return null;
  if (!authUser) return null;

  const authEmail = String(authUser.email || "").trim().toLowerCase();

  const { data: byAuthId, error: byAuthIdErr } = await supabaseAdmin
    .from("users")
    .select("id,full_name,email,role,is_active,auth_user_id")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (byAuthIdErr) return null;
  let profile = byAuthId;

  if (!profile && authEmail) {
    const { data: byEmail, error: byEmailErr } = await supabaseAdmin
      .from("users")
      .select("id,full_name,email,role,is_active,auth_user_id")
      .ilike("email", authEmail)
      .maybeSingle();
    if (byEmailErr) return null;
    profile = byEmail;
  }

  if (!profile) return null;
  const profileRole = normalizeAppRole(profile.role);
  if (!profileRole) return null;
  if (!profile.is_active) return null;
  if (allowedRoles && !allowedRoles.includes(profileRole)) return null;

  return {
    authUserId: authUser.id,
    profileId: profile.id,
    fullName: profile.full_name,
    email: String(profile.email || authEmail),
    role: profileRole,
    isActive: Boolean(profile.is_active),
  };
}

export async function getAdminActorFromAuthHeader(authHeader: string | null): Promise<AdminActor | null> {
  return getActorFromAuthHeader(authHeader, ["superadmin"]);
}
