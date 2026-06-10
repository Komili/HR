"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import { ColumnDef } from "@tanstack/react-table"
import type { AttendanceSummary, UnknownFace } from "@/lib/types"
import { DataTable } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RuDateInput, toRuDate } from "@/components/ru-date-input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  getAttendance,
  getAttendanceLatestDate,
  getAttendanceRange,
  correctAttendance,
  registerAttendanceEvent,
  markAttendanceExcused,
  getCompany,
  getAttendanceSelfieUrl,
  getUnknownFaces,
  getUnknownFacePhotoUrl,
  markUnknownFaceReviewed,
} from "@/lib/hrms-api"
import { useAuth } from "@/app/contexts/AuthContext"
import {
  Clock,
  UserCheck,
  UserX,
  UserMinus,
  ShieldCheck,
  Download,
  Search,
  Pencil,
  LogIn,
  LogOut,
  CalendarRange,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Camera,
  Smartphone,
  Cpu,
  MousePointerClick,
  X,
  ScanFace,
  CheckCircle2,
  RefreshCw,
} from "lucide-react"

function formatTime(iso: string | null) {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false })
}

function formatMinutesToHours(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}ч ${m}м`
}

function timeToMins(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

const STATUS_LABELS: Record<string, string> = {
  present: "На месте",
  left: "Ушёл",
  absent: "Отсутствует",
  excused: "Уважит.",
}

const STATUS_STYLES: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700 border-emerald-200",
  left: "bg-red-100 text-red-700 border-red-200",
  absent: "bg-gray-100 text-gray-600 border-gray-200",
  excused: "bg-amber-100 text-amber-700 border-amber-200",
}

const ROW_BG: Record<string, string> = {
  present: "bg-emerald-100/70 hover:bg-emerald-200/70",
  left: "bg-red-100/70 hover:bg-red-200/70",
  absent: "bg-gray-100/70 hover:bg-gray-200/70",
  excused: "bg-amber-100/70 hover:bg-amber-200/70",
}

function getRowBg(row: AttendanceSummary): string {
  if (row.status === "excused") return ROW_BG.excused // отпросился — янтарный
  if (row.correctionType) {
    // Проверяем истёк ли срок
    if (row.correctionDeadline && new Date(row.correctionDeadline) < new Date()) {
      return "bg-orange-100/80 hover:bg-orange-200/80"
    }
    return "bg-yellow-100/80 hover:bg-yellow-200/80"
  }
  return ROW_BG[row.status] || ""
}

function formatDeviceName(name: string | null): string {
  if (!name) return "—"
  // Old format: "Hikvision 192.168.x.x" → just "Hikvision"
  if (/^Hikvision \d+\.\d+\.\d+\.\d+$/.test(name)) return "Hikvision"
  // Clean up underscores/camelCase
  return name.replace(/_/g, " ").trim()
}

function LastActivity({ event }: { event: AttendanceSummary["lastEvent"] }) {
  if (!event) return <span className="text-sm text-muted-foreground">—</span>
  const time = new Date(event.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false })
  const isMobile = event.source === "QR_CHECKIN" || event.deviceName?.includes("Мобильный")
  const isManual = event.deviceName?.includes("Ручной")
  const isIn = event.direction === "IN"
  const doorName = isMobile ? "Телефон" : isManual ? "Вручную" : formatDeviceName(event.deviceName)
  const dirLabel = isIn ? "Вход" : "Выход"
  const dirColor = isIn ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200"
  const Icon = isMobile ? Smartphone : event.source === "HIKVISION" ? Cpu : MousePointerClick
  return (
    <div className="flex flex-col leading-tight gap-0.5">
      <div className="flex items-center gap-1">
        <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-foreground font-medium truncate max-w-[110px]" title={doorName}>{doorName}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className={`inline-flex items-center rounded px-1 py-0 text-[10px] font-semibold border ${dirColor}`}>{dirLabel}</span>
        <span className="text-[11px] text-muted-foreground">{time}</span>
      </div>
      {event.note && (
        <div className="flex items-start gap-1 text-[11px] text-emerald-700 max-w-[140px]" title={event.note}>
          <span className="flex-shrink-0">📍</span>
          <span className="truncate">{event.note}</span>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || "bg-gray-100 text-gray-700 border-gray-200"
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${style}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

// ── Фото с JWT-авторизацией (для неизвестных лиц) ──
function AuthImage({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [src, setSrc] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    let revoked: string | null = null
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => { const u = URL.createObjectURL(b); revoked = u; setSrc(u) })
      .catch(() => setFailed(true))
    return () => { if (revoked) URL.revokeObjectURL(revoked) }
  }, [url])
  if (failed) return <div className={`flex items-center justify-center bg-gray-100 text-gray-300 ${className}`}><ScanFace className="h-8 w-8" /></div>
  if (!src) return <div className={`flex items-center justify-center bg-gray-100 ${className}`}><div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin" /></div>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />
}

const UNKNOWN_REASON: Record<string, { label: string; style: string }> = {
  no_id: { label: "Лицо не определено", style: "bg-red-100 text-red-700 border-red-200" },
  face_not_matched: { label: "Отказ в доступе", style: "bg-orange-100 text-orange-700 border-orange-200" },
  unknown_employee: { label: "ID не в базе", style: "bg-amber-100 text-amber-700 border-amber-200" },
}

// ── Блок «Неизвестные лица» за выбранную дату ──
function UnknownFacesSection({ date }: { date: string }) {
  const [items, setItems] = React.useState<UnknownFace[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showReviewed, setShowReviewed] = React.useState(false)

  const load = React.useCallback(() => {
    setLoading(true)
    getUnknownFaces(date)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [date])

  React.useEffect(() => { load() }, [load])

  const toggleReviewed = async (it: UnknownFace) => {
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, reviewed: !x.reviewed } : x)))
    try { await markUnknownFaceReviewed(it.id, !it.reviewed) } catch { load() }
  }

  const visible = showReviewed ? items : items.filter((i) => !i.reviewed)
  const unreviewedCount = items.filter((i) => !i.reviewed).length

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })

  return (
    <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-red-100/50 bg-gradient-to-r from-red-50/70 to-orange-50/70">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-red-100 to-orange-100">
            <ScanFace className="h-4 w-4 text-red-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Неизвестные лица</h3>
            <p className="text-xs text-muted-foreground">
              {unreviewedCount > 0 ? `${unreviewedCount} новых за день` : "Нет новых за день"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReviewed((v) => !v)}
            className="text-xs px-3 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {showReviewed ? "Скрыть проверенные" : "Показать все"}
          </button>
          <button
            onClick={load}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
            title="Обновить"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-3">
            <div className="h-5 w-5 rounded-full border-2 border-red-500/30 border-t-red-500 animate-spin" />
            <span className="text-sm">Загрузка...</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <ScanFace className="h-10 w-10 text-gray-300" />
            <span className="text-sm">{items.length === 0 ? "Неизвестных лиц за этот день нет" : "Все проверены"}</span>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((it) => {
              const reason = UNKNOWN_REASON[it.reason] || { label: it.reason, style: "bg-gray-100 text-gray-700 border-gray-200" }
              return (
                <div
                  key={it.id}
                  className={`group relative rounded-xl border overflow-hidden bg-white transition-all ${it.reviewed ? "opacity-60 border-gray-200" : "border-red-200 shadow-sm"}`}
                >
                  <div className="relative aspect-[3/4] bg-gray-100">
                    {it.hasPhoto ? (
                      <AuthImage url={getUnknownFacePhotoUrl(it.id)} alt="Неизвестное лицо" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full text-gray-300"><ScanFace className="h-10 w-10" /></div>
                    )}
                    <span className={`absolute top-1.5 left-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${reason.style}`}>
                      {reason.label}
                    </span>
                    {it.direction && (
                      <span className={`absolute top-1.5 right-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold border ${it.direction === "IN" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                        {it.direction === "IN" ? "Вход" : "Выход"}
                      </span>
                    )}
                  </div>
                  <div className="p-2 space-y-0.5">
                    <div className="text-xs font-semibold text-foreground">{fmtTime(it.timestamp)}</div>
                    <div className="text-[11px] text-muted-foreground truncate" title={it.officeName || it.deviceIp || ""}>
                      {it.officeName || it.deviceIp || "—"}
                    </div>
                    {it.rawEmployeeNo && (
                      <div className="text-[11px] text-muted-foreground truncate">СКУД №{it.rawEmployeeNo}</div>
                    )}
                    {it.companyName && (
                      <div className="text-[11px] text-muted-foreground truncate">{it.companyName}</div>
                    )}
                    <button
                      onClick={() => toggleReviewed(it)}
                      className={`mt-1 w-full flex items-center justify-center gap-1 h-7 rounded-lg text-[11px] font-medium border transition-colors ${it.reviewed ? "border-gray-200 text-gray-500 hover:bg-gray-50" : "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {it.reviewed ? "Проверено" : "Отметить проверено"}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user, token, currentCompanyName } = useAuth()
  const canCorrect = user && (user.isHoldingAdmin || user.role === "Кадровик" || user.role === "Руководитель")

  const [data, setData] = React.useState<AttendanceSummary[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedDate, setSelectedDate] = React.useState(() => {
    const now = new Date()
    return now.toISOString().split("T")[0]
  })
  const [latestDate, setLatestDate] = React.useState<string | null>(null)

  // Correction dialog
  const [correcting, setCorrecting] = React.useState<AttendanceSummary | null>(null)
  const [corrType, setCorrType] = React.useState<"minutes" | "manual_in" | "manual_out" | "remote" | "excused_left" | "excused_absent">("minutes")
  const [corrMinutes, setCorrMinutes] = React.useState(0)
  const [corrTime, setCorrTime] = React.useState("09:00")
  const [corrDeadline, setCorrDeadline] = React.useState("")
  const [corrNote, setCorrNote] = React.useState("")
  const [corrSaving, setCorrSaving] = React.useState(false)

  // Table search
  const [tableSearch, setTableSearch] = React.useState("")
  // Фильтр по статусу через карточки-кнопки
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null)

  // Selfie popup
  type SelfieEvent = NonNullable<AttendanceSummary["selfieEvents"]>[number]
  const [selfieDialog, setSelfieDialog] = React.useState<{ events: SelfieEvent[]; idx: number } | null>(null)
  const [selfieUrl, setSelfieUrl] = React.useState<string | null>(null)
  const [selfieLoading, setSelfieLoading] = React.useState(false)

  // Range report dialog
  const [rangeOpen, setRangeOpen] = React.useState(false)
  const [rangeFrom, setRangeFrom] = React.useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split("T")[0]
  })
  const [rangeTo, setRangeTo] = React.useState(() => {
    return new Date().toISOString().split("T")[0]
  })
  const [rangeLoading, setRangeLoading] = React.useState(false)

  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null)

  const loadData = React.useCallback((silent = false) => {
    if (!silent) { setError(null); setLoading(true) }
    getAttendance(selectedDate)
      .then((d) => { setData(d); setLastUpdated(new Date()) })
      .catch((err) => {
        if (!silent) { setData([]); setError(err instanceof Error ? err.message : "Ошибка загрузки данных") }
      })
      .finally(() => { if (!silent) setLoading(false) })
  }, [selectedDate])

  const fetchSelfie = React.useCallback((eventId: number) => {
    setSelfieUrl(null)
    setSelfieLoading(true)
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null
    fetch(getAttendanceSelfieUrl(eventId), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => setSelfieUrl(URL.createObjectURL(b)))
      .catch(() => setSelfieUrl(null))
      .finally(() => setSelfieLoading(false))
  }, [])

  const openSelfie = React.useCallback((events: NonNullable<AttendanceSummary["selfieEvents"]>, idx = 0) => {
    setSelfieDialog({ events, idx })
    fetchSelfie(events[idx].id)
  }, [fetchSelfie])

  const navigateSelfie = React.useCallback((dir: 1 | -1) => {
    if (!selfieDialog) return
    const nextIdx = selfieDialog.idx + dir
    if (nextIdx < 0 || nextIdx >= selfieDialog.events.length) return
    setSelfieDialog({ ...selfieDialog, idx: nextIdx })
    fetchSelfie(selfieDialog.events[nextIdx].id)
  }, [selfieDialog, fetchSelfie])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  // Real-time SSE updates: reconnect when date or token changes
  React.useEffect(() => {
    if (!token) return
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "/api"
    const companyId = typeof window !== "undefined" ? localStorage.getItem("currentCompanyId") : null
    const params = new URLSearchParams({ date: selectedDate, token })
    if (companyId) params.set("companyId", companyId)
    const es = new EventSource(`${apiBase}/attendance/stream?${params}`)
    es.onmessage = () => { if (!document.hidden) loadData(true) }
    es.onerror = () => es.close()
    const onVisible = () => { if (!document.hidden) loadData(true) }
    document.addEventListener("visibilitychange", onVisible)
    return () => { es.close(); document.removeEventListener("visibilitychange", onVisible) }
  }, [selectedDate, token, loadData])

  React.useEffect(() => {
    getAttendanceLatestDate()
      .then((r) => { if (r.date) setLatestDate(r.date) })
      .catch(() => {})
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered data by search
  const filteredData = React.useMemo(() => {
    if (!tableSearch.trim()) return data
    const q = tableSearch.toLowerCase()
    return data.filter((d) =>
      d.employeeName.toLowerCase().includes(q) ||
      (d.departmentName && d.departmentName.toLowerCase().includes(q)) ||
      (d.officeName && d.officeName.toLowerCase().includes(q))
    )
  }, [data, tableSearch])

  // Stats
  const presentCount = filteredData.filter((d) => d.status === "present").length
  const leftCount = filteredData.filter((d) => d.status === "left").length
  const absentCount = filteredData.filter((d) => d.status === "absent").length
  const excusedCount = filteredData.filter((d) => d.status === "excused").length

  // Фильтр по статусу (клик по карточке)
  const displayedData = React.useMemo(
    () => (statusFilter ? filteredData.filter((d) => d.status === statusFilter) : filteredData),
    [filteredData, statusFilter],
  )

  // Correction handlers
  const openCorrection = (row: AttendanceSummary) => {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, "0")
    const mm = String(now.getMinutes()).padStart(2, "0")
    setCorrecting(row)
    // Для отсутствующих (нет записи, id ≤ 0) сразу предлагаем отметить приход
    setCorrType(row.id > 0 ? "minutes" : "manual_in")
    setCorrMinutes(0)
    setCorrTime(`${hh}:${mm}`)
    setCorrDeadline("")
    setCorrNote("")
  }

  const handleCorrect = async () => {
    if (!correcting) return
    const isCheck = corrType === "manual_in" || corrType === "manual_out"
    const isExcused = corrType === "excused_left" || corrType === "excused_absent"
    if (isCheck && !corrTime) return
    if (!isCheck && !corrNote.trim()) return
    if (corrType === "minutes" && corrMinutes === 0) return
    setCorrSaving(true)
    try {
      if (isExcused) {
        // Отпросился: ушёл (с временем ухода) или не пришёл — помечаем день уважительным
        await markAttendanceExcused(
          correcting.employeeId,
          correcting.date,
          corrType === "excused_left" ? "left" : "absent",
          corrNote.trim(),
          corrType === "excused_left" ? corrTime : undefined,
        )
      } else if (isCheck) {
        // Отметка прихода/ухода за сотрудника — создаём реальное событие (работает и без записи)
        await registerAttendanceEvent(
          correcting.employeeId,
          corrType === "manual_in" ? "IN" : "OUT",
          undefined,
          corrNote.trim() || undefined,
          corrDeadline || undefined,
          correcting.date,
          corrTime,
        )
      } else {
        await correctAttendance(correcting.id, {
          type: corrType,
          correctionMinutes: corrType === "minutes" ? corrMinutes : undefined,
          note: corrNote,
          deadline: corrDeadline || undefined,
        })
      }
      setCorrecting(null)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка корректировки")
    } finally {
      setCorrSaving(false)
    }
  }

  // Excel export
  const exportExcel = async () => {
    // Fetch company schedule for late/absent calculations
    const companyId = user?.companyId ||
      (typeof window !== "undefined" ? parseInt(localStorage.getItem("currentCompanyId") || "0") || null : null)

    let workDayStart = "09:00"
    let workDayEnd = "18:00"
    let lunchBreakStart = "12:00"
    let lunchBreakEnd = "13:00"

    if (companyId) {
      try {
        const company = await getCompany(companyId)
        workDayStart = company.workDayStart || "09:00"
        workDayEnd = company.workDayEnd || "18:00"
        lunchBreakStart = company.lunchBreakStart || "12:00"
        lunchBreakEnd = company.lunchBreakEnd || "13:00"
      } catch { /* use defaults */ }
    }

    const workStartMins = timeToMins(workDayStart)
    const workEndMins = timeToMins(workDayEnd)
    const lunchDurMins = timeToMins(lunchBreakEnd) - timeToMins(lunchBreakStart)
    const workdayMins = workEndMins - workStartMins - lunchDurMins

    const dateFormatted = toRuDate(selectedDate)
    const exportTime = new Date().toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    })
    const companyLabel = currentCompanyName || "Все компании"

    // Summary rows
    const summaryRows = [
      ["Посещаемость за " + dateFormatted],
      ["Компания: " + companyLabel, "", "", "Дата экспорта: " + exportTime],
      ["Рабочий день: " + workDayStart + "–" + workDayEnd + "  |  Обед: " + lunchBreakStart + "–" + lunchBreakEnd],
      [],
      ["На месте: " + presentCount, "Ушли: " + leftCount, "Отсутствуют: " + absentCount, "Уважит.: " + excusedCount],
      [],
    ]

    // Headers
    const headers = ["№", "ФИО", "Отдел", "Должность", "Офис", "Вход", "Выход", "Часы", "Мин", "Опоздание", "Корректировка", "Статус"]

    // Accumulators (prefixed to avoid shadowing component-level stats)
    let totalLateMinutes = 0
    let exportLateCount = 0
    let totalAbsentMinutes = 0
    let exportAbsentCount = 0

    // Data rows
    const rows = data.map((row, i) => {
      const h = Math.floor(row.totalMinutes / 60)
      const m = row.totalMinutes % 60

      let lateStr = ""
      if (row.isLate && row.firstEntry) {
        const entryDate = new Date(row.firstEntry)
        const entryMins = entryDate.getHours() * 60 + entryDate.getMinutes()
        const lateMin = Math.max(0, entryMins - workStartMins)
        if (lateMin > 0) {
          totalLateMinutes += lateMin
          exportLateCount++
          const lh = Math.floor(lateMin / 60)
          const lm = lateMin % 60
          lateStr = lh > 0 ? `+${lh}ч ${lm}м` : `+${lm}м`
        }
      }
      if (row.status === "absent") {
        exportAbsentCount++
        totalAbsentMinutes += workdayMins
      }

      return [
        i + 1,
        row.employeeName,
        row.departmentName || "",
        row.positionName || "",
        row.officeName || "",
        row.firstEntry ? formatTime(row.firstEntry) : "—",
        row.lastExit ? formatTime(row.lastExit) : "—",
        h,
        m,
        lateStr || "",
        row.correctionMinutes !== 0 ? (row.correctionMinutes > 0 ? "+" : "") + row.correctionMinutes + " мин" : "",
        STATUS_LABELS[row.status] || row.status,
      ]
    })

    // Totals
    const totalMinutes = data.reduce((sum, d) => sum + d.totalMinutes, 0)
    const totalH = Math.floor(totalMinutes / 60)
    const totalM = totalMinutes % 60
    const presentDays = data.filter((d) => d.status === "present" || d.status === "left").length

    const lateH = Math.floor(totalLateMinutes / 60)
    const lateM = totalLateMinutes % 60
    const absentH = Math.floor(totalAbsentMinutes / 60)
    const absentM = totalAbsentMinutes % 60

    const totalsRow =  ["", "ИТОГО:", "", "", "", "", "", totalH, totalM, "", "", `Работали: ${presentDays} чел.`]
    const lateRow =    ["", `Опоздали: ${exportLateCount} чел.`, "", "", "", "", "", lateH, lateM, `${lateH}ч ${lateM}м`, "", ""]
    const absentRow =  ["", `Отсутствовали: ${exportAbsentCount} чел.`, "", "", "", "", "", absentH, absentM, `${absentH}ч ${absentM}м`, "", ""]

    // Build worksheet
    const wsData = [...summaryRows, headers, ...rows, [], totalsRow, lateRow, absentRow]
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Column widths
    ws["!cols"] = [
      { wch: 5 },   // №
      { wch: 30 },  // ФИО
      { wch: 20 },  // Отдел
      { wch: 22 },  // Должность
      { wch: 18 },  // Офис
      { wch: 8 },   // Вход
      { wch: 8 },   // Выход
      { wch: 6 },   // Часы
      { wch: 6 },   // Мин
      { wch: 12 },  // Опоздание
      { wch: 14 },  // Корректировка
      { wch: 16 },  // Статус
    ]

    // Merge title cell
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 11 } },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Посещаемость")
    XLSX.writeFile(wb, `Посещаемость_${toRuDate(selectedDate)}.xlsx`)
  }

  // Range Excel export
  const exportRangeExcel = async () => {
    setRangeLoading(true)
    try {
      // Fetch company schedule for late/absent calculations
      const companyId = user?.companyId ||
        (typeof window !== "undefined" ? parseInt(localStorage.getItem("currentCompanyId") || "0") || null : null)

      let workDayStart = "09:00"
      let workDayEnd = "18:00"
      let lunchBreakStart = "12:00"
      let lunchBreakEnd = "13:00"
      let workDays = "1,2,3,4,5"

      if (companyId) {
        try {
          const company = await getCompany(companyId)
          workDayStart = company.workDayStart || "09:00"
          workDayEnd = company.workDayEnd || "18:00"
          lunchBreakStart = company.lunchBreakStart || "12:00"
          lunchBreakEnd = company.lunchBreakEnd || "13:00"
          workDays = company.workDays || "1,2,3,4,5"
        } catch { /* use defaults */ }
      }

      const workStartMins = timeToMins(workDayStart)
      const workEndMins = timeToMins(workDayEnd)
      const LATE_GRACE = 15 // порог опоздания, мин
      const GRACE = 5 // порог переработки/раннего ухода, мин
      const localMins = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() }

      const rangeData = await getAttendanceRange(rangeFrom, rangeTo)

      // Collect all unique dates sorted
      const datesSet = new Set<string>()
      rangeData.forEach((r) => datesSet.add(r.date))
      const dates = Array.from(datesSet).sort()

      // Group by employee
      type DayInfo = { entry: string | null; exit: string | null; minutes: number; late: number; over: number; early: boolean }
      type EmpAgg = {
        name: string; department: string
        days: Map<string, DayInfo>
        lateDays: number; lateMinutes: number
        overDays: number; overMinutes: number
        absentCount: number
      }
      const employeeMap = new Map<number, EmpAgg>()

      rangeData.forEach((r) => {
        if (!employeeMap.has(r.employeeId)) {
          employeeMap.set(r.employeeId, {
            name: r.employeeName, department: r.departmentName || "",
            days: new Map(), lateDays: 0, lateMinutes: 0, overDays: 0, overMinutes: 0, absentCount: 0,
          })
        }
        const emp = employeeMap.get(r.employeeId)!
        const entryMins = r.firstEntry ? localMins(r.firstEntry) : null
        const exitMins = r.lastExit ? localMins(r.lastExit) : null

        let late = 0
        if (entryMins !== null) { const l = entryMins - workStartMins; if (l > LATE_GRACE) late = l }
        let over = 0
        if (entryMins !== null) { const before = workStartMins - entryMins; if (before > GRACE) over += before }
        if (exitMins !== null) { const after = exitMins - workEndMins; if (after > GRACE) over += after }
        const early = exitMins !== null && (workEndMins - exitMins) > GRACE

        emp.days.set(r.date, { entry: r.firstEntry, exit: r.lastExit, minutes: r.totalMinutes, late, over, early })
        if (late > 0) { emp.lateDays++; emp.lateMinutes += late }
        if (over > 0) { emp.overDays++; emp.overMinutes += over }
      })

      // Рабочие дни недели компании (ISO: 1=Пн..7=Вс)
      const workDaySet = new Set(
        workDays.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 7),
      )
      if (workDaySet.size === 0) [1, 2, 3, 4, 5].forEach((d) => workDaySet.add(d))

      // Все рабочие дни в выбранном диапазоне (для подсчёта прогулов)
      const workingDaysInRange: string[] = []
      {
        const start = new Date(rangeFrom + "T00:00:00")
        const end = new Date(rangeTo + "T00:00:00")
        for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
          const d = new Date(t)
          const iso = d.getDay() === 0 ? 7 : d.getDay()
          if (workDaySet.has(iso)) {
            workingDaysInRange.push(
              `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
            )
          }
        }
      }

      // Прогул = рабочий день без единой записи
      employeeMap.forEach((emp) => {
        emp.absentCount = workingDaysInRange.reduce((n, day) => (emp.days.has(day) ? n : n + 1), 0)
      })

      // Map preserves insertion order — server data already sorted by sortOrder
      const employees = Array.from(employeeMap.entries())

      const exportTime = new Date().toLocaleString("ru-RU", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      })
      const companyLabel = currentCompanyName || "Все компании"

      const fmtLate = (days: number, mins: number): string => {
        if (days === 0) return ""
        const h = Math.floor(mins / 60)
        const m = mins % 60
        const timeStr = h > 0 ? (m > 0 ? `${h}ч ${m}м` : `${h}ч`) : `${m}м`
        return `${days} дн. (${timeStr})`
      }
      const isWeekend = (d: string) => { const wd = new Date(d + "T00:00:00").getDay(); return wd === 0 || wd === 6 }

      // ───────── Красочный Excel через ExcelJS ─────────
      const ExcelJS = (await import("exceljs")).default
      const wb = new ExcelJS.Workbook()
      wb.creator = "КАДРЫ"; wb.created = new Date()

      const nCols = 2 + dates.length * 2 + 4
      const sumStart = 3 + dates.length * 2 // первая сводная колонка (Всего)
      const ws = wb.addWorksheet("Отчёт за период", {
        views: [{ state: "frozen", xSplit: 2, ySplit: 5 }],
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      })

      const COL = {
        title: "FF6D28D9", meta: "FFF5F3FF", sched: "FFFEF3C7",
        emp: "FF334155", dateH: "FF2563EB", dateW: "FFBE185D", sub: "FF64748B",
        tot: "FF0F766E", late: "FFB45309", miss: "FFB91C1C", over: "FF15803D",
        white: "FFFFFFFF", border: "FFE2E8F0", zebra: "FFF8FAFC", totals: "FFE2E8F0",
        lLate: "FFFEF3C7", lEarly: "FFFFEDD5", lMiss: "FFFEE2E2", lOver: "FFDCFCE7", weekend: "FFFDF2F8",
      }
      const setFill = (cell: any, argb: string) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } } }
      const allBorder = (cell: any) => {
        cell.border = {
          top: { style: "thin", color: { argb: COL.border } },
          left: { style: "thin", color: { argb: COL.border } },
          bottom: { style: "thin", color: { argb: COL.border } },
          right: { style: "thin", color: { argb: COL.border } },
        }
      }

      // Ширины
      ws.getColumn(1).width = 5
      ws.getColumn(2).width = 30
      dates.forEach((_, i) => { ws.getColumn(3 + i * 2).width = 8; ws.getColumn(4 + i * 2).width = 8 })
      ws.getColumn(sumStart).width = 11
      ws.getColumn(sumStart + 1).width = 16
      ws.getColumn(sumStart + 2).width = 11
      ws.getColumn(sumStart + 3).width = 16

      // Row 1 — заголовок
      ws.mergeCells(1, 1, 1, nCols)
      const tCell = ws.getRow(1).getCell(1)
      tCell.value = `Отчёт посещаемости за период ${toRuDate(rangeFrom)} — ${toRuDate(rangeTo)}`
      tCell.font = { bold: true, size: 14, color: { argb: COL.white } }
      tCell.alignment = { vertical: "middle", horizontal: "center" }
      setFill(tCell, COL.title); ws.getRow(1).height = 28

      // Row 2 — мета
      ws.mergeCells(2, 1, 2, nCols)
      const mCell = ws.getRow(2).getCell(1)
      mCell.value = `Компания: ${companyLabel}        Дата экспорта: ${exportTime}`
      mCell.font = { size: 10, color: { argb: "FF475569" } }
      mCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
      setFill(mCell, COL.meta); ws.getRow(2).height = 18

      // Row 3 — расписание
      ws.mergeCells(3, 1, 3, nCols)
      const sCell = ws.getRow(3).getCell(1)
      sCell.value = `Рабочий день: ${workDayStart}–${workDayEnd}    |    Обед: ${lunchBreakStart}–${lunchBreakEnd} (вычитается из часов)    |    Опоздание — от +${LATE_GRACE} мин, переработка — от +${GRACE} мин`
      sCell.font = { size: 10, bold: true, color: { argb: "FF92400E" } }
      sCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
      setFill(sCell, COL.sched); ws.getRow(3).height = 18

      // Row 4-5 — шапка
      const r4 = ws.getRow(4), r5 = ws.getRow(5)
      ws.mergeCells(4, 1, 5, 1); ws.mergeCells(4, 2, 5, 2)
      const styleHead = (cell: any, val: string, argb: string, size = 9) => {
        cell.value = val
        cell.font = { bold: true, size, color: { argb: COL.white } }
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
        setFill(cell, argb); allBorder(cell)
      }
      styleHead(r4.getCell(1), "№", COL.emp, 10)
      styleHead(r4.getCell(2), "ФИО", COL.emp, 10)

      dates.forEach((d, i) => {
        const c = 3 + i * 2
        const we = isWeekend(d)
        ws.mergeCells(4, c, 4, c + 1)
        styleHead(r4.getCell(c), toRuDate(d), we ? COL.dateW : COL.dateH, 9)
        styleHead(r5.getCell(c), "Вход", COL.sub, 8)
        styleHead(r5.getCell(c + 1), "Выход", COL.sub, 8)
      })

      const sums = [
        { label: "Всего", sub: "часов", color: COL.tot },
        { label: "Опозданий", sub: "дней / время", color: COL.late },
        { label: "Переработка", sub: "дней / время", color: COL.over },
        { label: "Пропусков", sub: "дней", color: COL.miss },
      ]
      sums.forEach((s, i) => {
        const c = sumStart + i
        styleHead(r4.getCell(c), s.label, s.color, 9)
        styleHead(r5.getCell(c), s.sub, s.color, 8)
      })
      r4.height = 18; r5.height = 16

      // Данные
      let rowIdx = 6
      let gMin = 0, gLateD = 0, gLateM = 0, gAbs = 0, gOverD = 0, gOverM = 0
      employees.forEach(([, emp], idx) => {
        const row = ws.getRow(rowIdx)
        row.getCell(1).value = idx + 1
        row.getCell(2).value = emp.name

        let totalMin = 0
        dates.forEach((date, i) => {
          const c = 3 + i * 2
          const inCell = row.getCell(c), outCell = row.getCell(c + 1)
          const day = emp.days.get(date)
          if (day) {
            inCell.value = day.entry ? formatTime(day.entry) : "—"
            outCell.value = day.exit ? formatTime(day.exit) : "—"
            totalMin += day.minutes
            if (day.late > 0) { setFill(inCell, COL.lLate); inCell.font = { size: 9, bold: true, color: { argb: "FF92400E" } } }
            else if (!day.entry) setFill(inCell, COL.lMiss)
            else if (day.over > 0 && day.entry && localMins(day.entry) < workStartMins) setFill(inCell, COL.lOver)
            if (day.early) { setFill(outCell, COL.lEarly); outCell.font = { size: 9, bold: true, color: { argb: "FFC2410C" } } }
            else if (!day.exit) setFill(outCell, COL.lMiss)
            else if (day.over > 0 && day.exit && localMins(day.exit) > workEndMins) setFill(outCell, COL.lOver)
          } else {
            inCell.value = "—"; outCell.value = "—"
            if (isWeekend(date)) { setFill(inCell, COL.weekend); setFill(outCell, COL.weekend) }
          }
        })

        const h = Math.floor(totalMin / 60), m = totalMin % 60
        row.getCell(sumStart).value = `${h}ч ${m}м`
        row.getCell(sumStart + 1).value = fmtLate(emp.lateDays, emp.lateMinutes)
        row.getCell(sumStart + 2).value = fmtLate(emp.overDays, emp.overMinutes)
        row.getCell(sumStart + 3).value = emp.absentCount || ""

        const zebra = idx % 2 === 1
        for (let c = 1; c <= nCols; c++) {
          const cell = row.getCell(c)
          allBorder(cell)
          if (!cell.font) cell.font = { size: 9, color: { argb: "FF1E293B" } }
          cell.alignment = { vertical: "middle", horizontal: c === 2 ? "left" : "center" }
          if (zebra && !cell.fill) setFill(cell, COL.zebra)
        }
        row.getCell(2).font = { size: 9, bold: true, color: { argb: "FF0F172A" } }
        if (emp.lateDays > 0) row.getCell(sumStart + 1).font = { size: 9, bold: true, color: { argb: "FF92400E" } }
        if (emp.overDays > 0) { setFill(row.getCell(sumStart + 2), COL.lOver); row.getCell(sumStart + 2).font = { size: 9, bold: true, color: { argb: "FF166534" } } }
        if (emp.absentCount > 0) { setFill(row.getCell(sumStart + 3), COL.lMiss); row.getCell(sumStart + 3).font = { size: 9, bold: true, color: { argb: "FF991B1B" } } }
        row.height = 16

        gMin += totalMin; gLateD += emp.lateDays; gLateM += emp.lateMinutes
        gAbs += emp.absentCount; gOverD += emp.overDays; gOverM += emp.overMinutes
        rowIdx++
      })

      // Итог
      const gh = Math.floor(gMin / 60), gm = gMin % 60
      const tRow = ws.getRow(rowIdx)
      tRow.getCell(2).value = "ИТОГО"
      tRow.getCell(sumStart).value = `${gh}ч ${gm}м`
      tRow.getCell(sumStart + 1).value = fmtLate(gLateD, gLateM)
      tRow.getCell(sumStart + 2).value = fmtLate(gOverD, gOverM)
      tRow.getCell(sumStart + 3).value = gAbs || ""
      for (let c = 1; c <= nCols; c++) {
        const cell = tRow.getCell(c)
        allBorder(cell); setFill(cell, COL.totals)
        cell.font = { bold: true, size: 9, color: { argb: "FF0F172A" } }
        cell.alignment = { vertical: "middle", horizontal: c === 2 ? "left" : "center" }
      }
      tRow.height = 20

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Посещаемость_${toRuDate(rangeFrom)}_${toRuDate(rangeTo)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      setRangeOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки данных за период")
    } finally {
      setRangeLoading(false)
    }
  }

  const columns: ColumnDef<AttendanceSummary>[] = [
    {
      id: "index",
      header: "№",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">{row.index + 1}</span>
      ),
    },
    {
      accessorKey: "employeeName",
      header: "ФИО",
      cell: ({ row }) => (
        <a
          href={`/employees/${row.original.employeeId}`}
          className="font-medium text-foreground hover:text-emerald-600 hover:underline transition-colors"
        >
          {row.original.employeeName}
        </a>
      ),
    },
    {
      accessorKey: "departmentName",
      header: "Отдел",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.departmentName || "—"}
        </span>
      ),
    },
    {
      accessorKey: "positionName",
      header: "Должность",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.positionName || "—"}
        </span>
      ),
    },
    {
      accessorKey: "officeName",
      header: "Офис",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.officeName || "—"}
        </span>
      ),
    },
    {
      accessorKey: "firstEntry",
      header: "Вход",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">
            {formatTime(row.original.firstEntry)}
          </span>
          {row.original.isLate && row.original.firstEntry && (
            <span className="inline-flex items-center rounded-full bg-orange-100 border border-orange-200 px-1.5 py-0.5 text-xs font-medium text-orange-700" title="Опоздание">
              Опоздал
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "lastExit",
      header: "Выход",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">
            {formatTime(row.original.lastExit)}
          </span>
          {row.original.isEarlyLeave && row.original.lastExit && (
            <span className="inline-flex items-center rounded-full bg-purple-100 border border-purple-200 px-1.5 py-0.5 text-xs font-medium text-purple-700" title="Ранний уход">
              Ранний
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "totalMinutes",
      header: "Часов",
      cell: ({ row }) => {
        const { totalMinutes, correctionMinutes } = row.original
        return (
          <div className="text-sm">
            <span className="font-medium">{formatMinutesToHours(totalMinutes)}</span>
            {correctionMinutes !== 0 && (
              <span className={`ml-1 text-xs ${correctionMinutes > 0 ? "text-emerald-600" : "text-red-500"}`}>
                ({correctionMinutes > 0 ? "+" : ""}{correctionMinutes}м)
              </span>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "status",
      header: "Статус",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        if (!canCorrect) return null
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-50"
            onClick={() => openCorrection(row.original)}
            title="Корректировка"
          >
            <Pencil className="h-4 w-4 text-blue-600" />
          </Button>
        )
      },
    },
  ]

  const quickStats = [
    { label: "На месте", status: "present", value: presentCount, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-100", ring: "ring-emerald-400 border-emerald-300 bg-emerald-50/60" },
    { label: "Ушли", status: "left", value: leftCount, icon: UserMinus, color: "text-red-600", bg: "bg-red-100", ring: "ring-red-400 border-red-300 bg-red-50/60" },
    { label: "Отсутствуют", status: "absent", value: absentCount, icon: UserX, color: "text-gray-600", bg: "bg-gray-100", ring: "ring-gray-400 border-gray-300 bg-gray-50/60" },
    { label: "Уважит.", status: "excused", value: excusedCount, icon: ShieldCheck, color: "text-amber-600", bg: "bg-amber-100", ring: "ring-amber-400 border-amber-300 bg-amber-50/60" },
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/25">
              <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Посещаемость</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Учёт рабочего времени
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={exportExcel}
            className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50 text-xs sm:text-sm"
          >
            <Download className="mr-1 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Скачать Excel</span>
            <span className="sm:hidden">Excel</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRangeOpen(true)}
            className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl border-purple-200 text-purple-600 hover:bg-purple-50 text-xs sm:text-sm"
          >
            <CalendarRange className="mr-1 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Отчёт за период</span>
            <span className="sm:hidden">Период</span>
          </Button>
        </div>
      </div>

      {/* Date picker + Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="date" className="text-sm font-medium whitespace-nowrap">
            Дата:
          </Label>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl border-blue-200 hover:bg-blue-50 hover:border-blue-300 shrink-0"
              onClick={() => {
                const [y, mo, dy] = selectedDate.split("-").map(Number)
                const date = new Date(y, mo - 1, dy - 1)
                setSelectedDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`)
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <RuDateInput
              id="date"
              value={selectedDate}
              onChange={setSelectedDate}
              className="w-36 sm:w-44"
              inputClassName="border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl border-blue-200 hover:bg-blue-50 hover:border-blue-300 shrink-0"
              onClick={() => {
                const [y, mo, dy] = selectedDate.split("-").map(Number)
                const date = new Date(y, mo - 1, dy + 1)
                setSelectedDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`)
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по ФИО..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="pl-10 h-10 rounded-xl bg-white/80 border-blue-100 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          {lastUpdated && selectedDate === new Date().toISOString().split("T")[0] && (
            <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {lastUpdated.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false })}
            </span>
          )}
        </div>
      </div>

      {/* Stats — кнопки фильтра по статусу */}
      <div className="grid gap-3 grid-cols-2 sm:gap-4 sm:grid-cols-4">
        {quickStats.map((stat) => {
          const active = statusFilter === stat.status
          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => setStatusFilter(active ? null : stat.status)}
              aria-pressed={active}
              title={active ? "Сбросить фильтр" : `Показать: ${stat.label}`}
              className={`flex items-center gap-4 rounded-2xl bg-white/80 backdrop-blur-sm border p-4 shadow-sm text-left transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer ${
                active ? `ring-2 ${stat.ring} shadow-md` : "border-white/50"
              }`}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.bg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  {stat.label}
                  {active && <X className="h-3 w-3" />}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden">
        {error && (
          <div className="mx-5 mt-4 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="h-5 w-5 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
                <span>Загрузка...</span>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-blue-100/50 bg-white/50">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-blue-50/80 to-cyan-50/80 border-b border-blue-100/50">
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left">№</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left">ФИО</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left hidden lg:table-cell">Должность</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left hidden md:table-cell">Активность</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left">Вход</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left">Выход</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left hidden md:table-cell">Часов</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left hidden md:table-cell">Статус</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedData.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center">
                        <div className="flex flex-col items-center text-muted-foreground gap-2">
                          <Clock className="h-12 w-12 text-gray-300 mb-1" />
                          {statusFilter ? (
                            <>
                              <span className="text-sm">Нет сотрудников с этим статусом</span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-1 text-xs"
                                onClick={() => setStatusFilter(null)}
                              >
                                Сбросить фильтр
                              </Button>
                            </>
                          ) : (
                            <>
                              <span className="text-sm">Нет данных за выбранную дату</span>
                              {latestDate && latestDate !== selectedDate && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-1 text-xs"
                                  onClick={() => setSelectedDate(latestDate)}
                                >
                                  Перейти к последним данным ({new Date(latestDate + "T00:00:00").toLocaleDateString("ru-RU")})
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayedData.map((row, index) => {
                      const deadlineExpired = row.correctionDeadline && new Date(row.correctionDeadline) < new Date()
                      return (
                        <tr
                          key={row.id}
                          className={`group border-b border-blue-50 transition-colors ${getRowBg(row)}`}
                        >
                          <td className="py-3 px-4 text-sm text-muted-foreground">{index + 1}</td>
                          <td className="py-3 px-4">
                            <a
                              href={`/employees/${row.employeeId}`}
                              className="font-medium text-foreground hover:text-blue-600 hover:underline transition-colors"
                            >
                              {row.employeeName}
                            </a>
                            {row.correctionNote && (
                              <div className="flex items-start gap-1 mt-0.5">
                                {deadlineExpired && (
                                  <AlertTriangle className="h-3 w-3 text-orange-500 flex-shrink-0 mt-0.5" />
                                )}
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]" title={row.correctionNote}>
                                  {row.correctionNote}
                                  {row.correctionDeadline && (
                                    <span className={`ml-1 font-medium ${deadlineExpired ? "text-orange-600" : "text-yellow-700"}`}>
                                      (до {new Date(row.correctionDeadline).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false })})
                                    </span>
                                  )}
                                </p>
                              </div>
                            )}
                            {/* Комментарий мобильного чекина — где / на каком объекте */}
                            {row.lastNote && (
                              <div className="flex items-start gap-1 mt-0.5 text-xs text-emerald-700 md:hidden" title={row.lastNote}>
                                <span className="flex-shrink-0">📍</span>
                                <span className="truncate max-w-[220px]">{row.lastNote}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground hidden lg:table-cell">{row.positionName || "—"}</td>
                          <td className="py-3 px-4 hidden md:table-cell">
                            <LastActivity event={row.lastEvent} />
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium">{formatTime(row.firstEntry)}</span>
                              {row.isLate && row.firstEntry && (
                                <span className="inline-flex items-center rounded-full bg-orange-100 border border-orange-200 px-1.5 py-0.5 text-xs font-medium text-orange-700">Опоздал</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium">{formatTime(row.lastExit)}</span>
                              {row.isEarlyLeave && row.lastExit && (
                                <span className="inline-flex items-center rounded-full bg-purple-100 border border-purple-200 px-1.5 py-0.5 text-xs font-medium text-purple-700">Ранний</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm hidden md:table-cell">
                            <span className="font-medium">{formatMinutesToHours(row.totalMinutes)}</span>
                            {row.correctionMinutes !== 0 && (
                              <span className={`ml-1 text-xs ${row.correctionMinutes > 0 ? "text-emerald-600" : "text-red-500"}`}>
                                ({row.correctionMinutes > 0 ? "+" : ""}{row.correctionMinutes}м)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 hidden md:table-cell">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1">
                              {row.selfieEvents && row.selfieEvents.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 hover:bg-violet-50"
                                  onClick={() => openSelfie(row.selfieEvents!, 0)}
                                  title="Фото чекина"
                                >
                                  <Camera className="h-4 w-4 text-violet-500" />
                                </Button>
                              )}
                              {canCorrect && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-50"
                                  onClick={() => openCorrection(row)}
                                  title="Корректировка / отметка"
                                >
                                  <Pencil className="h-4 w-4 text-blue-600" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Неизвестные лица за выбранную дату */}
      <UnknownFacesSection date={selectedDate} />

      {/* Correction Dialog */}
      <Dialog open={!!correcting} onOpenChange={() => setCorrecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              Корректировка / отметка
            </DialogTitle>
            <DialogDescription>
              {correcting?.employeeName} — {correcting && toRuDate(correcting.date)}
              {correcting && correcting.id <= 0 && (
                <span className="block mt-1 text-amber-600">
                  Сотрудник ещё не отмечался — отметьте за него приход или уход.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Тип */}
            <div className="flex flex-wrap gap-2">
              {([
                // ±Минуты и «отпросился и ушёл» — только для существующей записи
                ...(correcting && correcting.id > 0
                  ? [
                      { key: "minutes", label: "±Минуты", icon: Pencil, color: "blue" },
                    ] as const
                  : []),
                { key: "manual_in", label: "Check-In", icon: LogIn, color: "emerald" },
                { key: "manual_out", label: "Check-Out", icon: LogOut, color: "red" },
                ...(correcting && correcting.id > 0
                  ? [{ key: "excused_left", label: "Отпросился, ушёл", icon: ShieldCheck, color: "amber" }] as const
                  : [{ key: "excused_absent", label: "Отпросился, не пришёл", icon: ShieldCheck, color: "amber" }] as const),
              ] as const).map(({ key, label, icon: Icon, color }) => (
                <button
                  key={key}
                  onClick={() => setCorrType(key)}
                  className={`flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs sm:text-sm font-medium transition-colors ${
                    corrType === key
                      ? color === "blue" ? "bg-blue-500 border-blue-500 text-white"
                        : color === "emerald" ? "bg-emerald-500 border-emerald-500 text-white"
                        : color === "red" ? "bg-red-500 border-red-500 text-white"
                        : color === "amber" ? "bg-amber-500 border-amber-500 text-white"
                        : "bg-purple-500 border-purple-500 text-white"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              ))}
            </div>

            {/* Поля по типу */}
            {corrType === "minutes" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700">
                    <span className="font-semibold">−минуты</span> — уже работал до прихода в офис (был на объекте)
                  </div>
                  <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-yellow-700">
                    <span className="font-semibold">+минуты</span> — вышел по делам / отпросился (строка станет жёлтой)
                  </div>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="outline" size="icon"
                    className="h-12 w-12 rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-lg font-bold"
                    onClick={() => setCorrMinutes((v) => v - 30)}>−</Button>
                  <div className={`flex items-center justify-center h-12 min-w-[100px] rounded-xl border-2 px-4 text-xl font-bold tabular-nums ${
                    corrMinutes > 0 ? "border-yellow-300 bg-yellow-50 text-yellow-700"
                      : corrMinutes < 0 ? "border-red-300 bg-red-50 text-red-700"
                      : "border-gray-200 bg-gray-50 text-gray-500"
                  }`}>
                    {corrMinutes > 0 ? "+" : ""}{corrMinutes}
                  </div>
                  <Button variant="outline" size="icon"
                    className="h-12 w-12 rounded-xl border-emerald-200 text-emerald-600 hover:bg-emerald-50 text-lg font-bold"
                    onClick={() => setCorrMinutes((v) => v + 30)}>+</Button>
                </div>
                <div className="text-center text-sm text-muted-foreground">
                  Итого: <span className="font-semibold text-foreground">
                    {correcting ? formatMinutesToHours(correcting.totalMinutes + Math.abs(corrMinutes)) : ""}
                  </span>
                  {corrMinutes !== 0 && (
                    <span className="ml-1 text-xs text-emerald-600">(+{Math.abs(corrMinutes)} мин.)</span>
                  )}
                </div>
              </div>
            )}

            {(corrType === "manual_in" || corrType === "manual_out" || corrType === "excused_left") && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {corrType === "manual_in" ? "Время прихода" : "Время ухода"}
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={23}
                    value={corrTime.split(":")[0]}
                    onChange={(e) => {
                      const h = String(Math.min(23, Math.max(0, parseInt(e.target.value) || 0))).padStart(2, "0")
                      setCorrTime(`${h}:${corrTime.split(":")[1]}`)
                    }}
                    className="w-16 h-10 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <span className="text-lg font-bold">:</span>
                  <input
                    type="number" min={0} max={59}
                    value={corrTime.split(":")[1]}
                    onChange={(e) => {
                      const m = String(Math.min(59, Math.max(0, parseInt(e.target.value) || 0))).padStart(2, "0")
                      setCorrTime(`${corrTime.split(":")[0]}:${m}`)
                    }}
                    className="w-16 h-10 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            )}

            {/* Срок (не для «отпросился») */}
            {corrType !== "excused_left" && corrType !== "excused_absent" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Срок — ожидается в офисе до (необязательно)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={23}
                  value={corrDeadline ? corrDeadline.split(":")[0] : ""}
                  placeholder="ЧЧ"
                  onChange={(e) => {
                    const h = String(Math.min(23, Math.max(0, parseInt(e.target.value) || 0))).padStart(2, "0")
                    setCorrDeadline(`${h}:${corrDeadline ? corrDeadline.split(":")[1] : "00"}`)
                  }}
                  className="w-16 h-10 rounded-xl border border-amber-200 bg-white px-2 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
                <span className="text-lg font-bold">:</span>
                <input
                  type="number" min={0} max={59}
                  value={corrDeadline ? corrDeadline.split(":")[1] : ""}
                  placeholder="ММ"
                  onChange={(e) => {
                    const m = String(Math.min(59, Math.max(0, parseInt(e.target.value) || 0))).padStart(2, "0")
                    setCorrDeadline(`${corrDeadline ? corrDeadline.split(":")[0] : "00"}:${m}`)
                  }}
                  className="w-16 h-10 rounded-xl border border-amber-200 bg-white px-2 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
                {corrDeadline && (
                  <button onClick={() => setCorrDeadline("")} className="text-xs text-muted-foreground hover:text-red-500 ml-1">✕ убрать</button>
                )}
              </div>
            </div>
            )}

            {/* Комментарий */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {corrType === "excused_left" || corrType === "excused_absent" ? "Причина" : "Комментарий"}
                {corrType === "manual_in" || corrType === "manual_out" ? " (необязательно)" : " *"}
              </Label>
              <textarea
                value={corrNote}
                onChange={(e) => setCorrNote(e.target.value)}
                placeholder={corrType === "manual_in" || corrType === "manual_out"
                  ? "Например: задерживается, позвонил в 9:00..."
                  : "Укажите причину корректировки..."}
                rows={2}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCorrecting(null)} className="rounded-xl">Отмена</Button>
              <Button
                onClick={handleCorrect}
                disabled={corrSaving
                  || (corrType === "minutes" && corrMinutes === 0)
                  || (corrType !== "manual_in" && corrType !== "manual_out" && !corrNote.trim())}
                className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
              >
                {corrSaving
                  ? <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Selfie Popup */}
      {selfieDialog && (() => {
        const ev = selfieDialog.events[selfieDialog.idx]
        const isIn = ev.direction === "IN"
        const isMobile = ev.source === "QR_CHECKIN" || ev.deviceName?.includes("Мобильный")
        const camName = isMobile ? "Телефон" : ev.deviceName ? ev.deviceName.replace(/_/g, " ") : "Камера"
        const dt = new Date(ev.timestamp)
        const dateStr = dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })
        const timeStr = dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => { setSelfieDialog(null); setSelfieUrl(null) }}
          >
            <div
              className="relative bg-white rounded-2xl shadow-2xl max-w-xs w-full mx-4 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-violet-500" />
                  <span className="text-sm font-semibold">Фото чекина</span>
                  {selfieDialog.events.length > 1 && (
                    <span className="text-xs text-muted-foreground bg-gray-200 rounded-full px-2 py-0.5">
                      {selfieDialog.idx + 1} / {selfieDialog.events.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setSelfieDialog(null); setSelfieUrl(null) }}
                  className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Photo */}
              <div className="relative aspect-[3/4] bg-gray-100 flex items-center justify-center">
                {selfieLoading ? (
                  <div className="h-8 w-8 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
                ) : selfieUrl ? (
                  <img src={selfieUrl} alt="Фото чекина" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Camera className="h-10 w-10 text-gray-300" />
                    <span className="text-sm">Фото недоступно</span>
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="px-4 py-3 border-t space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${isIn ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    {isIn ? "▲ Вход" : "▼ Выход"}
                  </span>
                  <span className="text-xs text-muted-foreground">{isMobile ? "📱" : "🖥"} {camName}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{timeStr}</span>
                  {" — "}{dateStr}
                </div>
                {ev.note && (
                  <div className="flex items-start gap-1.5 text-xs text-emerald-700 pt-1 border-t mt-1.5">
                    <span className="flex-shrink-0 mt-0.5">📍</span>
                    <span className="font-medium break-words">{ev.note}</span>
                  </div>
                )}
              </div>

              {/* Navigation */}
              {selfieDialog.events.length > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 border-t bg-gray-50">
                  <button
                    onClick={() => navigateSelfie(-1)}
                    disabled={selfieDialog.idx === 0}
                    className="h-8 w-8 flex items-center justify-center rounded-full border hover:bg-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs text-muted-foreground">листать фото</span>
                  <button
                    onClick={() => navigateSelfie(1)}
                    disabled={selfieDialog.idx === selfieDialog.events.length - 1}
                    className="h-8 w-8 flex items-center justify-center rounded-full border hover:bg-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Range Report Dialog */}
      <Dialog open={rangeOpen} onOpenChange={setRangeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-purple-600" />
              Отчёт за период
            </DialogTitle>
            <DialogDescription>
              Скачать Excel-отчёт с входами/выходами за каждый день
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rangeFrom" className="text-sm font-medium">
                  С даты
                </Label>
                <RuDateInput
                  id="rangeFrom"
                  value={rangeFrom}
                  max={rangeTo || undefined}
                  onChange={setRangeFrom}
                  inputClassName="border-purple-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rangeTo" className="text-sm font-medium">
                  По дату
                </Label>
                <RuDateInput
                  id="rangeTo"
                  value={rangeTo}
                  min={rangeFrom || undefined}
                  onChange={setRangeTo}
                  inputClassName="border-purple-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
            </div>

            <div className="rounded-xl bg-purple-50 border border-purple-200 p-4 text-sm text-purple-700">
              Отчёт содержит: ФИО, вход/выход за каждый день, общее количество часов (без обеда), опоздания, пропуски и переработку. Цветная подсветка отклонений.
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRangeOpen(false)} className="rounded-xl">
                Отмена
              </Button>
              <Button
                onClick={exportRangeExcel}
                disabled={!rangeFrom || !rangeTo || rangeLoading}
                className="rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600 shadow-lg shadow-purple-500/25"
              >
                {rangeLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Формирование...
                  </div>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Скачать Excel
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
