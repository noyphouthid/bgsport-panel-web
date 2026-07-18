"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import toast from "react-hot-toast";
import { Download } from "lucide-react";

type PatternMockupViewerProps = {
  imageUrl: string | null;
  alt: string;
  downloadFileName: string;
  className?: string;
};

export function PatternMockupViewer({
  imageUrl,
  alt,
  downloadFileName,
  className = "",
}: PatternMockupViewerProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!imageUrl) {
      toast.error("ບໍ່ພົບຮູບແບບເສື້ອ");
      return;
    }

    setDownloading(true);
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error("download_failed");

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      toast.success("ດາວໂຫລດແບບເສື້ອສຳເລັດແລ້ວ");
    } catch {
      toast.error("ດາວໂຫລດແບບເສື້ອບໍ່ສຳເລັດ");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={className}>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={!imageUrl || downloading}
          className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
        >
          <Download size={14} />
          {downloading ? "ກຳລັງດາວໂຫລດ..." : "ດາວໂຫລດແບບ"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {imageUrl ? (
          <img src={imageUrl} alt={alt} className="h-full min-h-[220px] w-full object-contain bg-white" />
        ) : (
          <div className="flex min-h-[220px] items-center justify-center px-4 text-center text-sm font-bold text-slate-400">
            ບໍ່ມີຮູບ Mockup
          </div>
        )}
      </div>
    </div>
  );
}
