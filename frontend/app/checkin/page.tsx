"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, XCircle, Camera, ChevronLeft, Loader2, User } from "lucide-react"

type Employee = {
  id: number
  firstName: string
  lastName: string
  position: { name: string } | null
}

type Step = "loading" | "error" | "select" | "camera" | "submitting" | "success" | "fail"

const API = "/api"

function CheckinContent() {
  const params = useSearchParams()
  const officeId = Number(params.get("office") ?? 0)
  const token = params.get("t") ?? ""

  const [step, setStep] = React.useState<Step>("loading")
  const [officeName, setOfficeName] = React.useState("")
  const [employees, setEmployees] = React.useState<Employee[]>([])
  const [search, setSearch] = React.useState("")
  const [selected, setSelected] = React.useState<Employee | null>(null)
  const [direction, setDirection] = React.useState<"IN" | "OUT">("IN")
  const [errorMsg, setErrorMsg] = React.useState("")
  const [result, setResult] = React.useState<{ employeeName: string; timestamp: string; direction: string } | null>(null)

  const videoRef = React.useRef<HTMLVideoElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const streamRef = React.useRef<MediaStream | null>(null)

  // 1. Загрузить список сотрудников
  React.useEffect(() => {
    if (!officeId || !token) {
      setErrorMsg("Неверная ссылка QR-кода")
      setStep("error")
      return
    }
    fetch(`${API}/checkin/employees?officeId=${officeId}&token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.statusCode >= 400) throw new Error(data.message)
        setOfficeName(data.office.name)
        setEmployees(data.employees)
        setStep("select")
      })
      .catch(e => {
        setErrorMsg(e.message || "Ошибка загрузки")
        setStep("error")
      })
  }, [officeId, token])

  // 2. Открыть камеру
  async function openCamera(emp: Employee, dir: "IN" | "OUT") {
    setSelected(emp)
    setDirection(dir)
    setStep("camera")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch {
      setErrorMsg("Камера недоступна. Разрешите доступ к камере в браузере.")
      setStep("error")
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  function goBack() {
    stopCamera()
    setStep("select")
    setSelected(null)
    setSearch("")
  }

  // 3. Сделать селфи и отправить
  async function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !selected) return

    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext("2d")?.drawImage(video, 0, 0)
    const selfie = canvas.toDataURL("image/jpeg", 0.85)

    stopCamera()
    setStep("submitting")

    try {
      const res = await fetch(`${API}/checkin/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officeId,
          token,
          employeeId: selected.id,
          direction,
          selfie,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Ошибка")
      setResult(data)
      setStep("success")
    } catch (e: any) {
      setErrorMsg(e.message || "Ошибка сервера")
      setStep("fail")
    }
  }

  // Отфильтрованные сотрудники
  const filtered = employees.filter(e => {
    const q = search.toLowerCase()
    return (
      e.lastName.toLowerCase().includes(q) ||
      e.firstName.toLowerCase().includes(q)
    )
  })

  // ── UI ──

  if (step === "loading") return <Screen><Loader2 className="h-10 w-10 animate-spin text-amber-500" /></Screen>

  if (step === "error") return (
    <Screen>
      <XCircle className="h-12 w-12 text-red-400 mb-3" />
      <p className="text-center text-red-600 font-medium px-6">{errorMsg}</p>
      <p className="text-sm text-slate-500 mt-2 text-center">Попробуйте отсканировать QR-код заново</p>
    </Screen>
  )

  if (step === "success" && result) return (
    <Screen>
      <CheckCircle2 className="h-16 w-16 text-emerald-500 mb-4" />
      <p className="text-xl font-bold text-slate-800">
        {result.direction === "IN" ? "Вход записан" : "Выход записан"}
      </p>
      <p className="text-slate-600 mt-1 text-lg">{result.employeeName}</p>
      <p className="text-2xl font-mono font-bold text-amber-500 mt-2">
        {new Date(result.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false })}
      </p>
      <p className="text-slate-400 text-sm mt-4">{officeName}</p>
    </Screen>
  )

  if (step === "fail") return (
    <Screen>
      <XCircle className="h-12 w-12 text-red-400 mb-3" />
      <p className="text-red-600 font-medium text-center px-6">{errorMsg}</p>
      <button
        onClick={() => setStep("select")}
        className="mt-4 px-5 py-2 rounded-lg bg-amber-500 text-white font-medium"
      >
        Попробовать снова
      </button>
    </Screen>
  )

  if (step === "submitting") return (
    <Screen>
      <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
      <p className="text-slate-600 mt-3">Записываем...</p>
    </Screen>
  )

  if (step === "camera") return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-black/80">
        <button onClick={goBack} className="text-white/70 hover:text-white">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div>
          <p className="text-white font-medium text-sm">{selected?.lastName} {selected?.firstName}</p>
          <p className="text-white/50 text-xs">
            {direction === "IN" ? "Вход" : "Выход"} · {officeName}
          </p>
        </div>
      </div>

      {/* Камера */}
      <div className="flex-1 relative flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full max-h-[70vh] object-cover"
        />
        {/* Силуэт лица */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-52 h-64 rounded-full border-4 border-white/50" />
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Кнопка */}
      <div className="p-6 flex flex-col items-center gap-3 bg-black/80">
        <p className="text-white/60 text-sm">Смотрите в камеру и нажмите</p>
        <button
          onClick={capture}
          className="w-20 h-20 rounded-full bg-white border-4 border-amber-400 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        >
          <Camera className="h-8 w-8 text-slate-700" />
        </button>
      </div>
    </div>
  )

  // ── Выбор сотрудника ──
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-md mx-auto">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{officeName}</p>
        </div>
        <h1 className="text-lg font-bold text-slate-800">Отметка присутствия</h1>
      </div>

      {/* Направление */}
      <div className="px-4 pt-4">
        <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-white">
          {(["IN", "OUT"] as const).map(d => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                direction === d
                  ? d === "IN"
                    ? "bg-emerald-500 text-white"
                    : "bg-red-500 text-white"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {d === "IN" ? "Вход" : "Выход"}
            </button>
          ))}
        </div>
      </div>

      {/* Поиск */}
      <div className="px-4 pt-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Найти по имени..."
          className="w-full h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          autoFocus
        />
      </div>

      {/* Список */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6 space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-slate-400 text-sm py-8">Сотрудник не найден</p>
        )}
        {filtered.map(emp => (
          <button
            key={emp.id}
            onClick={() => openCamera(emp, direction)}
            className="w-full flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-amber-400 hover:shadow-sm active:scale-[0.98] transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 text-sm">
                {emp.lastName} {emp.firstName}
              </p>
              {emp.position && (
                <p className="text-xs text-slate-500 truncate">{emp.position.name}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function CheckinPage() {
  return (
    <React.Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
      </div>
    }>
      <CheckinContent />
    </React.Suspense>
  )
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
      {children}
    </div>
  )
}
