"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import Swal from "sweetalert2";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
import type { AppRole } from "@/lib/access-control";

type User = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: AppRole;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const ADMIN_TRANSFER_ROLES = new Set<User["role"]>(["superadmin", "admin"]);
const GRAPHIC_TRANSFER_ROLES = new Set<User["role"]>(["graphic"]);
type TransferAssignment = "admin" | "graphic";

const ROLES = [
  { value: "superadmin", label: "Superadmin" },
  { value: "admin", label: "ຜູ້ດູແລລະບົບ (Admin)" },
  { value: "manager", label: "ຜູ້ຈັດການ (Manager)" },
  { value: "staff", label: "ພະນັກງານ (Staff)" },
  { value: "graphic", label: "Graphic" },
  { value: "production", label: "ຝ່າຍວາງຜະລິດ" },
  { value: "accountant", label: "Accountant" },
] as const;

export default function UsersPage() {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filter
  const [roleFilter, setRoleFilter] = useState<"all" | AppRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Add new user
  const [newFullName, setNewFullName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
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
  const [editPassword, setEditPassword] = useState("");
  const [transferAssignment, setTransferAssignment] = useState<TransferAssignment>("admin");
  const [transferSourceUserId, setTransferSourceUserId] = useState("");
  const [transferringOrders, setTransferringOrders] = useState(false);
  const { markClean } = useUnsavedChangesGuard({ scopeRef: pageRef, enabled: !loading });

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
    const timer = setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const callAdminApi = async (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      throw new Error("no_session");
    }

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new Error(data.error || "request_failed");
    }
    return data;
  };

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

  const transferRoleSet = useMemo(() => {
    if (!editing) return null;
    if (GRAPHIC_TRANSFER_ROLES.has(editing.role)) return GRAPHIC_TRANSFER_ROLES;
    if (ADMIN_TRANSFER_ROLES.has(editing.role)) return ADMIN_TRANSFER_ROLES;
    return null;
  }, [editing]);

  const transferSourceCandidates = useMemo(() => {
    if (!transferRoleSet) return [];
    return users.filter((user) => transferRoleSet.has(user.role) && user.id !== editing?.id);
  }, [users, editing, transferRoleSet]);

  const canTransferOrders = transferRoleSet !== null;

  const openEdit = (user: User) => {
    setEditing(user);
    setEditFullName(user.full_name);
    setEditPhone(user.phone || "");
    setEditEmail(user.email || "");
    setEditRole(user.role);
    setEditActive(user.is_active);
    setEditNotes(user.notes || "");
    setEditPassword("");
    setTransferAssignment(GRAPHIC_TRANSFER_ROLES.has(user.role) ? "graphic" : "admin");
    setTransferSourceUserId("");
  };

  const closeEdit = () => {
    setEditing(null);
    setEditFullName("");
    setEditPhone("");
    setEditEmail("");
    setEditRole("staff");
    setEditActive(true);
    setEditNotes("");
    setEditPassword("");
    setTransferAssignment("admin");
    setTransferSourceUserId("");
    setTransferringOrders(false);
  };

  const addUser = async () => {
    const name = newFullName.trim();
    const email = newEmail.trim().toLowerCase();
    if (!name) {
      toast.error("ກະລຸນາປ້ອນຊື່ຜູ້ໃຊ້");
      return;
    }
    if (!email) {
      toast.error("ກະລຸນາປ້ອນ Email");
      return;
    }
    if (newPassword.trim().length < 6) {
      toast.error("ລະຫັດຜ່ານຕ້ອງຢ່າງໜ້ອຍ 6 ຕົວ");
      return;
    }

    setErr(null);
    try {
      await callAdminApi("/api/admin/users", "POST", {
        full_name: name,
        phone: newPhone.trim() || null,
        email,
        password: newPassword,
        role: newRole,
        notes: newNotes.trim() || null,
        is_active: true,
      });
      toast.success("ເພີ່ມຜູ້ໃຊ້ສຳເລັດ");
      setNewFullName("");
      setNewPhone("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("staff");
      setNewNotes("");
      markClean();
      await loadUsers();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ເພີ່ມຜູ້ໃຊ້ບໍ່ສຳເລັດ";
      setErr(msg);
      toast.error(msg);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;

    const name = editFullName.trim();
    const email = editEmail.trim().toLowerCase();
    if (!name) {
      toast.error("ກະລຸນາປ້ອນຊື່ຜູ້ໃຊ້");
      return;
    }
    if (!email) {
      toast.error("ກະລຸນາປ້ອນ Email");
      return;
    }

    setErr(null);
    try {
      await callAdminApi(`/api/admin/users/${editing.id}`, "PATCH", {
        full_name: name,
        phone: editPhone.trim() || null,
        email,
        role: editRole,
        is_active: editActive,
        notes: editNotes.trim() || null,
        password: editPassword.trim() || undefined,
      });
      toast.success("ບັນທຶກການແກ້ໄຂແລ້ວ");
      closeEdit();
      markClean();
      await loadUsers();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ";
      setErr(msg);
      toast.error(msg);
    }
  };

  const toggleActive = async (user: User) => {
    const newStatus = !user.is_active;
    const ok = await Swal.fire({
      icon: "question",
      title: newStatus ? "ຢືນຢັນເປີດໃຊ້ງານ?" : "ຢືນຢັນປິດໃຊ້ງານ?",
      text: user.full_name,
      showCancelButton: true,
      confirmButtonText: "ຢືນຢັນ",
      cancelButtonText: "ຍົກເລີກ",
      reverseButtons: true,
    });
    if (!ok.isConfirmed) return;

    setErr(null);
    try {
      await callAdminApi(`/api/admin/users/${user.id}`, "PATCH", {
        full_name: user.full_name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        is_active: newStatus,
        notes: user.notes,
      });
      toast.success(newStatus ? "ເປີດໃຊ້ງານແລ້ວ" : "ປິດໃຊ້ງານແລ້ວ");
      await loadUsers();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ອັບເດດສະຖານະບໍ່ສຳເລັດ";
      setErr(msg);
      toast.error(msg);
    }
  };

  const deleteUser = async (user: User) => {
    const ok = await Swal.fire({
      icon: "warning",
      title: "ຢືນຢັນລຶບຜູ້ໃຊ້?",
      html: `ຊື່: <b>${user.full_name}</b><br/>Email: <b>${user.email || "-"}</b>`,
      showCancelButton: true,
      confirmButtonText: "ລຶບ",
      cancelButtonText: "ຍົກເລີກ",
      reverseButtons: true,
    });
    if (!ok.isConfirmed) return;

    setErr(null);
    try {
      await callAdminApi(`/api/admin/users/${user.id}`, "DELETE");
      toast.success("ລຶບຜູ້ໃຊ້ແລ້ວ");
      await loadUsers();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ລຶບຜູ້ໃຊ້ບໍ່ສຳເລັດ";
      setErr(msg);
      toast.error(msg);
    }
  };

  const transferOrdersToEditingUser = async () => {
    if (!editing || !canTransferOrders) return;
    if (!transferSourceUserId) {
      toast.error("ກະລຸນາເລືອກ user ຕົ້ນທາງ");
      return;
    }

    const sourceUser = users.find((user) => user.id === transferSourceUserId);
    if (!sourceUser) {
      toast.error("ບໍ່ພົບ user ຕົ້ນທາງ");
      return;
    }

    const ok = await Swal.fire({
      icon: "warning",
      title: "ຢືນຢັນຍ້າຍອໍເດີ?",
      html: `ຍ້າຍອໍເດີ ${transferAssignment === "graphic" ? "graphic" : "admin"} ຈາກ <b>${sourceUser.full_name}</b><br/>ໄປຫາ <b>${editing.full_name}</b>`,
      showCancelButton: true,
      confirmButtonText: "ຍ້າຍອໍເດີ",
      cancelButtonText: "ຍົກເລີກ",
      reverseButtons: true,
    });
    if (!ok.isConfirmed) return;

    setErr(null);
    setTransferringOrders(true);
    try {
      const result = (await callAdminApi(`/api/admin/users/${editing.id}/transfer-orders`, "POST", {
        source_user_id: transferSourceUserId,
        assignment_type: transferAssignment,
      })) as { transferred_count?: number };

      const transferredCount = Number(result.transferred_count || 0);
      toast.success(
        transferredCount > 0
          ? `ຍ້າຍອໍເດີສຳເລັດ ${transferredCount} ລາຍການ`
          : "ບໍ່ມີອໍເດີໃຫ້ຍ້າຍ"
      );
      setTransferSourceUserId("");
      await loadUsers();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ຍ້າຍອໍເດີບໍ່ສຳເລັດ";
      setErr(msg);
      toast.error(msg);
    } finally {
      setTransferringOrders(false);
    }
  };

  const getRoleBadge = (role: User["role"]) => {
    switch (role) {
      case "superadmin":
        return <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-black uppercase border border-red-200">Superadmin</span>;
      case "admin":
        return <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-black uppercase border border-purple-200">Admin</span>;
      case "manager":
        return <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black uppercase border border-blue-200">Manager</span>;
      case "staff":
        return <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black uppercase border border-slate-200">Staff</span>;
      case "graphic":
        return <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-[10px] font-black uppercase border border-pink-200">Graphic</span>;
      case "production":
        return <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase border border-emerald-200">Production</span>;
      case "accountant":
        return <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black uppercase border border-amber-200">Accountant</span>;
    }
  };

  return (
    <div ref={pageRef} className="space-y-6">
      <div className="mb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">ຈັດການຜູ້ໃຊ້</h1>
            <div className="text-sm font-medium text-slate-500">ເພີ່ມ, ແກ້ໄຂ, ລຶບຜູ້ໃຊ້ງານລະບົບ</div>
          </div>
          <Link
            href="/users/permissions"
            className="inline-flex items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-black text-sky-700 transition hover:bg-sky-100"
          >
            ກຳນົດສິດພະນັກງານ
          </Link>
        </div>

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
            <label className="text-xs font-black text-slate-500 mb-1.5 block uppercase">Password *</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 chars"
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
              data-unsaved-ignore="true"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ຊື່, ເບີໂທ, ອີເມລ"
              className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2 text-sm font-bold text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 mb-1.5 block uppercase tracking-tighter">ກອງຕາມຕຳແໜ່ງ</label>
              <select
                data-unsaved-ignore="true"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as "all" | AppRole)}
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2 text-sm font-bold text-white outline-none cursor-pointer"
              >
              <option value="all">ທັງໝົດ</option>
              <option value="superadmin">Superadmin</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="graphic">Graphic</option>
              <option value="production">ຝ່າຍວາງຜະລິດ</option>
              <option value="accountant">Accountant</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 mb-1.5 block uppercase tracking-tighter">ກອງຕາມສະຖານະ</label>
              <select
                data-unsaved-ignore="true"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
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
                <div className="md:col-span-2">
                  <label className="text-xs font-black text-slate-500 mb-1.5 block uppercase">Reset Password</label>
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Leave blank to keep current password"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
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

              {canTransferOrders ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <div>
                    <div className="text-sm font-black text-amber-900">ຍ້າຍອໍເດີໄປ user ນີ້</div>
                    <div className="text-xs font-medium text-amber-800">
                      {transferAssignment === "graphic"
                        ? "ໃຊ້ສຳລັບຍ້າຍອໍເດີຂອງ graphic ເກົ່າ ເຂົ້າຫາ user ນີ້ ເພື່ອໃຫ້ລາຍງານ graphic-work ລວມເປັນຄົນດຽວ."
                        : "ໃຊ້ສຳລັບຍ້າຍອໍເດີຂອງ admin ເກົ່າ ເຂົ້າຫາ user ນີ້ ເພື່ອໃຫ້ລາຍງານ admin-sales ລວມເປັນຄົນດຽວ."}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                    <div>
                      <label className="text-xs font-black text-amber-900 mb-1.5 block uppercase">user ຕົ້ນທາງ</label>
                      <select
                        value={transferSourceUserId}
                        onChange={(e) => setTransferSourceUserId(e.target.value)}
                        className="w-full border border-amber-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 bg-white"
                        disabled={transferringOrders}
                      >
                        <option value="">
                          {transferAssignment === "graphic"
                            ? "ເລືອກ graphic ທີ່ຈະຍ້າຍອໍເດີອອກ"
                            : "ເລືອກ admin ທີ່ຈະຍ້າຍອໍເດີອອກ"}
                        </option>
                        {transferSourceCandidates.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.full_name} {user.email ? `(${user.email})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={transferOrdersToEditingUser}
                      disabled={!transferSourceUserId || transferringOrders}
                      className="bg-amber-600 text-white px-5 py-2.5 rounded-xl text-sm font-black hover:bg-amber-700 transition-colors disabled:opacity-50"
                    >
                      {transferringOrders
                        ? "ກຳລັງຍ້າຍ..."
                        : transferAssignment === "graphic"
                          ? "ຍ້າຍອໍເດີ graphic ມາ user ນີ້"
                          : "ຍ້າຍອໍເດີ admin ມາ user ນີ້"}
                    </button>
                  </div>
                </div>
              ) : null}

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
