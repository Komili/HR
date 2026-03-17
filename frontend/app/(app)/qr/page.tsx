"use client"

import * as React from "react"
import { QRCodeSVG } from "qrcode.react"
import { Loader2, RefreshCw, QrCode } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/app/contexts/AuthContext"
import { getOffices } from "@/lib/hrms-api"
import type { Office } from "@/lib/types"

const WINDOW_MS = 5 * 60 * 1000 // 5 минут

function currentWindow(): number {
  return Math.floor(Date.now() / WINDOW_MS)
}

function secondsLeft(): number {
  return Math.ceil((WINDOW_MS - (Date.now() % WINDOW_MS)) / 1000)
}

type QrData = { token: string; expiresIn: number }

export default function QrPage() {
  const { user } = useAuth()
  const [offices, setOffices] = React.useState<Office[]>([])
  const [loading, setLoading] = React.useState(true)
  const [qrMap, setQrMap] = React.useState<Record<number, QrData>>({})
  const [countdown, setCountdown] = React.useState(secondsLeft())
  const windowRef = React.useRef(currentWindow())

  const origin = typeof window !== "undefined" ? window.location.origin : ""

  // Загрузить офисы
  React.useEffect(() => {
    getOffices()
      .then(setOffices)
      .finally(() => setLoading(false))
  }, [user])

  // Загрузить токены для всех офисов
  const loadTokens = React.useCallback(async (officeList: Office[]) => {
    const authToken = localStorage.getItem("authToken")
    const results = await Promise.all(
      officeList.map(o =>
        fetch(`/api/checkin/admin/qr?officeId=${o.id}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        })
          .then(r => r.json())
          .then(data => [o.id, data] as const)
          .catch(() => [o.id, null] as const)
      )
    )
    const map: Record<number, QrData> = {}
    results.forEach(([id, data]) => { if (data) map[id] = data })
    setQrMap(map)
  }, [])

  React.useEffect(() => {
    if (offices.length > 0) loadTokens(offices)
  }, [offices, loadTokens])

  // Обратный отсчёт + авторефреш при смене окна
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(secondsLeft())
      const win = currentWindow()
      if (win !== windowRef.current) {
        windowRef.current = win
        if (offices.length > 0) loadTokens(offices)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [offices, loadTokens])

  const mins = Math.floor(countdown / 60)
  const secs = countdown % 60
  const countdownStr = `${mins}:${String(secs).padStart(2, "0")}`

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
    </div>
  )

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-100">
            <QrCode className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">QR Check-in</h1>
            <p className="text-sm text-muted-foreground">Покажите или распечатайте QR для каждого офиса</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4" />
          <span>Обновится через <span className="font-mono font-bold text-amber-600">{countdownStr}</span></span>
        </div>
      </div>

      {offices.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <QrCode className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p>Нет офисов. Сначала добавьте офисы в Настройках.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {offices.map(office => {
          const qr = qrMap[office.id]
          const url = qr ? `${origin}/checkin?office=${office.id}&t=${qr.token}` : ""

          return (
            <Card key={office.id} className="text-center">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{office.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3">
                {url ? (
                  <>
                    <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                      <QRCodeSVG value={url} size={180} />
                    </div>
                    <p className="text-xs text-slate-400 font-mono break-all px-2">{url}</p>
                    <button
                      onClick={() => window.open(url, "_blank")}
                      className="text-xs text-amber-600 hover:underline"
                    >
                      Открыть страницу
                    </button>
                  </>
                ) : (
                  <div className="h-44 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">Как использовать:</p>
        <ol className="list-decimal list-inside space-y-1 text-amber-700">
          <li>Откройте эту страницу на планшете или распечатайте QR</li>
          <li>Сотрудник сканирует QR своим телефоном</li>
          <li>Выбирает своё имя, фотографируется</li>
          <li>Отметка записывается автоматически</li>
        </ol>
        <p className="mt-2 text-amber-600 text-xs">
          QR-код меняется каждые 5 минут — отметиться удалённо невозможно
        </p>
      </div>
    </div>
  )
}
