"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Toaster } from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { AppRole } from "@/lib/access-control";

type UserProfile = {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  is_active: boolean;
};

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
      if (data.session) {
        router.replace("/dashboard");
        return;
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

    const { data: byAuthId, error: byAuthIdErr } = await supabase
      .from("users")
      .select("id,full_name,email,role,is_active,auth_user_id")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();

    if (byAuthIdErr) {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error("ກວດສອບບໍ່ສຳເລັດ");
      return;
    }

    let userRow = byAuthId;
    if (!userRow) {
      const { data: byEmail, error: byEmailErr } = await supabase
        .from("users")
        .select("id,full_name,email,role,is_active,auth_user_id")
        .ilike("email", inputEmail)
        .maybeSingle();
      if (byEmailErr) {
        await supabase.auth.signOut();
        setLoading(false);
        toast.error("ກວດສອບບໍ່ສຳເລັດ");
        return;
      }
      userRow = byEmail;
    }

    if (!userRow || !userRow.is_active) {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error("ບັນຊີນີ້ບໍ່ມີສິດໃຊ້ງານລະບົບ");
      return;
    }

    const profile = userRow as UserProfile;
    toast.success(`ຍິນດີຕໍ່ຮັບ ${profile.full_name}`);
    setLoading(false);
    router.replace("/dashboard");
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-sm font-bold text-slate-600">ກຳລັງກວດສອບ session...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-black text-slate-900">ເຂົ້າສູ່ລະບົບ BG SPORT</h1>
          <p className="text-sm text-slate-500 font-medium">ກະລຸນາໃຊ້ບັນຊີຂອງທ່ານເພື່ອເຂົ້າໃຊ້ງານ</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">ລະຫັດຜ່ານ</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
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
      </div>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 2800,
          style: { fontWeight: 700 },
        }}
      />
    </div>
  );
}

