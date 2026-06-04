"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CrudModal } from "@/components/crud-modal"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Send, Plus, Pencil, Trash2, KeyRound, CheckCircle2, XCircle, Building2, Bell,
} from "lucide-react"
import {
  getTelegramCategories, getTelegramConfig, updateTelegramConfig,
  getTelegramChats, createTelegramChat, updateTelegramChat, deleteTelegramChat, testTelegramChat,
  getCompanies,
} from "@/lib/hrms-api"
import type { TelegramCategoryDef, TelegramChat, Company } from "@/lib/types"

export default function TelegramSettingsPage() {
  const [categories, setCategories] = React.useState<TelegramCategoryDef[]>([])
  const [chats, setChats] = React.useState<TelegramChat[]>([])
  const [companies, setCompanies] = React.useState<Company[]>([])
  const [defaultToken, setDefaultToken] = React.useState("")
  const [tokenSaving, setTokenSaving] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [toast, setToast] = React.useState<{ msg: string; ok: boolean } | null>(null)

  // Edit dialog
  const [editOpen, setEditOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<TelegramChat | null>(null)
  const [form, setForm] = React.useState<{ title: string; chatId: string; token: string; companyIds: number[]; categories: string[]; isActive: boolean }>(
    { title: "", chatId: "", token: "", companyIds: [], categories: [], isActive: true }
  )
  const [saving, setSaving] = React.useState(false)

  // Delete dialog
  const [deleting, setDeleting] = React.useState<TelegramChat | null>(null)
  const [testingId, setTestingId] = React.useState<number | null>(null)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const load = React.useCallback(async () => {
    try {
      const [cats, cfg, list, comps] = await Promise.all([
        getTelegramCategories(), getTelegramConfig(), getTelegramChats(), getCompanies(),
      ])
      setCategories(cats)
      setDefaultToken(cfg.defaultToken || "")
      setChats(list)
      setCompanies(comps)
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка загрузки", false)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const catLabel = (key: string) => categories.find((c) => c.key === key)?.label || key

  const saveToken = async () => {
    setTokenSaving(true)
    try {
      await updateTelegramConfig(defaultToken)
      showToast("Токен по умолчанию сохранён")
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка", false)
    } finally {
      setTokenSaving(false)
    }
  }

  const parseIds = (csv: string): number[] =>
    (csv || "").split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))

  const openCreate = () => {
    setEditing(null)
    setForm({ title: "", chatId: "", token: "", companyIds: [], categories: categories.map((c) => c.key), isActive: true })
    setEditOpen(true)
  }

  const openEdit = (chat: TelegramChat) => {
    setEditing(chat)
    setForm({
      title: chat.title,
      chatId: chat.chatId,
      token: chat.token || "",
      companyIds: parseIds(chat.companyIds),
      categories: (chat.categories || "").split(",").map((s) => s.trim()).filter(Boolean),
      isActive: chat.isActive,
    })
    setEditOpen(true)
  }

  const toggleCategory = (key: string) => {
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(key) ? f.categories.filter((k) => k !== key) : [...f.categories, key],
    }))
  }

  const toggleCompany = (id: number) => {
    setForm((f) => ({
      ...f,
      companyIds: f.companyIds.includes(id) ? f.companyIds.filter((x) => x !== id) : [...f.companyIds, id],
    }))
  }

  const saveChat = async () => {
    if (!form.title.trim() || !form.chatId.trim()) {
      showToast("Заполните название и Chat ID", false)
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        chatId: form.chatId.trim(),
        token: form.token.trim() || null,
        companyIds: form.companyIds,
        categories: form.categories,
        isActive: form.isActive,
      }
      if (editing) await updateTelegramChat(editing.id, payload)
      else await createTelegramChat(payload)
      setEditOpen(false)
      await load()
      showToast(editing ? "Чат обновлён" : "Чат добавлен")
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка сохранения", false)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await deleteTelegramChat(deleting.id)
      setDeleting(null)
      await load()
      showToast("Чат удалён")
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка удаления", false)
    }
  }

  const handleTest = async (chat: TelegramChat) => {
    setTestingId(chat.id)
    try {
      await testTelegramChat(chat.id)
      showToast(`Тест отправлен в «${chat.title}»`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Не удалось отправить", false)
    } finally {
      setTestingId(null)
    }
  }

  const companiesLabel = (csv: string): string => {
    const ids = parseIds(csv)
    if (ids.length === 0) return "Все компании (глобально)"
    return ids.map((id) => companies.find((c) => c.id === id)?.name || `ID ${id}`).join(", ")
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5 fade-in">
          <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-white shadow-2xl ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
            {toast.ok ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            <span className="text-sm font-medium">{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-sky-500 to-blue-500 shadow-lg shadow-sky-500/25">
          <Send className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Telegram-уведомления</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Настройка: что, кому и куда отправлять</p>
        </div>
      </div>

      {/* Default token */}
      <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-sky-600" />
            <CardTitle className="text-base sm:text-lg font-bold">Токен бота по умолчанию</CardTitle>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Используется для всех чатов, у которых не задан свой токен. Получить — у @BotFather.
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={defaultToken}
              onChange={(e) => setDefaultToken(e.target.value)}
              placeholder="123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="h-10 rounded-xl font-mono text-sm flex-1"
            />
            <Button onClick={saveToken} disabled={tokenSaving} className="h-10 rounded-xl bg-gradient-to-r from-sky-500 to-blue-500">
              {tokenSaving ? "Сохранение..." : "Сохранить токен"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Chats */}
      <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-sky-600" />
            <div>
              <CardTitle className="text-base sm:text-lg font-bold">Чаты-получатели</CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground">Куда и какие уведомления отправлять</p>
            </div>
          </div>
          <Button onClick={openCreate} size="sm" className="h-9 rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 self-start sm:self-auto">
            <Plus className="mr-1 h-4 w-4" /> Добавить чат
          </Button>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {loading ? (
            <div className="py-10 text-center text-muted-foreground text-sm">Загрузка...</div>
          ) : chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
              <Bell className="h-10 w-10 text-gray-300" />
              <span className="text-sm">Нет настроенных чатов</span>
              <span className="text-xs">Пока используются настройки из .env (если заданы)</span>
            </div>
          ) : (
            <div className="space-y-3">
              {chats.map((chat) => {
                const cats = (chat.categories || "").split(",").map((s) => s.trim()).filter(Boolean)
                return (
                  <div key={chat.id} className={`rounded-xl border p-3 sm:p-4 ${chat.isActive ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50 opacity-70"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">{chat.title}</span>
                          {!chat.isActive && <span className="text-[10px] rounded-full bg-gray-200 text-gray-600 px-2 py-0.5">Выключен</span>}
                          {chat.token && <span className="text-[10px] rounded-full bg-violet-100 text-violet-700 px-2 py-0.5">свой бот</span>}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{companiesLabel(chat.companyIds)}</span>
                          <span className="font-mono">chat: {chat.chatId}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {cats.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Категории не выбраны</span>
                          ) : cats.map((k) => (
                            <span key={k} className="inline-flex items-center rounded-full bg-sky-100 text-sky-700 border border-sky-200 px-2 py-0.5 text-[11px]">
                              {catLabel(k)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-emerald-600 hover:bg-emerald-50" onClick={() => handleTest(chat)} disabled={testingId === chat.id} title="Отправить тест">
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-blue-50" onClick={() => openEdit(chat)} title="Изменить">
                          <Pencil className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-red-50" onClick={() => setDeleting(chat)} title="Удалить">
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit / Create dialog */}
      <CrudModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title={editing ? "Изменить чат" : "Добавить чат"}
        description="Куда отправлять и какие категории уведомлений"
        onSave={saveChat}
        isSaving={saving}
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label>Название *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Напр. «Кадры Фавз» или «Директор»" className="h-10 rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label>Chat ID *</Label>
            <Input value={form.chatId} onChange={(e) => setForm({ ...form, chatId: e.target.value })} placeholder="-1001234567890 или 123456789" className="h-10 rounded-xl font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Компании</Label>
              <button type="button" className="text-xs text-sky-600 hover:underline" onClick={() => setForm({ ...form, companyIds: form.companyIds.length === companies.length ? [] : companies.map((c) => c.id) })}>
                {form.companyIds.length === companies.length ? "Снять все" : "Выбрать все"}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 rounded-xl border border-gray-200 p-3 max-h-44 overflow-y-auto">
              {companies.map((c) => (
                <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.companyIds.includes(c.id)} onChange={() => toggleCompany(c.id)} className="h-4 w-4 rounded accent-sky-600" />
                  <span className="truncate">{c.name}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {form.companyIds.length === 0
                ? "Ничего не выбрано = все компании (глобально, + системные уведомления)"
                : `Выбрано компаний: ${form.companyIds.length}`}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Свой токен бота (необязательно)</Label>
            <Input value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="Если пусто — берётся токен по умолчанию" className="h-10 rounded-xl font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label>Категории уведомлений</Label>
            <div className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 p-3">
              {categories.map((c) => (
                <label key={c.key} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.categories.includes(c.key)} onChange={() => toggleCategory(c.key)} className="h-4 w-4 rounded accent-sky-600" />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded accent-sky-600" />
            <span>Активен (получает уведомления)</span>
          </label>
        </div>
      </CrudModal>

      {/* Delete dialog */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" /> Удалить чат
            </DialogTitle>
            <DialogDescription>
              Удалить чат <span className="font-semibold text-foreground">{deleting?.title}</span>? Уведомления туда отправляться перестанут.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleting(null)}>Отмена</Button>
            <Button variant="destructive" onClick={confirmDelete}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
