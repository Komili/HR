"use client"

import * as React from "react"
import { useDebounce } from "use-debounce"
import { useSearchParams } from "next/navigation"
import { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import type { InventoryItem, CreateInventoryItemInput, UpdateInventoryItemInput, Employee, InventoryHistory } from "@/lib/types"
import { DataTable } from "@/components/data-table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CrudModal } from "@/components/crud-modal"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  getInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getEmployees,
  getInventoryHistory,
} from "@/lib/hrms-api"
import {
  Package,
  Search,
  Plus,
  CheckCircle2,
  MoreHorizontal,
  Edit,
  Trash2,
  Wrench,
  Archive,
  UserCheck,
  History,
  ArrowRightLeft,
  CirclePlus,
  Pencil,
  Undo2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const STATUS_OPTIONS = [
  { value: "В наличии", label: "В наличии" },
  { value: "Выдан", label: "Выдан" },
  { value: "В ремонте", label: "В ремонте" },
  { value: "Списан", label: "Списан" },
]

const CATEGORY_OPTIONS = [
  "Компьютеры",
  "Оргтехника",
  "Мебель",
  "Транспорт",
  "Инструменты",
  "Средства связи",
  "Прочее",
]

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "В наличии": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Выдан": "bg-blue-100 text-blue-700 border-blue-200",
    "В ремонте": "bg-amber-100 text-amber-700 border-amber-200",
    "Списан": "bg-red-100 text-red-700 border-red-200",
  }

  const icons: Record<string, React.ElementType> = {
    "В наличии": CheckCircle2,
    "Выдан": UserCheck,
    "В ремонте": Wrench,
    "Списан": Archive,
  }

  const Icon = icons[status] || Package
  const style = styles[status] || "bg-gray-100 text-gray-700 border-gray-200"

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${style}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  )
}

const ACTION_STYLES: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  "Создан": { bg: "bg-emerald-100 border-emerald-200", text: "text-emerald-700", icon: CirclePlus },
  "Изменён": { bg: "bg-blue-100 border-blue-200", text: "text-blue-700", icon: Pencil },
  "Выдан": { bg: "bg-purple-100 border-purple-200", text: "text-purple-700", icon: ArrowRightLeft },
  "Возвращён": { bg: "bg-amber-100 border-amber-200", text: "text-amber-700", icon: Undo2 },
  "Удалён": { bg: "bg-red-100 border-red-200", text: "text-red-700", icon: Trash2 },
}

