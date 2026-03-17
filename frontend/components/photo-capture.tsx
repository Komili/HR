"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { Camera, RotateCcw, Check, AlertTriangle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PhotoCaptureProps {
  onCapture: (blob: Blob) => void;
  capturedPreview?: string | null;
}

type FaceStatus = "checking" | "found" | "not_found" | "unsupported";

export default function PhotoCapture({ onCapture, capturedPreview }: PhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectorRef = useRef<any>(null);
  const detectionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(capturedPreview || null);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("checking");
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "FaceDetector" in window) {
      try {
        detectorRef.current = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      } catch { detectorRef.current = null; }
    }
  }, []);

  const startFaceDetection = useCallback(() => {
    if (!detectorRef.current) { setFaceStatus("unsupported"); return; }
    setFaceStatus("checking");
    detectionTimerRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const faces = await detectorRef.current.detect(videoRef.current);
        setFaceStatus(faces.length > 0 ? "found" : "not_found");
      } catch {
        setFaceStatus("unsupported");
        if (detectionTimerRef.current) clearInterval(detectionTimerRef.current);
      }
    }, 500);
  }, []);

  const stopFaceDetection = useCallback(() => {
    if (detectionTimerRef.current) { clearInterval(detectionTimerRef.current); detectionTimerRef.current = null; }
  }, []);

  const stopCamera = useCallback(() => {
    stopFaceDetection();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    setStream(null);
    setCameraActive(false);
    setFaceStatus("checking");
  }, [stream, stopFaceDetection]);

  useEffect(() => {
    return () => { stopFaceDetection(); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [stream, stopFaceDetection]);

  const startCamera = useCallback(async () => {
    setError(null);
    setPhotoWarning(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
      });
      setStream(mediaStream);
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadeddata = () => startFaceDetection();
      }
    } catch (err: any) {
      // Определяем причину ошибки
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("permission_denied");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("no_camera");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setError("camera_busy");
      } else if (location.protocol === "http:" && location.hostname !== "localhost") {
        setError("https_required");
      } else {
        setError("unknown");
      }
    }
  }, [startFaceDetection]);

  // Обработка файла из галереи/системной камеры
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoWarning(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    onCapture(file);
    // Сбрасываем input чтобы можно было выбрать снова
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [onCapture]);

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      if (detectorRef.current && faceStatus === "not_found") {
        setPhotoWarning("Лицо не обнаружено. Для СКУД нужно чёткое фото анфас. Рекомендуем переснять.");
      } else {
        setPhotoWarning(null);
      }
      setPreview(URL.createObjectURL(blob));
      onCapture(blob);
      stopCamera();
    }, "image/jpeg", 0.92);
  }, [onCapture, stopCamera, faceStatus]);

  const retake = useCallback(() => {
    setPreview(null);
    setPhotoWarning(null);
    setError(null);
  }, []);

  const borderColor = faceStatus === "found" ? "border-emerald-400" : faceStatus === "not_found" ? "border-red-400" : "border-yellow-400";
  const outlineColor = faceStatus === "found" ? "rgba(52,211,153,0.9)" : faceStatus === "not_found" ? "rgba(248,113,113,0.9)" : "rgba(255,255,255,0.6)";

  // Фото сделано
  if (preview) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden border-2 border-emerald-300 shadow-lg">
          <img src={preview} alt="Фото" className="w-full h-full object-cover" />
          {!photoWarning && (
            <div className="absolute top-2 right-2 bg-emerald-500 text-white rounded-full p-1">
              <Check className="h-4 w-4" />
            </div>
          )}
        </div>
        {photoWarning && (
          <div className="w-full max-w-[320px] bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 items-start">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">{photoWarning}</p>
          </div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={retake} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Переснять
        </Button>
      </div>
    );
  }

  // Камера активна
  if (cameraActive) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className={`text-xs font-medium px-3 py-1 rounded-full ${
          faceStatus === "found" ? "bg-emerald-100 text-emerald-700" :
          faceStatus === "not_found" ? "bg-red-100 text-red-700" :
          "bg-gray-100 text-gray-500"
        }`}>
          {faceStatus === "found" && "✓ Лицо найдено — можно фотографировать"}
          {faceStatus === "not_found" && "Расположите лицо в рамке"}
          {faceStatus === "checking" && "Поиск лица..."}
          {faceStatus === "unsupported" && "Расположите лицо и плечи в рамке"}
        </div>
        <div className={`relative w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden border-2 ${borderColor} shadow-lg bg-black transition-colors duration-300`}>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 320 320" preserveAspectRatio="xMidYMid slice">
            <defs>
              <mask id="silhouetteMask">
                <rect width="320" height="320" fill="white" />
                <ellipse cx="160" cy="125" rx="72" ry="88" fill="black" />
                <rect x="133" y="203" width="54" height="28" fill="black" rx="10" />
                <ellipse cx="160" cy="290" rx="130" ry="60" fill="black" />
              </mask>
            </defs>
            <rect width="320" height="320" fill="rgba(0,0,0,0.35)" mask="url(#silhouetteMask)" />
            <ellipse cx="160" cy="125" rx="72" ry="88" fill="none" stroke={outlineColor} strokeWidth="2.5" strokeDasharray={faceStatus === "found" ? "none" : "8 4"} />
            <ellipse cx="160" cy="290" rx="130" ry="60" fill="none" stroke={outlineColor} strokeWidth="2" strokeDasharray="8 4" />
          </svg>
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={takePhoto} className={`gap-2 ${faceStatus === "found" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-600 hover:bg-gray-700"}`}>
            <Camera className="h-4 w-4" />
            {faceStatus === "found" ? "Сфотографироваться" : "Всё равно снять"}
          </Button>
          <Button type="button" variant="outline" onClick={stopCamera}>Отмена</Button>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  // Начальный экран
  return (
    <div className="flex flex-col items-center gap-3">
      {/* Скрытый input для файла/камеры */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="w-full max-w-[320px] rounded-2xl bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-3 p-5">
        <Camera className="h-12 w-12 text-gray-400" />
        <p className="text-sm text-gray-500 text-center font-medium">Фото для пропуска (СКУД)</p>
        <ul className="text-xs text-gray-400 space-y-1 text-left w-full max-w-[200px]">
          <li>✓ Лицо анфас, по центру</li>
          <li>✓ Хорошее освещение</li>
          <li>✓ Без очков и головного убора</li>
          <li>✓ Нейтральное выражение</li>
        </ul>
      </div>

      {/* Ошибки доступа к камере */}
      {error && (
        <div className="w-full max-w-[320px] bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
          {error === "https_required" && (
            <>
              <p className="font-semibold">Браузер блокирует камеру (требуется HTTPS)</p>
              <p>Используйте кнопку ниже — она откроет системную камеру напрямую.</p>
            </>
          )}
          {error === "permission_denied" && (
            <>
              <p className="font-semibold">Доступ к камере запрещён</p>
              <p>Откройте настройки браузера → Разрешения → Камера → Разрешить для этого сайта. Или используйте кнопку ниже.</p>
            </>
          )}
          {error === "camera_busy" && (
            <>
              <p className="font-semibold">Камера занята другим приложением</p>
              <p>Закройте другие приложения использующие камеру, или используйте кнопку ниже.</p>
            </>
          )}
          {error === "no_camera" && <p>Камера не найдена на устройстве.</p>}
          {error === "unknown" && <p>Не удалось открыть камеру. Попробуйте кнопку ниже.</p>}
        </div>
      )}

      <div className="flex flex-col gap-2 w-full max-w-[320px]">
        {/* Основная кнопка — встроенная камера браузера */}
        {!error && (
          <Button type="button" onClick={startCamera} className="gap-2 bg-emerald-600 hover:bg-emerald-700 w-full">
            <Camera className="h-4 w-4" />
            Включить камеру
          </Button>
        )}

        {/* Fallback — системная камера через file input */}
        <Button
          type="button"
          variant={error ? "default" : "outline"}
          onClick={() => fileInputRef.current?.click()}
          className={`gap-2 w-full ${error ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
        >
          <Upload className="h-4 w-4" />
          {error ? "Открыть камеру / галерею" : "Загрузить из галереи"}
        </Button>

        {error && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { setError(null); startCamera(); }} className="text-xs text-gray-500">
            Попробовать снова
          </Button>
        )}
      </div>
    </div>
  );
}
