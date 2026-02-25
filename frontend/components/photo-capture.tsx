"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { Camera, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PhotoCaptureProps {
  onCapture: (blob: Blob) => void;
  capturedPreview?: string | null;
}

export default function PhotoCapture({ onCapture, capturedPreview }: PhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(capturedPreview || null);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      setStream(mediaStream);
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch {
      setError("Не удалось получить доступ к камере. Проверьте разрешения.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setCameraActive(false);
  }, [stream]);

  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Зеркалим (selfie-камера)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setPreview(URL.createObjectURL(blob));
          onCapture(blob);
          stopCamera();
        }
      },
      "image/jpeg",
      0.9,
    );
  }, [onCapture, stopCamera]);

  const retake = useCallback(() => {
    setPreview(null);
    startCamera();
  }, [startCamera]);

  if (preview) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-full max-w-[320px] aspect-[4/5] rounded-2xl overflow-hidden border-2 border-emerald-300 shadow-lg">
          <img src={preview} alt="Фото" className="w-full h-full object-cover" />
          <div className="absolute top-2 right-2 bg-emerald-500 text-white rounded-full p-1">
            <Check className="h-4 w-4" />
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={retake} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Переснять
        </Button>
      </div>
    );
  }

  if (!cameraActive) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="w-full max-w-[320px] aspect-[4/5] rounded-2xl bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-3">
          <Camera className="h-12 w-12 text-gray-400" />
          <p className="text-sm text-gray-500 text-center px-4">
            Сделайте фото для пропуска
          </p>
        </div>
        <Button type="button" onClick={startCamera} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Camera className="h-4 w-4" />
          Включить камеру
        </Button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-full max-w-[320px] aspect-[4/5] rounded-2xl overflow-hidden border-2 border-emerald-400 shadow-lg bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        {/* Силуэт-направляющая */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 320 400"
          preserveAspectRatio="xMidYMid slice"
        >
          {/* Затемнение вокруг силуэта */}
          <defs>
            <mask id="silhouetteMask">
              <rect width="320" height="400" fill="white" />
              {/* Голова */}
              <ellipse cx="160" cy="140" rx="70" ry="85" fill="black" />
              {/* Шея */}
              <rect x="135" y="215" width="50" height="30" fill="black" rx="10" />
              {/* Плечи */}
              <ellipse cx="160" cy="300" rx="120" ry="70" fill="black" />
            </mask>
          </defs>
          <rect
            width="320"
            height="400"
            fill="rgba(0,0,0,0.4)"
            mask="url(#silhouetteMask)"
          />
          {/* Контур силуэта */}
          <ellipse cx="160" cy="140" rx="70" ry="85" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeDasharray="8 4" />
          <ellipse cx="160" cy="300" rx="120" ry="70" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeDasharray="8 4" />
        </svg>
        <div className="absolute bottom-3 left-0 right-0 text-center">
          <span className="text-xs text-white/80 bg-black/50 px-3 py-1 rounded-full">
            Расположите лицо и плечи в рамке
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={takePhoto} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Camera className="h-4 w-4" />
          Сфотографироваться
        </Button>
        <Button type="button" variant="outline" onClick={stopCamera}>
          Отмена
        </Button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
