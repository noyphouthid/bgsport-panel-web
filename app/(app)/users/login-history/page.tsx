"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Crosshair, ExternalLink, Laptop, MapPin, Monitor, Pencil, RefreshCw, Smartphone, Tablet, Wifi } from "lucide-react";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { describeDevice, googleMapsUrl, type DeviceType, type GpsStatus } from "@/lib/login-audit";

type UserOption = { id: string; full_name: string; email: string | null };
type DeviceOption = { id: string; label: string | null; last_user_agent: string | null; last_seen_at: string };

type LoginEvent = {
  id: number;
  created_at: string;
  user_id: string | null;
  email: string | null;
  success: boolean;
  failure_reason: string | null;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  browser: string | null;
  os: string | null;
  device_type: DeviceType | null;
  device_id: string | null;
  is_new_device: boolean;
  is_new_ip: boolean;
  user_agent: string | null;
  isp?: string | null;
  ip_latitude?: number | null;
  ip_longitude?: number | null;
  gps_status?: GpsStatus | null;
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  gps_accuracy_m?: number | null;
  user: { id: string; full_name: string; role: string } | null;
  device: { id: string; label: string | null } | null;
};

type Filters = {
  userId: string;
  deviceId: string;
  status: "all" | "success" | "failed";
  from: string;
  to: string;
  ip: string;
  onlyNew: boolean;
};

const EMPTY_FILTERS: Filters = { userId: "", deviceId: "", status: "all", from: "", to: "", ip: "", onlyNew: false };

const FAILURE_LABELS: Record<string, string> = {
  wrong_password: "ລະຫັດຜ່ານ ຫຼື email ບໍ່ຖືກ",
  inactive_account: "ບັນຊີຖືກປິດ / ບໍ່ມີສິດ",
  profile_check_failed: "ກວດສອບບັນຊີບໍ່ສຳເລັດ",
};

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Vientiane",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function DeviceIcon({ type }: { type: DeviceType | null }) {
  if (type === "mobile") return <Smartphone size={14} />;
  if (type === "tablet") return <Tablet size={14} />;
  return <Monitor size={14} />;
}

const GPS_STATUS_LABELS: Record<GpsStatus, { label: string; className: string }> = {
  granted: { label: "ໄດ້ຕຳແໜ່ງ", className: "bg-emerald-100 text-emerald-700" },
  denied: { label: "ບໍ່ອະນຸຍາດຕຳແໜ່ງ", className: "bg-rose-100 text-rose-700" },
  timeout: { label: "ບໍ່ໄດ້ຕອບ / ໝົດເວລາ", className: "bg-amber-100 text-amber-700" },
  unavailable: { label: "ຫາຕຳແໜ່ງບໍ່ໄດ້", className: "bg-slate-100 text-slate-600" },
  unsupported: { label: "ອຸປະກອນບໍ່ຮອງຮັບ", className: "bg-slate-100 text-slate-600" },
};

