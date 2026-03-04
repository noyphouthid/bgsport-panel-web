import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type AppRole = "admin" | "manager" | "staff" | "graphic" | "accountant";

export type AdminActor = {
  authUserId: string;
  profileId: string;
  fullName: string;
  email: string;
  role: AppRole;
  isActive: boolean;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

const publicClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function getAdminActorFromAuthHeader(authHeader: string | null): Promise<AdminActor | null> {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data: userData, error: userErr } = await publicClient.auth.getUser(token);
  if (userErr || !userData.user) return null;

  const authUser = userData.user;
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
  if (!profile.is_active || profile.role !== "admin") return null;

  return {
    authUserId: authUser.id,
    profileId: profile.id,
    fullName: profile.full_name,
    email: String(profile.email || authEmail),
    role: profile.role as AppRole,
    isActive: Boolean(profile.is_active),
  };
}
