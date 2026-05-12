"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import {
  ACCESS_PERMISSION_ITEMS,
  EDIT_PERMISSION_ITEMS,
  buildDefaultPermissionSettings,
  normalizePermissionMode,
  normalizeUserPermissionSettings,
  type AccessPermissionKey,
  type EditPermissionKey,
  type PermissionMode,
  type UserPermissionSettings,
} from "@/lib/user-permissions";

type UserRole = "superadmin" | "admin" | "manager" | "staff" | "graphic" | "accountant";

type UserRow = {
  id: string;
  full_name: string;
  email: string | null;
  role: UserRole;
  is_active: boolean;
  permission_settings: UserPermissionSettings | null;
};

const MODE_OPTIONS: Array<{ value: PermissionMode; label: string }> = [
  { value: "inherit", label: "ໃຊ້ຕາມ role ເດີມ" },
  { value: "allow", label: "ອະນຸຍາດ" },
  { value: "deny", label: "ບໍ່ອະນຸຍາດ" },
];

function groupAccessItems() {
  const grouped = new Map<string, typeof ACCESS_PERMISSION_ITEMS>();
  ACCESS_PERMISSION_ITEMS.forEach((item) => {
    const current = grouped.get(item.group) || [];
    grouped.set(item.group, [...current, item]);
  });
  return [...grouped.entries()];
}