function ActionBadge({ action }: { action: string }) {
  const style = ACTION_STYLES[action] || { bg: "bg-gray-100 border-gray-200", text: "text-gray-700", icon: History }
  const Icon = style.icon

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${style.bg} ${style.text}`}>
      <Icon className="h-3 w-3" />
      {action}
    </span>
  )
}

function formatDateTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function InventoryPage() {
  const searchParams = useSearchParams()
  const [data, setData] = React.useState<InventoryItem[]>([])
  const [page, setPage] = React.useState(0)
  const [total, setTotal] = React.useState(0)
  const limit = 10
  const [search, setSearch] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [debouncedSearch] = useDebounce(search, 500)

  const [isModalOpen, setIsModalOpen] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [editingItem, setEditingItem] = React.useState<InventoryItem | null>(null)
  const [employees, setEmployees] = React.useState<Employee[]>([])
  const [formData, setFormData] = React.useState<CreateInventoryItemInput>({
    name: "",
    model: "",
    category: "",
    inventoryNumber: "",
    price: undefined,
    acquisitionDate: "",
    description: "",
    status: "В наличии",
    employeeId: undefined,
  })

  // History dialog state
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false)
  const [historyData, setHistoryData] = React.useState<InventoryHistory[]>([])
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [historyItemName, setHistoryItemName] = React.useState("")

  const pageCount = Math.ceil(total / limit)

  // Stats
  const availableCount = data.filter(i => i.status === "В наличии").length
  const assignedCount = data.filter(i => i.status === "Выдан").length

  React.useEffect(() => {
    if (searchParams.get("action") === "create") {
      handleOpenCreateModal()
      window.history.replaceState({}, "", "/inventory")
    }
  }, [searchParams])

  const loadInventory = React.useCallback(() => {
    setError(null)
    getInventoryItems(page + 1, limit, debouncedSearch)
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
    loadInventory()
  }, [loadInventory])

  React.useEffect(() => {
    getEmployees(1, 1000, "")
      .then((result) => setEmployees(result.data))
      .catch(() => {})
  }, [])

  const handleOpenCreateModal = () => {
    setEditingItem(null)
    setFormData({
      name: "",
      model: "",
      category: "",
      inventoryNumber: "",
      price: undefined,
      acquisitionDate: "",
      description: "",
      status: "В наличии",
      employeeId: undefined,
    })
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (item: InventoryItem) => {
    setEditingItem(item)
    setFormData({
      name: item.name,
      model: item.model || "",
      category: item.category || "",
      inventoryNumber: item.inventoryNumber || "",
      price: item.price || undefined,
      acquisitionDate: item.acquisitionDate ? item.acquisitionDate.split("T")[0] : "",
      description: item.description || "",
      status: item.status,
      employeeId: item.employeeId || undefined,
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (confirm("Вы уверены, что хотите удалить этот инвентарь?")) {
      try {
        await deleteInventoryItem(id)
        loadInventory()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка удаления")
      }
    }
  }

  const handleSave = async () => {
    if (!formData.name) {
      setError("Заполните обязательное поле: Название")
      return
    }

    setIsSaving(true)
    try {
      const payload = { ...formData }
      // Clean empty strings
      if (!payload.model) delete payload.model
      if (!payload.category) delete payload.category
      if (!payload.inventoryNumber) delete payload.inventoryNumber
      if (!payload.acquisitionDate) delete payload.acquisitionDate
      if (!payload.description) delete payload.description

      if (editingItem) {
        await updateInventoryItem(editingItem.id, payload as UpdateInventoryItemInput)
      } else {
        await createInventoryItem(payload)
      }
      setIsModalOpen(false)
      loadInventory()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpenHistory = async (item: InventoryItem) => {
    setHistoryItemName(item.name)
    setHistoryData([])
    setHistoryLoading(true)
    setIsHistoryOpen(true)
    try {
      const history = await getInventoryHistory(item.id)
      setHistoryData(history)
    } catch {
      setHistoryData([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const columns: ColumnDef<InventoryItem>[] = [
    {
      accessorKey: "name",
      header: "Название",
      cell: ({ row }) => {
        const { name, model } = row.original
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100">
              <Package className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <button
                onClick={() => handleOpenHistory(row.original)}
                className="font-medium text-foreground hover:text-indigo-600 hover:underline transition-colors text-left"
              >
                {name}
              </button>
              {model && (
                <div className="text-xs text-muted-foreground">{model}</div>
              )}
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "category",
      header: "Категория",
      cell: ({ row }) =>
        row.original.category ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-100 to-pink-100 px-3 py-1.5 text-xs font-medium text-purple-700">
            {row.original.category}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "inventoryNumber",
      header: "Инв. номер",
      cell: ({ row }) =>
        row.original.inventoryNumber ? (
          <span className="font-mono text-sm text-gray-600">{row.original.inventoryNumber}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "price",
      header: "Цена",
      cell: ({ row }) =>
        row.original.price != null ? (
          <span className="text-sm font-medium">
            {row.original.price.toLocaleString("ru-RU")} сом.
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "status",
      header: "Статус",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "employee",
      header: "Закреплён за",
      cell: ({ row }) => {
        const emp = row.original.employee
        if (!emp) return <span className="text-muted-foreground">—</span>
        const fullName = `${emp.lastName} ${emp.firstName}`
        return (
          <Link
            href={`/employees/${emp.id}`}
            className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline"
          >
            {fullName}
          </Link>
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
              <Button
                variant="ghost"
                className="h-8 w-8 p-0 hover:bg-emerald-50 data-[state=open]:bg-emerald-50"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Действия</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleOpenHistory(row.original)}
                className="cursor-pointer"
              >
                <History className="mr-2 h-4 w-4" />
                История
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleOpenEditModal(row.original)}
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
      label: "Всего",
      value: total,
      icon: Package,
      color: "text-indigo-600",
      bg: "bg-indigo-100",
    },
    {
      label: "В наличии",
      value: availableCount,
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-100",
    },
    {
      label: "Выдано",
      value: assignedCount,
      icon: UserCheck,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/25">
              <Package className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Инвентарь</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Учёт имущества и оборудования компании
              </p>
            </div>
          </div>
        </div>
        <Button
          onClick={handleOpenCreateModal}
          className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-105 text-xs sm:text-sm"
        >
          <Plus className="mr-1 sm:mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Добавить инвентарь</span>
          <span className="sm:hidden">Добавить</span>
        </Button>
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
              placeholder="Поиск по названию, модели..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 sm:pl-11 h-10 sm:h-11 rounded-xl bg-white/80 border-emerald-100 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 px-2 sm:px-3 py-1 sm:py-1.5 text-indigo-700 font-medium text-xs sm:text-sm">
              <Package className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Всего: {total}
            </span>
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
        title={editingItem ? "Редактировать инвентарь" : "Добавить инвентарь"}
        description={editingItem ? "Измените данные инвентаря" : "Заполните данные нового инвентаря"}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 sm:pr-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Название *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Введите название"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Модель</Label>
              <Input
                id="model"
                value={formData.model || ""}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="Введите модель"
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Категория</Label>
              <select
                id="category"
                value={formData.category || ""}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">Выберите категорию</option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventoryNumber">Инвентарный номер</Label>
              <Input
                id="inventoryNumber"
                value={formData.inventoryNumber || ""}
                onChange={(e) => setFormData({ ...formData, inventoryNumber: e.target.value })}
                placeholder="Введите инвентарный номер"
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Цена</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                value={formData.price ?? ""}
                onChange={(e) => setFormData({ ...formData, price: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="Введите цену"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acquisitionDate">Дата приобретения</Label>
              <Input
                id="acquisitionDate"
                type="date"
                value={formData.acquisitionDate || ""}
                onChange={(e) => setFormData({ ...formData, acquisitionDate: e.target.value })}
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Статус</Label>
              <select
                id="status"
                value={formData.status || "В наличии"}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee">Закрепить за сотрудником</Label>
              <select
                id="employee"
                value={formData.employeeId || ""}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">Не закреплён</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.lastName} {emp.firstName} {emp.patronymic || ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Описание</Label>
            <textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Введите описание"
              rows={3}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>
      </CrudModal>

      {/* History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-indigo-600" />
              История: {historyItemName}
            </DialogTitle>
            <DialogDescription>
              Полная история изменений инвентаря
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2">
            {historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
              </div>
            ) : historyData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <History className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">История пуста</p>
              </div>
            ) : (
              <div className="relative pl-6">
                {/* Timeline line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-indigo-200 via-purple-200 to-transparent" />

                <div className="space-y-4">
                  {historyData.map((entry, index) => (
                    <div key={entry.id} className="relative flex gap-4">
                      {/* Timeline dot */}
                      <div className={`absolute -left-6 top-1.5 h-3 w-3 rounded-full border-2 border-white shadow-sm ${
                        index === 0 ? "bg-indigo-500" : "bg-gray-300"
                      }`} />

                      <div className="flex-1 rounded-xl border bg-white/80 p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <ActionBadge action={entry.action} />
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(entry.createdAt)}
                          </span>
                        </div>

                        {entry.details && (
                          <p className="text-sm text-gray-700 mb-2">{entry.details}</p>
                        )}

                        {entry.employeeName && (
                          <div className="flex items-center gap-1.5 text-sm text-purple-600">
                            <UserCheck className="h-3.5 w-3.5" />
                            {entry.employeeName}
                          </div>
                        )}

                        <div className="mt-2 text-xs text-muted-foreground">
                          {entry.performedBy}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
