import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

function isInvalidRefreshTokenError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /invalid refresh token|refresh token not found/i.test(message);
}

const originalGetSession = supabase.auth.getSession.bind(supabase.auth);

supabase.auth.getSession = async () => {
  try {
    return await originalGetSession();
  } catch (error) {
    if (typeof window !== "undefined" && isInvalidRefreshTokenError(error)) {
      await supabase.auth.signOut({ scope: "local" });
      return { data: { session: null }, error: null } as Awaited<ReturnType<typeof originalGetSession>>;
    }

    throw error;
  }
};