export default function UserPermissionsPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [draftSettings, setDraftSettings] = useState<UserPermissionSettings>(buildDefaultPermissionSettings());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("users")
      .select("id,full_name,email,role,is_active,permission_settings")
      .order("full_name", { ascending: true });

    if (error) {
      setErr(error.message);
      setUsers([]);
      setLoading(false);
      return;
    }

    const rows = ((data ?? []) as UserRow[]).map((user) => ({
      ...user,
      permission_settings: normalizeUserPermissionSettings(user.permission_settings),
    }));

    setUsers(rows);
    setSelectedUserId((prev) => prev || rows[0]?.id || "");
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((user) => [user.full_name, user.email || "", user.role].join(" ").toLowerCase().includes(keyword));
  }, [query, users]);

  const selectedUser = useMemo(() => users.find((user) => user.id === selectedUserId) || null, [selectedUserId, users]);

  useEffect(() => {
    if (!selectedUser) {
      setDraftSettings(buildDefaultPermissionSettings());
      return;
    }
    setDraftSettings(normalizeUserPermissionSettings(selectedUser.permission_settings));
  }, [selectedUser]);

  const hasChanges = useMemo(() => {
    if (!selectedUser) return false;
    return JSON.stringify(normalizeUserPermissionSettings(selectedUser.permission_settings)) !== JSON.stringify(normalizeUserPermissionSettings(draftSettings));
  }, [draftSettings, selectedUser]);

  const updateAccessMode = (key: AccessPermissionKey, mode: PermissionMode) => {
    setDraftSettings((prev) => ({
      ...prev,
      access: {
        ...(prev.access || {}),
        [key]: mode,
      },
    }));
  };

  const updateEditMode = (key: EditPermissionKey, mode: PermissionMode) => {
    setDraftSettings((prev) => ({
      ...prev,
      edit: {
        ...(prev.edit || {}),
        [key]: mode,
      },
    }));
  };

  const resetToSaved = () => {
    if (!selectedUser) return;
    setDraftSettings(normalizeUserPermissionSettings(selectedUser.permission_settings));
  };

  const resetToInherit = () => {
    setDraftSettings(buildDefaultPermissionSettings());
  };

  const savePermissions = async () => {
    if (!selectedUser) return;

    setSaving(true);
    setErr(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setSaving(false);
      toast.error("ບໍ່ພົບ session");
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          permission_settings: normalizeUserPermissionSettings(draftSettings),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "save_failed");
      }

      toast.success("ບັນທຶກສິດການໃຊ້ງານແລ້ວ");
      await loadUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "ບັນທຶກບໍ່ສຳເລັດ";
      setErr(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const accessGroups = useMemo(() => groupAccessItems(), []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">ກຳນົດສິດພະນັກງານ</h1>
          <p className="text-sm font-medium text-slate-500">ກຳນົດສິດເຂົ້າເຖິງໜ້າ ແລະ ສິດແກ້ໄຂຂໍ້ມູນເປັນລາຍຄົນ</p>
        </div>
        <Link
          href="/users"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          ກັບໄປຈັດການຜູ້ໃຊ້
        </Link>
      </div>

      {err ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{err}</div> : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">ຄົ້ນຫາພະນັກງານ</div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ຊື່, email, role"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 outline-none"
            />
          </div>

          <div className="space-y-2">
            {filteredUsers.map((user) => {
              const active = user.id === selectedUserId;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setSelectedUserId(user.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    active ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="font-black text-slate-900">{user.full_name}</div>
                  <div className="mt-1 text-xs font-medium text-slate-500">{user.email || "-"}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase text-slate-600">{user.role}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${user.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                      {user.is_active ? "active" : "inactive"}
                    </span>
                  </div>
                </button>
              );
            })}

            {!loading && filteredUsers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-bold text-slate-400">ບໍ່ພົບພະນັກງານ</div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
                  <ShieldCheck size={14} />
                  Permission Profile
                </div>
                <h2 className="mt-3 text-xl font-black text-slate-900">{selectedUser?.full_name || "ເລືອກພະນັກງານ"}</h2>
                <p className="text-sm font-medium text-slate-500">{selectedUser ? `${selectedUser.role} • ${selectedUser.email || "-"}` : "ເລືອກ user ຈາກລາຍຊື່ດ້ານຊ້າຍ"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={resetToSaved}
                  disabled={!selectedUser || !hasChanges}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  ກັບຄືນຄ່າທີ່ບັນທຶກ
                </button>
                <button
                  type="button"
                  onClick={resetToInherit}
                  disabled={!selectedUser}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  ຕັ້ງເປັນ inherit ທັງໝົດ
                </button>
                <button
                  type="button"
                  onClick={savePermissions}
                  disabled={!selectedUser || !hasChanges || saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save size={16} />
                  {saving ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກສິດ"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-black text-slate-900">ສິດເຂົ້າເຖິງໜ້າ</h3>
            <p className="mt-1 text-sm font-medium text-slate-500">ກຳນົດວ່າພະນັກງານຄົນນີ້ຈະເຂົ້າເຖິງໜ້າໃດໄດ້ບ້າງ</p>

            <div className="mt-5 space-y-5">
              {accessGroups.map(([group, items]) => (
                <div key={group} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">{group}</div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {items.map((item) => (
                      <div key={item.key} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="font-black text-slate-900">{item.label}</div>
                        <div className="mt-1 text-xs font-medium text-slate-500">{item.key}</div>
                        <select
                          value={normalizePermissionMode(draftSettings.access?.[item.key])}
                          onChange={(event) => updateAccessMode(item.key, event.target.value as PermissionMode)}
                          disabled={!selectedUser}
                          className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 disabled:bg-slate-50"
                        >
                          {MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-black text-slate-900">ສິດແກ້ໄຂຂໍ້ມູນ</h3>
            <p className="mt-1 text-sm font-medium text-slate-500">ກຳນົດວ່າເຂົາຈະແກ້ໄຂຂໍ້ມູນໃນໂມດູນໃດໄດ້</p>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {EDIT_PERMISSION_ITEMS.map((item) => (
                <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="font-black text-slate-900">{item.label}</div>
                  <div className="mt-1 text-sm font-medium text-slate-500">{item.description}</div>
                  <select
                    value={normalizePermissionMode(draftSettings.edit?.[item.key])}
                    onChange={(event) => updateEditMode(item.key, event.target.value as PermissionMode)}
                    disabled={!selectedUser}
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 disabled:bg-slate-50"
                  >
                    {MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
