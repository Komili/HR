"use client"

import * as React from "react"
import { Calendar } from "lucide-react"

/** yyyy-mm-dd → dd.mm.yyyy */
export function toRuDate(iso: string | null | undefined): string {
  if (!iso) return ""
  const parts = iso.split("-")
  if (parts.length !== 3) return iso
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

/**
 * Поле выбора даты с отображением в формате ДД.ММ.ГГГГ (не зависит от локали ОС).
 * Хранит значение как yyyy-mm-dd (как обычный <input type="date">),
 * показывает ДД.ММ.ГГГГ и открывает системный календарь по иконке.
 */
export function RuDateInput({
  value,
  onChange,
  id,
  min,
  max,
  className,
  inputClassName,
}: {
  value: string
  onChange: (v: string) => void
  id?: string
  min?: string
  max?: string
  className?: string
  inputClassName?: string
}) {
  const dateRef = React.useRef<HTMLInputElement>(null)
  const display = toRuDate(value)

  const openPicker = () => {
    const el = dateRef.current
    if (!el) return
    // showPicker поддерживается в современных Chrome/Edge/Firefox
    if (typeof el.showPicker === "function") el.showPicker()
    else el.focus()
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={display}
        placeholder="ДД.ММ.ГГГГ"
        onChange={(e) => {
          const m = e.target.value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
          if (m) {
            const dd = m[1].padStart(2, "0")
            const mm = m[2].padStart(2, "0")
            onChange(`${m[3]}-${mm}-${dd}`)
          }
        }}
        className={`h-10 w-full rounded-xl border bg-background pl-3 pr-10 text-sm focus:outline-none ${
          inputClassName ?? "border-input focus:border-slate-400 focus:ring-2 focus:ring-slate-500/20"
        }`}
      />
      <button
        type="button"
        onClick={openPicker}
        tabIndex={-1}
        aria-label="Открыть календарь"
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        <Calendar className="h-4 w-4" />
      </button>
      {/* Скрытый нативный date-input — только как источник системного календаря */}
      <input
        ref={dateRef}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => { if (e.target.value) onChange(e.target.value) }}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-2 h-0 w-0 opacity-0"
      />
    </div>
  )
}
