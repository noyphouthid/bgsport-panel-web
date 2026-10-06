import { LIFEFOOTBALL_ORIGIN, normalizeLifefootballOrderCode } from "@/lib/lifefootball-order";

export class LifefootballLookupError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 502) {
    super(message);
  }
}

type FactorySession = { cookie: string; expiresAt: number };
let session: FactorySession | null = null;
let loginPromise: Promise<FactorySession> | null = null;

async function factoryFetch(path: string, init?: RequestInit) {
  try {
    return await fetch(`${LIFEFOOTBALL_ORIGIN}${path}`, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new LifefootballLookupError("factory_unavailable", "ບໍ່ສາມາດເຊື່ອມຕໍ່ເວັບໂຮງງານໄດ້, ກະລຸນາລອງໃໝ່");
  }
}

async function login(): Promise<FactorySession> {
  const username = process.env.LIFEFOOTBALL_AGENT_USERNAME?.trim();
  const password = process.env.LIFEFOOTBALL_AGENT_PASSWORD;
  if (!username || !password) {
    throw new LifefootballLookupError("missing_factory_credentials", "ຍັງບໍ່ໄດ້ຕັ້ງຄ່າບັນຊີເວັບໂຮງງານໃນເຊີບເວີ", 503);
  }
  const response = await factoryFetch("/api/agent-auth/sign-in/username", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: LIFEFOOTBALL_ORIGIN },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new LifefootballLookupError("factory_login_failed", "ລັອກອິນເວັບໂຮງງານບໍ່ສຳເລັດ, ກະລຸນາກວດບັນຊີໃນເຊີບເວີ");
  }
  const cookies = response.headers.getSetCookie();
  const cookie = cookies.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
  if (!cookie) {
    throw new LifefootballLookupError("factory_login_failed", "ເວັບໂຮງງານບໍ່ໄດ້ສົ່ງ session ສຳລັບລັອກອິນ");
  }
  return { cookie, expiresAt: Date.now() + 10 * 60_000 };
}

async function getSession() {
  if (session && session.expiresAt > Date.now()) return session;
  if (!loginPromise) {
    loginPromise = login().then((value) => {
      session = value;
      return value;
    }).finally(() => { loginPromise = null; });
  }
  return loginPromise;
}

export async function resolveLifefootballOrderCode(orderId: string): Promise<string> {
  // Only IDs from the validated factory URL may be used to build a request.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) {
    throw new LifefootballLookupError("invalid_factory_order_id", "ລິ້ງອໍເດີໂຮງງານບໍ່ຖືກຕ້ອງ", 400);
  }
  let auth = await getSession();
  const readOrder = () => factoryFetch(`/api/agent-portal/orders/${encodeURIComponent(orderId)}`, {
    headers: { Cookie: auth.cookie, Accept: "application/json" },
  });
  let response = await readOrder();
  if (response.status === 401 || response.status === 403) {
    if (session === auth) session = null;
    auth = await getSession();
    response = await readOrder();
  }
  if (response.status === 404) {
    throw new LifefootballLookupError("factory_order_not_found", "ບໍ່ພົບອໍເດີໃນເວັບໂຮງງານ", 404);
  }
  if (!response.ok) {
    throw new LifefootballLookupError("factory_order_lookup_failed", "ບໍ່ສາມາດອ່ານອໍເດີໃນເວັບໂຮງງານໄດ້");
  }
  const data = await response.json().catch(() => null) as { order?: { id?: unknown; code?: unknown } } | null;
  const code = normalizeLifefootballOrderCode(data?.order?.code);
  // order.code is the page's h1; production.orderCode is a different identifier.
  if (data?.order?.id !== orderId || !code) {
    throw new LifefootballLookupError("invalid_factory_order_response", "ເວັບໂຮງງານບໍ່ໄດ້ສົ່ງລະຫັດອໍເດີທີ່ຖືກຕ້ອງ");
  }
  return code;
}
