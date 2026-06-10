"use client"

import * as React from "react"
import {
  DoorOpen, Loader2, Eye, EyeOff,
  CheckCircle2, XCircle, Wifi, WifiOff, LinkIcon, Unlink,
  AlertCircle, Pencil, Trash2, RefreshCw, Users,
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
  getAgentStatus, grantAllHikvisionAccess, revokeAllHikvisionAccess, getAgents, assignAgentCompany, deleteAgent,
  assignAgentToDevice,
} from "@/lib/hrms-api"
import type { Company, HikvisionDevice, AgentRecord } from "@/lib/types"
import { AgentStatusBanner } from "@/components/agent-status-banner"

const EMPTY_BIND = { companyId: 0, officeName: "", direction: "IN" as "IN" | "OUT", login: "admin", password: "", externalIp: "" }

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

  // Grant all
  const [grantAllDeviceId, setGrantAllDeviceId] = React.useState<number | null>(null)
  const [grantAllLoading, setGrantAllLoading] = React.useState(false)
  const [grantAllResult, setGrantAllResult] = React.useState<{ granted: number; skipped: number; message: string } | null>(null)

  // Revoke all
  const [revokeAllDeviceId, setRevokeAllDeviceId] = React.useState<number | null>(null)
  const [revokeAllLoading, setRevokeAllLoading] = React.useState(false)
  const [revokeAllResult, setRevokeAllResult] = React.useState<{ revoked: number; message: string } | null>(null)

  // Ping / status
  const [pingResults, setPingResults] = React.useState<Record<number, PingResult | null>>({})
  const [pingingId, setPingingId] = React.useState<number | null>(null)
  const [pingingAll, setPingingAll] = React.useState(false)

  // Agent status (per-company banner)
  const [agentStatus, setAgentStatus] = React.useState<{ online: boolean; secondsAgo: number | null; pendingCommands: number; agentName: string | null } | null>(null)

  // All agents (superadmin panel)
  const [agents, setAgents] = React.useState<AgentRecord[]>([])
  const [agentsLoading, setAgentsLoading] = React.useState(false)
  const [assigningAgentId, setAssigningAgentId] = React.useState<number | null>(null)

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

  const loadAgentStatus = React.useCallback(async () => {
    try { setAgentStatus(await getAgentStatus()) } catch { /* ignore */ }
  }, [])

  const loadAgents = React.useCallback(async () => {
    if (!isSuperAdmin) return
    setAgentsLoading(true)
    try {
      const [data] = await Promise.all([
        getAgents(),
        new Promise(r => setTimeout(r, 600)),
      ])
      setAgents(data)
    } catch { /* ignore */ }
    finally { setAgentsLoading(false) }
  }, [isSuperAdmin])

  React.useEffect(() => { load() }, [load])
  React.useEffect(() => {
    loadAgentStatus()
    const t = setInterval(loadAgentStatus, 15_000)
    return () => clearInterval(t)
  }, [loadAgentStatus])
  React.useEffect(() => {
    loadAgents()
    const t = setInterval(loadAgents, 20_000)
    return () => clearInterval(t)
  }, [loadAgents])

  function openBind(device: HikvisionDevice) {
    setBindDevice(device)
    setBindForm({
      companyId: device.companyId ?? 0,
      officeName: device.officeName || "",
      direction: device.direction || "IN",
      login: device.login || "admin",
      password: "",
      externalIp: device.externalIp || "",
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
        externalIp: bindForm.externalIp || undefined,
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

  async function handleGrantAll() {
    if (!grantAllDeviceId) return
    setGrantAllLoading(true)
    setGrantAllResult(null)
    try {
      const result = await grantAllHikvisionAccess(grantAllDeviceId)
      setGrantAllResult(result)
    } catch (e: any) {
      setGrantAllResult({ granted: 0, skipped: 0, message: e.message || "Ошибка" })
    } finally {
      setGrantAllLoading(false)
    }
  }

  async function handleRevokeAll() {
    if (!revokeAllDeviceId) return
    setRevokeAllLoading(true)
    setRevokeAllResult(null)
    try {
      const result = await revokeAllHikvisionAccess(revokeAllDeviceId)
      setRevokeAllResult(result)
    } catch (e: any) {
      setRevokeAllResult({ revoked: 0, message: e.message || "Ошибка" })
    } finally {
      setRevokeAllLoading(false)
    }
  }

  async function handleAssignAgent(agentDbId: number, companyId: number | null) {
    setAssigningAgentId(agentDbId)
    try { await assignAgentCompany(agentDbId, companyId); await loadAgents() }
    catch (e: any) { setError(e.message || "Ошибка назначения") }
    finally { setAssigningAgentId(null) }
  }

  async function handleDeleteAgent(agentDbId: number) {
    try { await deleteAgent(agentDbId); await loadAgents() }
    catch (e: any) { setError(e.message || "Ошибка удаления агента") }
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

      {/* ── Панель всех агентов (суперадмин) ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Relay-агенты</span>
            {agents.length > 0 && (
              <Badge variant="outline" className="text-slate-500 border-slate-200 text-xs">
                {agents.filter(a => a.online).length}/{agents.length} онлайн
              </Badge>
            )}
          </div>
          <button
            onClick={loadAgents}
            disabled={agentsLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 transition-colors border border-slate-200"
            title="Обновить"
          >
            {agentsLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            {agentsLoading ? "Обновление..." : "Обновить"}
          </button>
        </div>

        {agents.length === 0 && !agentsLoading && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400 text-center">
            Нет зарегистрированных агентов — запустите AGENT.bat в офисе
          </div>
        )}

        {agents.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map(agent => {
              const timeAgo = (s: number) =>
                s < 60 ? `${s} сек` : s < 3600 ? `${Math.floor(s / 60)} мин` : `${Math.floor(s / 3600)} ч`

              return (
                <div
                  key={agent.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-xs ${
                    agent.online
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className={`h-2 w-2 rounded-full shrink-0 ${agent.online ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 truncate">{agent.name}</div>
                    <div className="text-slate-400 mt-0.5">
                      {agent.online && agent.secondsAgo !== null
                        ? <span className="text-emerald-600">{timeAgo(agent.secondsAgo)} назад</span>
                        : agent.lastSeenAt
                          ? <span>
                              {(() => {
                                const s = Math.floor((Date.now() - new Date(agent.lastSeenAt).getTime()) / 1000)
                                return `офлайн ${timeAgo(s)}`
                              })()}
                            </span>
                          : <span>никогда не подключался</span>
                      }
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <select
                      value={agent.companyId ?? ""}
                      onChange={e => handleAssignAgent(agent.id, e.target.value ? Number(e.target.value) : null)}
                      disabled={assigningAgentId === agent.id}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400 max-w-[120px] disabled:opacity-50"
                    >
                      <option value="">Все компании</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleDeleteAgent(agent.id)}
                      className="p-1 rounded hover:bg-red-100 text-slate-300 hover:text-red-500 transition-colors"
                      title="Удалить агент"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
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
                            <span className="text-sm font-semibold">
                              {device.deviceName || "Новое устройство"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground pl-5 mt-0.5">Ожидает привязки</p>
                        </div>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                          onClick={() => setDeleteDeviceId(device.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="text-xs space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">MAC:</span>
                          <span className="font-mono text-slate-700">{device.macAddress}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Внутренний IP:</span>
                          <span className="font-mono text-slate-700">{device.lastSeenIp}</span>
                        </div>
                        {device.externalIp && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Внешний IP:</span>
                            <span className="font-mono text-slate-700">{device.externalIp}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Обнаружено:</span>
                          <span className="text-slate-700">{new Date(device.createdAt).toLocaleDateString("ru-RU")}</span>
                        </div>
                        {device.lastSeenAt && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Последний сигнал:</span>
                            <span className={`font-medium ${
                              Date.now() - new Date(device.lastSeenAt).getTime() < 120_000
                                ? "text-emerald-600"
                                : "text-amber-600"
                            }`}>
                              {(() => {
                                const s = Math.floor((Date.now() - new Date(device.lastSeenAt).getTime()) / 1000)
                                if (s < 60) return `${s} сек назад`
                                if (s < 3600) return `${Math.floor(s / 60)} мин назад`
                                return `${Math.floor(s / 3600)} ч назад`
                              })()}
                            </span>
                          </div>
                        )}
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

          {/* ── Привязанные устройства (по компаниям) ── */}
          {activeDevices.length > 0 && (() => {
            const grouped = activeDevices.reduce((acc, d) => {
              const key = String(d.companyId ?? 0)
              if (!acc[key]) acc[key] = { company: d.company, devices: [] }
              acc[key].devices.push(d)
              return acc
            }, {} as Record<string, { company: typeof activeDevices[0]['company']; devices: typeof activeDevices }>)

            return (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-slate-700">Активные устройства</h2>
                <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                  {activeDevices.length}
                </Badge>
              </div>
              {Object.values(grouped).map((group, gi) => (
                <div key={gi} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-slate-100" />
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-2">
                      {group.company?.shortName || group.company?.name || "Без компании"}
                    </span>
                    <Badge variant="outline" className="text-slate-400 border-slate-200 text-xs">
                      {group.devices.length}
                    </Badge>
                    <div className="h-px flex-1 bg-slate-100" />
                  </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.devices.map(device => {
                  const ping = pingResults[device.id]
                  const isPinging = pingingId === device.id || pingingAll

                  const secsAgo = Math.floor((Date.now() - new Date(device.lastSeenAt).getTime()) / 1000)
                  const isOnline = secsAgo < 300          // < 5 мин — онлайн
                  const isWarn   = secsAgo >= 300 && secsAgo < 1800  // 5–30 мин — предупреждение
                  // > 30 мин — офлайн

                  const timeAgo = secsAgo < 60
                    ? `${secsAgo} сек`
                    : secsAgo < 3600
                      ? `${Math.floor(secsAgo / 60)} мин`
                      : `${Math.floor(secsAgo / 3600)} ч`

                  const deviceStatusColor = isOnline
                    ? "border-emerald-200 bg-white"
                    : isWarn
                      ? "border-amber-200 bg-white"
                      : "border-red-200 bg-white"

                  return (
                    <Card key={device.id} className={`border ${deviceStatusColor} shadow-sm`}>
                      <CardContent className="p-0">

                        {/* Статус-шапка */}
                        <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg text-xs font-medium ${
                          isOnline ? "bg-emerald-500 text-white"
                          : isWarn  ? "bg-amber-400 text-white"
                          : "bg-red-500 text-white"
                        }`}>
                          <div className="flex items-center gap-1.5">
                            <div className={`h-2 w-2 rounded-full ${isOnline ? "bg-white animate-pulse" : "bg-white/60"}`} />
                            <span>{isOnline ? "Онлайн" : isWarn ? "Нет сигнала" : "Офлайн"}</span>
                            <span className="opacity-75">· {timeAgo} назад</span>
                          </div>
                          <div className="flex items-center gap-1 opacity-90">
                            <span>{device.direction === "IN" ? "↑ Вход" : "↓ Выход"}</span>
                          </div>
                        </div>

                        <div className="p-4 space-y-3">
                        {/* Заголовок */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {device.deviceName || device.officeName || "Устройство"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {device.officeName} · {device.company?.shortName || device.company?.name}
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
                            <span>IP (локальный):</span>
                            <span className="font-mono text-slate-700">{device.lastSeenIp}</span>
                          </div>
                          {device.externalIp && (
                            <div className="flex justify-between">
                              <span>IP (внешний):</span>
                              <span className="font-mono text-slate-700">{device.externalIp}</span>
                            </div>
                          )}
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

                        {/* Агент */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">Агент:</span>
                          <select
                            value={device.agentId ?? ""}
                            onChange={e => assignAgentToDevice(device.id, e.target.value ? Number(e.target.value) : null).then(load)}
                            className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                          >
                            <option value="">—</option>
                            {agents.map(a => (
                              <option key={a.id} value={a.id}>
                                {a.name}{a.online ? " ●" : ""}
                              </option>
                            ))}
                          </select>
                        </div>

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
                        <div className="flex gap-2">
                          <Button
                            size="sm" variant="outline"
                            className="flex-1 h-8 text-xs gap-1.5 border-violet-200 text-violet-600 hover:bg-violet-50 hover:text-violet-700"
                            onClick={() => { setGrantAllDeviceId(device.id); setGrantAllResult(null) }}
                          >
                            <Users className="h-3.5 w-3.5" />
                            Выдать всем
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            className="flex-1 h-8 text-xs gap-1.5 border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600"
                            onClick={() => { setRevokeAllDeviceId(device.id); setRevokeAllResult(null) }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Удалить всех
                          </Button>
                        </div>

                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
                </div>
              ))}
            </div>
            )
          })()}

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
                {bindDevice.deviceName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Устройство:</span>
                    <span className="font-medium text-slate-700">{bindDevice.deviceName}</span>
                  </div>
                )}
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

              <div className="space-y-1">
                <Label>Внешний IP устройства (опционально)</Label>
                <Input
                  value={bindForm.externalIp}
                  onChange={e => setBindForm(f => ({ ...f, externalIp: e.target.value }))}
                  placeholder="185.125.200.112"
                />
                <p className="text-xs text-muted-foreground">Публичный IP офиса устройства — для port forwarding. Обновляется автоматически при ISUP подключении.</p>
              </div>
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

      {/* ── Массовая выдача доступа ── */}
      <Dialog open={!!grantAllDeviceId} onOpenChange={open => { if (!open) { setGrantAllDeviceId(null); setGrantAllResult(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-violet-600" />
              Выдать доступ всем
            </DialogTitle>
          </DialogHeader>
          {!grantAllResult ? (
            <>
              {!hikvDevices.find(d => d.id === grantAllDeviceId)?.agentId ? (
                <>
                  <div className="py-2">
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-3 flex gap-2.5">
                      <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      <div className="text-sm text-red-700">
                        <p className="font-semibold">Агент не назначен</p>
                        <p className="mt-0.5 text-xs">Сначала выберите relay-агент для этого устройства, затем выдайте доступ.</p>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => setGrantAllDeviceId(null)}>Закрыть</Button>
                  </DialogFooter>
                </>
              ) : (
              <>
              <div className="py-2 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Все активные сотрудники компании получат Face ID доступ к этому устройству.
                </p>
                <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-xs text-violet-700">
                  Сотрудники со статусом "Уволен", "Декрет", "В отпуске", "Больничный" будут пропущены.
                  Те, у кого уже есть доступ, тоже будут пропущены.
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGrantAllDeviceId(null)}>Отмена</Button>
                <Button onClick={handleGrantAll} disabled={grantAllLoading} className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
                  {grantAllLoading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Users className="h-4 w-4" />
                  }
                  Выдать всем
                </Button>
              </DialogFooter>
              </>
              )}
            </>
          ) : (
            <>
              <div className="py-2 space-y-3">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 space-y-2">
                  <p className="text-sm font-semibold text-emerald-700">Готово!</p>
                  <div className="text-sm text-emerald-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Выдано доступов:</span>
                      <span className="font-bold">{grantAllResult.granted}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Пропущено (уже имели):</span>
                      <span className="font-medium">{grantAllResult.skipped}</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Команды отправлены в очередь. Relay-агент выдаст доступы в течение нескольких секунд.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => { setGrantAllDeviceId(null); setGrantAllResult(null) }} className="w-full">
                  Закрыть
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {/* ── Удалить всех ── */}
      <Dialog open={!!revokeAllDeviceId} onOpenChange={open => { if (!open) { setRevokeAllDeviceId(null); setRevokeAllResult(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Удалить всех с устройства
            </DialogTitle>
          </DialogHeader>
          {!revokeAllResult ? (
            <>
              <div className="py-2 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Все сотрудники будут удалены с устройства. Relay-агент выполнит удаление.
                </p>
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  Это действие нельзя отменить. После удаления сотрудники потеряют доступ к двери.
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRevokeAllDeviceId(null)}>Отмена</Button>
                <Button onClick={handleRevokeAll} disabled={revokeAllLoading} className="bg-red-500 hover:bg-red-600 text-white gap-2">
                  {revokeAllLoading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />
                  }
                  Удалить всех
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="py-2">
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 space-y-1">
                  <p className="text-sm font-semibold text-red-700">Готово!</p>
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Удалено:</span>
                    <span className="font-bold">{revokeAllResult.revoked}</span>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => { setRevokeAllDeviceId(null); setRevokeAllResult(null) }} className="w-full">
                  Закрыть
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
