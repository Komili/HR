"use client"

import React, { useEffect, useState, useMemo, use } from "react"
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
import { CrudModal } from "@/components/crud-modal"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ArrowLeft,
  UserSearch,
  Plus,
  Phone,
  Mail,
  FileText,
  Trash2,
  MoreHorizontal,
  Building2,
  Briefcase,
  Paperclip,
  Star,
  Download,
  X,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Vacancy, Candidate, CandidateStatus } from "@/lib/types"
import {
  getVacancy,
  getCandidates,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  getCandidateResume,
} from "@/lib/hrms-api"

const VACANCY_STATUS_LABELS: Record<string, string> = {
  OPEN: "Открыта",
  ON_HOLD: "На паузе",
  CLOSED: "Закрыта",
}

const CANDIDATE_STATUSES: { value: CandidateStatus; label: string; color: string; dot: string }[] = [
  { value: "NEW", label: "Новый", color: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  { value: "REVIEWING", label: "Рассматривается", color: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  { value: "SHORTLIST", label: "Шортлист", color: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  { value: "INTERVIEW", label: "Собеседование", color: "bg-cyan-100 text-cyan-700 border-cyan-200", dot: "bg-cyan-500" },
  { value: "HIRED", label: "Принят", color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  { value: "REJECTED", label: "Отказ", color: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400" },
]

const statusMeta = (status: string) => CANDIDATE_STATUSES.find((s) => s.value === status) || CANDIDATE_STATUSES[0]

type CandidateForm = {
  fullName: string
  phone: string
  email: string
  source: string
  note: string
}

const EMPTY_FORM: CandidateForm = { fullName: "", phone: "", email: "", source: "", note: "" }

export default function VacancyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const vacancyId = parseInt(id, 10)

  const [vacancy, setVacancy] = useState<Vacancy | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState<CandidateForm>(EMPTY_FORM)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [previewCandidate, setPreviewCandidate] = useState<Candidate | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const refresh = () => {
    setLoading(true)
    Promise.all([getVacancy(vacancyId), getCandidates(vacancyId)])
      .then(([v, c]) => {
        setError(null)
        setVacancy(v)
        setCandidates(c)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Ошибка загрузки вакансии")
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vacancyId])

  useEffect(() => {
    return () => {
      if (previewUrl) window.URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl])

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {}
    candidates.forEach((c) => { byStatus[c.status] = (byStatus[c.status] || 0) + 1 })
    return byStatus
  }, [candidates])

  const displayedCandidates = useMemo(
    () => (statusFilter ? candidates.filter((c) => c.status === statusFilter) : candidates),
    [candidates, statusFilter],
  )

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setResumeFile(null)
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.fullName.trim()) {
      setError("Введите ФИО кандидата")
      return
    }
    setIsSaving(true)
    try {
      await createCandidate(
        vacancyId,
        {
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          source: form.source.trim() || undefined,
          note: form.note.trim() || undefined,
        },
        resumeFile || undefined,
      )
      refresh()
      setIsModalOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка добавления кандидата")
    } finally {
      setIsSaving(false)
    }
  }

  const handleStatusChange = async (candidate: Candidate, status: string) => {
    // Оптимистичное обновление — сразу видно в UI, без ожидания ответа сервера
    setCandidates((prev) => prev.map((c) => (c.id === candidate.id ? { ...c, status: status as CandidateStatus } : c)))
    try {
      await updateCandidate(candidate.id, { status })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка изменения статуса")
      refresh()
    }
  }

  const handleDelete = async (candidate: Candidate) => {
    if (!confirm(`Удалить кандидата «${candidate.fullName}»?`)) return
    try {
      await deleteCandidate(candidate.id)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления кандидата")
    }
  }

  const closePreview = () => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl)
    setPreviewCandidate(null)
    setPreviewUrl(null)
  }

  const handleOpenResume = async (candidate: Candidate) => {
    setPreviewCandidate(candidate)
    setPreviewUrl(null)
    setPreviewLoading(true)
    try {
      const blob = await getCandidateResume(candidate.id)
      const url = window.URL.createObjectURL(blob)
      setPreviewUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки резюме")
      setPreviewCandidate(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleDownloadResume = () => {
    if (!previewUrl || !previewCandidate) return
    const link = document.createElement("a")
    link.href = previewUrl
    link.download = previewCandidate.resumeName || "resume"
    link.click()
  }

  if (loading && !vacancy) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="h-6 w-6 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin mr-3" />
        Загрузка...
      </div>
    )
  }

  if (!vacancy) {
    return (
      <div className="space-y-4">
        <Link href="/vacancies" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-indigo-600">
          <ArrowLeft className="h-4 w-4" /> К вакансиям
        </Link>
        {error && <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>}
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <Link href="/vacancies" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-indigo-600 mb-3">
          <ArrowLeft className="h-4 w-4" /> К вакансиям
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/25">
              <UserSearch className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{vacancy.title}</h1>
              <div className="flex flex-wrap items-center gap-2.5 mt-1.5 text-sm sm:text-base text-muted-foreground">
                {vacancy.department?.name && (
                  <span className="inline-flex items-center gap-1.5"><Building2 className="h-4 w-4" /> {vacancy.department.name}</span>
                )}
                {vacancy.position?.name && (
                  <span className="inline-flex items-center gap-1.5"><Briefcase className="h-4 w-4" /> {vacancy.position.name}</span>
                )}
                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium bg-white/70">
                  {VACANCY_STATUS_LABELS[vacancy.status] || vacancy.status}
                </span>
              </div>
            </div>
          </div>
          <Button
            className="h-10 sm:h-11 px-4 sm:px-5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:scale-105 text-sm"
            onClick={openCreate}
          >
            <Plus className="mr-2 h-4 w-4" />
            Добавить кандидата
          </Button>
        </div>
        {vacancy.description && (
          <p className="mt-3 text-sm sm:text-base text-muted-foreground whitespace-pre-wrap">{vacancy.description}</p>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 sm:p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Фильтр по статусу — воронка кандидатов */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter(null)}
          className={`flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-sm font-medium transition-colors ${
            statusFilter === null ? "bg-gray-800 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Все ({candidates.length})
        </button>
        {CANDIDATE_STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={`flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-sm font-medium transition-colors ${
              statusFilter === s.value ? `${s.color} ring-2 ring-offset-1 ring-current` : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${s.dot}`} />
            {s.label} ({counts[s.value] || 0})
          </button>
        ))}
      </div>

      {displayedCandidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-2xl bg-white/60 border border-white/50">
          <UserSearch className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-sm">{statusFilter ? "Нет кандидатов с этим статусом" : "Пока никто не откликнулся"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedCandidates.map((c) => {
            const meta = statusMeta(c.status)
            const initials = c.fullName.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("")
            return (
              <div
                key={c.id}
                className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-sm hover:shadow-md transition-shadow p-4 sm:p-5 flex flex-wrap items-center gap-4"
              >
                <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white font-semibold shrink-0">
                  {initials}
                </div>

                <div className="flex-1 min-w-[220px]">
                  <div className="text-base sm:text-lg font-semibold">{c.fullName}</div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                    {c.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4" /> {c.phone}</span>}
                    {c.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4" /> {c.email}</span>}
                    {c.source && <span>Откуда: {c.source}</span>}
                  </div>
                  {c.note && <p className="mt-1.5 text-sm text-muted-foreground">{c.note}</p>}
                </div>

                {c.resumePath && (
                  <button
                    onClick={() => handleOpenResume(c)}
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-indigo-200 text-indigo-600 text-sm font-medium hover:bg-indigo-50 transition-colors"
                    title={c.resumeName || "Резюме"}
                  >
                    <Paperclip className="h-4 w-4" /> Резюме
                  </button>
                )}

                <Select value={c.status} onValueChange={(v) => handleStatusChange(c, v)}>
                  <SelectTrigger className={`h-9 w-[190px] rounded-full border text-sm font-medium ${meta.color}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {CANDIDATE_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-9 w-9 p-0 hover:bg-red-50 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel>Действия</DropdownMenuLabel>
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
          })}
        </div>
      )}

      <CrudModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Новый кандидат"
        description="Данные человека, откликнувшегося на вакансию."
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">ФИО</Label>
            <Input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="Иванов Иван Иванович"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Телефон</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+992 90 123 4567"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="ivanov@mail.com"
                className="h-11 rounded-xl"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Откуда узнал (необязательно)</Label>
            <Input
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="Сайт компании, знакомые, hh.tj..."
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Заметка (необязательно)</Label>
            <textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Опыт работы, впечатление от разговора..."
              rows={2}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Резюме (необязательно, PDF/DOC/DOCX)</Label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
              className="w-full text-sm file:mr-3 file:h-9 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:text-sm file:font-medium hover:file:bg-indigo-100 cursor-pointer"
            />
            {resumeFile && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> {resumeFile.name}
              </p>
            )}
          </div>
        </div>
      </CrudModal>

      {/* Просмотр резюме — в модальном окне, без ухода со страницы */}
      <Dialog open={!!previewCandidate} onOpenChange={() => closePreview()}>
        <DialogContent className="max-w-4xl h-[85vh] p-0 overflow-hidden" showCloseButton={false}>
          <DialogHeader className="px-6 py-4 border-b bg-gray-50/80 flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-600" />
                <span className="truncate max-w-md">
                  Резюме — {previewCandidate?.fullName}
                </span>
              </DialogTitle>
              <div className="flex items-center gap-2">
                {previewUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg"
                    onClick={handleDownloadResume}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Скачать
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg hover:bg-gray-200"
                  onClick={closePreview}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-gray-100 min-h-0">
            {previewLoading ? (
              <div className="flex items-center justify-center h-full min-h-[400px]">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="h-6 w-6 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
                  <span>Загрузка резюме...</span>
                </div>
              </div>
            ) : previewUrl && previewCandidate ? (
              <div className="h-full w-full p-4">
                {(previewCandidate.resumeName || "").toLowerCase().endsWith(".pdf") ? (
                  <object
                    data={previewUrl}
                    type="application/pdf"
                    className="w-full h-full rounded-lg shadow-lg bg-white"
                    style={{ minHeight: "calc(85vh - 100px)" }}
                  >
                    <div className="flex flex-col items-center justify-center h-full min-h-[400px] bg-white rounded-lg p-8">
                      <FileText className="h-16 w-16 text-gray-300 mb-4" />
                      <p className="text-gray-500 mb-4">Не удалось отобразить PDF в браузере</p>
                      <Button onClick={handleDownloadResume}>
                        <Download className="h-4 w-4 mr-2" />
                        Скачать файл
                      </Button>
                    </div>
                  </object>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full min-h-[400px] bg-white rounded-lg p-8">
                    <FileText className="h-16 w-16 text-gray-300 mb-4" />
                    <p className="text-gray-500 mb-1">{previewCandidate.resumeName}</p>
                    <p className="text-sm text-gray-400 mb-4">Word-документы нельзя показать прямо в браузере</p>
                    <Button onClick={handleDownloadResume}>
                      <Download className="h-4 w-4 mr-2" />
                      Скачать файл
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
