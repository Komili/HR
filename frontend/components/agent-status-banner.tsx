"use client"

import * as React from "react"
import { RefreshCw, Loader2 } from "lucide-react"

type AgentStatus = {
  online: boolean
  secondsAgo: number | null
  pendingCommands: number
} | null

interface Props {
  status: AgentStatus
  onRefresh: () => Promise<void>
  compact?: boolean
}

export function AgentStatusBanner({ status, onRefresh, compact = false }: Props) {
  const [refreshing, setRefreshing] = React.useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try { await onRefresh() } finally { setRefreshing(false) }
  }

  const timeAgo = (s: number) =>
    s < 60 ? `${s} сек` : s < 3600 ? `${Math.floor(s / 60)} мин` : `${Math.floor(s / 3600)} ч`

  if (status === null) return null

  if (compact) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
        status.online
          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
          : "bg-red-50 border-red-200 text-red-700"
      }`}>
        <div className={`h-2 w-2 rounded-full shrink-0 ${status.online ? "bg-emerald-500 animate-pulse" : "bg-red-400"}`} />
        <span className="font-medium">
          {status.online ? "Relay-агент работает" : "Relay-агент не подключён"}
        </span>
        {status.online && status.secondsAgo !== null && (
          <span className="text-emerald-500">· {timeAgo(status.secondsAgo)} назад</span>
        )}
        {!status.online && (
          <span className="text-red-500">· запустите AGENT.bat на ПК в офисе</span>
        )}
        {status.pendingCommands > 0 && (
          <span className="ml-auto bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
            {status.pendingCommands} в очереди
          </span>
        )}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="ml-auto p-1 rounded hover:bg-black/5 disabled:opacity-40 transition-colors"
          title="Обновить статус"
        >
          {refreshing
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <RefreshCw className="h-3 w-3" />
          }
        </button>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
      status.online
        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
        : "bg-red-50 border-red-200 text-red-800"
    }`}>
      <div className={`shrink-0 h-2.5 w-2.5 rounded-full ${status.online ? "bg-emerald-500 animate-pulse" : "bg-red-400"}`} />

      <div className="flex-1 min-w-0">
        <span className="font-semibold">
          {status.online ? "Relay-агент работает" : "Relay-агент не подключён"}
        </span>
        {status.online && status.secondsAgo !== null && (
          <span className="text-emerald-600 ml-2 text-xs">
            · последний сигнал {timeAgo(status.secondsAgo)} назад
          </span>
        )}
        {!status.online && (
          <span className="text-red-600 ml-2 text-xs">
            · запустите AGENT.bat на локальном ПК в офисе
          </span>
        )}
      </div>

      {status.pendingCommands > 0 && (
        <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 shrink-0">
          {status.pendingCommands} в очереди
        </span>
      )}

      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className={`shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
          status.online
            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-100"
            : "border-red-200 text-red-700 hover:bg-red-100"
        }`}
        title="Обновить статус агента"
      >
        {refreshing
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <RefreshCw className="h-3.5 w-3.5" />
        }
        <span className="hidden sm:inline">Проверить</span>
      </button>
    </div>
  )
}
