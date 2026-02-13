"use client"

import React, { useEffect, useState, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { DataTable } from "@/components/data-table"
import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  MoreHorizontal,
  Briefcase,
  Plus,
  Edit,
  Trash2,
  Users,
  Search,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CrudModal } from "@/components/crud-modal"
import { Label } from "@/components/ui/label"
import type { Position, Employee } from "@/lib/types"
import {
  getPositions,
  createPosition,
  updatePosition,
  deletePosition,
  getEmployees,
} from "@/lib/hrms-api"

export default function PositionsPage() {
  const searchParams = useSearchParams()
  const [positions, setPositions] = useState<Position[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentPosition, setCurrentPosition] = useState<Partial<Position>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (searchParams.get("action") === "create") {
      setCurrentPosition({})
      setIsModalOpen(true)
      window.history.replaceState({}, "", "/positions")
    }
  }, [searchParams])

  const refreshPositions = () =>
    Promise.all([
      getPositions(),
      getEmployees(1, 1000, ""),
    ])
      .then(([pos, empResult]) => {
        setError(null)
        setPositions(pos)
        setEmployees(empResult.data)
      })
      .catch((err) => {
        setPositions([])
        setError(err instanceof Error ? err.message : "Ошибка загрузки данных")
      })

  useEffect(() => {
    refreshPositions()
  }, [])

  const posEmployeeCount = useMemo(() => {
    const counts: Record<number, number> = {}
    employees.forEach((emp) => {
      if (emp.positionId) {
        counts[emp.positionId] = (counts[emp.positionId] || 0) + 1
      }
    })
    return counts
  }, [employees])

  const filteredPositions = useMemo(() => {
    if (!search.trim()) return positions
    const q = search.toLowerCase()
    return positions.filter((p) => p.name.toLowerCase().includes(q))
  }, [positions, search])

  const handleSave = async () => {
    if (!currentPosition.name?.trim()) {
      setError("Введите название должности")
      return
    }
    setIsSaving(true)
    try {
      if (currentPosition.id) {
        await updatePosition(currentPosition.id, currentPosition.name)
      } else {
        await createPosition(currentPosition.name)
      }
      await refreshPositions()
      setIsModalOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (confirm("Вы уверены, что хотите удалить эту должность?")) {
      try {
        await deletePosition(id)
        await refreshPositions()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка удаления")
      }
    }
  }

  const columns: ColumnDef<Position>[] = [
    {
      accessorKey: "name",
      header: "Название должности",
      cell: ({ row }) => {
        const count = posEmployeeCount[row.original.id] || 0
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-pink-100">
              <Briefcase className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <div className="font-medium">{row.getValue("name")}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{count} сотр.</span>
              </div>
            </div>
          </div>
        )
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-emerald-50">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Действия</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setCurrentPosition(row.original)
                  setIsModalOpen(true)
                }}
                className="cursor-pointer"
              >
                <Edit className="mr-2 h-4 w-4" />
                Редактировать
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600 cursor-pointer focus:text-red-600"
                onClick={() => handleDelete(row.original.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/25">
              <Briefcase className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Должности</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Роли и должности в организации
              </p>
            </div>
          </div>
        </div>
        <Button
          className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-105 text-xs sm:text-sm"
          onClick={() => {
            setCurrentPosition({})
            setIsModalOpen(true)
          }}
        >
          <Plus className="mr-1 sm:mr-2 h-4 w-4" />
          Добавить должность
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-purple-100">
            <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold">{positions.length}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Всего должностей</div>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-emerald-100">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold">{employees.length}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Всего сотрудников</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 sm:p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden">
        <div className="flex items-center gap-3 p-3 sm:p-5 border-b border-emerald-100/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск должностей..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 rounded-xl bg-white/80 border-purple-100 focus:border-purple-300 focus:ring-2 focus:ring-purple-500/20"
            />
          </div>
        </div>
        <div className="p-3 sm:p-5">
          <DataTable columns={columns} data={filteredPositions} />
        </div>
      </div>

      <CrudModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={currentPosition.id ? "Редактировать должность" : "Создать должность"}
        description="Введите название должности для продолжения."
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Название должности
            </Label>
            <Input
              id="name"
              value={currentPosition.name || ""}
              onChange={(e) => setCurrentPosition({ ...currentPosition, name: e.target.value })}
              placeholder="Введите название должности"
              className="h-11 rounded-xl"
            />
          </div>
        </div>
      </CrudModal>
    </div>
  )
}
