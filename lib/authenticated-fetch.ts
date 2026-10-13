import { supabase } from "@/lib/supabase";

const SIGN_IN_MESSAGE = "ກະລຸນາເຂົ້າລະບົບໃໝ່ ເພື່ອໂຫຼດຂໍ້ມູນ";

export async function authenticatedFetch(input: string, init?: RequestInit): Promise<Response> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error(SIGN_IN_MESSAGE);

  const send = (token: string) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  const response = await send(data.session.access_token);
  if (response.status !== 401) return response;

  // Retry once with a fresh token when the server rejects a cached session.
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshed.session?.access_token) throw new Error(SIGN_IN_MESSAGE);
  return send(refreshed.session.access_token);
}
