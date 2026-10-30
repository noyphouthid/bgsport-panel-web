"use client";

import { useEffect, useRef, useState } from "react";
import { Barcode, Camera, CameraOff, LoaderCircle } from "lucide-react";
import type { IScannerControls } from "@zxing/browser";

type Props = {
  onDetected: (value: string) => Promise<void>;
  disabled?: boolean;
};

function cameraErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "ກະລຸນາອະນຸຍາດໃຫ້ເວັບໃຊ້ກ້ອງ ແລ້ວລອງອີກຄັ້ງ";
  if (name === "NotFoundError") return "ບໍ່ພົບກ້ອງໂທລະສັບ ກະລຸນາກວດສອບກ້ອງ ຫຼື ພິມລະຫັດແທນ";
  if (name === "NotReadableError") return "ບໍ່ສາມາດເປີດກ້ອງໄດ້ ກະລຸນາປິດແອັບອື່ນທີ່ກຳລັງໃຊ້ກ້ອງ";
  return "ບໍ່ສາມາດເປີດກ້ອງໄດ້ ກະລຸນາລອງອີກຄັ້ງ ຫຼື ພິມລະຫັດແທນ";
}

export function FactoryBarcodeScanner({ onDetected, disabled = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const [opened, setOpened] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!opened || disabled) return;
    let cancelled = false;
    let controls: IScannerControls | undefined;
    let stream: MediaStream | undefined;
    let processing = false;
    let lastCode = "";
    let lastDetectedAt = 0;
    const video = videoRef.current;

    const release = () => {
      controls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("camera_unavailable");
        }
        // Load the decoder only when opening the camera. It also works in
        // browsers without the native BarcodeDetector API (including Safari).
        const [{ BrowserMultiFormatReader }, { getFactoryBarcodeHints }] = await Promise.all([
          import("@zxing/browser"),
          import("@/lib/factory-barcode-reader"),
        ]);
        if (cancelled || !video) return;
        setActive(false);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          release();
          return;
        }
        const reader = new BrowserMultiFormatReader(getFactoryBarcodeHints(), {
          delayBetweenScanAttempts: 150,
          delayBetweenScanSuccess: 300,
        });
        controls = await reader.decodeFromStream(stream, video, (result) => {
          if (cancelled || processing || !result) return;
          const code = result.getText().trim();
          const now = Date.now();
          if (!code || (code === lastCode && now - lastDetectedAt < 3000)) return;
          lastCode = code;
          lastDetectedAt = now;
          processing = true;
          void Promise.resolve()
            .then(() => { if (!cancelled) return onDetectedRef.current(code); })
            .catch(() => {
              if (!cancelled) setError("ກວດສອບລະຫັດບໍ່ສຳເລັດ ກະລຸນາສະແກນອີກຄັ້ງ");
            })
            .finally(() => { processing = false; });
        });
        if (cancelled) release();
        else setActive(true);
      } catch (err) {
        release();
        if (cancelled) return;
        setError(!navigator.mediaDevices?.getUserMedia
          ? "ກະລຸນາເປີດເວັບຜ່ານ HTTPS ໃນ Safari ຫຼື Chrome ເທິງໂທລະສັບ ແລ້ວອະນຸຍາດໃຫ້ໃຊ້ກ້ອງ"
          : cameraErrorMessage(err));
        setActive(false);
        setOpened(false);
      }
    };

    // Stop the camera when the employee locks the phone or switches apps.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      cancelled = true;
      release();
      setActive(false);
      setOpened(false);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void start();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      release();
    };
  }, [opened, disabled]);

  const scanning = opened && !disabled;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-lg font-black text-slate-900">
          <Barcode size={22} className="text-emerald-600" />
          ສະແກນດ້ວຍກ້ອງໂທລະສັບ
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setError("");
            setActive(false);
            setOpened(!opened);
          }}
          aria-expanded={scanning}
          aria-controls="factory-barcode-camera"
          className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-base font-black text-white transition disabled:opacity-50 sm:w-auto ${scanning ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
        >
          {scanning ? <CameraOff size={18} /> : <Camera size={18} />}
          {scanning ? "ຢຸດສະແກນ" : "ເປີດກ້ອງໂທລະສັບ"}
        </button>
      </div>
      <p className="text-sm font-medium leading-relaxed text-slate-500">
        ກົດເປີດກ້ອງ ແລະ ອະນຸຍາດໃຫ້ໃຊ້ກ້ອງ. ຫັນກ້ອງຫຼັງໄປຫາ Barcode ແບບເສັ້ນທີ່ຢູ່ຂ້າງ QR ໃນໃບໂຮງງານ ເຊັ່ນ <span className="font-mono font-bold text-slate-900">26-184019</span>.
      </p>
      {scanning ? (
        <div id="factory-barcode-camera" className="relative overflow-hidden rounded-3xl bg-slate-950">
          <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full object-contain" />
          {active ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="h-28 w-full rounded-2xl border-2 border-emerald-400 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]">
                <div className="mt-14 h-px w-full bg-emerald-400/80" />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-bold text-white" role="status">
              <LoaderCircle size={20} className="animate-spin" /> ກຳລັງເປີດກ້ອງ...
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-slate-950/80 px-3 py-3 text-center text-xs font-bold text-white">
            ຈັດ Barcode ໃຫ້ຢູ່ແນວນອນ ແລະ ເຫັນຄົບທຸກເສັ້ນ • ສະແກນໄດ້ຕໍ່ເນື່ອງ
          </div>
        </div>
      ) : null}
      {error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div> : null}
    </div>
  );
}
