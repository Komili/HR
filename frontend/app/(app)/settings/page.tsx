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

export default function SettingsPage() {
  const { user } = useAuth()
  const canEditSchedule = user && (user.isHoldingAdmin || user.role === "Кадровик" || user.role === "Руководитель")

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
  const [company, setCompany] = React.useState<Company | null>(null)
  const [lunchStart, setLunchStart] = React.useState("12:00")
  const [lunchEnd, setLunchEnd] = React.useState("13:00")
  const [scheduleSaving, setScheduleSaving] = React.useState(false)
  const [scheduleSuccess, setScheduleSuccess] = React.useState(false)
  const [scheduleError, setScheduleError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!canEditSchedule) return
    getCompanies().then((companies) => {
      const c = user?.isHoldingAdmin
        ? companies[0]
        : companies.find((x) => x.id === (user as any)?.companyId) || companies[0]
      if (c) {
        setCompany(c)
        setLunchStart(c.lunchBreakStart || "12:00")
        setLunchEnd(c.lunchBreakEnd || "13:00")
      }
    })
  }, [canEditSchedule, user])

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company) return
    setScheduleError(null)
    setScheduleSuccess(false)
    setScheduleSaving(true)
    try {
      await updateCompanySchedule(company.id, { lunchBreakStart: lunchStart, lunchBreakEnd: lunchEnd })
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
        {/* Расписание обеда */}
        {canEditSchedule && company && (
          <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
            <CardHeader className="border-b border-emerald-100/50 bg-gradient-to-r from-amber-50/50 to-orange-50/50 p-4 sm:p-5">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                Время обеда
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <form onSubmit={handleSaveSchedule} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Перерыв на обед автоматически вычитается из отработанного времени сотрудников.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lunchStart">Начало обеда</Label>
                    <Input
                      id="lunchStart"
                      type="time"
                      value={lunchStart}
                      onChange={(e) => setLunchStart(e.target.value)}
                      className="h-10 rounded-xl border-amber-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lunchEnd">Конец обеда</Label>
                    <Input
                      id="lunchEnd"
                      type="time"
                      value={lunchEnd}
                      onChange={(e) => setLunchEnd(e.target.value)}
                      className="h-10 rounded-xl border-amber-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>

                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                  Текущее расписание: <span className="font-semibold">{lunchStart} — {lunchEnd}</span>
                  {" "}({(() => {
                    const [sh, sm] = lunchStart.split(":").map(Number)
                    const [eh, em] = lunchEnd.split(":").map(Number)
                    const mins = (eh * 60 + em) - (sh * 60 + sm)
                    return mins > 0 ? `${mins} мин.` : "—"
                  })()})
                </div>

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
                  disabled={scheduleSaving}
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
