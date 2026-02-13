"use client"

import * as React from "react"
import { useAuth } from "@/app/contexts/AuthContext"
import { useRouter } from "next/navigation"
import type { SystemUser, Role, Company } from "@/lib/types"
import {
  getUsers,
  getRoles,
  createUser,
  updateUser,
  changeUserPassword,
  deleteUser,
  getCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
} from "@/lib/hrms-api"
import { DataTable } from "@/components/data-table"
import { CrudModal } from "@/components/crud-modal"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ColumnDef } from "@tanstack/react-table"
import {
  Shield,
  Users,
  Building2,
  UserPlus,
  Edit,
  Trash2,
  Key,
  MoreHorizontal,
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Plus,
  Mail,
  User,
  Crown,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

// ===================== USERS TAB =====================

function UsersTab() {
  const [users, setUsers] = React.useState<SystemUser[]>([])
  const [roles, setRoles] = React.useState<Role[]>([])
  const [companies, setCompanies] = React.useState<Company[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")

  // Modal states
  const [isModalOpen, setIsModalOpen] = React.useState(false)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [editingUser, setEditingUser] = React.useState<SystemUser | null>(null)
  const [passwordUserId, setPasswordUserId] = React.useState<number | null>(null)
  const [passwordUserEmail, setPasswordUserEmail] = React.useState("")
  const [newPassword, setNewPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [formData, setFormData] = React.useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    roleId: 0,
    companyId: undefined as number | undefined,
    isActive: true,
  })

  const loadData = React.useCallback(() => {
    setError(null)
    Promise.all([getUsers(), getRoles(), getCompanies()])
      .then(([u, r, c]) => {
        setUsers(u)
        setRoles(r)
        setCompanies(c)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Ошибка загрузки данных")
      })
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const filteredUsers = React.useMemo(() => {
    if (!search) return users
    const s = search.toLowerCase()
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(s) ||
        (u.firstName && u.firstName.toLowerCase().includes(s)) ||
        (u.lastName && u.lastName.toLowerCase().includes(s)) ||
        u.role.name.toLowerCase().includes(s) ||
        (u.company?.name && u.company.name.toLowerCase().includes(s))
    )
  }, [users, search])

  const handleOpenCreate = () => {
    setEditingUser(null)
    setFormData({
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      roleId: roles.length > 0 ? roles[0].id : 0,
      companyId: undefined,
      isActive: true,
    })
    setIsModalOpen(true)
  }

  const handleOpenEdit = (user: SystemUser) => {
    setEditingUser(user)
    setFormData({
      email: user.email,
      password: "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      roleId: user.roleId,
      companyId: user.companyId || undefined,
      isActive: user.isActive,
    })
    setIsModalOpen(true)
  }

  const handleOpenPassword = (user: SystemUser) => {
    setPasswordUserId(user.id)
    setPasswordUserEmail(user.email)
    setNewPassword("")
    setShowPassword(false)
    setIsPasswordModalOpen(true)
  }

  const handleSave = async () => {
    if (!formData.email) {
      setError("Укажите email")
      return
    }
    if (!editingUser && !formData.password) {
      setError("Укажите пароль")
      return
    }
    if (!formData.roleId) {
      setError("Выберите роль")
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          email: formData.email,
          firstName: formData.firstName || undefined,
          lastName: formData.lastName || undefined,
          roleId: formData.roleId,
          companyId: formData.companyId || null,
          isActive: formData.isActive,
        })
      } else {
        await createUser({
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName || undefined,
          lastName: formData.lastName || undefined,
          roleId: formData.roleId,
          companyId: formData.companyId,
        })
      }
      setIsModalOpen(false)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setIsSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (!passwordUserId || !newPassword) {
      setError("Укажите новый пароль")
      return
    }
    if (newPassword.length < 6) {
      setError("Пароль должен быть не менее 6 символов")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await changeUserPassword(passwordUserId, newPassword)
      setIsPasswordModalOpen(false)
      setNewPassword("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка смены пароля")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (user: SystemUser) => {
    if (!confirm(`Удалить пользователя ${user.email}?`)) return
    try {
      await deleteUser(user.id)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления")
    }
  }

  const getRoleBadgeColor = (roleName: string) => {
    switch (roleName) {
      case "Суперадмин":
        return "from-amber-100 to-orange-100 text-amber-700"
      case "Кадровик":
        return "from-emerald-100 to-teal-100 text-emerald-700"
      case "Руководитель":
        return "from-blue-100 to-indigo-100 text-blue-700"
      case "Бухгалтер":
        return "from-purple-100 to-pink-100 text-purple-700"
      default:
        return "from-gray-100 to-gray-200 text-gray-700"
    }
  }

  const columns: ColumnDef<SystemUser>[] = [
    {
      accessorKey: "email",
      header: "Пользователь",
      cell: ({ row }) => {
        const u = row.original
        const name = [u.lastName, u.firstName].filter(Boolean).join(" ") || u.email
        const initials = u.firstName && u.lastName
          ? `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase()
          : u.email.charAt(0).toUpperCase()

        return (
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm ${
              u.isHoldingAdmin
                ? "bg-gradient-to-br from-amber-500 to-orange-500"
                : "bg-gradient-to-br from-emerald-500 to-teal-500"
            }`}>
              {initials}
            </div>
            <div>
              <div className="font-medium text-foreground">{name}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />
                <span>{u.email}</span>
              </div>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "role.name",
      header: "Роль",
      cell: ({ row }) => (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r px-3 py-1.5 text-xs font-medium ${getRoleBadgeColor(row.original.role.name)}`}>
          {row.original.isHoldingAdmin && <Crown className="h-3 w-3" />}
          {row.original.role.name}
        </span>
      ),
    },
    {
      accessorKey: "company.name",
      header: "Компания",
      cell: ({ row }) =>
        row.original.company ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-100 to-cyan-100 px-3 py-1.5 text-xs font-medium text-blue-700">
            <Building2 className="h-3 w-3" />
            {row.original.company.shortName || row.original.company.name}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 px-3 py-1.5 text-xs font-medium text-amber-700">
            <Crown className="h-3 w-3" />
            Все компании
          </span>
        ),
    },
    {
      accessorKey: "isActive",
      header: "Статус",
      cell: ({ row }) =>
        row.original.isActive ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            Активен
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500">
            <XCircle className="h-4 w-4" />
            Отключён
          </span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const u = row.original
        return (
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
                <DropdownMenuItem onClick={() => handleOpenEdit(u)} className="cursor-pointer">
                  <Edit className="mr-2 h-4 w-4" />
                  Редактировать
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleOpenPassword(u)} className="cursor-pointer">
                  <Key className="mr-2 h-4 w-4" />
                  Сменить пароль
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 cursor-pointer focus:text-red-600"
                  onClick={() => handleDelete(u)}
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

  const activeCount = users.filter((u) => u.isActive).length
  const adminCount = users.filter((u) => u.isHoldingAdmin).length

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-emerald-100">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-bold">{users.length}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Всего</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-blue-100">
            <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-bold">{activeCount}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Активных</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-amber-100">
            <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-bold">{adminCount}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Админов</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-5 border-b border-emerald-100/50">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 sm:left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по email, имени, роли..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 sm:pl-11 h-10 sm:h-11 rounded-xl bg-white/80 border-emerald-100 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <Button
            onClick={handleOpenCreate}
            className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-105 text-xs sm:text-sm"
          >
            <UserPlus className="mr-1 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Добавить пользователя</span>
            <span className="sm:hidden">Добавить</span>
          </Button>
        </div>

        {error && (
          <div className="mx-3 sm:mx-5 mt-3 sm:mt-4 rounded-xl bg-red-50 border border-red-200 p-3 sm:p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="p-3 sm:p-5">
          <DataTable columns={columns} data={filteredUsers} />
        </div>
      </div>

      {/* Modal: Create / Edit User */}
      <CrudModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? "Редактировать пользователя" : "Новый пользователь"}
        description={editingUser ? "Измените данные пользователя" : "Заполните данные нового пользователя системы"}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 sm:pr-2">
          <div className="space-y-2">
            <Label htmlFor="userEmail">Email *</Label>
            <Input
              id="userEmail"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="user@company.tj"
              className="h-10 rounded-xl"
            />
          </div>

          {!editingUser && (
            <div className="space-y-2">
              <Label htmlFor="userPassword">Пароль *</Label>
              <div className="relative">
                <Input
                  id="userPassword"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Минимум 6 символов"
                  className="h-10 rounded-xl pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="userLastName">Фамилия</Label>
              <Input
                id="userLastName"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="Фамилия"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="userFirstName">Имя</Label>
              <Input
                id="userFirstName"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="Имя"
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="userRole">Роль *</Label>
            <select
              id="userRole"
              value={formData.roleId}
              onChange={(e) => setFormData({ ...formData, roleId: Number(e.target.value) })}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value={0}>Выберите роль</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="userCompany">Компания</Label>
            <select
              id="userCompany"
              value={formData.companyId || ""}
              onChange={(e) => setFormData({ ...formData, companyId: e.target.value ? Number(e.target.value) : undefined })}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="">Без компании (холдинг)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Суперадмины без компании видят данные всех компаний
            </p>
          </div>

          {editingUser && (
            <div className="flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
              <Label htmlFor="userActive" className="flex-1 cursor-pointer text-sm">
                Пользователь активен
              </Label>
              <button
                id="userActive"
                type="button"
                onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  formData.isActive ? "bg-emerald-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    formData.isActive ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          )}
        </div>
      </CrudModal>

      {/* Modal: Change Password */}
      <CrudModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="Смена пароля"
        description={`Новый пароль для ${passwordUserEmail}`}
        onSave={handleChangePassword}
        isSaving={isSaving}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPwd">Новый пароль *</Label>
            <div className="relative">
              <Input
                id="newPwd"
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                className="h-10 rounded-xl pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </CrudModal>
    </div>
  )
}

// ===================== COMPANIES TAB =====================

function CompaniesTab() {
  const [companies, setCompanies] = React.useState<Company[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [isModalOpen, setIsModalOpen] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [editingCompany, setEditingCompany] = React.useState<Company | null>(null)
  const [formData, setFormData] = React.useState({
    name: "",
    shortName: "",
    inn: "",
    address: "",
    phone: "",
    email: "",
    isActive: true,
  })

  const loadData = React.useCallback(() => {
    setError(null)
    getCompanies()
      .then(setCompanies)
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"))
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const filteredCompanies = React.useMemo(() => {
    if (!search) return companies
    const s = search.toLowerCase()
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        (c.shortName && c.shortName.toLowerCase().includes(s)) ||
        (c.inn && c.inn.toLowerCase().includes(s))
    )
  }, [companies, search])

  const handleOpenCreate = () => {
    setEditingCompany(null)
    setFormData({ name: "", shortName: "", inn: "", address: "", phone: "", email: "", isActive: true })
    setIsModalOpen(true)
  }

  const handleOpenEdit = (company: Company) => {
    setEditingCompany(company)
    setFormData({
      name: company.name,
      shortName: company.shortName || "",
      inn: company.inn || "",
      address: company.address || "",
      phone: company.phone || "",
      email: company.email || "",
      isActive: company.isActive,
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name) {
      setError("Укажите название компании")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const payload: Partial<Company> = {
        name: formData.name,
        shortName: formData.shortName || null,
        inn: formData.inn || null,
        address: formData.address || null,
        phone: formData.phone || null,
        email: formData.email || null,
        isActive: formData.isActive,
      }
      if (editingCompany) {
        await updateCompany(editingCompany.id, payload)
      } else {
        await createCompany(payload)
      }
      setIsModalOpen(false)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (company: Company) => {
    if (!confirm(`Удалить компанию "${company.name}"? Все данные компании будут потеряны.`)) return
    try {
      await deleteCompany(company.id)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления")
    }
  }

  const columns: ColumnDef<Company>[] = [
    {
      accessorKey: "name",
      header: "Компания",
      cell: ({ row }) => {
        const c = row.original
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-sm font-bold text-white shadow-sm">
              {c.shortName ? c.shortName.charAt(0).toUpperCase() : c.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-foreground">{c.name}</div>
              {c.shortName && (
                <div className="text-xs text-muted-foreground">{c.shortName}</div>
              )}
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "inn",
      header: "ИНН",
      cell: ({ row }) => row.original.inn || <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "_count.employees",
      header: "Сотрудники",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-100 to-teal-100 px-3 py-1.5 text-xs font-medium text-emerald-700">
          <Users className="h-3 w-3" />
          {row.original._count?.employees ?? 0}
        </span>
      ),
    },
    {
      accessorKey: "_count.users",
      header: "Пользователи",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-100 to-pink-100 px-3 py-1.5 text-xs font-medium text-purple-700">
          <User className="h-3 w-3" />
          {row.original._count?.users ?? 0}
        </span>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Статус",
      cell: ({ row }) =>
        row.original.isActive ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            Активна
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500">
            <XCircle className="h-4 w-4" />
            Отключена
          </span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const c = row.original
        return (
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
                <DropdownMenuItem onClick={() => handleOpenEdit(c)} className="cursor-pointer">
                  <Edit className="mr-2 h-4 w-4" />
                  Редактировать
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 cursor-pointer focus:text-red-600"
                  onClick={() => handleDelete(c)}
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

  const totalEmployees = companies.reduce((sum, c) => sum + (c._count?.employees ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-blue-100">
            <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-bold">{companies.length}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Компаний</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-emerald-100">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-bold">{totalEmployees}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Сотрудников</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-green-100">
            <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-bold">{companies.filter((c) => c.isActive).length}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Активных</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-5 border-b border-emerald-100/50">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 sm:left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по названию, ИНН..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 sm:pl-11 h-10 sm:h-11 rounded-xl bg-white/80 border-emerald-100 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <Button
            onClick={handleOpenCreate}
            className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:scale-105 text-xs sm:text-sm"
          >
            <Plus className="mr-1 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Добавить компанию</span>
            <span className="sm:hidden">Добавить</span>
          </Button>
        </div>

        {error && (
          <div className="mx-3 sm:mx-5 mt-3 sm:mt-4 rounded-xl bg-red-50 border border-red-200 p-3 sm:p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="p-3 sm:p-5">
          <DataTable columns={columns} data={filteredCompanies} />
        </div>
      </div>

      {/* Modal: Create / Edit Company */}
      <CrudModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCompany ? "Редактировать компанию" : "Новая компания"}
        description={editingCompany ? "Измените данные компании" : "Заполните данные новой компании холдинга"}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 sm:pr-2">
          <div className="space-y-2">
            <Label htmlFor="companyName">Название *</Label>
            <Input
              id="companyName"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Полное название компании"
              className="h-10 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyShortName">Краткое название</Label>
              <Input
                id="companyShortName"
                value={formData.shortName}
                onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                placeholder="Сокращение"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyInn">ИНН</Label>
              <Input
                id="companyInn"
                value={formData.inn}
                onChange={(e) => setFormData({ ...formData, inn: e.target.value })}
                placeholder="ИНН компании"
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyAddress">Адрес</Label>
            <Input
              id="companyAddress"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Юридический адрес"
              className="h-10 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyPhone">Телефон</Label>
              <Input
                id="companyPhone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+992 ..."
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyEmail">Email</Label>
              <Input
                id="companyEmail"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="info@company.tj"
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          {editingCompany && (
            <div className="flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
              <Label htmlFor="companyActive" className="flex-1 cursor-pointer text-sm">
                Компания активна
              </Label>
              <button
                id="companyActive"
                type="button"
                onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  formData.isActive ? "bg-emerald-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    formData.isActive ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          )}
        </div>
      </CrudModal>
    </div>
  )
}

// ===================== MAIN PAGE =====================

export default function AdminPage() {
  const { isHoldingAdmin, isLoading } = useAuth()
  const router = useRouter()

  React.useEffect(() => {
    if (!isLoading && !isHoldingAdmin) {
      router.push("/dashboard")
    }
  }, [isLoading, isHoldingAdmin, router])

  if (isLoading || !isHoldingAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
              <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Админ-панель</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Управление пользователями и компаниями холдинга
              </p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="bg-white/80 backdrop-blur-sm border border-white/50 shadow-sm rounded-xl p-1">
          <TabsTrigger
            value="users"
            className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm px-4 py-2 text-sm"
          >
            <Users className="mr-2 h-4 w-4" />
            Пользователи
          </TabsTrigger>
          <TabsTrigger
            value="companies"
            className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-indigo-500 data-[state=active]:text-white data-[state=active]:shadow-sm px-4 py-2 text-sm"
          >
            <Building2 className="mr-2 h-4 w-4" />
            Компании
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UsersTab />
        </TabsContent>

        <TabsContent value="companies">
          <CompaniesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
