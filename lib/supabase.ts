import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Let app code refresh on demand so revoked refresh tokens do not throw
    // noisy console errors during client initialization.
    autoRefreshToken: false,
  },
});

function isInvalidRefreshTokenError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /invalid refresh token|refresh token not found/i.test(message);
}

async function clearInvalidSession() {
  if (typeof window === "undefined") return;

  await supabase.auth.signOut({ scope: "local" });
}

const originalGetSession = supabase.auth.getSession.bind(supabase.auth);

supabase.auth.getSession = async () => {
  try {
    const result = await originalGetSession();

    if (isInvalidRefreshTokenError(result.error)) {
      await clearInvalidSession();
      return { data: { session: null }, error: null } as Awaited<ReturnType<typeof originalGetSession>>;
    }

    return result;
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      await clearInvalidSession();
      return { data: { session: null }, error: null } as Awaited<ReturnType<typeof originalGetSession>>;
    }

    throw error;
  }
};
