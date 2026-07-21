"use client"

import * as React from "react"
import { useDebounce } from "use-debounce"
import { useSearchParams } from "next/navigation"
import { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import type { Employee, Department, Position, CreateEmployeeInput, UpdateEmployeeInput } from "@/lib/types"
import { useAuth } from "@/app/contexts/AuthContext"
import { DataTable } from "@/components/data-table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CrudModal } from "@/components/crud-modal"
import { EmployeeFormFields } from "@/components/employee-form-fields"
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getDepartments,
  getPositions,
  getEmployeeInventory,
  getEmployeePhotoUrl,
} from "@/lib/hrms-api"
import { StatusBadge, ALL_STATUSES } from "@/components/status-badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Package } from "lucide-react"
import { EmployeeAvatar } from "@/components/employee-avatar"
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
  EyeOff,
  Edit,
  Trash2,
  Copy,
  Briefcase,
  X,
  LayoutList,
  LayoutGrid,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function GalleryCard({ employee }: { employee: Employee }) {
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)
  const [visible, setVisible] = React.useState(false)
  const name = `${employee.lastName} ${employee.firstName}`
  const initials = `${employee.firstName?.charAt(0) || ""}${employee.lastName?.charAt(0) || ""}`.toUpperCase()

  React.useEffect(() => {
    if (!employee.photoPath || !ref.current) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { rootMargin: "300px" })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [employee.photoPath])

  React.useEffect(() => {
    if (!visible || !employee.photoPath) return
    let revoked = false
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null
    fetch(getEmployeePhotoUrl(employee.id, false), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => { if (blob && !revoked) setBlobUrl(URL.createObjectURL(blob)) })
      .catch(() => {})
    return () => { revoked = true; setBlobUrl(p => { if (p) URL.revokeObjectURL(p); return null }) }
  }, [visible, employee.photoPath, employee.id])

  const isDismissed = employee.status === "Уволен"
  return (
    <Link href={`/employees/${employee.id}`} className={`group flex flex-col items-center gap-2 rounded-xl p-2 transition-colors ${isDismissed ? "opacity-50 hover:opacity-70 hover:bg-gray-50" : "hover:bg-emerald-50"}`}>
      <div
        ref={ref}
        className={`w-24 h-32 rounded-xl overflow-hidden flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow ${isDismissed ? "bg-gray-100" : "bg-gradient-to-br from-emerald-100 to-teal-100"}`}
      >
        {blobUrl ? (
          <img src={blobUrl} alt={name} className={`w-full h-full object-cover ${isDismissed ? "grayscale" : ""}`} />
        ) : (
          <span className={`text-2xl font-bold ${isDismissed ? "text-gray-400" : "text-emerald-600"}`}>{initials}</span>
        )}
      </div>
      <div className="text-center w-24">
        <div className={`text-xs font-medium leading-tight line-clamp-2 transition-colors ${isDismissed ? "text-gray-400" : "text-foreground group-hover:text-emerald-600"}`}>{name}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">ID: {employee.id}</div>
      </div>
    </Link>
  )
}

function EmployeeGallery({ employees }: { employees: Employee[] }) {
  if (employees.length === 0) {
    return <div className="py-16 text-center text-muted-foreground text-sm">Нет сотрудников</div>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {employees.map(emp => <GalleryCard key={emp.id} employee={emp} />)}
    </div>
  )
}

