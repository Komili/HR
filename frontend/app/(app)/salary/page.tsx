"use client"

import * as React from "react"
import * as XLSX from "xlsx"
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
  getSalaries,
  calculateSalaries,
  updateSalary,
} from "@/lib/hrms-api"
import { useAuth } from "@/app/contexts/AuthContext"
import type { SalaryRecord } from "@/lib/types"
import {
  Banknote,
  Calculator,
  Download,
  Search,
  Pencil,
  CheckCircle2,
  Users,
  TrendingUp,
  Wallet,
  CalendarDays,
} from "lucide-react"

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

function formatMinutesToHours(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}ч ${m}м`
}

export default function SalaryPage() {
  const { user, currentCompanyName } = useAuth()
  const canEdit = user && (user.isHoldingAdmin || user.role === "Кадровик" || user.role === "Руководитель")

  const now = new Date()
  const [month, setMonth] = React.useState(now.getMonth() + 1)
  const [year, setYear] = React.useState(now.getFullYear())
  const [data, setData] = React.useState<SalaryRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [calculating, setCalculating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null)
  const [tableSearch, setTableSearch] = React.useState("")

  // Edit dialog
  const [editing, setEditing] = React.useState<SalaryRecord | null>(null)
  const [editBonus, setEditBonus] = React.useState(0)
  const [editDeduction, setEditDeduction] = React.useState(0)
  const [editNote, setEditNote] = React.useState("")
  const [editSaving, setEditSaving] = React.useState(false)

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  const loadData = React.useCallback(() => {
    setError(null)
    setLoading(true)
    getSalaries(month, year)
      .then(setData)
      .catch((err) => {
        setData([])
        setError(err instanceof Error ? err.message : "Ошибка загрузки")
      })
      .finally(() => setLoading(false))
  }, [month, year])

  React.useEffect(() => { loadData() }, [loadData])

  const filteredData = React.useMemo(() => {
    if (!tableSearch.trim()) return data
    const q = tableSearch.toLowerCase()
    return data.filter((d) => {
      const name = d.employee ? `${d.employee.lastName} ${d.employee.firstName} ${d.employee.patronymic || ""}`.toLowerCase() : ""
      const dept = d.employee?.department?.name?.toLowerCase() || ""
      return name.includes(q) || dept.includes(q)
    })
  }, [data, tableSearch])

  // Stats
  const totalPayroll = filteredData.reduce((s, d) => s + d.totalAmount, 0)
  const totalBonus = filteredData.reduce((s, d) => s + d.bonus, 0)
  const totalDeduction = filteredData.reduce((s, d) => s + d.deduction, 0)
  const avgSalary = filteredData.length > 0 ? totalPayroll / filteredData.length : 0

  const handleCalculate = async () => {
    setCalculating(true)
    setError(null)
    try {
      const result = await calculateSalaries(month, year)
      showSuccess(`Рассчитано для ${result.calculated} сотрудников`)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка расчёта")
    } finally {
      setCalculating(false)
    }
  }

  const openEdit = (record: SalaryRecord) => {
    setEditing(record)
    setEditBonus(record.bonus)
    setEditDeduction(record.deduction)
    setEditNote(record.note || "")
  }

  const handleEdit = async () => {
    if (!editing) return
    setEditSaving(true)
    try {
      await updateSalary(editing.id, { bonus: editBonus, deduction: editDeduction, note: editNote })
      setEditing(null)
      showSuccess("Запись обновлена")
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setEditSaving(false)
    }
  }

  const exportExcel = () => {
    const title = `Зарплатная ведомость — ${MONTHS[month - 1]} ${year}`
    const company = currentCompanyName || "Все компании"
    const exportTime = new Date().toLocaleString("ru-RU")

    const summaryRows: (string | number)[][] = [
      [title],
      [`Компания: ${company}`, "", "", `Дата экспорта: ${exportTime}`],
      [],
      [`Сотрудников: ${data.length}`, `Фонд ЗП: ${formatCurrency(totalPayroll)}`, `Премии: ${formatCurrency(totalBonus)}`, `Удержания: ${formatCurrency(totalDeduction)}`],
      [],
    ]

    const headers = ["№", "ФИО", "Отдел", "Должность", "Оклад", "Раб. дней", "Всего дней", "Отработано", "Премия", "Удержание", "К выплате", "Примечание"]
    const rows = data.map((r, i) => {
      const emp = r.employee
      const name = emp ? `${emp.lastName} ${emp.firstName} ${emp.patronymic || ""}`.trim() : `ID ${r.employeeId}`
      return [
        i + 1,
        name,
        emp?.department?.name || "",
        emp?.position?.name || "",
        r.baseSalary,
        r.workedDays,
        r.totalDays,
        formatMinutesToHours(r.workedHours),
        r.bonus,
        r.deduction,
        r.totalAmount,
        r.note || "",
      ]
    })

    const totalsRow = ["", "ИТОГО", "", "", "", "", "", "", totalBonus, totalDeduction, totalPayroll, ""]

    const wsData = [...summaryRows, headers, ...rows, [], totalsRow]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws["!cols"] = [
      { wch: 5 }, { wch: 30 }, { wch: 20 }, { wch: 22 }, { wch: 12 },
      { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 20 },
    ]
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Зарплата")
    XLSX.writeFile(wb, `Зарплата_${MONTHS[month - 1]}_${year}.xlsx`)
  }

  const quickStats = [
    { label: "Сотрудников", value: filteredData.length, icon: Users, color: "text-blue-600", bg: "bg-blue-100" },
    { label: "Фонд ЗП", value: formatCurrency(totalPayroll), icon: Wallet, color: "text-emerald-600", bg: "bg-emerald-100" },
    { label: "Средняя ЗП", value: formatCurrency(avgSalary), icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-100" },
    { label: "Премии", value: formatCurrency(totalBonus), icon: Banknote, color: "text-amber-600", bg: "bg-amber-100" },
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      {successMessage && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-600 px-4 py-3 sm:px-5 sm:py-4 text-white shadow-2xl shadow-emerald-500/30">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-white/20">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <span className="font-medium text-sm sm:text-base">{successMessage}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 shadow-lg shadow-green-500/25">
              <Banknote className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Зарплата</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Расчёт и ведомость заработной платы</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {canEdit && (
            <Button
              onClick={handleCalculate}
              disabled={calculating}
              size="sm"
              className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-500/25 text-xs sm:text-sm"
            >
              {calculating ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span className="hidden sm:inline">Расчёт...</span>
                </div>
              ) : (
                <>
                  <Calculator className="mr-1 sm:mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Рассчитать зарплату</span>
                  <span className="sm:hidden">Рассчитать</span>
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={exportExcel}
            className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl border-green-200 text-green-600 hover:bg-green-50 text-xs sm:text-sm"
          >
            <Download className="mr-1 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Скачать Excel</span>
            <span className="sm:hidden">Excel</span>
          </Button>
        </div>
      </div>

      {/* Period selector + Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium whitespace-nowrap">
            <CalendarDays className="inline h-4 w-4 mr-1 -mt-0.5" />
            Период:
          </Label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="h-10 rounded-xl border border-green-200 bg-background px-3 text-sm focus:border-green-400 focus:ring-2 focus:ring-green-500/20"
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2020}
            max={2030}
            className="h-10 w-24 rounded-xl border-green-200 focus:border-green-400 focus:ring-2 focus:ring-green-500/20"
          />
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по ФИО..."
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            className="pl-10 h-10 rounded-xl bg-white/80 border-green-100 focus:border-green-300 focus:ring-2 focus:ring-green-500/20"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 sm:gap-4 sm:grid-cols-4">
        {quickStats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-3 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm"
          >
            <div className={`flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl ${stat.bg}`}>
              <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`} />
            </div>
            <div className="min-w-0">
              <div className="text-base sm:text-xl font-bold truncate">{stat.value}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden">
        {error && (
          <div className="mx-5 mt-4 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>
        )}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="h-5 w-5 rounded-full border-2 border-green-500/30 border-t-green-500 animate-spin" />
                <span>Загрузка...</span>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-green-100/50 bg-white/50">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-green-50/80 to-emerald-50/80 border-b border-green-100/50">
                    <th className="text-green-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left">№</th>
                    <th className="text-green-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left">ФИО</th>
                    <th className="text-green-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left hidden lg:table-cell">Отдел</th>
                    <th className="text-green-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-right hidden md:table-cell">Оклад</th>
                    <th className="text-green-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-center hidden md:table-cell">Дней</th>
                    <th className="text-green-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-right hidden lg:table-cell">Премия</th>
                    <th className="text-green-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-right hidden lg:table-cell">Удержание</th>
                    <th className="text-green-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-right">К выплате</th>
                    <th className="text-green-700 text-xs font-semibold uppercase tracking-wider py-4 px-4 text-left"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center">
                        <div className="flex flex-col items-center text-muted-foreground">
                          <Banknote className="h-12 w-12 text-gray-300 mb-3" />
                          <span className="text-sm">
                            {data.length === 0 ? "Нажмите «Рассчитать зарплату» для формирования ведомости" : "Ничего не найдено"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((row, index) => {
                      const emp = row.employee
                      const name = emp ? `${emp.lastName} ${emp.firstName} ${emp.patronymic || ""}`.trim() : `ID ${row.employeeId}`
                      return (
                        <tr key={row.id} className="group border-b border-green-50 hover:bg-green-50/50 transition-colors">
                          <td className="py-3 px-4 text-sm text-muted-foreground">{index + 1}</td>
                          <td className="py-3 px-4">
                            <a href={`/employees/${row.employeeId}`} className="font-medium text-foreground hover:text-green-600 hover:underline transition-colors">
                              {name}
                            </a>
                            {emp?.position?.name && (
                              <div className="text-xs text-muted-foreground mt-0.5 lg:hidden">{emp.position.name}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground hidden lg:table-cell">{emp?.department?.name || "—"}</td>
                          <td className="py-3 px-4 text-sm text-right tabular-nums hidden md:table-cell">{formatCurrency(row.baseSalary)}</td>
                          <td className="py-3 px-4 text-sm text-center hidden md:table-cell">
                            <span className="font-medium">{row.workedDays}</span>
                            <span className="text-muted-foreground">/{row.totalDays}</span>
                          </td>
                          <td className="py-3 px-4 text-sm text-right tabular-nums hidden lg:table-cell">
                            {row.bonus > 0 ? <span className="text-emerald-600">+{formatCurrency(row.bonus)}</span> : "—"}
                          </td>
                          <td className="py-3 px-4 text-sm text-right tabular-nums hidden lg:table-cell">
                            {row.deduction > 0 ? <span className="text-red-500">-{formatCurrency(row.deduction)}</span> : "—"}
                          </td>
                          <td className="py-3 px-4 text-sm text-right font-bold tabular-nums text-green-700">
                            {formatCurrency(row.totalAmount)}
                          </td>
                          <td className="py-3 px-4">
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-green-50"
                                onClick={() => openEdit(row)}
                                title="Редактировать"
                              >
                                <Pencil className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                  {filteredData.length > 0 && (
                    <tr className="bg-green-50/80 font-bold">
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4 text-sm">ИТОГО</td>
                      <td className="py-3 px-4 hidden lg:table-cell"></td>
                      <td className="py-3 px-4 hidden md:table-cell"></td>
                      <td className="py-3 px-4 hidden md:table-cell"></td>
                      <td className="py-3 px-4 text-sm text-right tabular-nums hidden lg:table-cell text-emerald-600">
                        {totalBonus > 0 ? `+${formatCurrency(totalBonus)}` : "—"}
                      </td>
                      <td className="py-3 px-4 text-sm text-right tabular-nums hidden lg:table-cell text-red-500">
                        {totalDeduction > 0 ? `-${formatCurrency(totalDeduction)}` : "—"}
                      </td>
                      <td className="py-3 px-4 text-sm text-right tabular-nums text-green-700">
                        {formatCurrency(totalPayroll)}
                      </td>
                      <td className="py-3 px-4"></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-green-600" />
              Редактировать начисление
            </DialogTitle>
            <DialogDescription>
              {editing?.employee && `${editing.employee.lastName} ${editing.employee.firstName}`} — {MONTHS[(editing?.month || 1) - 1]} {editing?.year}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="rounded-xl bg-green-50 border border-green-200 p-4 space-y-1">
              <div className="text-sm text-green-700">
                Оклад: <span className="font-bold">{editing ? formatCurrency(editing.baseSalary) : ""}</span>
              </div>
              <div className="text-sm text-green-700">
                Отработано дней: <span className="font-bold">{editing?.workedDays}/{editing?.totalDays}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editBonus" className="text-sm font-medium">Премия</Label>
                <Input
                  id="editBonus"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editBonus}
                  onChange={(e) => setEditBonus(Number(e.target.value))}
                  className="h-10 rounded-xl border-green-200 focus:border-green-400"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDeduction" className="text-sm font-medium">Удержание</Label>
                <Input
                  id="editDeduction"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editDeduction}
                  onChange={(e) => setEditDeduction(Number(e.target.value))}
                  className="h-10 rounded-xl border-red-200 focus:border-red-400"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="editNote" className="text-sm font-medium">Примечание</Label>
              <textarea
                id="editNote"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Причина премии/удержания..."
                rows={2}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-300"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditing(null)} className="rounded-xl">Отмена</Button>
              <Button
                onClick={handleEdit}
                disabled={editSaving}
                className="rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
              >
                {editSaving ? (
                  <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  "Сохранить"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
