"use client"

import * as React from "react"
import {
  DoorOpen,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { useAuth } from "@/app/contexts/AuthContext"
import { getCompanies, getDoors, createDoor, updateDoor, deleteDoor } from "@/lib/hrms-api"
import type { Company, Door } from "@/lib/types"

const EMPTY_FORM = {
  name: "",
  companyId: 0,
  inDeviceIp: "",
  inDevicePort: 80,
  outDeviceIp: "",
  outDevicePort: 80,
  login: "admin",
  password: "",
  isActive: true,
}

export default function DoorsPage() {
  const { user } = useAuth()
  const [doors, setDoors] = React.useState<Door[]>([])
  const [companies, setCompanies] = React.useState<Company[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingDoor, setEditingDoor] = React.useState<Door | null>(null)
  const [form, setForm] = React.useState({ ...EMPTY_FORM })
  const [showPassword, setShowPassword] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const [deleteId, setDeleteId] = React.useState<number | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const isSuperAdmin = user?.isHoldingAdmin

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [doorsData, companiesData] = await Promise.all([
        getDoors(),
        getCompanies(),
      ])
      setDoors(doorsData)
      setCompanies(companiesData)
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  function openCreate() {
    setEditingDoor(null)
    setForm({ ...EMPTY_FORM, companyId: companies[0]?.id ?? 0 })
    setFormError(null)
    setShowPassword(false)
    setDialogOpen(true)
  }

  function openEdit(door: Door) {
    setEditingDoor(door)
    setForm({
      name: door.name,
      companyId: door.companyId,
      inDeviceIp: door.inDeviceIp,
      inDevicePort: door.inDevicePort,
      outDeviceIp: door.outDeviceIp,
      outDevicePort: door.outDevicePort,
      login: door.login,
      password: "",
      isActive: door.isActive,
    })
    setFormError(null)
    setShowPassword(false)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError("Введите название двери"); return }
    if (!form.companyId) { setFormError("Выберите компанию"); return }
    if (!form.inDeviceIp.trim()) { setFormError("Введите IP внутреннего устройства"); return }
    if (!form.outDeviceIp.trim()) { setFormError("Введите IP внешнего устройства"); return }
    if (!editingDoor && !form.password.trim()) { setFormError("Введите пароль"); return }

    setSaving(true)
    setFormError(null)
    try {
      if (editingDoor) {
        const data: any = {
          name: form.name,
          inDeviceIp: form.inDeviceIp,
          inDevicePort: form.inDevicePort,
          outDeviceIp: form.outDeviceIp,
          outDevicePort: form.outDevicePort,
          login: form.login,
          isActive: form.isActive,
        }
        if (form.password.trim()) data.password = form.password
        await updateDoor(editingDoor.id, data)
      } else {
        await createDoor({
          name: form.name,
          companyId: form.companyId,
          inDeviceIp: form.inDeviceIp,
          inDevicePort: form.inDevicePort,
          outDeviceIp: form.outDeviceIp,
          outDevicePort: form.outDevicePort,
          login: form.login,
          password: form.password,
        })
      }
      setDialogOpen(false)
      await load()
    } catch (e: any) {
      setFormError(e.message || "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await deleteDoor(deleteId)
      setDeleteId(null)
      await load()
    } catch (e: any) {
      setError(e.message || "Ошибка удаления")
    } finally {
      setDeleting(false)
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Доступ только для Суперадмина
      </div>
    )
  }

  // Group doors by company
  const doorsByCompany = companies.map(c => ({
    company: c,
    doors: doors.filter(d => d.companyId === c.id),
  })).filter(g => g.doors.length > 0)

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-100">
            <DoorOpen className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Управление дверями</h1>
            <p className="text-sm text-muted-foreground">СКУД — Face ID устройства Hikvision</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-amber-500 hover:bg-amber-600 text-white">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Добавить дверь</span>
        </Button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : doors.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <DoorOpen className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p className="font-medium">Нет дверей</p>
            <p className="text-sm mt-1">Нажмите «Добавить дверь» чтобы настроить первую точку доступа</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {doorsByCompany.map(({ company, doors: cDoors }) => (
            <div key={company.id}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {company.shortName || company.name}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cDoors.map(door => (
                  <Card key={door.id} className={`border ${door.isActive ? "border-slate-200" : "border-slate-100 opacity-60"}`}>
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <DoorOpen className={`h-4 w-4 flex-shrink-0 ${door.isActive ? "text-amber-500" : "text-slate-400"}`} />
                          <CardTitle className="text-sm font-semibold">{door.name}</CardTitle>
                        </div>
                        <div className="flex items-center gap-1">
                          {door.isActive ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-slate-400" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2">
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Вход (IN):</span>
                          <span className="font-mono">{door.inDeviceIp}:{door.inDevicePort}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Выход (OUT):</span>
                          <span className="font-mono">{door.outDeviceIp}:{door.outDevicePort}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Логин:</span>
                          <span className="font-mono">{door.login}</span>
                        </div>
                        {door._count !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Доступов:</span>
                            <span className="font-semibold text-slate-700">{door._count.accesses}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={() => openEdit(door)}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Изменить
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setDeleteId(door.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}

          {/* Компании без дверей */}
          {companies
            .filter(c => !doors.some(d => d.companyId === c.id))
            .length > 0 && (
            <div className="text-sm text-muted-foreground">
              Компании без дверей: {companies
                .filter(c => !doors.some(d => d.companyId === c.id))
                .map(c => c.shortName || c.name)
                .join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Диалог создания/редактирования */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDoor ? "Редактировать дверь" : "Новая дверь"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {formError && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Название двери</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Главный вход, Склад, Серверная..."
                />
              </div>
              {!editingDoor && (
                <div className="col-span-2 space-y-1">
                  <Label>Компания</Label>
                  <select
                    value={form.companyId}
                    onChange={e => setForm(f => ({ ...f, companyId: parseInt(e.target.value) }))}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value={0} disabled>Выберите компанию</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="border rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Устройство ВХОДА (IN — снаружи)
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">IP адрес</Label>
                  <Input
                    value={form.inDeviceIp}
                    onChange={e => setForm(f => ({ ...f, inDeviceIp: e.target.value }))}
                    placeholder="192.168.1.100"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Порт</Label>
                  <Input
                    type="number"
                    value={form.inDevicePort}
                    onChange={e => setForm(f => ({ ...f, inDevicePort: parseInt(e.target.value) || 80 }))}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Устройство ВЫХОДА (OUT — внутри)
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">IP адрес</Label>
                  <Input
                    value={form.outDeviceIp}
                    onChange={e => setForm(f => ({ ...f, outDeviceIp: e.target.value }))}
                    placeholder="192.168.1.101"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Порт</Label>
                  <Input
                    type="number"
                    value={form.outDevicePort}
                    onChange={e => setForm(f => ({ ...f, outDevicePort: parseInt(e.target.value) || 80 }))}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Логин Hikvision</Label>
                <Input
                  value={form.login}
                  onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
                  placeholder="admin"
                />
              </div>
              <div className="space-y-1">
                <Label>Пароль {editingDoor && <span className="text-muted-foreground text-xs">(оставьте пустым чтобы не менять)</span>}</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder={editingDoor ? "••••••••" : "Пароль"}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            {editingDoor && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="rounded"
                />
                <Label htmlFor="isActive" className="cursor-pointer">Дверь активна</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingDoor ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог удаления */}
      <Dialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить дверь?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Все данные о доступах будут удалены. Это действие нельзя отменить.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Отмена</Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
