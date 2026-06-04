"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CreateEmployeeInput, Department, Position, Employee } from "@/lib/types"

/** Единый список статусов сотрудника — используется во всех формах */
export const EMPLOYEE_STATUSES = [
  "Активен",
  "Стажёр",
  "Руководитель",
  "Дистанционно",
  "В отпуске",
  "Больничный",
  "Декрет",
  "Уволен",
] as const

type Props = {
  value: CreateEmployeeInput
  onChange: (next: CreateEmployeeInput) => void
  departments: Department[]
  positions: Position[]
  /** Список сотрудников для выбора руководителя. Если не передан — поле скрыто. */
  managers?: Employee[]
  /** ID текущего сотрудника, чтобы исключить его из списка руководителей */
  excludeManagerId?: number
}

const selectClass = "w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"

/** ISO "1994-06-24" → "24.06.1994" */
function isoToDisplay(iso: string): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ""
}

/** "24.06.1994" → ISO "1994-06-24" (или "" если дата неполная/некорректная) */
function displayToIso(text: string): string {
  const digits = text.replace(/\D/g, "")
  if (digits.length !== 8) return ""
  const dd = digits.slice(0, 2), mm = digits.slice(2, 4), yyyy = digits.slice(4)
  const iso = `${yyyy}-${mm}-${dd}`
  const d = new Date(iso)
  if (isNaN(d.getTime()) || +mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return ""
  return iso
}

/**
 * Поле даты рождения в формате ДД.ММ.ГГГГ (24.06.1994).
 * Внутри хранит ISO (yyyy-mm-dd), наружу отдаёт через onChange.
 */
function BirthDateInput({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [text, setText] = React.useState(() => isoToDisplay(value))

  // Синхронизация при внешней смене значения (открытие формы другого сотрудника),
  // но без сброса во время активного ввода неполной даты.
  React.useEffect(() => {
    setText((prev) => (displayToIso(prev) === value ? prev : isoToDisplay(value)))
  }, [value])

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8)
    let formatted = digits
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}.${digits.slice(2)}`
    setText(formatted)
    onChange(digits.length === 8 ? displayToIso(formatted) : "")
  }

  return (
    <Input
      id="emp-birthDate"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      placeholder="ДД.ММ.ГГГГ"
      inputMode="numeric"
      maxLength={10}
      className="h-10 rounded-xl"
    />
  )
}

/**
 * Общие поля формы создания/редактирования сотрудника.
 * Используется и на странице списка, и в профиле — чтобы поля не разъезжались.
 */
export function EmployeeFormFields({
  value,
  onChange,
  departments,
  positions,
  managers,
  excludeManagerId,
}: Props) {
  const set = (patch: Partial<CreateEmployeeInput>) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 sm:pr-2">
      {/* Фамилия / Имя */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-2">
          <Label htmlFor="emp-lastName">Фамилия *</Label>
          <Input
            id="emp-lastName"
            value={value.lastName}
            onChange={(e) => set({ lastName: e.target.value })}
            placeholder="Введите фамилию"
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emp-firstName">Имя *</Label>
          <Input
            id="emp-firstName"
            value={value.firstName}
            onChange={(e) => set({ firstName: e.target.value })}
            placeholder="Введите имя"
            className="h-10 rounded-xl"
          />
        </div>
      </div>

      {/* Отчество */}
      <div className="space-y-2">
        <Label htmlFor="emp-patronymic">Отчество</Label>
        <Input
          id="emp-patronymic"
          value={value.patronymic || ""}
          onChange={(e) => set({ patronymic: e.target.value })}
          placeholder="Введите отчество"
          className="h-10 rounded-xl"
        />
      </div>

      {/* Email / Телефон */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-2">
          <Label htmlFor="emp-email">Email</Label>
          <Input
            id="emp-email"
            type="email"
            value={value.email || ""}
            onChange={(e) => set({ email: e.target.value })}
            placeholder="Введите email"
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emp-phone">Телефон</Label>
          <Input
            id="emp-phone"
            value={value.phone || ""}
            onChange={(e) => set({ phone: e.target.value })}
            placeholder="Номер телефона"
            className="h-10 rounded-xl"
          />
        </div>
      </div>

      {/* Дата рождения / Адрес */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-2">
          <Label htmlFor="emp-birthDate">Дата рождения</Label>
          <BirthDateInput
            value={value.birthDate || ""}
            onChange={(iso) => set({ birthDate: iso })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emp-address">Адрес</Label>
          <Input
            id="emp-address"
            value={value.address || ""}
            onChange={(e) => set({ address: e.target.value })}
            placeholder="Адрес проживания"
            className="h-10 rounded-xl"
          />
        </div>
      </div>

      {/* Отдел / Должность */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-2">
          <Label htmlFor="emp-department">Отдел</Label>
          <select
            id="emp-department"
            value={value.departmentId || ""}
            onChange={(e) => set({ departmentId: e.target.value ? Number(e.target.value) : undefined })}
            className={selectClass}
          >
            <option value="">Выберите отдел</option>
            {departments.map((dep) => (
              <option key={dep.id} value={dep.id}>{dep.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="emp-position">Должность</Label>
          <select
            id="emp-position"
            value={value.positionId || ""}
            onChange={(e) => set({ positionId: e.target.value ? Number(e.target.value) : undefined })}
            className={selectClass}
          >
            <option value="">Выберите должность</option>
            {positions.map((pos) => (
              <option key={pos.id} value={pos.id}>{pos.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Статус / Руководитель */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-2">
          <Label htmlFor="emp-status">Статус</Label>
          <select
            id="emp-status"
            value={value.status || "Активен"}
            onChange={(e) => set({ status: e.target.value })}
            className={selectClass}
          >
            {EMPLOYEE_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {managers && (
          <div className="space-y-2">
            <Label htmlFor="emp-manager">Руководитель</Label>
            <select
              id="emp-manager"
              value={value.managerId || ""}
              onChange={(e) => set({ managerId: e.target.value ? Number(e.target.value) : undefined })}
              className={selectClass}
            >
              <option value="">Нет руководителя</option>
              {managers
                .filter((emp) => emp.id !== excludeManagerId)
                .map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.lastName} {emp.firstName}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>
    </div>
  )
}
