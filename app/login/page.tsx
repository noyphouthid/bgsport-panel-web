"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Toaster } from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { AppRole, getDefaultPathForRole } from "@/lib/access-control";
import ThemeToggle from "@/components/theme-toggle";

type UserProfile = {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  is_active: boolean;
};

async function findActiveProfile(authUserId: string, emailAddress: string) {
  const normalizedEmail = emailAddress.trim().toLowerCase();
  const { data: byAuthId, error: byAuthIdErr } = await supabase
    .from("users")
    .select("id,full_name,email,role,is_active,auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (byAuthIdErr) throw byAuthIdErr;

  let userRow = byAuthId;
  if (!userRow) {
    const { data: byEmail, error: byEmailErr } = await supabase
      .from("users")
      .select("id,full_name,email,role,is_active,auth_user_id")
      .ilike("email", normalizedEmail)
      .maybeSingle();
    if (byEmailErr) throw byEmailErr;
    userRow = byEmail;
  }

  if (!userRow || !userRow.is_active) return null;
  return userRow as UserProfile;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const session = data.session;
      if (session) {
        const emailAddress = String(session.user.email || "").trim().toLowerCase();
        if (!emailAddress) {
          await supabase.auth.signOut();
        } else {
          try {
            const profile = await findActiveProfile(session.user.id, emailAddress);
            if (profile) {
              router.replace(getDefaultPathForRole(profile.role));
              return;
            }
            await supabase.auth.signOut();
          } catch {
            await supabase.auth.signOut();
          }
        }
      }
      setCheckingSession(false);
    };

    void checkSession();
    return () => {
      active = false;
    };
  }, [router]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const inputEmail = email.trim().toLowerCase();
    if (!inputEmail || !password.trim()) {
      toast.error("ກະລຸນາປ້ອນຂໍ້ມູນໃຫ້ຖືກຕ້ອງ");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: inputEmail,
      password,
    });

    if (error || !data.user) {
      setLoading(false);
      toast.error(error?.message || "ເຂົ້າສູ່ລະບົບບໍ່ສຳເລັດ");
      return;
    }

    let profile: UserProfile | null = null;
    try {
      profile = await findActiveProfile(data.user.id, inputEmail);
    } catch {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error("ກວດສອບບໍ່ສຳເລັດ");
      return;
    }

    if (!profile) {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error("ບັນຊີນີ້ບໍ່ມີສິດໃຊ້ງານລະບົບ");
      return;
    }

    toast.success(`ຍິນດີຕໍ່ຮັບ ${profile.full_name}`);
    setLoading(false);
    router.replace(getDefaultPathForRole(profile.role));
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="text-sm font-bold text-[var(--theme-foreground)]">ກຳລັງກວດສອບ session...</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md rounded-2xl border p-6 space-y-5 shadow-lg backdrop-blur-md bg-[var(--theme-surface)] border-[color:var(--theme-border)]">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-black text-[var(--theme-foreground)]">ເຂົ້າສູ່ລະບົບ BG SPORT</h1>
          <p className="text-sm font-medium text-slate-500">ກະລຸນາໃຊ້ບັນຊີຂອງທ່ານເພື່ອເຂົ້າໃຊ້ງານ</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--theme-foreground)] block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition bg-[var(--theme-surface-strong)] border border-[color:var(--theme-border)] text-[var(--theme-foreground)] focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--theme-foreground)] block mb-1">ລະຫັດຜ່ານ</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition bg-[var(--theme-surface-strong)] border border-[color:var(--theme-border)] text-[var(--theme-foreground)] focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-black hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {loading ? "ກຳລັງເຂົ້າສູ່ລະບົບ..." : "ເຂົ້າສູ່ລະບົບ"}
          </button>
        </form>

        <div className="rounded-xl border border-emerald-200/50 bg-emerald-50/80 p-3 text-center">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">Customer Tracking</div>
          <Link href="/track" className="mt-1 inline-block text-sm font-black text-emerald-900 hover:text-emerald-700">
            ເປີດໜ້າຕິດຕາມສະຖານະສຳລັບລູກຄ້າ
          </Link>
        </div>
      </div>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 2800,
          style: { fontWeight: 700, background: "var(--theme-surface)", color: "var(--theme-foreground)", border: "1px solid var(--theme-border)" },
        }}
      />
    </div>
  );
}
