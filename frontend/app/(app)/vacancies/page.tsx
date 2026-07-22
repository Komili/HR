"use client"

import React, { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  UserSearch,
  Plus,
  Search,
  Users,
  Star,
  MoreHorizontal,
  Edit,
  Trash2,
  Briefcase,
  Building2,
  Landmark,
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
import { useAuth } from "@/app/contexts/AuthContext"
import type { Vacancy, Department, Position } from "@/lib/types"
import {
  getVacancies,
  createVacancy,
  updateVacancy,
  deleteVacancy,
  getDepartments,
  getPositions,
} from "@/lib/hrms-api"

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Открыта",
  ON_HOLD: "На паузе",
  CLOSED: "Закрыта",
}

const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ON_HOLD: "bg-amber-100 text-amber-700 border-amber-200",
  CLOSED: "bg-gray-100 text-gray-600 border-gray-200",
}

type VacancyForm = {
  id?: number
  title?: string
  companyId?: number
  departmentId?: number | null
  positionId?: number | null
  description?: string
  status?: string
}

export default function VacanciesPage() {
  const { user, currentCompanyId, companies, isHoldingAdmin, isMultiCompany } = useAuth()
  const [vacancies, setVacancies] = useState<Vacancy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState<VacancyForm>({})
  const [isSaving, setIsSaving] = useState(false)

  // Отделы/должности выбранной в форме компании (нужны для суперадмина / кадровика с мультидоступом)
  const [formDepartments, setFormDepartments] = useState<Department[]>([])
  const [formPositions, setFormPositions] = useState<Position[]>([])

  // Компании, для которых можно создавать вакансии: суперадмин — все, мультидоступ-кадровик — свои
  const allowedCompanies = useMemo(() => {
    if (isHoldingAdmin) return companies
    if (user?.companyIds) return companies.filter((c) => user.companyIds!.includes(c.id))
    return []
  }, [isHoldingAdmin, companies, user?.companyIds])
  const showCompanySelector = isHoldingAdmin || isMultiCompany

  const loadFormCompanyOptions = (companyId: number) => {
    Promise.all([getDepartments(companyId), getPositions(companyId)])
      .then(([deps, pos]) => {
        setFormDepartments(deps)
        setFormPositions(pos)
      })
      .catch(() => {
        setFormDepartments([])
        setFormPositions([])
      })
  }

  const refresh = () => {
    setLoading(true)
    getVacancies()
      .then((v) => {
        setError(null)
        setVacancies(v)
      })
      .catch((err) => {
        setVacancies([])
        setError(err instanceof Error ? err.message : "Ошибка загрузки вакансий")
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCompanyId])

  const filteredVacancies = useMemo(() => {
    if (!search.trim()) return vacancies
    const q = search.toLowerCase()
    return vacancies.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        (v.department?.name || "").toLowerCase().includes(q) ||
        (v.position?.name || "").toLowerCase().includes(q) ||
        (v.company?.name || "").toLowerCase().includes(q),
    )
  }, [vacancies, search])

  const totalCandidates = vacancies.reduce((sum, v) => sum + (v.candidateCount || 0), 0)
  const totalShortlist = vacancies.reduce((sum, v) => sum + (v.shortlistCount || 0), 0)
  const openCount = vacancies.filter((v) => v.status === "OPEN").length

  const openCreate = () => {
    const defaultCompanyId = currentCompanyId || allowedCompanies[0]?.id
    setForm({ status: "OPEN", companyId: defaultCompanyId || undefined })
    setFormDepartments([])
    setFormPositions([])
    if (defaultCompanyId) loadFormCompanyOptions(defaultCompanyId)
    setIsModalOpen(true)
  }

  const openEdit = (v: Vacancy) => {
    setForm({
      id: v.id,
      title: v.title,
      companyId: v.companyId,
      departmentId: v.departmentId,
      positionId: v.positionId,
      description: v.description || "",
      status: v.status,
    })
    loadFormCompanyOptions(v.companyId)
    setIsModalOpen(true)
  }

  const handleFormCompanyChange = (companyId: number) => {
    setForm({ ...form, companyId, departmentId: null, positionId: null })
    loadFormCompanyOptions(companyId)
  }

  const handleSave = async () => {
    if (!form.title?.trim()) {
      setError("Введите название вакансии")
      return
    }
    if (!form.id && showCompanySelector && !form.companyId) {
      setError("Выберите компанию")
      return
    }
    setIsSaving(true)
    try {
      const data = {
        title: form.title.trim(),
        departmentId: form.departmentId || undefined,
        positionId: form.positionId || undefined,
        description: form.description?.trim() || undefined,
        status: form.status || "OPEN",
      }
      if (form.id) {
        await updateVacancy(form.id, data)
      } else {
        await createVacancy({ ...data, companyId: form.companyId })
      }
      refresh()
      setIsModalOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения вакансии")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (v: Vacancy) => {
    if (!confirm(`Удалить вакансию «${v.title}»? Все кандидаты по ней будут удалены.`)) return
    try {
      await deleteVacancy(v.id)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления вакансии")
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/25">
              <UserSearch className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Вакансии</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Открытые позиции и кадровый резерв (шорт-лист)
              </p>
            </div>
          </div>
        </div>
        <Button
          className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:scale-105 text-xs sm:text-sm"
          onClick={openCreate}
        >
          <Plus className="mr-1 sm:mr-2 h-4 w-4" />
          Добавить вакансию
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:gap-4 sm:grid-cols-4">
        <div className="flex items-center gap-3 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-indigo-100">
            <UserSearch className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold">{vacancies.length}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Всего вакансий</div>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-emerald-100">
            <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold">{openCount}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Открытых</div>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-blue-100">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold">{totalCandidates}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Кандидатов всего</div>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-amber-100">
            <Star className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold">{totalShortlist}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">В шорт-листе</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 sm:p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Поиск вакансий..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-10 rounded-xl bg-white/80 border-indigo-100 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="h-6 w-6 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin mr-3" />
          Загрузка...
        </div>
      ) : filteredVacancies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-2xl bg-white/60 border border-white/50">
          <UserSearch className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-sm">{search ? "Ничего не найдено" : "Пока нет вакансий"}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredVacancies.map((v) => (
            <div
              key={v.id}
              className="group relative rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-sm hover:shadow-lg transition-all p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <Link href={`/vacancies/${v.id}`} className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base truncate hover:text-indigo-600 transition-colors">
                    {v.title}
                  </h3>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-indigo-50 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Действия</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => openEdit(v)} className="cursor-pointer">
                      <Edit className="mr-2 h-4 w-4" />
                      Редактировать
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 cursor-pointer focus:text-red-600"
                      onClick={() => handleDelete(v)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {!currentCompanyId && v.company?.name && (
                <div className="mt-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700">
                    <Landmark className="h-3 w-3" /> {v.company.shortName || v.company.name}
                  </span>
                </div>
              )}

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {v.department?.name && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> {v.department.name}
                  </span>
                )}
                {v.position?.name && (
                  <span className="inline-flex items-center gap-1">
                    <Briefcase className="h-3 w-3" /> {v.position.name}
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[v.status] || ""}`}>
                  {STATUS_LABELS[v.status] || v.status}
                </span>
                <Link
                  href={`/vacancies/${v.id}`}
                  className="flex items-center gap-3 text-xs text-muted-foreground hover:text-indigo-600 transition-colors"
                >
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {v.candidateCount || 0}
                  </span>
                  {(v.shortlistCount || 0) > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                      <Star className="h-3.5 w-3.5" /> {v.shortlistCount}
                    </span>
                  )}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <CrudModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={form.id ? "Редактировать вакансию" : "Новая вакансия"}
        description="Название и параметры вакансии для сбора кандидатов."
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Название вакансии</Label>
            <Input
              value={form.title || ""}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Например: Менеджер по продажам"
              className="h-11 rounded-xl"
            />
          </div>

          {showCompanySelector && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Компания{!form.id ? " *" : ""}</Label>
              {form.id ? (
                <div className="h-11 rounded-xl border border-input bg-gray-50 px-3 flex items-center text-sm text-muted-foreground">
                  {allowedCompanies.find((c) => c.id === form.companyId)?.shortName
                    || allowedCompanies.find((c) => c.id === form.companyId)?.name
                    || "—"}
                </div>
              ) : (
                <Select
                  value={form.companyId ? String(form.companyId) : ""}
                  onValueChange={(v) => handleFormCompanyChange(Number(v))}
                >
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Выберите компанию" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {allowedCompanies.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.shortName || c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Отдел (необязательно)</Label>
              <Select
                value={form.departmentId ? String(form.departmentId) : "none"}
                onValueChange={(v) => setForm({ ...form, departmentId: v === "none" ? null : Number(v) })}
                disabled={showCompanySelector && !form.id && !form.companyId}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Не выбран" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="none">Не выбран</SelectItem>
                  {formDepartments.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Должность (необязательно)</Label>
              <Select
                value={form.positionId ? String(form.positionId) : "none"}
                onValueChange={(v) => setForm({ ...form, positionId: v === "none" ? null : Number(v) })}
                disabled={showCompanySelector && !form.id && !form.companyId}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Не выбрана" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="none">Не выбрана</SelectItem>
                  {formPositions.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Статус</Label>
            <Select
              value={form.status || "OPEN"}
              onValueChange={(v) => setForm({ ...form, status: v })}
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Описание (необязательно)</Label>
            <textarea
              value={form.description || ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Требования, обязанности, условия..."
              rows={3}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
            />
          </div>
        </div>
      </CrudModal>
    </div>
  )
}
