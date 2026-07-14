"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ImagePlus, Loader2, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resizeImageFileToFit } from "@/lib/client-image";
import {
  DESIGN_QUEUE_MAX_IMAGE_SIZE,
  type DesignQueueMockupRow,
  type DesignQueueUploadTarget,
  buildDesignQueueMockupStoragePath,
  getDesignQueueMockupUrl,
  ORDER_MEDIA_BUCKET,
} from "@/lib/design-queue-media";

type MockupUploadModalProps = {
  canEdit: boolean;
  queue: DesignQueueUploadTarget | null;
  viewerUserId: string | null;
  onClose: () => void;
  onUpdated?: () => void;
};

export function MockupUploadModal({ canEdit, queue, viewerUserId, onClose, onUpdated }: MockupUploadModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<DesignQueueMockupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!queue) {
      setItems([]);
      setLoading(false);
      setUploading(false);
      setDragging(false);
      setDeletingId(null);
      return;
    }

    let mounted = true;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("design_queue_mockups")
        .select("id,queue_entry_id,file_name,file_path,file_url,mime_type,width,height,file_size_bytes,uploaded_by_user_id,uploaded_at,updated_at")
        .eq("queue_entry_id", queue.id)
        .order("uploaded_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        setItems([]);
        toast.error(`ໂຫຼດຮູບບໍ່ສຳເລັດ: ${error.message}`);
      } else {
        setItems((data ?? []) as DesignQueueMockupRow[]);
      }
      setLoading(false);
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [queue]);

  if (!queue) return null;

  const refresh = async () => {
    const { data, error } = await supabase
      .from("design_queue_mockups")
      .select("id,queue_entry_id,file_name,file_path,file_url,mime_type,width,height,file_size_bytes,uploaded_by_user_id,uploaded_at,updated_at")
      .eq("queue_entry_id", queue.id)
      .order("uploaded_at", { ascending: false });

    if (error) {
      toast.error(`ໂຫຼດຮູບບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    setItems((data ?? []) as DesignQueueMockupRow[]);
    onUpdated?.();
  };

  const handleFiles = async (list: FileList | File[]) => {
    if (!canEdit) {
      toast.error("ທ່ານບໍ່ມີສິດອັບໂຫລດຮູບ");
      return;
    }
    if (!viewerUserId) {
      toast.error("ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້");
      return;
    }

    const files = Array.from(list).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      toast.error("ກະລຸນາເລືອກໄຟລ໌ຮູບ");
      return;
    }

    setUploading(true);
    let successCount = 0;
    let failedCount = 0;

    for (const file of files) {
      try {
        const resized = await resizeImageFileToFit(file, DESIGN_QUEUE_MAX_IMAGE_SIZE, DESIGN_QUEUE_MAX_IMAGE_SIZE);
        const path = buildDesignQueueMockupStoragePath(queue.id, resized.file.name);
        const { error: uploadError } = await supabase.storage.from(ORDER_MEDIA_BUCKET).upload(path, resized.file, {
          upsert: true,
          contentType: resized.mimeType,
        });
        if (uploadError) throw uploadError;

        const publicUrl = supabase.storage.from(ORDER_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
        const { error: insertError } = await supabase.from("design_queue_mockups").insert({
          queue_entry_id: queue.id,
          file_name: resized.file.name,
          file_path: path,
          file_url: publicUrl,
          mime_type: resized.mimeType,
          width: resized.width,
          height: resized.height,
          file_size_bytes: resized.file.size,
          uploaded_by_user_id: viewerUserId,
          updated_at: new Date().toISOString(),
        });
        if (insertError) throw insertError;

        successCount += 1;
      } catch (error) {
        failedCount += 1;
        const message = error instanceof Error ? error.message : `ອັບໂຫລດ ${file.name} ບໍ່ສຳເລັດ`;
        toast.error(message);
      }
    }

    setUploading(false);
    if (successCount > 0) {
      toast.success(`ອັບໂຫລດຮູບສຳເລັດ ${successCount} ໄຟລ໌`);
      await refresh();
    }
    if (failedCount > 0 && successCount === 0) {
      toast.error("ບໍ່ສາມາດອັບໂຫລດຮູບໄດ້");
    }
  };

  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = event.target.files;
    if (nextFiles?.length) {
      await handleFiles(nextFiles);
    }
    event.target.value = "";
  };

  const handleDrop = async (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) {
      await handleFiles(event.dataTransfer.files);
    }
  };

  const deleteItem = async (item: DesignQueueMockupRow) => {
    if (!canEdit) {
      toast.error("ທ່ານບໍ່ມີສິດລົບຮູບ");
      return;
    }

    const confirmed = window.confirm(`ຕ້ອງການລົບຮູບ ${item.file_name} ແທ້ບໍ?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    try {
      if (item.file_path) {
        const { error: storageError } = await supabase.storage.from(ORDER_MEDIA_BUCKET).remove([item.file_path]);
        if (storageError) throw storageError;
      }

      const { error: deleteError } = await supabase.from("design_queue_mockups").delete().eq("id", item.id);
      if (deleteError) throw deleteError;

      toast.success("ລົບຮູບສຳເລັດແລ້ວ");
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "ລົບຮູບບໍ່ສຳເລັດ";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Design Upload</div>
            <h2 className="mt-1 text-2xl font-black text-slate-900">ອັບໂຫລດຮູບເສື້ອ</h2>
            <div className="mt-2 text-sm font-medium text-slate-500">
              ຄິວ #{queue.queue_number} | {queue.type_code}-{queue.order_no} | ຂະໜາດຮູບສູງສຸດ {DESIGN_QUEUE_MAX_IMAGE_SIZE}x{DESIGN_QUEUE_MAX_IMAGE_SIZE}px
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-6 overflow-y-auto p-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <button
              type="button"
              disabled={uploading || !canEdit}
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragging(false);
              }}
              onDrop={(event) => void handleDrop(event)}
              className={`flex min-h-[260px] w-full flex-col items-center justify-center rounded-[1.75rem] border-2 border-dashed px-6 py-8 text-center transition ${
                dragging
                  ? "border-sky-400 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:border-sky-300 hover:bg-sky-50/60"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {uploading ? <Loader2 size={26} className="animate-spin" /> : <Upload size={28} />}
              <div className="mt-4 text-base font-black">ລາກຮູບມາວາງ ຫຼື ກົດເພື່ອເລືອກໄຟລ໌</div>
              <div className="mt-2 text-sm font-medium text-slate-500">ລະບົບຈະ resize ໃຫ້ບໍ່ເກີນ 2024x2024 pixel ກ່ອນອັບໂຫລດ</div>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm">
                <ImagePlus size={14} />
                JPG, PNG, WEBP
              </div>
            </button>

            <input ref={inputRef} type="file" accept="image/*" multiple onChange={(event) => void handleFileInput(event)} className="hidden" />

            <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase text-slate-500">ຄຳແນະນຳ</div>
              <div className="mt-2 text-sm font-medium text-slate-600">ອັບໂຫລດໄດ້ຫຼາຍຮູບຕໍ່ 1 ຄິວ ແລະ ສາມາດລົບຫຼືເພີ່ມໄດ້ພາຍຫຼັງ.</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">ຮູບທີ່ອັບໂຫລດແລ້ວ</h3>
                <div className="text-sm font-medium text-slate-500">{items.length.toLocaleString()} ໄຟລ໌</div>
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-[1.75rem] border border-slate-100 bg-slate-50 text-sm font-bold text-slate-500">
                ກຳລັງໂຫຼດຮູບ...
              </div>
            ) : items.length === 0 ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[1.75rem] border border-slate-100 bg-slate-50 px-6 text-center text-sm font-medium text-slate-500">
                <ImagePlus size={28} className="mb-3 text-slate-400" />
                ຄິວນີ້ຍັງບໍ່ມີຮູບເສື້ອ ສາມາດລາກຮູບມາວາງໄດ້ເລີຍ
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {items.map((item) => {
                  const previewUrl = getDesignQueueMockupUrl(item);
                  return (
                    <div key={item.id} className="overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white shadow-sm">
                      {previewUrl ? (
                        <a href={previewUrl} target="_blank" rel="noreferrer" className="block bg-slate-100">
                          <img src={previewUrl} alt={item.file_name} className="h-56 w-full object-cover" />
                        </a>
                      ) : (
                        <div className="flex h-56 items-center justify-center bg-slate-100 text-sm font-bold text-slate-500">ບໍ່ພົບ preview</div>
                      )}
                      <div className="space-y-3 p-4">
                        <div>
                          <div className="truncate text-sm font-black text-slate-900">{item.file_name}</div>
                          <div className="mt-1 text-xs font-medium text-slate-500">
                            {item.width || "-"}x{item.height || "-"} px | {new Date(item.uploaded_at).toLocaleString("en-GB")}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {previewUrl ? (
                            <a
                              href={previewUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              ເປີດຮູບ
                            </a>
                          ) : null}
                          <button
                            type="button"
                            disabled={deletingId === item.id || !canEdit}
                            onClick={() => void deleteItem(item)}
                            className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                          >
                            {deletingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
