"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, Save } from "lucide-react";
import { TransportBranchPicker } from "../_components/transport-branch-picker";
import { TransportNotePreview } from "../_components/transport-note-preview";
import { TransportCodFields } from "../_components/transport-cod-fields";
import { ensureTransportBranchCodeStorage } from "@/lib/transport-branch-code";
import { ensureTransportCodStorage, validateTransportCod } from "@/lib/transport-cod";
import { supabase } from "@/lib/supabase";
import { transportNoteFont } from "@/lib/transport-note-font";
import type { AppRole } from "@/lib/access-control";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
import {
  buildTransportNoteNo,
  canManageAllTransportNotes,
  DEFAULT_TRANSPORT_NOTE_FORM,
  mapTransportNoteToForm,
  isPassengerBusTransport,
  type TransportNoteForm,
  type TransportNoteRow,
} from "@/lib/transport-notes";

export default function TransportNotePage() {
  const searchParams = useSearchParams();
  const noteId = searchParams.get("id");
  const pageRef = useRef<HTMLDivElement | null>(null);

  const [form, setForm] = useState<TransportNoteForm>(DEFAULT_TRANSPORT_NOTE_FORM);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(noteId));
  const [currentNote, setCurrentNote] = useState<TransportNoteRow | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerName, setViewerName] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const { markClean } = useUnsavedChangesGuard({ scopeRef: pageRef, enabled: !loading && !accessDenied });

  useEffect(() => {
    const loadUser = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user.id;
      if (!authUserId) return;

      const { data } = await supabase.from("users").select("id,role,full_name").eq("auth_user_id", authUserId).maybeSingle();
      if (data?.id) setViewerUserId(String(data.id));
      if (data?.full_name) setViewerName(String(data.full_name));
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

      if (row.created_by_user_id) {
        const { data: creator } = await supabase.from("users").select("full_name").eq("id", row.created_by_user_id).maybeSingle();
        setCreatorName(creator?.full_name || "");
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
    if (canManageAllTransportNotes(viewerRole)) {
      setAccessDenied(false);
      return;
    }
    const denied = currentNote.created_by_user_id !== viewerUserId;
    setAccessDenied(denied);
    if (denied) {
      toast.error("ທ່ານສາມາດເບິ່ງ ຫຼື ແກ້ໄຂໄດ້ສະເພາະໃບບິນທີ່ຕົນເອງສ້າງ");
    }
  }, [currentNote, viewerRole, viewerUserId]);

  const passengerBus = isPassengerBusTransport(form.transporters);

  const updateField = <K extends keyof TransportNoteForm>(key: K, value: TransportNoteForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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

    if (passengerBus && !form.branch.trim()) {
      toast.error("ກະລຸນາປ້ອນບ່ອນຝາກລົງ");
      return;
    }
    if (passengerBus && (!form.city.trim() || !form.province.trim())) {
      toast.error("ກະລຸນາປ້ອນເມືອງ ແລະ ແຂວງຂອງບ່ອນສົ່ງ");
      return;
    }
    const branchCode = passengerBus ? "" : form.branchCode.trim();
    const codError = validateTransportCod(form.codEnabled, form.codAmount);
    if (codError) {
      toast.error(codError);
      return;
    }
    setSaving(true);
    try {
      if (form.codEnabled) await ensureTransportCodStorage(supabase);
      if (branchCode) await ensureTransportBranchCodeStorage(supabase);
      const payload = {
        note_no: currentNote?.note_no || buildTransportNoteNo(),
        source_type: currentNote?.source_type || "standalone",
        order_id: currentNote?.order_id || null,
        delivery_request_id: currentNote?.delivery_request_id || null,
        receiver_name: form.receiverName.trim(),
        receiver_phone: form.receiverPhone.trim(),
        branch: form.branch.trim() || null,
        ...(branchCode || currentNote?.branch_code !== undefined ? { branch_code: branchCode || null } : {}),
        city: form.city.trim() || null,
        province: form.province.trim() || null,
        transporters: form.transporters,
        shipping_charge_mode: form.shippingChargeMode,
        ...(form.codEnabled || currentNote?.cod_enabled !== undefined ? { cod_enabled: form.codEnabled, cod_amount: form.codEnabled ? form.codAmount : 0 } : {}),
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
      markClean();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ບັນທຶກໃບຝາກເຄື່ອງບໍ່ສຳເລັດ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={pageRef} className="space-y-6 text-slate-900">
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
              ປ້ອນຂໍ້ມູນຜູ້ຮັບ ແລະ ບ່ອນສົ່ງ ພ້ອມເບິ່ງຕົວຢ່າງໃບບິນກ່ອນບັນທຶກ.
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

              <TransportBranchPicker
                value={form}
                disabled={loading || saving || accessDenied}
                onChange={(address) => setForm((prev) => ({ ...prev, ...address }))}
              />

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

              <TransportCodFields
                enabled={form.codEnabled}
                amount={form.codAmount}
                disabled={loading || saving || accessDenied}
                onChange={(codEnabled, codAmount) => setForm(prev => ({ ...prev, codEnabled, codAmount }))}
              />

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

        <aside className="min-w-0 self-start rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6 xl:sticky xl:top-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-800">ຕົວຢ່າງໃບບິນຂົນສົ່ງ</h2>
            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">80 × 100 mm</span>
          </div>
          <div className="overflow-x-auto pb-2">
            <div className="mx-auto w-fit border border-slate-200 bg-white shadow-sm">
              <TransportNotePreview
                className={transportNoteFont.className}
                row={{
                  ...currentNote,
                  receiver_name: form.receiverName,
                  receiver_phone: form.receiverPhone,
                  branch: form.branch,
                  branch_code: form.branchCode,
                  city: form.city,
                  province: form.province,
                  transporters: form.transporters,
                  shipping_charge_mode: form.shippingChargeMode,
                  cod_enabled: form.codEnabled,
                  cod_amount: form.codEnabled ? form.codAmount : 0,
                  created_by_name: creatorName || (currentNote?.created_by_user_id === viewerUserId || !currentNote ? viewerName : ""),
                }}
              />
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
