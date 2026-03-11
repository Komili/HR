"use client"

import {
  CheckCircle2,
  GraduationCap,
  Star,
  Laptop,
  Palmtree,
  Thermometer,
  Heart,
  XCircle,
  Clock,
} from "lucide-react"

export const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  "Активен": {
    color: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    icon: CheckCircle2,
    label: "Активен",
  },
  "Стажёр": {
    color: "bg-blue-100 text-blue-700 border border-blue-200",
    icon: GraduationCap,
    label: "Стажёр",
  },
  "Руководитель": {
    color: "bg-purple-100 text-purple-700 border border-purple-200",
    icon: Star,
    label: "Руководитель",
  },
  "Дистанционно": {
    color: "bg-cyan-100 text-cyan-700 border border-cyan-200",
    icon: Laptop,
    label: "Дистанционно",
  },
  "В отпуске": {
    color: "bg-amber-100 text-amber-700 border border-amber-200",
    icon: Palmtree,
    label: "В отпуске",
  },
  "Больничный": {
    color: "bg-orange-100 text-orange-700 border border-orange-200",
    icon: Thermometer,
    label: "Больничный",
  },
  "Декрет": {
    color: "bg-pink-100 text-pink-700 border border-pink-200",
    icon: Heart,
    label: "Декрет",
  },
  "Уволен": {
    color: "bg-gray-100 text-gray-500 border border-gray-200",
    icon: XCircle,
    label: "Уволен",
  },
  "Ожидает": {
    color: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    icon: Clock,
    label: "Ожидает",
  },
}

export const ALL_STATUSES = [
  "Активен",
  "Стажёр",
  "Руководитель",
  "Дистанционно",
  "В отпуске",
  "Больничный",
  "Декрет",
  "Уволен",
]

interface StatusBadgeProps {
  status: string | null | undefined
  size?: "sm" | "md"
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const s = status || "Активен"
  const config = STATUS_CONFIG[s] ?? {
    color: "bg-gray-100 text-gray-600 border border-gray-200",
    icon: CheckCircle2,
    label: s,
  }
  const Icon = config.icon

  if (size === "sm") {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${config.color}`}>
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  )
}
