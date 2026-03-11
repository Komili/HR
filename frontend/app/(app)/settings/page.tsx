"use client"

import * as React from "react"
import {
  Settings,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Clock,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/app/contexts/AuthContext"
import { apiFetch } from "@/lib/api"
import { getCompanies, updateCompanySchedule } from "@/lib/hrms-api"
import type { Company } from "@/lib/types"

function TimeInput({ value, onChange, id, className }: {
  value: string
  onChange: (v: string) => void
  id?: string
  className?: string
}) {
  const [h, m] = value.split(":").map(Number)

  const setHour = (newH: number) => {
    const clamped = Math.max(0, Math.min(23, newH))
    onChange(`${String(clamped).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
  }
  const setMin = (newM: number) => {
    const clamped = Math.max(0, Math.min(59, newM))
    onChange(`${String(h).padStart(2, "0")}:${String(clamped).padStart(2, "0")}`)
  }

  return (
    <div id={id} className={`flex items-center gap-1 ${className ?? ""}`}>
      <input
        type="number"
        min={0}
        max={23}
        value={String(h).padStart(2, "0")}
        onChange={(e) => setHour(parseInt(e.target.value) || 0)}
        className="w-14 h-10 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
      />
      <span className="text-lg font-semibold text-muted-foreground">:</span>
      <input
        type="number"
        min={0}
        max={59}
        value={String(m).padStart(2, "0")}
        onChange={(e) => setMin(parseInt(e.target.value) || 0)}
        className="w-14 h-10 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
      />
    </div>
  )
}

export default function SettingsPage() {
  const { user } = useAuth()
  const canEditSchedule = user && user.isHoldingAdmin

  const [currentPassword, setCurrentPassword] = React.useState("")
  const [newPassword, setNewPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [showCurrent, setShowCurrent] = React.useState(false)
  const [showNew, setShowNew] = React.useState(false)
  const [showConfirm, setShowConfirm] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [success, setSuccess] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Schedule settings
  const [allCompanies, setAllCompanies] = React.useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = React.useState<number | null>(null)
  const [company, setCompany] = React.useState<Company | null>(null)
  const [lunchStart, setLunchStart] = React.useState("12:00")
  const [lunchEnd, setLunchEnd] = React.useState("13:00")
  const [workStart, setWorkStart] = React.useState("09:00")
  const [workEnd, setWorkEnd] = React.useState("18:00")
  const [scheduleSaving, setScheduleSaving] = React.useState(false)
  const [scheduleSuccess, setScheduleSuccess] = React.useState(false)
  const [scheduleError, setScheduleError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!canEditSchedule) return
    getCompanies().then((companies) => {
      setAllCompanies(companies)
      // Попытаться взять текущую выбранную компанию из localStorage (CompanySelector)
      const storedId = typeof window !== "undefined" ? localStorage.getItem("currentCompanyId") : null
      const initialCompany = storedId
        ? companies.find((x) => x.id === parseInt(storedId, 10)) || companies[0]
        : companies[0]
      if (initialCompany) {
        setSelectedCompanyId(initialCompany.id)
      }
    })
  }, [canEditSchedule])

  React.useEffect(() => {
    if (!selectedCompanyId || allCompanies.length === 0) return
    const c = allCompanies.find((x) => x.id === selectedCompanyId) || null
    setCompany(c)
    if (c) {
      setLunchStart(c.lunchBreakStart || "12:00")
      setLunchEnd(c.lunchBreakEnd || "13:00")
      setWorkStart(c.workDayStart || "09:00")
      setWorkEnd(c.workDayEnd || "18:00")
    }
  }, [selectedCompanyId, allCompanies])

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company) return
    setScheduleError(null)
    setScheduleSuccess(false)
    setScheduleSaving(true)
    try {
      await updateCompanySchedule(company.id, {
        lunchBreakStart: lunchStart,
        lunchBreakEnd: lunchEnd,
        workDayStart: workStart,
        workDayEnd: workEnd,
      })
      setScheduleSuccess(true)
      setTimeout(() => setScheduleSuccess(false), 3000)
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setScheduleSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!newPassword || newPassword.length < 6) {
      setError("Новый пароль должен содержать минимум 6 символов")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают")
      return
    }
    if (!user?.sub) {
      setError("Не удалось определить пользователя")
      return
    }

    setIsSaving(true)
    try {
      await apiFetch(`/users/${user.sub}/password`, {
        method: "PATCH",
        body: { newPassword },
      })
      setSuccess(true)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка смены пароля")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 shadow-lg shadow-slate-500/25">
          <Settings className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Настройки</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Управление аккаунтом
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Расписание компании */}
        {canEditSchedule && (
          <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden lg:col-span-2">
            <CardHeader className="border-b border-amber-100/50 bg-gradient-to-r from-amber-50/50 to-orange-50/50 p-4 sm:p-5">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                Рабочее расписание компании
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <form onSubmit={handleSaveSchedule} className="space-y-5">
                {/* Выбор компании */}
                {allCompanies.length > 1 && (
                  <div className="space-y-2">
                    <Label htmlFor="companySelect">Компания</Label>
                    <select
                      id="companySelect"
                      value={selectedCompanyId ?? ""}
                      onChange={(e) => setSelectedCompanyId(Number(e.target.value))}
                      className="w-full h-10 rounded-xl border border-amber-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                    >
                      {allCompanies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {company && (
                  <>
                    {/* Рабочее время */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-700">Рабочее время</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>Начало рабочего дня</Label>
                          <TimeInput value={workStart} onChange={setWorkStart} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Конец рабочего дня</Label>
                          <TimeInput value={workEnd} onChange={setWorkEnd} />
                        </div>
                      </div>
                    </div>

                    {/* Обеденный перерыв */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-700">Обеденный перерыв</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>Начало обеда</Label>
                          <TimeInput value={lunchStart} onChange={setLunchStart} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Конец обеда</Label>
                          <TimeInput value={lunchEnd} onChange={setLunchEnd} />
                        </div>
                      </div>
                    </div>

                    {/* Итоговая сводка */}
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-1">
                      <div>
                        Рабочий день: <span className="font-semibold">{workStart} — {workEnd}</span>
                        {" "}({(() => {
                          const [sh, sm] = workStart.split(":").map(Number)
                          const [eh, em] = workEnd.split(":").map(Number)
                          const total = (eh * 60 + em) - (sh * 60 + sm)
                          const lunch = (() => {
                            const [lsh, lsm] = lunchStart.split(":").map(Number)
                            const [leh, lem] = lunchEnd.split(":").map(Number)
                            return (leh * 60 + lem) - (lsh * 60 + lsm)
                          })()
                          const net = total - (lunch > 0 ? lunch : 0)
                          return net > 0 ? `${Math.floor(net / 60)}ч ${net % 60}м рабочих` : "—"
                        })()})
                      </div>
                      <div className="text-amber-700">
                        Обед: <span className="font-semibold">{lunchStart} — {lunchEnd}</span>
                        {" "}({(() => {
                          const [sh, sm] = lunchStart.split(":").map(Number)
                          const [eh, em] = lunchEnd.split(":").map(Number)
                          const mins = (eh * 60 + em) - (sh * 60 + sm)
                          return mins > 0 ? `${mins} мин.` : "—"
                        })()})
                      </div>
                    </div>
                  </>
                )}

                {scheduleError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {scheduleError}
                  </div>
                )}
                {scheduleSuccess && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    Расписание сохранено
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={scheduleSaving || !company}
                  className="w-full h-10 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/25 text-white"
                >
                  {scheduleSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Сохранение...
                    </>
                  ) : (
                    <>
                      <Clock className="mr-2 h-4 w-4" />
                      Сохранить расписание
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Смена пароля */}
        <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
          <CardHeader className="border-b border-emerald-100/50 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 p-4 sm:p-5">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                <Key className="h-4 w-4 text-emerald-600" />
              </div>
              Смена пароля
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Новый пароль</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Минимум 6 символов"
                    className="pl-9 pr-10 h-10 rounded-xl"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Подтвердите пароль</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Повторите новый пароль"
                    className="pl-9 pr-10 h-10 rounded-xl"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  Пароль успешно изменён
                </div>
              )}

              <Button
                type="submit"
                disabled={isSaving}
                className="w-full h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    Сменить пароль
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Информация об аккаунте */}
        <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
          <CardHeader className="border-b border-emerald-100/50 bg-gradient-to-r from-slate-50/50 to-gray-50/50 p-4 sm:p-5">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                <Settings className="h-4 w-4 text-slate-600" />
              </div>
              Информация об аккаунте
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium">{user?.email || "—"}</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-sm text-muted-foreground">Роль</span>
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                {user?.role || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-sm text-muted-foreground">Компания</span>
              <span className="text-sm font-medium">{user?.companyName || "Холдинг"}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">ID пользователя</span>
              <span className="text-sm font-mono text-muted-foreground">#{user?.sub}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
