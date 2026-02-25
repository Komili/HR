"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  UserCheck,
  UserX,
  Clock,
  QrCode,
  Plus,
  Trash2,
  Loader2,
  Eye,
  CheckCircle,
  XCircle,
  Printer,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/app/contexts/AuthContext";
import {
  getPendingRegistrations,
  approveRegistration,
  rejectRegistration,
  getRegistrationTokens,
  createRegistrationToken,
  deleteRegistrationToken,
  getDepartments,
  getPositions,
  getEmployeePhotoUrl,
} from "@/lib/hrms-api";
import type { PendingEmployee, RegistrationToken, Department, Position } from "@/lib/types";
import { EmployeeAvatar } from "@/components/employee-avatar";

type Tab = "pending" | "qr";

export default function RegistrationsPage() {
  const { currentCompanyId } = useAuth();
  const [tab, setTab] = useState<Tab>("pending");
  const [pending, setPending] = useState<PendingEmployee[]>([]);
  const [tokens, setTokens] = useState<RegistrationToken[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailEmployee, setDetailEmployee] = useState<PendingEmployee | null>(null);
  const [approveData, setApproveData] = useState<{ departmentId?: number; positionId?: number }>({});
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [creatingToken, setCreatingToken] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, t, d, pos] = await Promise.all([
        getPendingRegistrations(),
        getRegistrationTokens(),
        getDepartments(),
        getPositions(),
      ]);
      setPending(p);
      setTokens(t);
      setDepartments(d);
      setPositions(pos);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, currentCompanyId]);

  const handleApprove = async (id: number, updates?: { departmentId?: number; positionId?: number }) => {
    setActionLoading(id);
    try {
      await approveRegistration(id, updates);
      setPending((prev) => prev.filter((e) => e.id !== id));
      setDetailEmployee(null);
    } catch {
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: number) => {
    setActionLoading(id);
    try {
      await rejectRegistration(id);
      setPending((prev) => prev.filter((e) => e.id !== id));
      setDetailEmployee(null);
    } catch {
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateToken = async () => {
    if (!currentCompanyId) return;
    setCreatingToken(true);
    try {
      const token = await createRegistrationToken(currentCompanyId);
      setTokens((prev) => [token, ...prev]);
    } catch {
    } finally {
      setCreatingToken(false);
    }
  };

  const handleDeleteToken = async (id: number) => {
    try {
      await deleteRegistrationToken(id);
      setTokens((prev) => prev.filter((t) => t.id !== id));
    } catch {}
  };

  const pendingCount = pending.length;

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Регистрации</h1>
        <p className="text-gray-500 mt-1">Заявки на регистрацию новых сотрудников</p>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center">
            <Clock className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <div className="text-2xl font-bold">{pendingCount}</div>
            <div className="text-sm text-gray-500">Ожидают</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
            <QrCode className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <div className="text-2xl font-bold">{tokens.filter((t) => t.isActive).length}</div>
            <div className="text-sm text-gray-500">Активных QR</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
            <UserCheck className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <div className="text-2xl font-bold">{tokens.reduce((sum, t) => sum + t.usageCount, 0)}</div>
            <div className="text-sm text-gray-500">Всего регистраций</div>
          </div>
        </div>
      </div>

      {/* Вкладки */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("pending")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "pending"
              ? "border-emerald-500 text-emerald-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Заявки
          {pendingCount > 0 && (
            <Badge variant="destructive" className="ml-2 h-5 min-w-[20px] text-xs">
              {pendingCount}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setTab("qr")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "qr"
              ? "border-emerald-500 text-emerald-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          QR-коды
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      ) : tab === "pending" ? (
        <PendingTab
          pending={pending}
          onView={setDetailEmployee}
          onApprove={handleApprove}
          onReject={handleReject}
          actionLoading={actionLoading}
        />
      ) : (
        <QrTab
          tokens={tokens}
          onCreateToken={handleCreateToken}
          onDeleteToken={handleDeleteToken}
          creatingToken={creatingToken}
          currentCompanyId={currentCompanyId}
        />
      )}

      {/* Модальное окно деталей */}
      {detailEmployee && (
        <DetailModal
          employee={detailEmployee}
          departments={departments}
          positions={positions}
          approveData={approveData}
          setApproveData={setApproveData}
          onApprove={() => handleApprove(detailEmployee.id, approveData)}
          onReject={() => handleReject(detailEmployee.id)}
          onClose={() => { setDetailEmployee(null); setApproveData({}); }}
          actionLoading={actionLoading === detailEmployee.id}
        />
      )}
    </div>
  );
}

function PendingTab({
  pending,
  onView,
  onApprove,
  onReject,
  actionLoading,
}: {
  pending: PendingEmployee[];
  onView: (e: PendingEmployee) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  actionLoading: number | null;
}) {
  if (pending.length === 0) {
    return (
      <div className="bg-white rounded-2xl border p-12 text-center">
        <CheckCircle className="h-12 w-12 text-emerald-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900">Нет ожидающих заявок</h3>
        <p className="text-gray-500 text-sm mt-1">Все заявки обработаны</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pending.map((emp) => (
        <div key={emp.id} className="bg-white rounded-2xl border p-4 flex items-center gap-4">
          <EmployeeAvatar
            employeeId={emp.id}
            firstName={emp.firstName}
            lastName={emp.lastName}
            photoPath={emp.photoPath}
            size="lg"
            className="flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 truncate">
              {emp.lastName} {emp.firstName} {emp.patronymic || ""}
            </div>
            <div className="text-sm text-gray-500 flex flex-wrap gap-x-3">
              {emp.phone && <span>{emp.phone}</span>}
              {emp.company?.name && <span>{emp.company.name}</span>}
            </div>
            <div className="text-xs text-gray-400">
              {emp.createdAt && new Date(emp.createdAt).toLocaleDateString("ru-RU")}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={() => onView(emp)} className="gap-1">
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Детали</span>
            </Button>
            <Button
              size="sm"
              onClick={() => onApprove(emp.id)}
              disabled={actionLoading === emp.id}
              className="gap-1 bg-emerald-600 hover:bg-emerald-700"
            >
              <UserCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Одобрить</span>
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onReject(emp.id)}
              disabled={actionLoading === emp.id}
              className="gap-1"
            >
              <UserX className="h-4 w-4" />
              <span className="hidden sm:inline">Отклонить</span>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function QrTab({
  tokens,
  onCreateToken,
  onDeleteToken,
  creatingToken,
  currentCompanyId,
}: {
  tokens: RegistrationToken[];
  onCreateToken: () => void;
  onDeleteToken: (id: number) => void;
  creatingToken: boolean;
  currentCompanyId: number | null;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Токены регистрации</h2>
        <Button
          onClick={onCreateToken}
          disabled={creatingToken || !currentCompanyId}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
        >
          {creatingToken ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Создать QR
        </Button>
      </div>

      {!currentCompanyId && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Выберите компанию для создания QR-кода
        </div>
      )}

      {tokens.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <QrCode className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">Нет токенов</h3>
          <p className="text-gray-500 text-sm mt-1">Создайте QR-код для регистрации сотрудников</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tokens.map((token) => (
            <TokenCard key={token.id} token={token} onDelete={() => onDeleteToken(token.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TokenCard({ token, onDelete }: { token: RegistrationToken; onDelete: () => void }) {
  const qrRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [QRCodeComponent, setQRCodeComponent] = useState<any>(null);

  const registerUrl = typeof window !== "undefined"
    ? `${window.location.origin}/register?token=${token.token}`
    : "";

  useEffect(() => {
    import("qrcode.react").then((mod) => {
      setQRCodeComponent(() => mod.QRCodeSVG);
    });
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(registerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow || !qrRef.current) return;
    const svgEl = qrRef.current.querySelector("svg");
    if (!svgEl) return;
    printWindow.document.write(`
      <html><head><title>QR - ${token.company?.name || ""}</title>
      <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif}
      h2{margin-bottom:10px}p{color:#666;font-size:14px}</style></head>
      <body><h2>${token.company?.shortName || token.company?.name || ""}</h2>
      ${svgEl.outerHTML}
      <p>Отсканируйте QR-код для регистрации</p></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className={`bg-white rounded-2xl border p-5 space-y-4 ${!token.isActive ? "opacity-60" : ""}`}>
      <div className="flex justify-between items-start">
        <div>
          <div className="font-medium text-gray-900">{token.company?.shortName || token.company?.name}</div>
          <div className="text-xs text-gray-500">
            Создан: {new Date(token.createdAt).toLocaleDateString("ru-RU")}
          </div>
          <div className="text-xs text-gray-500">Использован: {token.usageCount} раз</div>
        </div>
        <Badge variant={token.isActive ? "default" : "secondary"}>
          {token.isActive ? "Активен" : "Отозван"}
        </Badge>
      </div>

      {token.isActive && QRCodeComponent && (
        <div ref={qrRef} className="flex justify-center py-2">
          <QRCodeComponent value={registerUrl} size={180} level="M" />
        </div>
      )}

      {token.isActive && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleCopy} className="flex-1 gap-1">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Скопировано" : "Ссылка"}
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrint} className="flex-1 gap-1">
            <Printer className="h-4 w-4" />
            Печать
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} className="gap-1">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function EmployeePhotoPortrait({ employeeId }: { employeeId: number }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const photoUrl = getEmployeePhotoUrl(employeeId, false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
    let revoked = false;
    fetch(photoUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(res => res.ok ? res.blob() : null)
      .then(blob => { if (blob && !revoked) setBlobUrl(URL.createObjectURL(blob)); })
      .catch(() => {});
    return () => {
      revoked = true;
      setBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [photoUrl]);

  if (!blobUrl) return null;
  return (
    <div className="flex justify-center">
      <div className="w-36 h-48 rounded-2xl overflow-hidden border-2 border-gray-200">
        <img src={blobUrl} alt="Фото" className="w-full h-full object-cover" />
      </div>
    </div>
  );
}

function DetailModal({
  employee,
  departments,
  positions,
  approveData,
  setApproveData,
  onApprove,
  onReject,
  onClose,
  actionLoading,
}: {
  employee: PendingEmployee;
  departments: Department[];
  positions: Position[];
  approveData: { departmentId?: number; positionId?: number };
  setApproveData: (data: { departmentId?: number; positionId?: number }) => void;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
  actionLoading: boolean;
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Заявка на регистрацию</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Фото */}
          {employee.photoPath && (
            <EmployeePhotoPortrait employeeId={employee.id} />
          )}

          {/* Данные */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Фамилия" value={employee.lastName} />
            <Field label="Имя" value={employee.firstName} />
            <Field label="Отчество" value={employee.patronymic} />
            <Field label="Дата рождения" value={employee.birthDate ? new Date(employee.birthDate).toLocaleDateString("ru-RU") : null} />
            <Field label="Телефон" value={employee.phone} />
            <Field label="Email" value={employee.email} />
            <Field label="Адрес" value={employee.address} full />
            <Field label="Серия паспорта" value={employee.passportSerial} />
            <Field label="Номер паспорта" value={employee.passportNumber} />
            <Field label="Кем выдан" value={employee.passportIssuedBy} full />
            <Field label="Дата выдачи" value={employee.passportIssueDate ? new Date(employee.passportIssueDate).toLocaleDateString("ru-RU") : null} />
            <Field label="ИНН" value={employee.inn} />
          </div>

          {/* Назначение */}
          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-700">Назначение (при одобрении)</h3>
            <div>
              <Label>Отдел</Label>
              <Select
                value={approveData.departmentId ? String(approveData.departmentId) : ""}
                onValueChange={(v) => setApproveData({ ...approveData, departmentId: v ? parseInt(v) : undefined })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите отдел" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Должность</Label>
              <Select
                value={approveData.positionId ? String(approveData.positionId) : ""}
                onValueChange={(v) => setApproveData({ ...approveData, positionId: v ? parseInt(v) : undefined })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите должность" />
                </SelectTrigger>
                <SelectContent>
                  {positions.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="destructive"
            onClick={onReject}
            disabled={actionLoading}
            className="gap-1"
          >
            <XCircle className="h-4 w-4" />
            Отклонить
          </Button>
          <Button
            onClick={onApprove}
            disabled={actionLoading}
            className="gap-1 bg-emerald-600 hover:bg-emerald-700"
          >
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Одобрить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, full }: { label: string; value: string | null | undefined; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium text-gray-900">{value || "—"}</div>
    </div>
  );
}
