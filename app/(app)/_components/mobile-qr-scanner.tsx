"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine } from "lucide-react";

type DetectedBarcode = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
  }
}

type MobileQrScannerProps = {
  onDetected: (value: string) => void;
};

export function MobileQrScanner({ onDetected }: MobileQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);

  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSupported(typeof window !== "undefined" && typeof window.BarcodeDetector !== "undefined");
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopScanner = () => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setActive(false);
  };

  const scanFrame = async () => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector) return;

    try {
      const results = await detector.detect(video);
      const first = results.find((item) => item.rawValue?.trim());
      if (first?.rawValue) {
        onDetected(first.rawValue);
        stopScanner();
        return;
      }
    } catch {
      // Keep scanning when one frame fails.
    }

    frameRef.current = requestAnimationFrame(() => {
      void scanFrame();
    });
  };

  const startScanner = async () => {
    if (!supported || active || typeof window.BarcodeDetector === "undefined") return;
    setError(null);

    try {
      detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
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
      frameRef.current = requestAnimationFrame(() => {
        void scanFrame();
      });
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
          onClick={active ? stopScanner : () => void startScanner()}
          className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black shadow-sm transition ${
            active ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {active ? <CameraOff size={18} /> : <Camera size={18} />}
          {active ? "ຢຸດ" : "ສະແກນ"}
        </button>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-3xl bg-slate-950">
        <video ref={videoRef} className="aspect-[3/4] w-full object-cover" playsInline muted />
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

      {!supported && (
        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
          ຖ້າກ້ອງບໍ່ເປີດ ຫຼື ອຸປະກອນບໍ່ຮອງຮັບ, ທ່ານຍັງສາມາດວາງ ຫຼື ພິມຄ່າ QR ດ້ານລຸ່ມໄດ້.
        </div>
      )}

      {error && <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>}
    </div>
  );
}
