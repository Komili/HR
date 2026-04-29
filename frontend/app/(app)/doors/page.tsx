"use client"

import * as React from "react"
import {
  DoorOpen, Loader2, Eye, EyeOff,
  CheckCircle2, XCircle, Wifi, WifiOff, LinkIcon, Unlink,
  AlertCircle, Pencil, Trash2, RefreshCw,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { useAuth } from "@/app/contexts/AuthContext"
import {
  getCompanies, getHikvisionDevices, bindHikvisionDevice,
  unbindHikvisionDevice, deleteHikvisionDevice, pingHikvisionDevice,
} from "@/lib/hrms-api"
import type { Company, HikvisionDevice } from "@/lib/types"

const EMPTY_BIND = { companyId: 0, officeName: "", direction: "IN" as "IN" | "OUT", login: "admin", password: "" }

type PingResult = {
  online: boolean; message: string;
  lastSeenAt?: string | null; secondsAgo?: number | null;
}

export default function DoorsPage() {
  const { user } = useAuth()
  const [companies, setCompanies] = React.useState<Company[]>([])
  const [hikvDevices, setHikvDevices] = React.useState<HikvisionDevice[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Bind dialog
  const [bindDevice, setBindDevice] = React.useState<HikvisionDevice | null>(null)
  const [bindForm, setBindForm] = React.useState({ ...EMPTY_BIND })
  const [bindSaving, setBindSaving] = React.useState(false)
  const [bindError, setBindError] = React.useState<string | null>(null)
  const [showPassword, setShowPassword] = React.useState(false)

  // Delete dialog
  const [deleteDeviceId, setDeleteDeviceId] = React.useState<number | null>(null)
  const [deletingDevice, setDeletingDevice] = React.useState(false)

  // Ping / status
  const [pingResults, setPingResults] = React.useState<Record<number, PingResult | null>>({})
  const [pingingId, setPingingId] = React.useState<number | null>(null)
  const [pingingAll, setPingingAll] = React.useState(false)

  const isSuperAdmin = user?.isHoldingAdmin

  const load = React.useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [companiesData, devicesData] = await Promise.all([
        getCompanies(), getHikvisionDevices(),
      ])
      setCompanies(companiesData)
      setHikvDevices(devicesData)
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  function openBind(device: HikvisionDevice) {
    setBindDevice(device)
    setBindForm({
      companyId: companies[0]?.id ?? 0,
      officeName: device.officeName || "",
      direction: device.direction || "IN",
      login: device.login || "admin",
      password: "",
    })
    setBindError(null)
    setShowPassword(false)
  }

  async function handleBind() {
    if (!bindDevice) return
    if (!bindForm.companyId) { setBindError("Выберите компанию"); return }
    if (!bindForm.officeName.trim()) { setBindError("Введите название офиса"); return }
    if (!bindForm.password.trim()) { setBindError("Введите пароль устройства"); return }
    setBindSaving(true); setBindError(null)
    try {
      await bindHikvisionDevice(bindDevice.id, {
        companyId: bindForm.companyId,
        officeName: bindForm.officeName,
        direction: bindForm.direction,
        login: bindForm.login || "admin",
        password: bindForm.password,
      })
      setBindDevice(null); await load()
    } catch (e: any) {
      setBindError(e.message || "Ошибка привязки")
    } finally { setBindSaving(false) }
  }

  async function handleUnbind(id: number) {
    try { await unbindHikvisionDevice(id); await load() }
    catch (e: any) { setError(e.message || "Ошибка отвязки") }
  }

  async function handleDeleteDevice() {
    if (!deleteDeviceId) return
    setDeletingDevice(true)
    try {
      await deleteHikvisionDevice(deleteDeviceId); setDeleteDeviceId(null); await load()
    } catch (e: any) {
      setError(e.message || "Ошибка удаления")
    } finally { setDeletingDevice(false) }
  }

  async function handlePing(id: number) {
    setPingingId(id)
    setPingResults(prev => ({ ...prev, [id]: null }))
    try {
      const result = await pingHikvisionDevice(id)
      setPingResults(prev => ({ ...prev, [id]: result }))
    } catch (e: any) {
      setPingResults(prev => ({ ...prev, [id]: { online: false, message: e.message || "Ошибка" } }))
    } finally { setPingingId(null) }
  }

  async function handlePingAll() {
    const activeDevices = hikvDevices.filter(d => d.status === "active")
    if (!activeDevices.length) return
    setPingingAll(true)
    setPingResults({})
    await Promise.all(activeDevices.map(async (d) => {
      try {
        const result = await pingHikvisionDevice(d.id)
        setPingResults(prev => ({ ...prev, [d.id]: result }))
      } catch (e: any) {
        setPingResults(prev => ({ ...prev, [d.id]: { online: false, message: e.message || "Ошибка" } }))
      }
    }))
    setPingingAll(false)
  }

  if (!isSuperAdmin) {
    return <div className="p-8 text-center text-muted-foreground">Доступ только для Суперадмина</div>
  }

  const pendingDevices = hikvDevices.filter(d => d.status === "pending")
  const activeDevices = hikvDevices.filter(d => d.status === "active")

  return (
    <div className="p-4 sm:p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-100">
            <DoorOpen className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Управление дверями</h1>
            <p className="text-sm text-muted-foreground">СКУД — Face ID устройства Hikvision</p>
          </div>
        </div>
        {activeDevices.length > 0 && (
          <Button
            variant="outline"
            onClick={handlePingAll}
            disabled={pingingAll}
            className="gap-2 border-blue-200 text-blue-600 hover:bg-blue-50"
          >
            {pingingAll
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />
            }
            <span className="hidden sm:inline">Проверить все</span>
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : (
        <div className="space-y-8">

          {/* ── Не привязанные устройства ── */}
          {pendingDevices.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <h2 className="text-sm font-semibold text-slate-700">Новые устройства</h2>
                <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
                  {pendingDevices.length} не привязано
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pendingDevices.map(device => (
                  <Card key={device.id} className="border border-orange-200 bg-orange-50/30">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                            <span className="text-sm font-semibold">Новое устройство</span>
                          </div>
                          {device.deviceName && (
                            <p className="text-xs text-muted-foreground pl-5 mt-0.5">{device.deviceName}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                          onClick={() => setDeleteDeviceId(device.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex justify-between">
                          <span>MAC:</span>
                          <span className="font-mono text-slate-700">{device.macAddress}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Внутренний IP:</span>
                          <span className="font-mono text-slate-700">{device.lastSeenIp}</span>
                        </div>
                        {device.externalIp && (
                          <div className="flex justify-between">
                            <span>Внешний IP:</span>
                            <span className="font-mono text-slate-700">{device.externalIp}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Обнаружено:</span>
                          <span>{new Date(device.createdAt).toLocaleDateString("ru-RU")}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs bg-orange-500 hover:bg-orange-600 text-white gap-1.5"
                        onClick={() => openBind(device)}
                      >
                        <LinkIcon className="h-3 w-3" />
                        Привязать к компании
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ── Привязанные устройства ── */}
          {activeDevices.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-slate-700">Активные устройства</h2>
                <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                  {activeDevices.length}
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activeDevices.map(device => {
                  const ping = pingResults[device.id]
                  const isPinging = pingingId === device.id || pingingAll
                  return (
                    <Card key={device.id} className="border border-blue-200 bg-blue-50/20">
                      <CardContent className="p-4 space-y-3">

                        {/* Заголовок */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-lg leading-none ${device.direction === "IN" ? "text-emerald-500" : "text-red-500"}`}>
                                {device.direction === "IN" ? "🟢" : "🔴"}
                              </span>
                              <span className="text-sm font-semibold truncate">{device.officeName}</span>
                            </div>
                            <p className="text-xs text-muted-foreground pl-6 mt-0.5">
                              {device.direction === "IN" ? "Вход (IN)" : "Выход (OUT)"} · {device.company?.shortName || device.company?.name}
                            </p>
                          </div>
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                            onClick={() => setDeleteDeviceId(device.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Инфо */}
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="flex justify-between">
                            <span>MAC:</span>
                            <span className="font-mono text-slate-700">{device.macAddress}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Внутренний IP:</span>
                            <span className="font-mono text-slate-700">{device.lastSeenIp}</span>
                          </div>
                          {device.externalIp && (
                            <div className="flex justify-between">
                              <span>Внешний IP:</span>
                              <span className="font-mono text-slate-700">{device.externalIp}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Последний сигнал:</span>
                            <span className={`font-medium ${
                              Date.now() - new Date(device.lastSeenAt).getTime() < 120_000
                                ? "text-emerald-600"
                                : Date.now() - new Date(device.lastSeenAt).getTime() < 600_000
                                  ? "text-amber-600"
                                  : "text-red-500"
                            }`}>
                              {(() => {
                                const s = Math.floor((Date.now() - new Date(device.lastSeenAt).getTime()) / 1000)
                                if (s < 60) return `${s} сек назад`
                                if (s < 3600) return `${Math.floor(s / 60)} мин назад`
                                return `${Math.floor(s / 3600)} ч назад`
                              })()}
                            </span>
                          </div>
                        </div>

                        {/* Статус пинга */}
                        {ping && (
                          <div className={`rounded-lg px-3 py-2 text-xs space-y-0.5 ${ping.online ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`}>
                            <div className={`flex items-center gap-1.5 font-medium ${ping.online ? "text-emerald-700" : "text-amber-700"}`}>
                              {ping.online
                                ? <CheckCircle2 className="h-3.5 w-3.5" />
                                : <WifiOff className="h-3.5 w-3.5" />
                              }
                              {ping.online ? "На связи" : "Нет сигнала"}
                            </div>
                            <div className={`pl-5 ${ping.online ? "text-emerald-600" : "text-amber-600"}`}>
                              {ping.message}
                            </div>
                          </div>
                        )}

                        {/* Кнопки */}
                        <div className="flex gap-2">
                          <Button
                            size="sm" variant="outline"
                            className="flex-1 h-8 text-xs gap-1"
                            onClick={() => handlePing(device.id)}
                            disabled={isPinging}
                          >
                            {isPinging
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : ping?.online === true
                                ? <Wifi className="h-3 w-3 text-emerald-500" />
                                : ping?.online === false
                                  ? <WifiOff className="h-3 w-3 text-red-500" />
                                  : <RefreshCw className="h-3 w-3" />
                            }
                            Синхр.
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            className="flex-1 h-8 text-xs"
                            onClick={() => openBind(device)}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Изменить
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            className="h-8 text-xs text-orange-500 hover:text-orange-600 hover:bg-orange-50 px-2"
                            onClick={() => handleUnbind(device.id)}
                            title="Отвязать"
                          >
                            <Unlink className="h-3 w-3" />
                          </Button>
                        </div>

                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* Пустое состояние */}
          {hikvDevices.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <DoorOpen className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <p className="font-medium">Нет устройств</p>
                <p className="text-sm mt-1">Настройте Hikvision на отправку событий — устройства появятся автоматически</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Диалог привязки ── */}
      <Dialog open={!!bindDevice} onOpenChange={open => !open && setBindDevice(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {bindDevice?.status === "active" ? "Изменить привязку" : "Привязать устройство к компании"}
            </DialogTitle>
          </DialogHeader>
          {bindDevice && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-slate-50 border p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">MAC:</span>
                  <span className="font-mono font-medium">{bindDevice.macAddress}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Внутренний IP:</span>
                  <span className="font-mono">{bindDevice.lastSeenIp}</span>
                </div>
                {bindDevice.externalIp && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Внешний IP:</span>
                    <span className="font-mono">{bindDevice.externalIp}</span>
                  </div>
                )}
              </div>

              {bindError && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{bindError}</div>
              )}

              <div className="space-y-1">
                <Label>Компания</Label>
                <select
                  value={bindForm.companyId}
                  onChange={e => setBindForm(f => ({ ...f, companyId: parseInt(e.target.value) }))}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value={0} disabled>Выберите компанию</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label>Название офиса</Label>
                <Input
                  value={bindForm.officeName}
                  onChange={e => setBindForm(f => ({ ...f, officeName: e.target.value }))}
                  placeholder="Главный офис, Склад..."
                />
                <p className="text-xs text-muted-foreground">Должно совпадать с офисом в системе</p>
              </div>

              <div className="space-y-1">
                <Label>Направление</Label>
                <div className="flex gap-3">
                  {(["IN", "OUT"] as const).map(d => (
                    <label key={d} className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-md border cursor-pointer text-sm font-medium transition-colors ${bindForm.direction === d ? (d === "IN" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-red-400 bg-red-50 text-red-700") : "border-input hover:bg-slate-50"}`}>
                      <input type="radio" className="sr-only" value={d} checked={bindForm.direction === d} onChange={() => setBindForm(f => ({ ...f, direction: d }))} />
                      {d === "IN" ? "🟢 Вход (IN)" : "🔴 Выход (OUT)"}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label>Логин</Label>
                  <Input
                    value={bindForm.login}
                    onChange={e => setBindForm(f => ({ ...f, login: e.target.value }))}
                    placeholder="admin"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Пароль устройства *</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={bindForm.password}
                      onChange={e => setBindForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Пароль Hikvision"
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Логин и пароль нужны для выдачи/отзыва Face ID доступа</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBindDevice(null)}>Отмена</Button>
            <Button onClick={handleBind} disabled={bindSaving} className="bg-orange-500 hover:bg-orange-600 text-white">
              {bindSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Привязать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Удаление устройства ── */}
      <Dialog open={!!deleteDeviceId} onOpenChange={open => !open && setDeleteDeviceId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Удалить устройство?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Устройство будет удалено из списка. При следующем событии оно снова обнаружится автоматически.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDeviceId(null)}>Отмена</Button>
            <Button onClick={handleDeleteDevice} disabled={deletingDevice} className="bg-red-500 hover:bg-red-600 text-white">
              {deletingDevice && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
