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
  getAttendanceRange,
  correctAttendance,
  registerAttendanceEvent,
  getEmployees,
  getOffices,
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
} from "lucide-react"

function formatTime(iso: string | null) {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
}

function formatMinutesToHours(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}ч ${m}м`
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

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || "bg-gray-100 text-gray-700 border-gray-200"
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${style}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

export default function AttendancePage() {
  const { user, currentCompanyName } = useAuth()
  const canCorrect = user && (user.isHoldingAdmin || user.role === "Кадровик" || user.role === "Руководитель")
  const canRegister = user && (user.isHoldingAdmin || user.role === "Кадровик")

  const [data, setData] = React.useState<AttendanceSummary[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedDate, setSelectedDate] = React.useState(() => {
    const now = new Date()
    return now.toISOString().split("T")[0]
  })

  // Correction dialog
  const [correcting, setCorrecting] = React.useState<AttendanceSummary | null>(null)
  const [corrMinutes, setCorrMinutes] = React.useState(0)
  const [corrNote, setCorrNote] = React.useState("")
  const [corrSaving, setCorrSaving] = React.useState(false)

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

  const loadData = React.useCallback(() => {
    setError(null)
    setLoading(true)
    getAttendance(selectedDate)
      .then(setData)
      .catch((err) => {
        setData([])
        setError(err instanceof Error ? err.message : "Ошибка загрузки данных")
      })
      .finally(() => setLoading(false))
  }, [selectedDate])

  React.useEffect(() => {
    loadData()
  }, [loadData])

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

  // Correction handlers
  const openCorrection = (row: AttendanceSummary) => {
    setCorrecting(row)
    setCorrMinutes(0)
    setCorrNote("")
  }

  const handleCorrect = async () => {
    if (!correcting || corrMinutes === 0 || !corrNote.trim()) return
    setCorrSaving(true)
    try {
      await correctAttendance(correcting.id, corrMinutes, corrNote)
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
  const exportExcel = () => {
    const dateFormatted = new Date(selectedDate + "T00:00:00").toLocaleDateString("ru-RU", {
      day: "2-digit", month: "long", year: "numeric",
    })
    const exportTime = new Date().toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
    const companyLabel = currentCompanyName || "Все компании"

    // Summary row data
    const summaryRows = [
      ["Посещаемость за " + dateFormatted],
      ["Компания: " + companyLabel, "", "", "Дата экспорта: " + exportTime],
      [],
      ["На месте: " + presentCount, "Ушли: " + leftCount, "Отсутствуют: " + absentCount, "Уважит.: " + excusedCount],
      [],
    ]

    // Header
    const headers = ["№", "ФИО", "Отдел", "Должность", "Офис", "Вход", "Выход", "Часы", "Мин", "Корректировка", "Статус"]

    // Data rows
    const rows = data.map((row, i) => {
      const h = Math.floor(row.totalMinutes / 60)
      const m = row.totalMinutes % 60
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
        row.correctionMinutes !== 0 ? (row.correctionMinutes > 0 ? "+" : "") + row.correctionMinutes + " мин" : "",
        STATUS_LABELS[row.status] || row.status,
      ]
    })

    // Totals
    const totalMinutes = data.reduce((sum, d) => sum + d.totalMinutes, 0)
    const totalH = Math.floor(totalMinutes / 60)
    const totalM = totalMinutes % 60
    const presentDays = data.filter((d) => d.status === "present" || d.status === "left").length

    const totalsRow = ["", "ИТОГО", "", "", "", "", "", totalH, totalM, "", "Дней: " + presentDays]

    // Build worksheet
    const wsData = [...summaryRows, headers, ...rows, [], totalsRow]
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
      { wch: 14 },  // Корректировка
      { wch: 14 },  // Статус
    ]

    // Merge title cell
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Посещаемость")
    XLSX.writeFile(wb, `Посещаемость_${selectedDate}.xlsx`)
  }

  // Range Excel export
  const exportRangeExcel = async () => {
    setRangeLoading(true)
    try {
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
      }>()

      rangeData.forEach((r) => {
        if (!employeeMap.has(r.employeeId)) {
          employeeMap.set(r.employeeId, {
            name: r.employeeName,
            department: r.departmentName || "",
            days: new Map(),
          })
        }
        employeeMap.get(r.employeeId)!.days.set(r.date, {
          entry: r.firstEntry,
          exit: r.lastExit,
          minutes: r.totalMinutes,
        })
      })

      const employees = Array.from(employeeMap.entries()).sort((a, b) =>
        a[1].name.localeCompare(b[1].name, "ru"),
      )

      // Format dates for headers
      const dateHeaders = dates.map((d) => {
        const dt = new Date(d + "T00:00:00")
        return dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
      })

      const fromFormatted = new Date(rangeFrom + "T00:00:00").toLocaleDateString("ru-RU")
      const toFormatted = new Date(rangeTo + "T00:00:00").toLocaleDateString("ru-RU")
      const exportTime = new Date().toLocaleString("ru-RU", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      })
      const companyLabel = currentCompanyName || "Все компании"

      // Title + meta
      const titleRow = [`Отчёт посещаемости за период ${fromFormatted} — ${toFormatted}`]
      const metaRow: string[] = [`Компания: ${companyLabel}`, "", "", `Дата экспорта: ${exportTime}`]

      // Headers: №, ФИО, [date Вход, date Выход] ..., Всего часов
      const headerRow1 = ["№", "ФИО"]
      const headerRow2 = ["", ""]
      dates.forEach((_, i) => {
        headerRow1.push(dateHeaders[i], "")
        headerRow2.push("Вход", "Выход")
      })
      headerRow1.push("Всего")
      headerRow2.push("часов")

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
        row.push(`${h}ч ${m}м`)
        return row
      })

      // Build worksheet
      const wsData = [titleRow, metaRow, [], headerRow1, headerRow2, ...dataRows]
      const ws = XLSX.utils.aoa_to_sheet(wsData)

      // Column widths
      const cols: { wch: number }[] = [
        { wch: 5 },   // №
        { wch: 30 },  // ФИО
      ]
      dates.forEach(() => {
        cols.push({ wch: 8 }, { wch: 8 }) // Вход, Выход
      })
      cols.push({ wch: 12 }) // Всего часов
      ws["!cols"] = cols

      // Merge title (row 0)
      const totalCols = 2 + dates.length * 2 + 1
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
      ]

      // Merge date headers (each date spans 2 columns, row index shifted by 1 due to metaRow)
      dates.forEach((_, i) => {
        const colStart = 2 + i * 2
        ws["!merges"]!.push({
          s: { r: 3, c: colStart },
          e: { r: 3, c: colStart + 1 },
        })
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
        <span className="text-sm font-medium">
          {formatTime(row.original.firstEntry)}
        </span>
      ),
    },
    {
      accessorKey: "lastExit",
      header: "Выход",
      cell: ({ row }) => (
        <span className="text-sm font-medium">
          {formatTime(row.original.lastExit)}
        </span>
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
    { label: "На месте", value: presentCount, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-100" },
    { label: "Ушли", value: leftCount, icon: UserMinus, color: "text-red-600", bg: "bg-red-100" },
    { label: "Отсутствуют", value: absentCount, icon: UserX, color: "text-gray-600", bg: "bg-gray-100" },
    { label: "Уважит.", value: excusedCount, icon: ShieldCheck, color: "text-amber-600", bg: "bg-amber-100" },
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
          <Input
            id="date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-10 w-full sm:w-48 rounded-xl border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по ФИО..."
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            className="pl-10 h-10 rounded-xl bg-white/80 border-blue-100 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 sm:gap-4 sm:grid-cols-4">
        {quickStats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-4 rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-4 shadow-sm hover:shadow-md transition-all"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.bg}`}>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          </div>
        ))}
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
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left hidden lg:table-cell">Отдел</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left hidden lg:table-cell">Должность</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left hidden md:table-cell">Офис</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left">Вход</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left">Выход</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left hidden md:table-cell">Часов</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left hidden md:table-cell">Статус</th>
                    <th className="text-blue-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center">
                        <div className="flex flex-col items-center text-muted-foreground">
                          <Clock className="h-12 w-12 text-gray-300 mb-3" />
                          <span className="text-sm">Нет данных за выбранную дату</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((row, index) => (
                      <tr
                        key={row.id}
                        className={`group border-b border-blue-50 transition-colors ${ROW_BG[row.status] || ""}`}
                      >
                        <td className="py-3 px-4 text-sm text-muted-foreground">{index + 1}</td>
                        <td className="py-3 px-4">
                          <a
                            href={`/employees/${row.employeeId}`}
                            className="font-medium text-foreground hover:text-blue-600 hover:underline transition-colors"
                          >
                            {row.employeeName}
                          </a>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground hidden lg:table-cell">{row.departmentName || "—"}</td>
                        <td className="py-3 px-4 text-sm text-muted-foreground hidden lg:table-cell">{row.positionName || "—"}</td>
                        <td className="py-3 px-4 text-sm text-muted-foreground hidden md:table-cell">{row.officeName || "—"}</td>
                        <td className="py-3 px-4 text-sm font-medium">{formatTime(row.firstEntry)}</td>
                        <td className="py-3 px-4 text-sm font-medium">{formatTime(row.lastExit)}</td>
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
                          {canCorrect && (
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
                        </td>
                      </tr>
                    ))
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
              Корректировка времени
            </DialogTitle>
            <DialogDescription>
              {correcting?.employeeName} — {correcting?.date}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
              <div className="text-sm text-blue-700">
                Текущее время: <span className="font-bold">{correcting ? formatMinutesToHours(correcting.totalMinutes) : ""}</span>
              </div>
              {corrMinutes !== 0 && (
                <div className="mt-1 text-sm text-blue-600">
                  После корректировки:{" "}
                  <span className="font-bold">
                    {correcting ? formatMinutesToHours(Math.max(0, correcting.totalMinutes + corrMinutes)) : ""}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Корректировка (минуты):</Label>
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-lg font-bold"
                  onClick={() => setCorrMinutes((v) => v - 30)}
                >
                  −
                </Button>
                <div className={`flex items-center justify-center h-12 min-w-[100px] rounded-xl border-2 px-4 text-xl font-bold tabular-nums ${
                  corrMinutes > 0
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : corrMinutes < 0
                      ? "border-red-300 bg-red-50 text-red-700"
                      : "border-gray-200 bg-gray-50 text-gray-500"
                }`}>
                  {corrMinutes > 0 ? "+" : ""}{corrMinutes}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-xl border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 text-lg font-bold"
                  onClick={() => setCorrMinutes((v) => v + 30)}
                >
                  +
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="corrNote" className="text-sm font-medium">
                Причина *
              </Label>
              <textarea
                id="corrNote"
                value={corrNote}
                onChange={(e) => setCorrNote(e.target.value)}
                placeholder="Укажите причину корректировки..."
                rows={2}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCorrecting(null)} className="rounded-xl">
                Отмена
              </Button>
              <Button
                onClick={handleCorrect}
                disabled={corrMinutes === 0 || !corrNote.trim() || corrSaving}
                className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
              >
                {corrSaving ? (
                  <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  "Сохранить"
                )}
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
