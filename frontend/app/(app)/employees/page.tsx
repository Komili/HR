"use client"

import * as React from "react"
import { useDebounce } from "use-debounce"
import { useSearchParams } from "next/navigation"
import { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import type { Employee, Department, Position, CreateEmployeeInput, UpdateEmployeeInput } from "@/lib/types"
import { DataTable } from "@/components/data-table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CrudModal } from "@/components/crud-modal"
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getDepartments,
  getPositions,
} from "@/lib/hrms-api"
import {
  Users,
  Search,
  UserPlus,
  Filter,
  Download,
  CheckCircle2,
  Clock,
  Building2,
  MoreHorizontal,
  User,
  Mail,
  Phone,
  Eye,
  Edit,
  Trash2,
  Copy,
  Briefcase,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function EmployeesPage() {
  const searchParams = useSearchParams()
  const [data, setData] = React.useState<Employee[]>([])
  const [page, setPage] = React.useState(0)
  const [total, setTotal] = React.useState(0)
  const limit = 10
  const [search, setSearch] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [debouncedSearch] = useDebounce(search, 500)

  // Модальное окно
  const [isModalOpen, setIsModalOpen] = React.useState(false)

  // Проверяем параметры action=create или action=edit для автооткрытия модалки
  React.useEffect(() => {
    const action = searchParams.get("action")
    const editId = searchParams.get("id")

    if (action === "create") {
      handleOpenCreateModal()
      window.history.replaceState({}, "", "/employees")
    } else if (action === "edit" && editId) {
      // Найдём сотрудника и откроем редактирование
      getEmployees(1, 1000, "").then((result) => {
        const emp = result.data.find(e => e.id === Number(editId))
        if (emp) {
          handleOpenEditModal(emp)
        }
        window.history.replaceState({}, "", "/employees")
      }).catch(() => {
        window.history.replaceState({}, "", "/employees")
      })
    }
  }, [searchParams])
  const [isSaving, setIsSaving] = React.useState(false)
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [positions, setPositions] = React.useState<Position[]>([])
  const [editingEmployee, setEditingEmployee] = React.useState<Employee | null>(null)
  const [formData, setFormData] = React.useState<CreateEmployeeInput>({
    firstName: "",
    lastName: "",
    patronymic: "",
    latinFirstName: "",
    latinLastName: "",
    email: "",
    phone: "",
    departmentId: undefined,
    positionId: undefined,
  })

  const pageCount = Math.ceil(total / limit)

  const loadEmployees = React.useCallback(() => {
    setError(null)
    getEmployees(page + 1, limit, debouncedSearch)
      .then((result) => {
        setData(result.data)
        setTotal(result.total)
      })
      .catch((err) => {
        setData([])
        setTotal(0)
        setError(err instanceof Error ? err.message : "Ошибка загрузки данных")
      })
  }, [page, limit, debouncedSearch])

  React.useEffect(() => {
    loadEmployees()
  }, [loadEmployees])

  React.useEffect(() => {
    Promise.all([getDepartments(), getPositions()])
      .then(([deps, pos]) => {
        setDepartments(deps)
        setPositions(pos)
      })
      .catch(() => {})
  }, [])

  const handleOpenCreateModal = () => {
    setEditingEmployee(null)
    setFormData({
      firstName: "",
      lastName: "",
      patronymic: "",
      latinFirstName: "",
      latinLastName: "",
      email: "",
      phone: "",
      departmentId: undefined,
      positionId: undefined,
    })
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (employee: Employee) => {
    setEditingEmployee(employee)
    setFormData({
      firstName: employee.firstName,
      lastName: employee.lastName,
      patronymic: employee.patronymic || "",
      latinFirstName: employee.latinFirstName,
      latinLastName: employee.latinLastName,
      email: employee.email || "",
      phone: employee.phone || "",
      departmentId: employee.departmentId || undefined,
      positionId: employee.positionId || undefined,
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (confirm("Вы уверены, что хотите удалить этого сотрудника?")) {
      try {
        await deleteEmployee(id)
        loadEmployees()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка удаления")
      }
    }
  }

  const handleExport = () => {
    // Формируем CSV с данными сотрудников
    const headers = ["ID", "Фамилия", "Имя", "Отчество", "Email", "Телефон", "Отдел", "Должность"]
    const csvRows = [
      headers.join(";"),
      ...data.map(emp => [
        emp.id,
        emp.lastName,
        emp.firstName,
        emp.patronymic || "",
        emp.email || "",
        emp.phone || "",
        emp.department?.name || "",
        emp.position?.name || ""
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
    ]

    const csvContent = "\uFEFF" + csvRows.join("\n") // BOM для корректного отображения кириллицы
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `employees_${new Date().toISOString().split("T")[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleSave = async () => {
    if (!formData.firstName || !formData.lastName || !formData.latinFirstName || !formData.latinLastName) {
      setError("Заполните обязательные поля: Имя, Фамилия, Имя (лат.), Фамилия (лат.)")
      return
    }

    setIsSaving(true)
    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, formData as UpdateEmployeeInput)
      } else {
        await createEmployee(formData)
      }
      setIsModalOpen(false)
      loadEmployees()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setIsSaving(false)
    }
  }

  const columns: ColumnDef<Employee>[] = [
    {
      accessorKey: "lastName",
      header: "Сотрудник",
      cell: ({ row }) => {
        const { lastName, firstName, patronymic, id } = row.original
        const fullName = `${lastName} ${firstName} ${patronymic || ""}`.trim()
        const initials = `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase()

        return (
          <Link href={`/employees/${id}`} className="group flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-sm font-bold text-white shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all">
              {initials}
            </div>
            <div>
              <div className="font-medium text-foreground group-hover:text-emerald-600 transition-colors">
                {fullName}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                <span>ID: {id}</span>
              </div>
            </div>
          </Link>
        )
      },
    },
    {
      accessorKey: "position.name",
      header: "Должность",
      cell: ({ row }) =>
        row.original.position?.name ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-100 to-pink-100 px-3 py-1.5 text-xs font-medium text-purple-700">
            <Briefcase className="h-3 w-3" />
            {row.original.position?.name}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "department.name",
      header: "Отдел",
      cell: ({ row }) =>
        row.original.department?.name ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-100 to-cyan-100 px-3 py-1.5 text-xs font-medium text-blue-700">
            <Building2 className="h-3 w-3" />
            {row.original.department?.name}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "email",
      header: "Контакты",
      cell: ({ row }) => (
        <div className="space-y-1">
          {row.original.email ? (
            <div className="flex items-center gap-1.5 text-sm">
              <Mail className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-emerald-700 hover:underline cursor-pointer">
                {row.original.email}
              </span>
            </div>
          ) : null}
          {row.original.phone ? (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <span>{row.original.phone}</span>
            </div>
          ) : null}
          {!row.original.email && !row.original.phone && (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const employee = row.original

        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 hover:bg-emerald-50 data-[state=open]:bg-emerald-50"
                >
                  <span className="sr-only">Открыть меню</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Действия</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href={`/employees/${employee.id}`}>
                    <Eye className="mr-2 h-4 w-4" />
                    Просмотр профиля
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleOpenEditModal(employee)}
                  className="cursor-pointer"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Редактировать
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigator.clipboard.writeText(String(employee.id))}
                  className="cursor-pointer"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Копировать ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 cursor-pointer focus:text-red-600"
                  onClick={() => handleDelete(employee.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  const pagination = {
    pageIndex: page,
    pageSize: limit,
    pageCount,
    canPreviousPage: page > 0,
    canNextPage: page + 1 < pageCount,
    previousPage: () => setPage((p) => p - 1),
    nextPage: () => setPage((p) => p + 1),
    setPageIndex: setPage,
  }

  const quickStats = [
    {
      label: "Активные",
      value: total,
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-100",
    },
    {
      label: "Отделов",
      value: departments.length,
      icon: Building2,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      label: "Должностей",
      value: positions.length,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-100",
    },
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/25">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Сотрудники</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Управление командой и профилями сотрудников
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            className="h-9 sm:h-10 rounded-xl bg-white/80 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 text-xs sm:text-sm"
            onClick={handleExport}
          >
            <Download className="mr-1 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Экспорт</span>
            <span className="sm:hidden">CSV</span>
          </Button>
          <Button
            onClick={handleOpenCreateModal}
            className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-105 text-xs sm:text-sm"
          >
            <UserPlus className="mr-1 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Добавить сотрудника</span>
            <span className="sm:hidden">Добавить</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-3 sm:gap-4">
        {quickStats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-2 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm hover:shadow-md transition-all"
          >
            <div className={`flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl ${stat.bg}`}>
              <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`} />
            </div>
            <div>
              <div className="text-lg sm:text-2xl font-bold">{stat.value}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-5 border-b border-emerald-100/50">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 sm:left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по имени, email, отделу..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 sm:pl-11 h-10 sm:h-11 rounded-xl bg-white/80 border-emerald-100 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-100 to-teal-100 px-2 sm:px-3 py-1 sm:py-1.5 text-emerald-700 font-medium text-xs sm:text-sm">
                <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                Всего: {total}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-3 sm:mx-5 mt-3 sm:mt-4 rounded-xl bg-red-50 border border-red-200 p-3 sm:p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="p-3 sm:p-5">
          <DataTable columns={columns} data={data} pagination={pagination} />
        </div>
      </div>

      <CrudModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEmployee ? "Редактировать сотрудника" : "Добавить сотрудника"}
        description={editingEmployee ? "Измените данные сотрудника" : "Заполните данные нового сотрудника"}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 sm:pr-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="lastName">Фамилия *</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="Введите фамилию"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstName">Имя *</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="Введите имя"
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="patronymic">Отчество</Label>
            <Input
              id="patronymic"
              value={formData.patronymic || ""}
              onChange={(e) => setFormData({ ...formData, patronymic: e.target.value })}
              placeholder="Введите отчество"
              className="h-10 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="latinLastName">Фамилия (лат.) *</Label>
              <Input
                id="latinLastName"
                value={formData.latinLastName}
                onChange={(e) => setFormData({ ...formData, latinLastName: e.target.value })}
                placeholder="Фамилия латиницей"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="latinFirstName">Имя (лат.) *</Label>
              <Input
                id="latinFirstName"
                value={formData.latinFirstName}
                onChange={(e) => setFormData({ ...formData, latinFirstName: e.target.value })}
                placeholder="Имя латиницей"
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ""}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Введите email"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Телефон</Label>
              <Input
                id="phone"
                value={formData.phone || ""}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Номер телефона"
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="department">Отдел</Label>
              <select
                id="department"
                value={formData.departmentId || ""}
                onChange={(e) => setFormData({ ...formData, departmentId: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">Выберите отдел</option>
                {departments.map((dep) => (
                  <option key={dep.id} value={dep.id}>{dep.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="position">Должность</Label>
              <select
                id="position"
                value={formData.positionId || ""}
                onChange={(e) => setFormData({ ...formData, positionId: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">Выберите должность</option>
                {positions.map((pos) => (
                  <option key={pos.id} value={pos.id}>{pos.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </CrudModal>
    </div>
  )
}
