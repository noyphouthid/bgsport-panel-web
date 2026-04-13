"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine } from "lucide-react";

type MobileQrScannerProps = {
  onDetected: (value: string) => void;
};

export function MobileQrScanner({ onDetected }: MobileQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  const [active, setActive] = useState(false);
  const [opened, setOpened] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSupported(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopScanner = (collapse = false) => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setActive(false);
    if (collapse) setOpened(false);
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width > 0 && height > 0) {
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          canvas.width = width;
          canvas.height = height;
          context.drawImage(video, 0, 0, width, height);
          const imageData = context.getImageData(0, 0, width, height);
          const result = jsQR(imageData.data, width, height, {
            inversionAttempts: "dontInvert",
          });

          if (result?.data?.trim()) {
            onDetected(result.data);
            stopScanner(true);
            return;
          }
        }
      }
    }

    frameRef.current = requestAnimationFrame(scanFrame);
  };

  const startScanner = async () => {
    if (active) return;
    setError(null);

    setOpened(true);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("ອຸປະກອນນີ້ບໍ່ຮອງຮັບການເປີດກ້ອງ");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setActive(true);
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ບໍ່ສາມາດເປີດກ້ອງໄດ້");
      stopScanner();
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-900">ສະແກນ QR ຜ່ານມືຖື</div>
          <div className="text-xs font-medium text-slate-500">
            {supported ? "ອອກແບບສຳລັບການຮັບສິນຄ້າ ແລະ ຈັດສົ່ງຜ່ານໂທລະສັບ" : "ກົດປຸ່ມສະແກນເພື່ອລອງເປີດກ້ອງໃນອຸປະກອນນີ້"}
          </div>
        </div>
        <button
          type="button"
          onClick={active ? () => stopScanner(true) : () => void startScanner()}
          className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black shadow-sm transition ${
            active ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {active ? <CameraOff size={18} /> : <Camera size={18} />}
          {active ? "ຢຸດ" : "ສະແກນ"}
        </button>
      </div>

      {opened ? (
        <div className="relative mt-4 overflow-hidden rounded-3xl bg-slate-950">
          <video ref={videoRef} className="aspect-[3/4] w-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          {!active && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 text-center text-white">
              <ScanLine size={28} />
              <div className="text-sm font-bold">
                {supported ? "ເປີດກ້ອງ ແລະ ຈັດ QR ໃຫ້ຢູ່ໃນກອບ" : "ກົດປຸ່ມສະແກນເພື່ອລອງເປີດກ້ອງ"}
              </div>
            </div>
          )}
          {active && <div className="pointer-events-none absolute inset-6 rounded-[2rem] border-2 border-emerald-400/90" />}
        </div>
      ) : (
        <div className="mt-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm font-medium text-slate-500">
          ໜ້າ monitor ຖືກຊ່ອນໄວ້ ກົດ `ສະແກນ` ເມື່ອຕ້ອງການເປີດກ້ອງ.
        </div>
      )}

      {!supported && (
        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
          ຖ້າກ້ອງບໍ່ເປີດ ຫຼື ອຸປະກອນບໍ່ຮອງຮັບ, ທ່ານຍັງສາມາດວາງ ຫຼື ພິມຄ່າ QR ດ້ານລຸ່ມໄດ້.
        </div>
      )}

      {error && <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>}
    </div>
  );
}
