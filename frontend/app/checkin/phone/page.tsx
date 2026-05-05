"use client"

import React, { useState, useRef, useCallback, useEffect } from "react"
import { Loader2, CheckCircle2, Clock, LogOut, LogIn, ChevronRight, Phone, Camera, RotateCcw } from "lucide-react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:7272/api"

function formatWorked(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} мин`
  if (m === 0) return `${h} ч`
  return `${h} ч ${m} мин`
}

type EmployeeInfo = {
  firstName: string
  lastName: string
  position: string
  companyName: string
}

type Result = {
  type: "in" | "out"
  firstName: string
  employeeName: string
  time: string
  workedMinutes: number | null
  companyName: string
  position: string
}

// ── Inline camera component ──────────────────────────────────────────────────
function SelfieCamera({ onCapture }: { onCapture: (blob: Blob) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const [active, setActive] = useState(false)

  // Set srcObject after video element appears in DOM
  useEffect(() => {
    if (active && stream && videoRef.current) {
      videoRef.current.srcObject = stream
    }
  }, [active, stream])

  const startCamera = useCallback(async () => {
    setCamError(null)
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
      })
      setStream(ms)
      setActive(true)
    } catch (err: any) {
      const n = err?.name || ""
      if (n === "NotAllowedError" || n === "PermissionDeniedError") {
        setCamError("Разрешите доступ к камере в браузере и попробуйте снова.")
      } else if (n === "NotFoundError") {
        setCamError("Камера не найдена на устройстве.")
      } else if (location.protocol === "http:" && location.hostname !== "localhost") {
        setCamError("Для работы камеры требуется HTTPS.")
      } else {
        setCamError("Не удалось открыть камеру. Попробуйте ещё раз.")
      }
    }
  }, [])

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach(t => t.stop())
    setStream(null)
    setActive(false)
  }, [stream])

  useEffect(() => () => { stream?.getTracks().forEach(t => t.stop()) }, [stream])

  const shoot = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")!
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      setPreview(URL.createObjectURL(blob))
      onCapture(blob)
      stopCamera()
    }, "image/jpeg", 0.92)
  }, [onCapture, stopCamera])

  const retake = useCallback(() => {
    setPreview(null)
    startCamera()
  }, [startCamera])

  // show preview after capture
  if (preview) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden border-2 border-emerald-400 shadow-lg">
          <img src={preview} alt="Селфи" className="w-full h-full object-cover" />
          <div className="absolute top-2 right-2 bg-emerald-500 text-white rounded-full p-1">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        </div>
        <button
          type="button"
          onClick={retake}
          className="flex items-center gap-2 text-sm text-gray-600 border border-gray-300 rounded-xl px-4 py-2 hover:bg-gray-50 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Переснять
        </button>
      </div>
    )
  }

  // camera active
  if (active) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden border-2 border-emerald-400 shadow-lg bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          {/* face oval guide */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice">
            <defs>
              <mask id="faceMask">
                <rect width="300" height="400" fill="white" />
                <ellipse cx="150" cy="160" rx="85" ry="110" fill="black" />
              </mask>
            </defs>
            <rect width="300" height="400" fill="rgba(0,0,0,0.3)" mask="url(#faceMask)" />
            <ellipse cx="150" cy="160" rx="85" ry="110" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeDasharray="10 5" />
          </svg>
        </div>
        <button
          type="button"
          onClick={shoot}
          className="w-18 h-18 w-[72px] h-[72px] rounded-full bg-white border-4 border-emerald-400 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        >
          <Camera className="h-8 w-8 text-gray-700" />
        </button>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    )
  }

  // initial / error state
  return (
    <div className="flex flex-col items-center gap-4">
      {camError && (
        <p className="text-sm text-red-500 text-center px-2">{camError}</p>
      )}
      <button
        type="button"
        onClick={startCamera}
        className="flex items-center gap-2 h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
      >
        <Camera className="h-5 w-5" />
        Включить камеру
      </button>
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

export default function PhoneCheckinPage() {
  const [step, setStep] = useState<"phone" | "greeting" | "photo" | "loading" | "result">("phone")
  const [phone, setPhone] = useState("")
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null)
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  const handlePhoneNext = async () => {
    const digits = phone.replace(/\D/g, "")
    if (digits.length < 9) { setError("Введите оставшиеся цифры номера"); return }
    setError(null)
    setLookupLoading(true)
    const fullPhone = `992${digits}`
    try {
      const res = await fetch(`${API_URL}/checkin/lookup?phone=${encodeURIComponent(fullPhone)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Сотрудник не найден")
      setEmployee(data)
      setStep("greeting")
    } catch (e: any) {
      setError(e.message || "Сотрудник с таким номером не найден")
    } finally {
      setLookupLoading(false)
    }
  }

  const handleSubmit = async () => {
    setStep("loading")
    setError(null)
    try {
      const form = new FormData()
      form.append("phone", `992${phone.replace(/\D/g, "")}`)
      if (photoBlob) form.append("photo", photoBlob, "selfie.jpg")

      const res = await fetch(`${API_URL}/checkin/phone`, { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Ошибка сервера")
      setResult(data)
      setStep("result")
    } catch (e: any) {
      setError(e.message || "Ошибка. Попробуйте снова.")
      setStep("photo")
    }
  }

  const reset = () => {
    setStep("phone")
    setPhone("")
    setEmployee(null)
    setPhotoBlob(null)
    setResult(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg mb-3">
            <span className="text-3xl">🏢</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Отметка о работе</h1>
          <p className="text-sm text-gray-500 mt-1">Чекин / Чекаут</p>
        </div>

        {/* STEP: PHONE */}
        {step === "phone" && (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Phone className="h-4 w-4 text-emerald-600" />
                Ваш номер телефона
              </label>
              <div className="flex h-14 rounded-xl border-2 border-gray-200 overflow-hidden focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-colors">
                <span className="flex items-center px-4 bg-gray-50 border-r-2 border-gray-200 text-xl font-mono font-semibold text-gray-500 select-none">
                  992
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="90 000 00 00"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  onKeyDown={e => e.key === "Enter" && handlePhoneNext()}
                  autoFocus
                  className="flex-1 px-4 text-xl font-mono tracking-wider focus:outline-none bg-transparent"
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <p className="text-xs text-gray-400">Введите 9 цифр после 992</p>
            </div>
            <button
              onClick={handlePhoneNext}
              disabled={lookupLoading}
              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              {lookupLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Далее <ChevronRight className="h-5 w-5" /></>}
            </button>
          </div>
        )}

        {/* STEP: GREETING */}
        {step === "greeting" && employee && (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6 text-center">
            <div className="space-y-2">
              <div className="text-5xl mb-2">👋</div>
              <h2 className="text-2xl font-bold text-gray-900">
                Привет, {employee.firstName}!
              </h2>
              {employee.position && (
                <p className="text-gray-500 text-sm">{employee.position}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setStep("phone"); setError(null) }}
                className="flex-1 h-11 rounded-xl border-2 border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors text-sm"
              >
                Назад
              </button>
              <button
                onClick={() => setStep("photo")}
                className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Camera className="h-4 w-4" />
                Сделать фото
              </button>
            </div>
          </div>
        )}

        {/* STEP: PHOTO */}
        {step === "photo" && (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-bold text-gray-800">Сделайте селфи</h2>
              <p className="text-sm text-gray-500">Смотрите прямо в камеру</p>
            </div>
            <SelfieCamera onCapture={blob => setPhotoBlob(blob)} />
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => { setStep("greeting"); setError(null); setPhotoBlob(null) }}
                className="flex-1 h-11 rounded-xl border-2 border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
              >
                Назад
              </button>
              <button
                onClick={handleSubmit}
                disabled={!photoBlob}
                className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
              >
                Отметиться
              </button>
            </div>
            {!photoBlob && (
              <p className="text-xs text-gray-400 text-center">Сделайте фото, чтобы отметиться</p>
            )}
          </div>
        )}

        {/* STEP: LOADING */}
        {step === "loading" && (
          <div className="bg-white rounded-2xl shadow-lg p-12 flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 text-emerald-500 animate-spin" />
            <p className="text-gray-600 font-medium">Отмечаем...</p>
          </div>
        )}

        {/* STEP: RESULT */}
        {step === "result" && result && (
          <div className={`rounded-2xl shadow-lg p-6 space-y-5 ${result.type === "in" ? "bg-emerald-600" : "bg-indigo-600"} text-white`}>
            <div className="text-center space-y-2">
              <div className="text-5xl">{result.type === "in" ? "✅" : "👋"}</div>
              <h2 className="text-2xl font-bold">
                {result.type === "in" ? "Рабочий день начался!" : "Рабочий день окончен!"}
              </h2>
            </div>

            <div className={`rounded-xl p-4 space-y-2 ${result.type === "in" ? "bg-emerald-700/50" : "bg-indigo-700/50"}`}>
              <p className="font-semibold text-lg">{result.employeeName}</p>
              {result.position && <p className="text-sm opacity-80">{result.position}</p>}
              {result.companyName && <p className="text-sm opacity-70">{result.companyName}</p>}
            </div>

            <div className={`rounded-xl p-4 space-y-2 ${result.type === "in" ? "bg-emerald-700/50" : "bg-indigo-700/50"}`}>
              <div className="flex items-center gap-2">
                {result.type === "in" ? <LogIn className="h-4 w-4 opacity-80" /> : <LogOut className="h-4 w-4 opacity-80" />}
                <span className="text-sm opacity-80">{result.type === "in" ? "Начало работы:" : "Конец работы:"}</span>
                <span className="font-bold text-lg ml-auto">{result.time}</span>
              </div>
              {result.type === "out" && result.workedMinutes !== null && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 opacity-80" />
                  <span className="text-sm opacity-80">Отработано сегодня:</span>
                  <span className="font-bold ml-auto">{formatWorked(result.workedMinutes)}</span>
                </div>
              )}
            </div>

            <div className={`rounded-xl p-3 text-sm ${result.type === "in" ? "bg-emerald-700/30" : "bg-indigo-700/30"}`}>
              {result.type === "in"
                ? `Уважаемый(ая) ${result.firstName}! Ваш рабочий день начался в ${result.time}.`
                : `Уважаемый(ая) ${result.firstName}! Рабочий день окончен в ${result.time}.${result.workedMinutes ? ` Сегодня вы работали ${formatWorked(result.workedMinutes)}.` : ""}`
              }
            </div>

            <button
              onClick={reset}
              className="w-full h-11 rounded-xl border-2 border-white/30 text-white font-medium hover:bg-white/10 transition-colors"
            >
              Новая отметка
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
