"use client";

import React, { useState, useCallback, useRef } from "react";
import Cropper from "react-easy-crop";
import { X, Edit3, Upload, ZoomIn, ZoomOut, RotateCcw, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── типы ──────────────────────────────────────────────────────────────────────
interface Area { x: number; y: number; width: number; height: number; }

interface Props {
  src: string;               // blob-url полного фото
  fullName: string;
  onUpload: (file: File) => Promise<void>;
  onClose: () => void;
}

// ── утилита: вырезать пикселями из canvas ─────────────────────────────────────
async function cropImageToBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await createImageBitmap(
    await fetch(imageSrc).then((r) => r.blob())
  );
  const canvas = document.createElement("canvas");
  canvas.width  = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas empty")), "image/jpeg", 0.92);
  });
}

// ── главный компонент ─────────────────────────────────────────────────────────
export default function PhotoLightbox({ src, fullName, onUpload, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // режим кроппера
  const [mode, setMode] = useState<"view" | "crop">("view");
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  // react-easy-crop state
  const [crop, setCrop]       = useState({ x: 0, y: 0 });
  const [zoom, setZoom]       = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // загрузка
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  // ── файл выбран ──────────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setMode("crop");
    e.target.value = "";
  };

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  // ── сохранить ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!cropSrc || !croppedAreaPixels) return;
    setSaving(true);
    setError("");
    try {
      const blob = await cropImageToBlob(cropSrc, croppedAreaPixels);
      const file = new File([blob], "photo.jpg", { type: "image/jpeg" });
      await onUpload(file);
      URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
      setMode("view");
    } catch (err: any) {
      setError(err?.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  // ── отмена кропа ────────────────────────────────────────────────────────────
  const handleCancelCrop = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setMode("view");
  };

  // ── рендер ───────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && mode === "view") onClose(); }}
    >
      <div className="relative w-full max-w-lg bg-gray-950 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
           style={{ maxHeight: "90vh" }}>

        {/* ── шапка ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="text-sm font-medium text-white truncate max-w-[260px]">{fullName}</span>
          <button
            onClick={mode === "crop" ? handleCancelCrop : onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── контент ── */}
        {mode === "view" ? (
          <>
            {/* полное фото */}
            <div className="flex-1 flex items-center justify-center bg-black overflow-hidden" style={{ minHeight: 320 }}>
              <img
                src={src}
                alt={fullName}
                className="max-h-[60vh] max-w-full object-contain"
              />
            </div>

            {/* нижняя панель */}
            <div className="flex items-center justify-center gap-3 px-4 py-4 border-t border-white/10">
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
              >
                <Edit3 className="h-4 w-4" />
                Редактировать фото
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* ── кроппер ── */}
            <div className="relative bg-black" style={{ height: "52vh", minHeight: 300 }}>
              {cropSrc && (
                <Cropper
                  image={cropSrc}
                  crop={crop}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={4 / 5}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onRotationChange={setRotation}
                  onCropComplete={onCropComplete}
                  cropShape="rect"
                  showGrid
                  style={{
                    containerStyle: { background: "#000" },
                    cropAreaStyle: { border: "2px solid #10b981" },
                  }}
                />
              )}
            </div>

            {/* контролы зума / поворота */}
            <div className="px-4 py-3 border-t border-white/10 space-y-3">
              <div className="flex items-center gap-3">
                <ZoomOut className="h-4 w-4 text-white/50 flex-shrink-0" />
                <input
                  type="range" min={1} max={3} step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-emerald-500"
                />
                <ZoomIn className="h-4 w-4 text-white/50 flex-shrink-0" />
              </div>
              <div className="flex items-center gap-3">
                <RotateCcw className="h-4 w-4 text-white/50 flex-shrink-0" />
                <input
                  type="range" min={-180} max={180} step={1}
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  className="flex-1 accent-emerald-500"
                />
                <span className="text-xs text-white/50 w-10 text-right">{rotation}°</span>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>

            {/* кнопки кропа */}
            <div className="flex items-center gap-3 px-4 py-4 border-t border-white/10">
              <Button
                variant="outline"
                onClick={handleCancelCrop}
                className="flex-1 rounded-xl border-white/20 text-white bg-white/5 hover:bg-white/10"
              >
                Отмена
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Check className="h-4 w-4" />
                }
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
              {/* Загрузить другое фото */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                title="Выбрать другое фото"
                className="rounded-xl text-white/60 hover:text-white hover:bg-white/10"
              >
                <Upload className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* скрытый input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
