"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type User = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: "admin" | "manager" | "staff";
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const ROLES = [
  { value: "admin", label: "ຜູ້ດູແລລະບົບ (Admin)" },
  { value: "manager", label: "ຜູ້ຈັດການ (Manager)" },
  { value: "staff", label: "ພະນັກງານ (Staff)" },
] as const;

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filter
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "manager" | "staff">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Add new user
  const [newFullName, setNewFullName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<User["role"]>("staff");
  const [newNotes, setNewNotes] = useState("");

  // Edit modal
  const [editing, setEditing] = useState<User | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<User["role"]>("staff");
  const [editActive, setEditActive] = useState(true);
  const [editNotes, setEditNotes] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setUsers([]);
    } else {
      setUsers((data as User[]) || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Filter users
  const filteredUsers = useMemo(() => {
    let result = users;

    // Role filter
    if (roleFilter !== "all") {
      result = result.filter((u) => u.role === roleFilter);
    }

    // Status filter
    if (statusFilter === "active") {
      result = result.filter((u) => u.is_active);
    } else if (statusFilter === "inactive") {
      result = result.filter((u) => !u.is_active);
    }

    // Search
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (u) =>
          u.full_name.toLowerCase().includes(q) ||
          u.phone?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [users, roleFilter, statusFilter, searchQuery]);

  const openEdit = (user: User) => {
    setEditing(user);
    setEditFullName(user.full_name);
    setEditPhone(user.phone || "");
    setEditEmail(user.email || "");
    setEditRole(user.role);
    setEditActive(user.is_active);
    setEditNotes(user.notes || "");
  };

  const closeEdit = () => {
    setEditing(null);
    setEditFullName("");
    setEditPhone("");
    setEditEmail("");
    setEditRole("staff");
    setEditActive(true);
    setEditNotes("");
  };

  const addUser = async () => {
    const name = newFullName.trim();
    if (!name) return alert("ກະລຸນາປ້ອນຊື່ຜູ້ໃຊ້");

    setErr(null);

    const payload = {
      full_name: name,
      phone: newPhone.trim() || null,
      email: newEmail.trim() || null,
      role: newRole,
      notes: newNotes.trim() || null,
      is_active: true,
    };

    const { error } = await supabase.from("users").insert(payload);

    if (error) {
      setErr(error.message);
      return;
    }

    alert("ເພີ່ມຜູ້ໃຊ້ສຳເລັດ");
    setNewFullName("");
    setNewPhone("");
    setNewEmail("");
    setNewRole("staff");
    setNewNotes("");
    await loadUsers();
  };

  const saveEdit = async () => {
    if (!editing) return;

    const name = editFullName.trim();
    if (!name) return alert("ກະລຸນາປ້ອນຊື່ຜູ້ໃຊ້");

    setErr(null);

    const payload = {
      full_name: name,
      phone: editPhone.trim() || null,
      email: editEmail.trim() || null,
      role: editRole,
      is_active: editActive,
      notes: editNotes.trim() || null,
    };

    const { error } = await supabase.from("users").update(payload).eq("id", editing.id);

    if (error) {
      setErr(error.message);
      return;
    }

    alert("ບັນທຶກການແກ້ໄຂແລ້ວ");
    closeEdit();
    await loadUsers();
  };

  const toggleActive = async (user: User) => {
    const newStatus = !user.is_active;
    const confirmMsg = newStatus
      ? `ເປີດໃຊ້ງານ: ${user.full_name}?`
      : `ປິດໃຊ້ງານ: ${user.full_name}?`;

    const ok = confirm(confirmMsg);
    if (!ok) return;

    setErr(null);

    const { error } = await supabase
      .from("users")
      .update({ is_active: newStatus })
      .eq("id", user.id);

    if (error) {
      setErr(error.message);
      return;
    }

    await loadUsers();
  };

  const deleteUser = async (user: User) => {
    const ok = confirm(
      `ຢືນຢັນລຶບຜູ້ໃຊ້?\n\nຊື່: ${user.full_name}\nເບີໂທ: ${user.phone || "-"}\n\n⚠️ ການລຶບຈະບໍ່ສາມາດກູ້ຄືນໄດ້!`
    );
    if (!ok) return;

    setErr(null);

    const { error } = await supabase.from("users").delete().eq("id", user.id);

    if (error) {
      setErr(error.message);
      return;
    }

    alert("ລຶບຜູ້ໃຊ້ແລ້ວ");
    await loadUsers();
  };

  const getRoleBadge = (role: User["role"]) => {
    switch (role) {
      case "admin":
        return <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-black uppercase border border-purple-200">Admin</span>;
      case "manager":
        return <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black uppercase border border-blue-200">Manager</span>;
      case "staff":
        return <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black uppercase border border-slate-200">Staff</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">ຈັດການຜູ້ໃຊ້</h1>
        <div className="text-sm font-medium text-slate-500">ເພີ່ມ, ແກ້ໄຂ, ລຶບຜູ້ໃຊ້ງານລະບົບ</div>

        {err && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm font-bold flex items-center gap-2">
            <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
            Error: {err}
          </div>
        )}
      </div>

      {/* Add new user */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <div className="font-black text-slate-700 mb-4 uppercase text-xs tracking-widest">ເພີ່ມຜູ້ໃຊ້ໃໝ່</div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="text-xs font-black text-slate-500 mb-1.5 block uppercase">ຊື່ຜູ້ໃຊ້ *</label>
            <input
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
              placeholder="ຊື່ ແລະ ນາມສະກຸນ"
              className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-green-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-black text-slate-500 mb-1.5 block uppercase">ເບີໂທ</label>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="020xxxxxxxx"
              className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-green-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-black text-slate-500 mb-1.5 block uppercase">ອີເມລ</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@email.com"
              className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-green-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-black text-slate-500 mb-1.5 block uppercase">ຕຳແໜ່ງ</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as User["role"])}
              className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-black text-slate-800 bg-slate-50 cursor-pointer"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              onClick={addUser}
              className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-black hover:bg-green-700 w-full shadow-lg shadow-green-100 transition-all active:scale-[0.98]"
            >
              + ເພີ່ມຜູ້ໃຊ້
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-black text-slate-500 mb-1.5 block uppercase">ໝາຍເຫດ</label>
          <input
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="ເພີ່ມໝາຍເຫດ (ຖ້າມີ)"
            className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-green-500 outline-none"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 rounded-2xl shadow-lg p-5 text-white">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <div>
            <label className="text-[10px] font-black text-slate-400 mb-1.5 block uppercase tracking-tighter">ຄົ້ນຫາຂໍ້ມູນ</label>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ຊື່, ເບີໂທ, ອີເມລ"
              className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2 text-sm font-bold text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 mb-1.5 block uppercase tracking-tighter">ກອງຕາມຕຳແໜ່ງ</label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2 text-sm font-bold text-white outline-none cursor-pointer"
            >
              <option value="all">ທັງໝົດ</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 mb-1.5 block uppercase tracking-tighter">ກອງຕາມສະຖານະ</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2 text-sm font-bold text-white outline-none cursor-pointer"
            >
              <option value="all">ທັງໝົດ</option>
              <option value="active">ໃຊ້ງານ</option>
              <option value="inactive">ປິດແລ້ວ</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 mb-1.5 block uppercase tracking-tighter">ຜົນການຄົ້ນຫາ</label>
            <div className="text-lg font-black text-blue-400 leading-none py-1.5">
              {filteredUsers.length} <span className="text-xs text-slate-500">ຈາກ {users.length} ຄົນ</span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 bg-slate-50/50 flex items-center justify-between border-b border-slate-100">
          <div className="text-sm font-black text-slate-700 uppercase tracking-widest">ລາຍການຜູ້ໃຊ້ທັງໝົດ</div>
          <div className="text-xs font-bold text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
            {loading ? "ກຳລັງໂຫຼດ..." : `UPDATE: ${new Date().toLocaleDateString()}`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
              <tr>
                <th className="p-4 text-left font-bold text-[11px] uppercase tracking-wider">ຊື່ຜູ້ໃຊ້</th>
                <th className="p-4 text-left font-bold text-[11px] uppercase tracking-wider">ເບີໂທ</th>
                <th className="p-4 text-left font-bold text-[11px] uppercase tracking-wider">ອີເມລ</th>
                <th className="p-4 text-center font-bold text-[11px] uppercase tracking-wider">ຕຳແໜ່ງ</th>
                <th className="p-4 text-center font-bold text-[11px] uppercase tracking-wider">ສະຖານະ</th>
                <th className="p-4 text-left font-bold text-[11px] uppercase tracking-wider">ໝາຍເຫດ</th>
                <th className="p-4 text-center font-bold text-[11px] uppercase tracking-wider">ຈັດການ</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50">
              {!loading && filteredUsers.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-slate-400 font-medium" colSpan={7}>
                    ບໍ່ມີຂໍ້ມູນທີ່ທ່ານຄົ້ນຫາ
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="p-4 font-black text-slate-900">{user.full_name}</td>
                    <td className="p-4 font-bold text-slate-600">{user.phone || "—"}</td>
                    <td className="p-4 text-slate-500 italic">{user.email || "—"}</td>
                    <td className="p-4 text-center">{getRoleBadge(user.role)}</td>
                    <td className="p-4 text-center">
                      {user.is_active ? (
                        <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-black uppercase">
                          ໃຊ້ງານ
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-slate-200 text-slate-500 text-[10px] font-black uppercase">
                          ປິດແລ້ວ
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-slate-500 max-w-xs truncate text-xs">{user.notes || "—"}</td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={() => openEdit(user)}
                          className="text-blue-600 font-black text-xs hover:bg-blue-50 px-2 py-1 rounded-lg transition-all"
                        >
                          ແກ້ໄຂ
                        </button>
                        <button
                          onClick={() => toggleActive(user)}
                          className={`font-black text-xs px-2 py-1 rounded-lg transition-all ${
                            user.is_active ? "text-amber-600 hover:bg-amber-50" : "text-green-600 hover:bg-green-50"
                          }`}
                        >
                          {user.is_active ? "ປິດ" : "ເປີດ"}
                        </button>
                        <button
                          onClick={() => deleteUser(user)}
                          className="text-red-500 font-black text-xs hover:bg-red-50 px-2 py-1 rounded-lg transition-all opacity-40 group-hover:opacity-100"
                        >
                          ລຶບ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="font-black text-slate-800 uppercase tracking-tight">ແກ້ໄຂຂໍ້ມູນ: {editing.full_name}</div>
              <button onClick={closeEdit} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-500 mb-1.5 block uppercase">ຊື່ຜູ້ໃຊ້ *</label>
                  <input
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-500 mb-1.5 block uppercase">ເບີໂທ</label>
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-500 mb-1.5 block uppercase">ອີເມລ</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-500 mb-1.5 block uppercase">ຕຳແໜ່ງ</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as User["role"])}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black text-slate-800 outline-none cursor-pointer"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-500 mb-1.5 block uppercase">ໝາຍເຫດ</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <input
                  id="edit-active"
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <label htmlFor="edit-active" className="text-sm font-black text-slate-700 cursor-pointer">
                  ເປີດໃຊ້ງານບັນຊີນີ້ (Active Status)
                </label>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
              <button
                onClick={closeEdit}
                className="bg-white border border-slate-200 text-slate-600 px-6 py-2 rounded-xl text-sm font-bold hover:bg-slate-100 transition-colors"
              >
                ຍົກເລີກ
              </button>
              <button
                onClick={saveEdit}
                className="bg-green-600 text-white px-8 py-2 rounded-xl text-sm font-black hover:bg-green-700 shadow-lg shadow-green-100 transition-all active:scale-[0.95]"
              >
                ບັນທຶກການແກ້ໄຂ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}