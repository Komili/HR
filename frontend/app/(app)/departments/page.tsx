"use client"

import React, { useEffect, useState, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { DataTable } from "@/components/data-table"
import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  MoreHorizontal,
  Building2,
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
import type { Department, Employee } from "@/lib/types"
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getEmployees,
} from "@/lib/hrms-api"

export default function DepartmentsPage() {
  const searchParams = useSearchParams()
  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentDepartment, setCurrentDepartment] = useState<Partial<Department>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (searchParams.get("action") === "create") {
      setCurrentDepartment({})
      setIsModalOpen(true)
      window.history.replaceState({}, "", "/departments")
    }
  }, [searchParams])

  const refreshDepartments = () =>
    Promise.all([
      getDepartments(),
      getEmployees(1, 1000, ""),
    ])
      .then(([deps, empResult]) => {
        setError(null)
        setDepartments(deps)
        setEmployees(empResult.data)
      })
      .catch((err) => {
        setDepartments([])
        setError(err instanceof Error ? err.message : "Ошибка загрузки данных")
      })

  useEffect(() => {
    refreshDepartments()
  }, [])

  // Count employees per department
  const deptEmployeeCount = useMemo(() => {
    const counts: Record<number, number> = {}
    employees.forEach((emp) => {
      if (emp.departmentId) {
        counts[emp.departmentId] = (counts[emp.departmentId] || 0) + 1
      }
    })
    return counts
  }, [employees])

  const filteredDepartments = useMemo(() => {
    if (!search.trim()) return departments
    const q = search.toLowerCase()
    return departments.filter((d) => d.name.toLowerCase().includes(q))
  }, [departments, search])

  const handleSave = async () => {
    if (!currentDepartment.name?.trim()) {
      setError("Введите название отдела")
      return
    }
    setIsSaving(true)
    try {
      if (currentDepartment.id) {
        await updateDepartment(currentDepartment.id, currentDepartment.name)
      } else {
        await createDepartment(currentDepartment.name)
      }
      await refreshDepartments()
      setIsModalOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (confirm("Вы уверены, что хотите удалить этот отдел?")) {
      try {
        await deleteDepartment(id)
        await refreshDepartments()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка удаления")
      }
    }
  }

  const columns: ColumnDef<Department>[] = [
    {
      accessorKey: "name",
      header: "Название отдела",
      cell: ({ row }) => {
        const count = deptEmployeeCount[row.original.id] || 0
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100">
              <Building2 className="h-5 w-5 text-blue-600" />
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
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/25">
              <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Отделы</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Организационная структура компании
              </p>
            </div>
          </div>
        </div>
        <Button
          className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-105 text-xs sm:text-sm"
          onClick={() => {
            setCurrentDepartment({})
            setIsModalOpen(true)
          }}
        >
          <Plus className="mr-1 sm:mr-2 h-4 w-4" />
          Добавить отдел
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-blue-100">
            <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold">{departments.length}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Всего отделов</div>
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
              placeholder="Поиск отделов..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 rounded-xl bg-white/80 border-blue-100 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
        <div className="p-3 sm:p-5">
          <DataTable columns={columns} data={filteredDepartments} />
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
