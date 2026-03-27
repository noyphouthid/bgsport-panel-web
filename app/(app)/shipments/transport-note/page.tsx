"use client";

import Link from "next/link";
import { Noto_Sans_Lao_Looped } from "next/font/google";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import {
  buildTransportNoteNo,
  DEFAULT_TRANSPORT_NOTE_FORM,
  mapTransportNoteToForm,
  TRANSPORTERS,
  type TransportNoteForm,
  type TransportNoteRow,
} from "@/lib/transport-notes";

const notoSansLaoLooped = Noto_Sans_Lao_Looped({
  subsets: ["lao"],
  weight: ["400", "700"],
});

function LogoMark() {
  return (
    <div className="flex h-[54px] w-[54px] items-center justify-center bg-black text-[22px] font-bold text-white">
      BG
    </div>
  );
}

export default function TransportNotePage() {
  const searchParams = useSearchParams();
  const noteId = searchParams.get("id");

  const [form, setForm] = useState<TransportNoteForm>(DEFAULT_TRANSPORT_NOTE_FORM);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(noteId));
  const [currentNote, setCurrentNote] = useState<TransportNoteRow | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user.id;
      if (!authUserId) return;

      const { data } = await supabase.from("users").select("id,role").eq("auth_user_id", authUserId).maybeSingle();
      if (data?.id) setViewerUserId(String(data.id));
      if (data?.role) setViewerRole(data.role as AppRole);
    };

    const loadNote = async () => {
      if (!noteId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.from("transport_notes").select("*").eq("id", noteId).maybeSingle();
      if (error) {
        toast.error(`ໂຫຼດໃບຝາກເຄື່ອງບໍ່ສຳເລັດ: ${error.message}`);
        setLoading(false);
        return;
      }

      const row = (data as TransportNoteRow | null) ?? null;
      if (!row) {
        toast.error("ບໍ່ພົບໃບຝາກເຄື່ອງ");
        setLoading(false);
        return;
      }

      setCurrentNote(row);
      setForm(mapTransportNoteToForm(row));
      setLoading(false);
    };

    void loadUser();
    void loadNote();
  }, [noteId]);

  useEffect(() => {
    if (!currentNote || !viewerUserId) return;
    if (viewerRole === "superadmin") {
      setAccessDenied(false);
      return;
    }
    const denied = currentNote.created_by_user_id !== viewerUserId;
    setAccessDenied(denied);
    if (denied) {
      toast.error("ທ່ານສາມາດເບິ່ງ ຫຼື ແກ້ໄຂໄດ້ສະເພາະໃບບິນທີ່ຕົນເອງສ້າງ");
    }
  }, [currentNote, viewerRole, viewerUserId]);

  const transporterText = useMemo(() => form.transporters.join(", "), [form.transporters]);
  const shippingModeText = form.shippingChargeMode === "origin" ? "ຈ່າຍຕົ້ນທາງ" : "ຈ່າຍປາຍທາງ";

  const updateField = <K extends keyof TransportNoteForm>(key: K, value: TransportNoteForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleTransporter = (name: string) => {
    setForm((prev) => ({
      ...prev,
      transporters: prev.transporters.includes(name)
        ? prev.transporters.filter((item) => item !== name)
        : [...prev.transporters, name],
    }));
  };

  const handleSave = async () => {
    if (!form.receiverName.trim()) {
      toast.error("ກະລຸນາປ້ອນຊື່ຜູ້ຮັບ");
      return;
    }
    if (accessDenied) {
      toast.error("ທ່ານບໍ່ມີສິດແກ້ໄຂໃບບິນນີ້");
      return;
    }
    if (!form.receiverPhone.trim()) {
      toast.error("ກະລຸນາປ້ອນເບີຜູ້ຮັບ");
      return;
    }
    if (form.transporters.length === 0) {
      toast.error("ກະລຸນາເລືອກຂົນສົ່ງ");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        note_no: currentNote?.note_no || buildTransportNoteNo(),
        source_type: currentNote?.source_type || "standalone",
        order_id: currentNote?.order_id || null,
        delivery_request_id: currentNote?.delivery_request_id || null,
        receiver_name: form.receiverName.trim(),
        receiver_phone: form.receiverPhone.trim(),
        branch: form.branch.trim() || null,
        city: form.city.trim() || null,
        province: form.province.trim() || null,
        transporters: form.transporters,
        shipping_charge_mode: form.shippingChargeMode,
        status: "saved",
        created_by_user_id: currentNote?.created_by_user_id || viewerUserId,
        updated_at: new Date().toISOString(),
      };

      if (currentNote?.id) {
        const { data, error } = await supabase
          .from("transport_notes")
          .update(payload)
          .eq("id", currentNote.id)
          .select("*")
          .single();
        if (error) throw error;
        setCurrentNote(data as TransportNoteRow);
      } else {
        const { data, error } = await supabase
          .from("transport_notes")
          .insert(payload)
          .select("*")
          .single();
        if (error) throw error;
        setCurrentNote(data as TransportNoteRow);
      }

      toast.success(currentNote?.id ? "ອັບເດດໃບຝາກເຄື່ອງແລ້ວ" : "ບັນທຶກໃບຝາກເຄື່ອງແລ້ວ");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ບັນທຶກໃບຝາກເຄື່ອງບໍ່ສຳເລັດ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-[2rem] bg-gradient-to-br from-sky-950 via-blue-900 to-slate-900 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/shipments/notes" className="inline-flex items-center gap-2 text-sm font-bold text-sky-100 transition hover:text-white">
              <ArrowLeft size={16} />
              ກັບໄປລາຍການໃບຝາກເຄື່ອງ
            </Link>
            <h1 className="mt-4 text-3xl font-black tracking-tight">
              {currentNote?.id ? "ແກ້ໄຂໃບຝາກເຄື່ອງ" : "ອອກໃບຝາກເຄື່ອງ"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-sky-100">
              ໜ້ານີ້ສາມາດໃຊ້ສ້າງໃບຝາກເຄື່ອງແບບ standalone ຫຼື ເຂົ້າມາແກ້ໄຂຈາກລາຍການໃບບິນໄດ້.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="border-b-2 border-slate-200 pb-3 text-2xl font-black text-blue-600">ເພີ່ມຂໍ້ມູນພັດສະດຸ</h2>

          {loading ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm font-medium text-slate-500">
              ກຳລັງໂຫຼດຂໍ້ມູນ...
            </div>
          ) : accessDenied ? (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-10 text-center text-sm font-medium text-rose-700">
              ທ່ານບໍ່ມີສິດເບິ່ງ ຫຼື ແກ້ໄຂໃບບິນນີ້
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold">ຊື່ຜູ້ຮັບ:</label>
                <input
                  type="text"
                  value={form.receiverName}
                  onChange={(e) => updateField("receiverName", e.target.value)}
                  placeholder="ລະບຸຊື່ຜູ້ຮັບ"
                  className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold">ເບີຜູ້ຮັບ:</label>
                <input
                  type="text"
                  value={form.receiverPhone}
                  onChange={(e) => updateField("receiverPhone", e.target.value)}
                  placeholder="20 xxxx xxxx"
                  className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-bold">ຝາກສາຂາ:</label>
                  <input
                    type="text"
                    value={form.branch}
                    onChange={(e) => updateField("branch", e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold">ເມືອງ:</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold">ແຂວງ:</label>
                <input
                  type="text"
                  value={form.province}
                  onChange={(e) => updateField("province", e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">ຝາກຂົນສົ່ງ:</label>
                <div className="flex flex-wrap gap-2">
                  {TRANSPORTERS.map((name) => {
                    const checked = form.transporters.includes(name);
                    return (
                      <label
                        key={name}
                        className={`flex cursor-pointer items-center rounded-md border-2 px-3 py-2 text-sm ${
                          checked ? "border-blue-600 bg-blue-50 text-blue-800" : "border-transparent bg-slate-100 text-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTransporter(name)}
                          className="mr-2"
                        />
                        {name}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">ຄ່າຂົນສົ່ງ:</label>
                <div className="flex flex-wrap gap-2">
                  <label
                    className={`flex cursor-pointer items-center rounded-md border-2 px-3 py-2 text-sm ${
                      form.shippingChargeMode === "destination" ? "border-blue-600 bg-blue-50 text-blue-800" : "border-transparent bg-slate-100 text-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="shippingChargeMode"
                      checked={form.shippingChargeMode === "destination"}
                      onChange={() => updateField("shippingChargeMode", "destination")}
                      className="mr-2"
                    />
                    ຈ່າຍປາຍທາງ
                  </label>
                  <label
                    className={`flex cursor-pointer items-center rounded-md border-2 px-3 py-2 text-sm ${
                      form.shippingChargeMode === "origin" ? "border-blue-600 bg-blue-50 text-blue-800" : "border-transparent bg-slate-100 text-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="shippingChargeMode"
                      checked={form.shippingChargeMode === "origin"}
                      onChange={() => updateField("shippingChargeMode", "origin")}
                      className="mr-2"
                    />
                    ຈ່າຍຕົ້ນທາງ
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-4 text-lg font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                <Save size={20} />
                {saving ? "ກຳລັງບັນທຶກ..." : currentNote?.id ? "ອັບເດດ" : "ບັນທຶກ"}
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-center overflow-auto py-6">
          <div className="origin-top scale-[1.45] transform-gpu">
            <div
              className={`relative flex h-[100mm] w-[80mm] flex-col overflow-hidden border-2 border-black bg-white text-black ${notoSansLaoLooped.className}`}
            >
            <div className="flex items-center border-b-[1.5px] border-black px-[10px] py-[8px]">
              <LogoMark />
              <div className="ml-[10px] text-[14px] font-bold leading-[1.2]">
                ຮ້ານ: BG SPORT
                <br />
                ເບີ: 2092201288
              </div>
            </div>

            <div className="mt-[6px] ml-[10px] w-fit bg-black px-[8px] py-[4px] text-[11px] font-bold text-white">
              ຜູ້ຮັບ (Receiver):
            </div>

            <div className="flex grow flex-col px-[10px] py-[6px] text-[14px] leading-[1.78]">
              <div>
                ຊື່ຜູ້ຮັບ: <span className="text-[15px] font-bold">{form.receiverName}</span>
              </div>
              <div>
                ເບີຜູ້ຮັບ: <span className="text-[15px] font-bold">{form.receiverPhone}</span>
              </div>
              <div>
                ຝາກສາຂາ: <span className="text-[15px] font-bold">{form.branch}</span>
              </div>
              <div>
                ເມືອງ: <span className="text-[15px] font-bold">{form.city}</span>
              </div>
              <div>
                ແຂວງ: <span className="text-[15px] font-bold">{form.province}</span>
              </div>

              <div className="my-[4px] border-b-[1.5px] border-black" />

              <div className="text-[14px] font-bold">
                ຝາກຂົນສົ່ງ: <span>{transporterText}</span>
              </div>
              <div className="text-[14px] font-bold">
                ຄ່າຂົນສົ່ງ: <span>{shippingModeText}</span>
              </div>

              <div className="my-[4px] border-b-[1.5px] border-black" />

              <div className="mt-auto text-center text-[9px] font-medium">* ກະລຸນາຖ່າຍ VDO ຕອນຮັບເຄື່ອງກ່ອນທຸກຄັ້ງ! *</div>
            </div>
          </div>
          </div>
        </div>
      </section>
    </div>
  );
}