export default function EmployeesPage() {
  const searchParams = useSearchParams()
  const { user, isMultiCompany, currentCompanyId, companies } = useAuth()
  const [data, setData] = React.useState<Employee[]>([])
  const [page, setPage] = React.useState(0)
  const [total, setTotal] = React.useState(0)
  const [limit, setLimit] = React.useState(50)
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

  // Отделы/должности выбранной в форме создания компании (для кадровика с мультидоступом)
  const [formDepartments, setFormDepartments] = React.useState<Department[]>([])
  const [formPositions, setFormPositions] = React.useState<Position[]>([])

  const allowedCompanies = React.useMemo(
    () => (user?.companyIds ? companies.filter(c => user.companyIds!.includes(c.id)) : []),
    [companies, user?.companyIds]
  )

  const loadFormCompanyOptions = React.useCallback((companyId: number) => {
    Promise.all([getDepartments(companyId), getPositions(companyId)])
      .then(([deps, pos]) => {
        setFormDepartments(deps)
        setFormPositions(pos)
      })
      .catch(() => {
        setFormDepartments([])
        setFormPositions([])
      })
  }, [])

  const handleFormCompanyChange = (companyId: number) => {
    setFormData(prev => ({ ...prev, companyId, departmentId: undefined, positionId: undefined }))
    loadFormCompanyOptions(companyId)
  }

  // Фильтры
  const [showFilters, setShowFilters] = React.useState(false)
  const [filterDept, setFilterDept] = React.useState<string>("")
  const [filterPosition, setFilterPosition] = React.useState<string>("")
  const [filterStatus, setFilterStatus] = React.useState<string>("")
  const [showDismissed, setShowDismissed] = React.useState(false)

  const hasExplicitFilters = !!(filterDept || filterPosition || filterStatus)
  // hasFilters drives server vs client-side fetch: hiding dismissed also requires loading all
  const hasFilters = hasExplicitFilters || !showDismissed
  const [viewMode, setViewMode] = React.useState<"table" | "gallery">("table")

  const filteredData = React.useMemo(() => {
    return data.filter((emp) => {
      // Hide dismissed unless explicitly shown or status filter is "Уволен"
      if (!showDismissed && filterStatus !== "Уволен" && emp.status === "Уволен") return false
      if (filterDept && String(emp.departmentId) !== filterDept) return false
      if (filterPosition && String(emp.positionId) !== filterPosition) return false
      if (filterStatus && emp.status !== filterStatus) return false
      return true
    })
  }, [data, showDismissed, filterDept, filterPosition, filterStatus])

  const dismissedCount = React.useMemo(
    () => data.filter((emp) => emp.status === "Уволен").length,
    [data]
  )

  const displayData = React.useMemo(() => {
    if (!hasFilters) return data
    return filteredData.slice(page * limit, (page + 1) * limit)
  }, [filteredData, hasFilters, page, limit, data])

  // Диалог подтверждения удаления
  const [deleteDialog, setDeleteDialog] = React.useState<{ id: number; name: string; inventoryCount: number } | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [formData, setFormData] = React.useState<CreateEmployeeInput>({
    firstName: "",
    lastName: "",
    patronymic: "",
    latinFirstName: "",
    latinLastName: "",
    birthDate: "",
    email: "",
    phone: "",
    address: "",
    departmentId: undefined,
    positionId: undefined,
  })

  const pageCount = hasFilters ? Math.ceil(filteredData.length / limit) : Math.ceil(total / limit)

  const loadEmployees = React.useCallback(() => {
    setError(null)
    const loadPage = hasFilters ? 1 : page + 1
    const loadLimit = hasFilters ? 1000 : limit
    getEmployees(loadPage, loadLimit, debouncedSearch)
      .then((result) => {
        setData(result.data)
        setTotal(result.total)
      })
      .catch((err) => {
        setData([])
        setTotal(0)
        setError(err instanceof Error ? err.message : "Ошибка загрузки данных")
      })
  }, [page, limit, debouncedSearch, hasFilters])

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
    const defaultCompanyId = isMultiCompany
      ? (currentCompanyId && user?.companyIds?.includes(currentCompanyId) ? currentCompanyId : user?.companyIds?.[0])
      : undefined
    setFormData({
      firstName: "",
      lastName: "",
      patronymic: "",
      latinFirstName: "",
      latinLastName: "",
      birthDate: "",
      email: "",
      phone: "",
      address: "",
      departmentId: undefined,
      positionId: undefined,
      managerId: undefined,
      status: "Активен",
      companyId: defaultCompanyId,
    })
    if (isMultiCompany && defaultCompanyId) {
      loadFormCompanyOptions(defaultCompanyId)
    }
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
      birthDate: employee.birthDate ? employee.birthDate.split("T")[0] : "",
      email: employee.email || "",
      phone: employee.phone || "",
      address: employee.address || "",
      departmentId: employee.departmentId || undefined,
      positionId: employee.positionId || undefined,
      managerId: employee.managerId || undefined,
      status: employee.status || "Активен",
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (employee: Employee) => {
    try {
      const inventory = await getEmployeeInventory(employee.id)
      setDeleteDialog({
        id: employee.id,
        name: `${employee.lastName} ${employee.firstName}`,
        inventoryCount: inventory.length,
      })
    } catch {
      setDeleteDialog({ id: employee.id, name: `${employee.lastName} ${employee.firstName}`, inventoryCount: 0 })
    }
  }

  const confirmDelete = async () => {
    if (!deleteDialog) return
    setIsDeleting(true)
    try {
      await deleteEmployee(deleteDialog.id)
      setDeleteDialog(null)
      loadEmployees()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления")
      setDeleteDialog(null)
    } finally {
      setIsDeleting(false)
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
    if (!formData.firstName || !formData.lastName) {
      setError("Заполните обязательные поля: Имя и Фамилия")
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
      size: 240,
      cell: ({ row }) => {
        const { lastName, firstName, patronymic, id, photoPath, updatedAt, department, position } = row.original
        const fullName = `${lastName} ${firstName} ${patronymic || ""}`.trim()

        return (
          <Link href={`/employees/${id}`} className="group flex items-center gap-2 sm:gap-3">
            <EmployeeAvatar
              employeeId={id}
              firstName={firstName}
              lastName={lastName}
              photoPath={photoPath}
              photoUpdatedAt={updatedAt}
              className="shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all shrink-0"
            />
            <div className="min-w-0">
              <div className="font-medium text-foreground group-hover:text-emerald-600 transition-colors truncate">
                {fullName}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3 shrink-0" />
                <span>ID: {id}</span>
              </div>
              {/* На мобиле показываем отдел и должность прямо здесь */}
              <div className="sm:hidden mt-0.5 space-y-0.5">
                {position?.name && (
                  <div className="text-xs text-purple-600 truncate">{position.name}</div>
                )}
                {department?.name && (
                  <div className="text-xs text-blue-600 truncate">{department.name}</div>
                )}
              </div>
            </div>
          </Link>
        )
      },
    },
    {
      accessorKey: "position.name",
      header: "Должность",
      size: 160,
      meta: { className: "hidden sm:table-cell" },
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
      size: 150,
      meta: { className: "hidden sm:table-cell" },
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
      size: 160,
      meta: { className: "hidden md:table-cell" },
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
      id: "documents",
      header: "Документы",
      size: 100,
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => {
        const docs = row.original.documents ?? []
        const TOTAL = 10
        const ALL_IDS = ["passport", "snils", "inn", "employment_contract", "employment_order", "diploma", "photo", "medical", "military_id", "other"]
        const ALL_NAMES = ["Паспорт", "СНИЛС", "ИНН", "Трудовой договор", "Приказ о приёме", "Диплом / Аттестат", "Фотография 3x4", "Медицинская справка", "Военный билет", "Прочие документы"]
        const uploadedTypes = new Set(docs.map((d) => d.type))
        const uploadedCount = ALL_IDS.filter((id, i) => uploadedTypes.has(id) || uploadedTypes.has(ALL_NAMES[i])).length
        const pct = Math.round((uploadedCount / TOTAL) * 100)
        const color = pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-400" : "bg-red-400"
        const textColor = pct >= 80 ? "text-emerald-700" : pct >= 40 ? "text-amber-700" : "text-red-600"
        return (
          <div className="space-y-1">
            <span className={`text-xs font-semibold ${textColor}`}>{pct}%</span>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      },
    },
    {
      id: "actions",
      header: "",
      size: 52,
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
                  onClick={() => handleDelete(employee)}
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
    onPageSizeChange: (size: number) => { setLimit(size); setPage(0) },
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
              className={`h-9 rounded-xl text-xs sm:text-sm gap-1.5 ${showFilters || hasExplicitFilters ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-emerald-200 bg-white/80"}`}
            >
              <Filter className="h-3.5 w-3.5" />
              Фильтры
              {hasExplicitFilters && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white font-bold">
                  {[filterDept, filterPosition, filterStatus].filter(Boolean).length}
                </span>
              )}
            </Button>
            <button
              onClick={() => { setShowDismissed((v) => !v); setPage(0) }}
              className={`flex items-center gap-1.5 h-9 rounded-xl px-3 text-xs font-medium border transition-colors ${showDismissed ? "border-gray-400 bg-gray-100 text-gray-700 hover:bg-gray-200" : "border-gray-200 bg-white/80 text-gray-500 hover:bg-gray-50"}`}
              title={showDismissed ? "Скрыть уволенных" : "Показать уволенных"}
            >
              {showDismissed ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{showDismissed ? "Уволенные видны" : "Уволенные скрыты"}</span>
              {!showDismissed && dismissedCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-400 text-[10px] text-white font-bold">{dismissedCount}</span>
              )}
            </button>
            {/* Переключатель вида */}
            <div className="flex rounded-xl border border-emerald-200 overflow-hidden">
              <button
                onClick={() => setViewMode("table")}
                className={`flex h-9 w-9 items-center justify-center transition-colors ${viewMode === "table" ? "bg-emerald-500 text-white" : "bg-white/80 text-muted-foreground hover:bg-emerald-50"}`}
                title="Таблица"
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("gallery")}
                className={`flex h-9 w-9 items-center justify-center transition-colors ${viewMode === "gallery" ? "bg-emerald-500 text-white" : "bg-white/80 text-muted-foreground hover:bg-emerald-50"}`}
                title="Галерея фотографий"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-100 to-teal-100 px-2 sm:px-3 py-1 sm:py-1.5 text-emerald-700 font-medium text-xs sm:text-sm">
                <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                {hasExplicitFilters ? `${filteredData.length} из ${data.length}` : `Всего: ${filteredData.length}`}
              </span>
            </div>
          </div>
        </div>

        {/* Панель фильтров */}
        {showFilters && (
          <div className="flex flex-wrap items-end gap-3 px-3 sm:px-5 py-3 bg-emerald-50/50 border-b border-emerald-100/50">
            <div className="flex-1 min-w-[150px] space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Отдел</label>
              <select
                value={filterDept}
                onChange={(e) => { setFilterDept(e.target.value); setPage(0) }}
                className="w-full h-9 rounded-lg border border-emerald-200 bg-white px-2 text-sm"
              >
                <option value="">Все отделы</option>
                {departments.map((d) => (
                  <option key={d.id} value={String(d.id)}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[150px] space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Должность</label>
              <select
                value={filterPosition}
                onChange={(e) => { setFilterPosition(e.target.value); setPage(0) }}
                className="w-full h-9 rounded-lg border border-emerald-200 bg-white px-2 text-sm"
              >
                <option value="">Все должности</option>
                {positions.map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[130px] space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Статус</label>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(0) }}
                className="w-full h-9 rounded-lg border border-emerald-200 bg-white px-2 text-sm"
              >
                <option value="">Все статусы</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            {hasExplicitFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFilterDept(""); setFilterPosition(""); setFilterStatus(""); setPage(0) }}
                className="h-9 rounded-lg text-xs text-red-500 hover:text-red-600 hover:bg-red-50 gap-1"
              >
                <X className="h-3.5 w-3.5" />
                Сбросить
              </Button>
            )}
          </div>
        )}

        {error && (
          <div className="mx-3 sm:mx-5 mt-3 sm:mt-4 rounded-xl bg-red-50 border border-red-200 p-3 sm:p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="p-3 sm:p-5">
          {viewMode === "table" ? (
            <DataTable
              columns={columns}
              data={displayData}
              pagination={pagination}
              getRowClassName={(emp: Employee) =>
                emp.status === "Уволен"
                  ? "opacity-50 bg-gray-50 hover:bg-gray-100"
                  : "hover:bg-emerald-50/50"
              }
            />
          ) : (
            <EmployeeGallery employees={displayData} />
          )}
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
        {isMultiCompany && !editingEmployee && (
          <div className="space-y-2 mb-4">
            <Label htmlFor="emp-company">Компания *</Label>
            <select
              id="emp-company"
              value={formData.companyId || ""}
              onChange={(e) => handleFormCompanyChange(Number(e.target.value))}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
            >
              {allowedCompanies.map((c) => (
                <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
              ))}
            </select>
          </div>
        )}
        <EmployeeFormFields
          value={formData}
          onChange={setFormData}
          departments={isMultiCompany && !editingEmployee ? formDepartments : departments}
          positions={isMultiCompany && !editingEmployee ? formPositions : positions}
          managers={data}
          excludeManagerId={editingEmployee?.id}
        />
      </CrudModal>

      {/* Диалог подтверждения удаления */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Удалить сотрудника
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <span className="block">
                Вы уверены, что хотите удалить <span className="font-semibold text-foreground">{deleteDialog?.name}</span>?
              </span>
              {deleteDialog && deleteDialog.inventoryCount > 0 && (
                <span className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-800 text-sm">
                  <Package className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                  <span>
                    У сотрудника <span className="font-semibold">{deleteDialog.inventoryCount}</span> {
                      deleteDialog.inventoryCount === 1 ? "предмет инвентаря" :
                      deleteDialog.inventoryCount < 5 ? "предмета инвентаря" : "предметов инвентаря"
                    }. Весь инвентарь будет автоматически откреплён и переведён в статус «В наличии».
                  </span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteDialog(null)} disabled={isDeleting}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? "Удаление..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
