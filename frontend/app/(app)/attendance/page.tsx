"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import { ColumnDef } from "@tanstack/react-table"
import type { AttendanceSummary, Employee, Office } from "@/lib/types"
import { DataTable } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  getEmployees,
  getOffices,
  getCompany,
  getAttendanceSelfieUrl,
} from "@/lib/hrms-api"
import { useAuth } from "@/app/contexts/AuthContext"
import {
  Clock,
  UserCheck,
  UserX,
  UserMinus,
  ShieldCheck,
  Download,
  Plus,
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

export default function AttendancePage() {
  const { user, token, currentCompanyName } = useAuth()
  const canCorrect = user && (user.isHoldingAdmin || user.role === "Кадровик" || user.role === "Руководитель")
  const canRegister = user && (user.isHoldingAdmin || user.role === "Кадровик")

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
  const [corrType, setCorrType] = React.useState<"minutes" | "manual_in" | "manual_out" | "remote">("minutes")
  const [corrMinutes, setCorrMinutes] = React.useState(0)
  const [corrTime, setCorrTime] = React.useState("09:00")
  const [corrDeadline, setCorrDeadline] = React.useState("")
  const [corrNote, setCorrNote] = React.useState("")
  const [corrSaving, setCorrSaving] = React.useState(false)

  // Register event extra fields
  const [regNote, setRegNote] = React.useState("")
  const [regDeadline, setRegDeadline] = React.useState("")

  // Register event dialog
  const [registerOpen, setRegisterOpen] = React.useState(false)
  const [employees, setEmployees] = React.useState<Employee[]>([])
  const [offices, setOffices] = React.useState<Office[]>([])
  const [regEmployeeId, setRegEmployeeId] = React.useState<number | "">("")
  const [regDirection, setRegDirection] = React.useState<"IN" | "OUT">("IN")
  const [regOfficeId, setRegOfficeId] = React.useState<number | "">("")
  const [regSaving, setRegSaving] = React.useState(false)
  const [empSearch, setEmpSearch] = React.useState("")

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
    setCorrType("minutes")
    setCorrMinutes(0)
    setCorrTime(`${hh}:${mm}`)
    setCorrDeadline("")
    setCorrNote("")
  }

  const handleCorrect = async () => {
    if (!correcting || !corrNote.trim()) return
    if (corrType === "minutes" && corrMinutes === 0) return
    if ((corrType === "manual_in" || corrType === "manual_out") && !corrTime) return
    setCorrSaving(true)
    try {
      await correctAttendance(correcting.id, {
        type: corrType,
        correctionMinutes: corrType === "minutes" ? corrMinutes : undefined,
        time: (corrType === "manual_in" || corrType === "manual_out") ? corrTime : undefined,
        note: corrNote,
        deadline: corrDeadline || undefined,
      })
      setCorrecting(null)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка корректировки")
    } finally {
      setCorrSaving(false)
    }
  }

  // Register event handlers
  const openRegister = async () => {
    setRegisterOpen(true)
    setRegEmployeeId("")
    setRegDirection("IN")
    setRegOfficeId("")
    setEmpSearch("")
    setRegNote("")
    setRegDeadline("")
    try {
      const [empResult, officeResult] = await Promise.all([
        getEmployees(1, 1000, ""),
        getOffices(),
      ])
      setEmployees(empResult.data)
      setOffices(officeResult)
    } catch {
      setEmployees([])
      setOffices([])
    }
  }

  const handleRegister = async () => {
    if (!regEmployeeId) return
    setRegSaving(true)
    try {
      await registerAttendanceEvent(
        regEmployeeId as number,
        regDirection,
        regOfficeId ? (regOfficeId as number) : undefined,
        regNote || undefined,
        regDeadline || undefined,
      )
      setRegisterOpen(false)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка регистрации")
    } finally {
      setRegSaving(false)
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

    const dateFormatted = new Date(selectedDate + "T00:00:00").toLocaleDateString("ru-RU", {
      day: "2-digit", month: "long", year: "numeric",
    })
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
    XLSX.writeFile(wb, `Посещаемость_${selectedDate}.xlsx`)
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

      const rangeData = await getAttendanceRange(rangeFrom, rangeTo)

      // Collect all unique dates sorted
      const datesSet = new Set<string>()
      rangeData.forEach((r) => datesSet.add(r.date))
      const dates = Array.from(datesSet).sort()

      // Group by employee
      const employeeMap = new Map<number, {
        name: string
        department: string
        days: Map<string, { entry: string | null; exit: string | null; minutes: number }>
        lateDays: number
        lateMinutes: number
        absentCount: number
      }>()

      rangeData.forEach((r) => {
        if (!employeeMap.has(r.employeeId)) {
          employeeMap.set(r.employeeId, {
            name: r.employeeName,
            department: r.departmentName || "",
            days: new Map(),
            lateDays: 0,
            lateMinutes: 0,
            absentCount: 0,
          })
        }
        const emp = employeeMap.get(r.employeeId)!
        emp.days.set(r.date, { entry: r.firstEntry, exit: r.lastExit, minutes: r.totalMinutes })
        if (r.isLate && r.firstEntry) {
          const entryDate = new Date(r.firstEntry)
          const entryMins = entryDate.getHours() * 60 + entryDate.getMinutes()
          const lateMin = Math.max(0, entryMins - workStartMins)
          emp.lateDays++
          emp.lateMinutes += lateMin
        }
        if (r.status === "absent") emp.absentCount++
      })

      // Map preserves insertion order — server data already sorted by sortOrder
      const employees = Array.from(employeeMap.entries())

      // Format dates for headers
      const dateHeaders = dates.map((d) => {
        const dt = new Date(d + "T00:00:00")
        return dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
      })

      const fromFormatted = new Date(rangeFrom + "T00:00:00").toLocaleDateString("ru-RU")
      const toFormatted = new Date(rangeTo + "T00:00:00").toLocaleDateString("ru-RU")
      const exportTime = new Date().toLocaleString("ru-RU", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      })
      const companyLabel = currentCompanyName || "Все компании"

      // Title + meta
      const titleRow = [`Отчёт посещаемости за период ${fromFormatted} — ${toFormatted}`]
      const metaRow: string[] = [`Компания: ${companyLabel}`, "", "", `Дата экспорта: ${exportTime}`]
      const scheduleRow: string[] = [`Рабочий день: ${workDayStart}–${workDayEnd}  |  Обед: ${lunchBreakStart}–${lunchBreakEnd}`]

      // Headers: №, ФИО, [date Вход, date Выход] ..., Всего часов, Опозданий, Пропусков
      const headerRow1 = ["№", "ФИО"]
      const headerRow2 = ["", ""]
      dates.forEach((_, i) => {
        headerRow1.push(dateHeaders[i], "")
        headerRow2.push("Вход", "Выход")
      })
      headerRow1.push("Всего", "Опозданий", "Пропусков")
      headerRow2.push("часов", "(дней/время)", "дней")

      // Accumulators
      let grandTotalMinutes = 0
      let grandTotalLateDays = 0
      let grandTotalLateMinutes = 0
      let grandTotalAbsent = 0

      const fmtLate = (days: number, mins: number): string => {
        if (days === 0) return ""
        const h = Math.floor(mins / 60)
        const m = mins % 60
        const timeStr = h > 0 ? (m > 0 ? `${h}ч ${m}м` : `${h}ч`) : `${m}м`
        return `${days} дн. (${timeStr})`
      }

      // Data rows
      const dataRows = employees.map(([, emp], idx) => {
        const row: (string | number)[] = [idx + 1, emp.name]
        let totalMin = 0
        dates.forEach((date) => {
          const day = emp.days.get(date)
          if (day) {
            row.push(
              day.entry ? formatTime(day.entry) : "—",
              day.exit ? formatTime(day.exit) : "—",
            )
            totalMin += day.minutes
          } else {
            row.push("—", "—")
          }
        })
        const h = Math.floor(totalMin / 60)
        const m = totalMin % 60
        row.push(`${h}ч ${m}м`, fmtLate(emp.lateDays, emp.lateMinutes), emp.absentCount)
        grandTotalMinutes += totalMin
        grandTotalLateDays += emp.lateDays
        grandTotalLateMinutes += emp.lateMinutes
        grandTotalAbsent += emp.absentCount
        return row
      })

      // Totals row
      const gH = Math.floor(grandTotalMinutes / 60)
      const gM = grandTotalMinutes % 60
      const totalsRow: (string | number)[] = ["", "ИТОГО:"]
      dates.forEach(() => totalsRow.push("", ""))
      totalsRow.push(`${gH}ч ${gM}м`, fmtLate(grandTotalLateDays, grandTotalLateMinutes), grandTotalAbsent)

      // Build worksheet
      const wsData = [titleRow, metaRow, scheduleRow, [], headerRow1, headerRow2, ...dataRows, [], totalsRow]
      const ws = XLSX.utils.aoa_to_sheet(wsData)

      // Column widths
      const cols: { wch: number }[] = [
        { wch: 5 },   // №
        { wch: 30 },  // ФИО
      ]
      dates.forEach(() => cols.push({ wch: 8 }, { wch: 8 })) // Вход, Выход
      cols.push({ wch: 12 }, { wch: 12 }, { wch: 12 }) // Всего, Опозданий, Пропусков
      ws["!cols"] = cols

      // Merge rows
      const totalCols = 2 + dates.length * 2 + 3
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }, // title
        { s: { r: 2, c: 0 }, e: { r: 2, c: totalCols - 1 } }, // schedule
      ]

      // Merge date headers (row 4 = headerRow1, offset by 3 metaRows + 1 empty)
      dates.forEach((_, i) => {
        const colStart = 2 + i * 2
        ws["!merges"]!.push({ s: { r: 4, c: colStart }, e: { r: 4, c: colStart + 1 } })
      })

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Отчёт за период")
      XLSX.writeFile(wb, `Посещаемость_${rangeFrom}_${rangeTo}.xlsx`)
      setRangeOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки данных за период")
    } finally {
      setRangeLoading(false)
    }
  }

  const filteredEmployees = employees.filter((emp) => {
    if (!empSearch) return true
    const q = empSearch.toLowerCase()
    const fullName = `${emp.lastName} ${emp.firstName} ${emp.patronymic || ""}`.toLowerCase()
    return fullName.includes(q)
  })

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
          {canRegister && (
            <Button
              onClick={openRegister}
              size="sm"
              className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-lg shadow-blue-500/25 text-xs sm:text-sm"
            >
              <Plus className="mr-1 sm:mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Отметить приход/уход</span>
              <span className="sm:hidden">Отметить</span>
            </Button>
          )}
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
            <Input
              id="date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-10 w-36 sm:w-44 rounded-xl border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
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
                              {canCorrect && row.id > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-50"
                                  onClick={() => openCorrection(row)}
                                  title="Корректировка"
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

      {/* Correction Dialog */}
      <Dialog open={!!correcting} onOpenChange={() => setCorrecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              Корректировка
            </DialogTitle>
            <DialogDescription>
              {correcting?.employeeName} — {correcting?.date}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Тип */}
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: "minutes", label: "±Минуты", icon: Pencil, color: "blue" },
                { key: "manual_in", label: "Check-In", icon: LogIn, color: "emerald" },
                { key: "manual_out", label: "Check-Out", icon: LogOut, color: "red" },
              ] as const).map(({ key, label, icon: Icon, color }) => (
                <button
                  key={key}
                  onClick={() => setCorrType(key)}
                  className={`flex items-center gap-2 h-10 px-3 rounded-xl border text-sm font-medium transition-colors ${
                    corrType === key
                      ? color === "blue" ? "bg-blue-500 border-blue-500 text-white"
                        : color === "emerald" ? "bg-emerald-500 border-emerald-500 text-white"
                        : color === "red" ? "bg-red-500 border-red-500 text-white"
                        : "bg-purple-500 border-purple-500 text-white"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
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

            {(corrType === "manual_in" || corrType === "manual_out") && (
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

            {/* Срок */}
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

            {/* Комментарий */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Комментарий *</Label>
              <textarea
                value={corrNote}
                onChange={(e) => setCorrNote(e.target.value)}
                placeholder="Укажите причину корректировки..."
                rows={2}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCorrecting(null)} className="rounded-xl">Отмена</Button>
              <Button
                onClick={handleCorrect}
                disabled={!corrNote.trim() || (corrType === "minutes" && corrMinutes === 0) || corrSaving}
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

      {/* Register Event Dialog */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Отметить приход/уход
            </DialogTitle>
            <DialogDescription>
              Зарегистрировать вход или выход сотрудника
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-y-auto">
            {/* Direction */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Направление:</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={regDirection === "IN" ? "default" : "outline"}
                  className={`h-12 rounded-xl ${
                    regDirection === "IN"
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                      : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  }`}
                  onClick={() => setRegDirection("IN")}
                >
                  <LogIn className="mr-2 h-5 w-5" />
                  Вход
                </Button>
                <Button
                  variant={regDirection === "OUT" ? "default" : "outline"}
                  className={`h-12 rounded-xl ${
                    regDirection === "OUT"
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "border-red-200 text-red-700 hover:bg-red-50"
                  }`}
                  onClick={() => setRegDirection("OUT")}
                >
                  <LogOut className="mr-2 h-5 w-5" />
                  Выход
                </Button>
              </div>
            </div>

            {/* Employee search */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Сотрудник *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Поиск по ФИО..."
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200">
                {filteredEmployees.length === 0 ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">Нет сотрудников</div>
                ) : (
                  filteredEmployees.slice(0, 50).map((emp) => {
                    const fullName = `${emp.lastName} ${emp.firstName} ${emp.patronymic || ""}`.trim()
                    const isSelected = regEmployeeId === emp.id
                    return (
                      <button
                        key={emp.id}
                        onClick={() => setRegEmployeeId(emp.id)}
                        className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-100 last:border-0 transition-colors ${
                          isSelected
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        {fullName}
                        {emp.department?.name && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            — {emp.department.name}
                          </span>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            {/* Office */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Офис</Label>
              <select
                value={regOfficeId}
                onChange={(e) => setRegOfficeId(e.target.value ? Number(e.target.value) : "")}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">Не указан</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}{o.address ? ` — ${o.address}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Комментарий */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Комментарий (необязательно)</Label>
              <textarea
                value={regNote}
                onChange={(e) => setRegNote(e.target.value)}
                placeholder="Например: работает на объекте, позвонил в 9:00..."
                rows={2}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Срок */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Ожидается в офисе до (необязательно)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={23}
                  value={regDeadline ? regDeadline.split(":")[0] : ""}
                  placeholder="ЧЧ"
                  onChange={(e) => {
                    const h = String(Math.min(23, Math.max(0, parseInt(e.target.value) || 0))).padStart(2, "0")
                    setRegDeadline(`${h}:${regDeadline ? regDeadline.split(":")[1] : "00"}`)
                  }}
                  className="w-16 h-10 rounded-xl border border-amber-200 bg-white px-2 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
                <span className="text-lg font-bold">:</span>
                <input
                  type="number" min={0} max={59}
                  value={regDeadline ? regDeadline.split(":")[1] : ""}
                  placeholder="ММ"
                  onChange={(e) => {
                    const m = String(Math.min(59, Math.max(0, parseInt(e.target.value) || 0))).padStart(2, "0")
                    setRegDeadline(`${regDeadline ? regDeadline.split(":")[0] : "00"}:${m}`)
                  }}
                  className="w-16 h-10 rounded-xl border border-amber-200 bg-white px-2 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
                {regDeadline && (
                  <button onClick={() => setRegDeadline("")} className="text-xs text-muted-foreground hover:text-red-500 ml-1">✕ убрать</button>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setRegisterOpen(false)} className="rounded-xl">
              Отмена
            </Button>
            <Button
              onClick={handleRegister}
              disabled={!regEmployeeId || regSaving}
              className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
            >
              {regSaving ? (
                <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <>
                  {regDirection === "IN" ? <LogIn className="mr-2 h-4 w-4" /> : <LogOut className="mr-2 h-4 w-4" />}
                  Зарегистрировать
                </>
              )}
            </Button>
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
                <Input
                  id="rangeFrom"
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="h-10 rounded-xl border-purple-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rangeTo" className="text-sm font-medium">
                  По дату
                </Label>
                <Input
                  id="rangeTo"
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="h-10 rounded-xl border-purple-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
            </div>

            <div className="rounded-xl bg-purple-50 border border-purple-200 p-4 text-sm text-purple-700">
              Отчёт содержит: ФИО сотрудника, время входа и выхода за каждый день периода, и общее количество часов.
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
