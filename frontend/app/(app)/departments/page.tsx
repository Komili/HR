"use client"

import React, { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { DataTable } from "@/components/data-table"
import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import {
  MoreHorizontal,
  Building2,
  Plus,
  Edit,
  Trash2,
  Users,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Department } from "@/lib/types"
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "@/lib/hrms-api"

export default function DepartmentsPage() {
  const searchParams = useSearchParams()
  const [departments, setDepartments] = useState<Department[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentDepartment, setCurrentDepartment] = useState<Partial<Department>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Проверяем параметр action=create для автооткрытия модалки
  useEffect(() => {
    if (searchParams.get("action") === "create") {
      setCurrentDepartment({})
      setIsModalOpen(true)
      window.history.replaceState({}, "", "/departments")
    }
  }, [searchParams])

  const refreshDepartments = () =>
    getDepartments()
      .then((data) => {
        setError(null)
        setDepartments(data)
      })
      .catch((err) => {
        setDepartments([])
        setError(err instanceof Error ? err.message : "Ошибка загрузки данных")
      })

  useEffect(() => {
    refreshDepartments()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    if (currentDepartment.id) {
      await updateDepartment(currentDepartment.id, currentDepartment.name || "")
    } else {
      await createDepartment(currentDepartment.name || "")
    }
    await refreshDepartments()
    setIsSaving(false)
    setIsModalOpen(false)
  }

  const handleDelete = async (id: number) => {
    if (confirm("Вы уверены, что хотите удалить этот отдел?")) {
      await deleteDepartment(id)
      await refreshDepartments()
    }
  }

  const columns: ColumnDef<Department>[] = [
    {
      accessorKey: "name",
      header: "Название отдела",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100">
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <div className="font-medium">{row.getValue("name")}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>0 сотрудников</span>
            </div>
          </div>
        </div>
      ),
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
                  setCurrentDepartment(row.original)
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/25">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Отделы</h1>
              <p className="text-sm text-muted-foreground">
                Управление организационной структурой компании
              </p>
            </div>
          </div>
        </div>
        <Button
          className="h-10 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-105"
          onClick={() => {
            setCurrentDepartment({})
            setIsModalOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Добавить отдел
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex items-center gap-4 rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <div className="text-2xl font-bold">{departments.length}</div>
            <div className="text-xs text-muted-foreground">Всего отделов</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden">
        <div className="p-5">
          <DataTable columns={columns} data={departments} />
        </div>
      </div>

      <CrudModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={currentDepartment.id ? "Редактировать отдел" : "Создать отдел"}
        description="Введите название отдела для продолжения."
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Название отдела
            </Label>
            <Input
              id="name"
              value={currentDepartment.name || ""}
              onChange={(e) => setCurrentDepartment({ ...currentDepartment, name: e.target.value })}
              placeholder="Введите название отдела"
              className="h-11 rounded-xl"
            />
          </div>
        </div>
      </CrudModal>
    </div>
  )
}