function GpsCell({ event }: { event: LoginEvent }) {
  if (!event.success) return <span className="text-xs font-bold text-slate-400">-</span>;
  if (!event.gps_status) return <span className="text-xs font-bold text-slate-400">ບໍ່ມີຂໍ້ມູນ</span>;
  const status = GPS_STATUS_LABELS[event.gps_status];
  const hasPoint = event.gps_status === "granted" && event.gps_latitude != null && event.gps_longitude != null;
  return (
    <div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${status.className}`}>{status.label}</span>
      {hasPoint ? (
        <a
          href={googleMapsUrl(event.gps_latitude!, event.gps_longitude!)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 flex items-center gap-1 text-xs font-black text-indigo-700 hover:underline"
        >
          <Crosshair size={12} />
          ເບິ່ງແຜນທີ່
          {event.gps_accuracy_m != null ? <span className="font-bold text-slate-500">(±{event.gps_accuracy_m.toLocaleString()} m)</span> : null}
          <ExternalLink size={11} />
        </a>
      ) : null}
    </div>
  );
}

function formatLocation(event: LoginEvent) {
  return [event.city, event.region, event.country].filter(Boolean).join(", ");
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none";

export default function LoginHistoryPage() {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [ipDraft, setIpDraft] = useState("");
  const [page, setPage] = useState(1);
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const response = await authenticatedFetch("/api/admin/login-devices");
      const payload = (await response.json().catch(() => ({}))) as { devices?: DeviceOption[] };
      if (response.ok) setDevices(payload.devices ?? []);
    } catch {
      // The event list shows the actionable error.
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("users").select("id,full_name,email").order("full_name", { ascending: true });
      setUsers((data ?? []) as UserOption[]);
    })();
    void loadDevices();
  }, [loadDevices]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const params = new URLSearchParams({ page: String(page), status: filters.status });
    if (filters.userId) params.set("user_id", filters.userId);
    if (filters.deviceId) params.set("device_id", filters.deviceId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.ip) params.set("ip", filters.ip);
    if (filters.onlyNew) params.set("only_new", "1");

    try {
      const response = await authenticatedFetch(`/api/admin/login-events?${params.toString()}`);
      const payload = (await response.json().catch(() => ({}))) as {
        events?: LoginEvent[];
        total?: number;
        pageSize?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ");
      setEvents(payload.events ?? []);
      setTotal(payload.total ?? 0);
      setPageSize(payload.pageSize ?? 50);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ");
      setEvents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const updateFilters = (patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const renameDevice = async (deviceId: string, currentLabel: string | null, hint: string) => {
    const result = await Swal.fire({
      title: "ຕັ້ງຊື່ເຄື່ອງ",
      text: hint,
      input: "text",
      inputValue: currentLabel || "",
      inputPlaceholder: "ເຊັ່ນ ຄອມແຄັດເຊຍ 1",
      inputAttributes: { maxlength: "100" },
      showCancelButton: true,
      confirmButtonText: "ບັນທຶກ",
      cancelButtonText: "ຍົກເລີກ",
    });
    if (!result.isConfirmed) return;

    try {
      const response = await authenticatedFetch(`/api/admin/login-devices/${deviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: String(result.value ?? "") }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "ບັນທຶກບໍ່ສຳເລັດ");
      toast.success("ບັນທຶກຊື່ເຄື່ອງແລ້ວ");
      await Promise.all([loadEvents(), loadDevices()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ບັນທຶກບໍ່ສຳເລັດ");
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">ປະຫວັດການເຂົ້າລະບົບ</h1>
          <p className="text-sm font-medium text-slate-500">ກວດເບິ່ງວ່າແຕ່ລະບັນຊີເຂົ້າລະບົບຈາກ IP ແລະ ເຄື່ອງໃດ</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadEvents()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            ໂຫຼດໃໝ່
          </button>
          <Link
            href="/users"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            ກັບໄປຈັດການຜູ້ໃຊ້
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
        <label className="block text-xs font-black text-slate-500">
          ຜູ້ໃຊ້
          <select value={filters.userId} onChange={(e) => updateFilters({ userId: e.target.value })} className={`mt-1 ${inputClass}`}>
            <option value="">ທັງໝົດ</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name} {user.email ? `(${user.email})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-black text-slate-500">
          ເຄື່ອງ
          <select value={filters.deviceId} onChange={(e) => updateFilters({ deviceId: e.target.value })} className={`mt-1 ${inputClass}`}>
            <option value="">ທັງໝົດ</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.label || `ບໍ່ມີຊື່ · ${device.id.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-black text-slate-500">
          ຜົນການເຂົ້າລະບົບ
          <select
            value={filters.status}
            onChange={(e) => updateFilters({ status: e.target.value as Filters["status"] })}
            className={`mt-1 ${inputClass}`}
          >
            <option value="all">ທັງໝົດ</option>
            <option value="success">ສຳເລັດ</option>
            <option value="failed">ບໍ່ສຳເລັດ</option>
          </select>
        </label>
        <form
          className="block text-xs font-black text-slate-500"
          onSubmit={(e) => {
            e.preventDefault();
            updateFilters({ ip: ipDraft.trim() });
          }}
        >
          IP
          <input value={ipDraft} onChange={(e) => setIpDraft(e.target.value)} onBlur={() => updateFilters({ ip: ipDraft.trim() })} placeholder="ເຊັ່ນ 115.84.1.2" className={`mt-1 ${inputClass}`} />
        </form>
        <label className="block text-xs font-black text-slate-500">
          ແຕ່ວັນທີ
          <input type="date" value={filters.from} onChange={(e) => updateFilters({ from: e.target.value })} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-xs font-black text-slate-500">
          ຫາວັນທີ
          <input type="date" value={filters.to} onChange={(e) => updateFilters({ to: e.target.value })} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={filters.onlyNew} onChange={(e) => updateFilters({ onlyNew: e.target.checked })} className="h-4 w-4" />
          ສະເພາະເຄື່ອງໃໝ່ / IP ໃໝ່
        </label>
        <div className="flex items-end">
          <button
            type="button"
            disabled={!hasFilters}
            onClick={() => {
              setIpDraft("");
              updateFilters(EMPTY_FILTERS);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            ລ້າງຕົວກອງ
          </button>
        </div>
      </div>

      {err ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{err}</div> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-500">
          <span>ທັງໝົດ {total.toLocaleString()} ລາຍການ</span>
          <span className="text-xs">ຊື່ເຄື່ອງຕັ້ງໂດຍ superadmin · ກົດ IP ຫຼື ຊື່ເຄື່ອງເພື່ອກອງ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">ເວລາ</th>
                <th className="px-4 py-3">ຜູ້ໃຊ້</th>
                <th className="px-4 py-3">ຜົນ</th>
                <th className="px-4 py-3">IP / ສະຖານທີ່</th>
                <th className="px-4 py-3">ເຄື່ອງ</th>
                <th className="px-4 py-3">ຕຳແໜ່ງ GPS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((event) => {
                const location = formatLocation(event);
                const agent = describeDevice(event);
                return (
                  <tr key={event.id} className={event.success ? "" : "bg-rose-50/40"}>
                    <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{dateTimeFormat.format(new Date(event.created_at))}</td>
                    <td className="px-4 py-3">
                      {event.user ? (
                        <button type="button" onClick={() => updateFilters({ userId: event.user!.id })} className="text-left">
                          <div className="font-black text-slate-900 hover:underline">{event.user.full_name}</div>
                          <div className="text-xs font-medium text-slate-500">{event.email || "-"}</div>
                        </button>
                      ) : (
                        <div>
                          <div className="font-black text-slate-500">ບໍ່ພົບບັນຊີ</div>
                          <div className="text-xs font-medium text-slate-500">{event.email || "-"}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {event.success ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700">ສຳເລັດ</span>
                      ) : (
                        <div>
                          <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-black text-rose-700">ບໍ່ສຳເລັດ</span>
                          <div className="mt-1 text-xs font-medium text-rose-700">{FAILURE_LABELS[event.failure_reason || ""] || event.failure_reason}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {event.ip ? (
                        <button
                          type="button"
                          onClick={() => {
                            setIpDraft(event.ip || "");
                            updateFilters({ ip: event.ip || "" });
                          }}
                          className="font-mono text-sm font-bold text-slate-900 hover:underline"
                        >
                          {event.ip}
                        </button>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                      {event.is_new_ip ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">IP ໃໝ່</span> : null}
                      {location ? (
                        <div className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                          <MapPin size={12} />
                          {event.ip_latitude != null && event.ip_longitude != null ? (
                            <a
                              href={googleMapsUrl(event.ip_latitude, event.ip_longitude)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="ຕຳແໜ່ງໂດຍປະມານຂອງ IP (ລະດັບເມືອງ)"
                              className="hover:underline"
                            >
                              {location} ~
                            </a>
                          ) : (
                            location
                          )}
                        </div>
                      ) : null}
                      {event.isp ? (
                        <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500">
                          <Wifi size={12} />
                          {event.isp}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {event.device ? (
                          <button
                            type="button"
                            onClick={() => updateFilters({ deviceId: event.device!.id })}
                            className={`inline-flex items-center gap-1.5 font-black hover:underline ${event.device.label ? "text-indigo-700" : "text-slate-500"}`}
                          >
                            <Laptop size={14} />
                            {event.device.label || "ຍັງບໍ່ໄດ້ຕັ້ງຊື່"}
                          </button>
                        ) : (
                          <span className="font-black text-slate-400">ບໍ່ມີລະຫັດເຄື່ອງ</span>
                        )}
                        {event.device ? (
                          <button
                            type="button"
                            title="ຕັ້ງຊື່ເຄື່ອງ"
                            onClick={() => void renameDevice(event.device!.id, event.device!.label, agent)}
                            className="rounded-lg border border-slate-200 p-1 text-slate-500 transition hover:bg-slate-50"
                          >
                            <Pencil size={12} />
                          </button>
                        ) : null}
                        {event.is_new_device ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">ເຄື່ອງໃໝ່</span> : null}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-500" title={event.user_agent || ""}>
                        <DeviceIcon type={event.device_type} />
                        {agent}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <GpsCell event={event} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && events.length === 0 && !err ? (
          <div className="px-4 py-10 text-center text-sm font-bold text-slate-400">ບໍ່ມີປະຫວັດການເຂົ້າລະບົບ</div>
        ) : null}
        {loading && events.length === 0 ? <div className="px-4 py-10 text-center text-sm font-bold text-slate-400">ກຳລັງໂຫຼດ...</div> : null}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-50"
          >
            ກ່ອນໜ້າ
          </button>
          <span className="text-sm font-bold text-slate-500">
            ໜ້າ {page} / {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-50"
          >
            ຖັດໄປ
          </button>
        </div>
      </div>
    </div>
  );
}
