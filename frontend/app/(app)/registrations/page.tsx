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
  CheckCircle,
  XCircle,
  Printer,
  Copy,
  Check,
  Phone,
  Mail,
  CalendarDays,
  Building2,
  Briefcase,
  Info,
  User,
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
import { QRCodeSVG } from "qrcode.react";

type Tab = "pending" | "qr";

export default function RegistrationsPage() {
  const { currentCompanyId } = useAuth();
  const [tab, setTab] = useState<Tab>("pending");
  const [pending, setPending] = useState<PendingEmployee[]>([]);
  const [tokens, setTokens] = useState<RegistrationToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailEmployee, setDetailEmployee] = useState<PendingEmployee | null>(null);
  const [modalDepartments, setModalDepartments] = useState<Department[]>([]);
  const [modalPositions, setModalPositions] = useState<Position[]>([]);
  const [approveData, setApproveData] = useState<{ departmentId?: number; positionId?: number }>({});
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [creatingToken, setCreatingToken] = useState(false);

  const loadData = useCallback(async (companyId: number | null) => {
    setLoading(true);
    await Promise.allSettled([
      getPendingRegistrations(companyId ?? undefined)
        .then(setPending)
        .catch(() => {}),
      getRegistrationTokens(companyId ?? undefined)
        .then(setTokens)
        .catch(() => {}),
    ]);
    setLoading(false);
  }, []);

  const handleView = useCallback(async (emp: PendingEmployee) => {
    setDetailEmployee(emp);
    setApproveData({});
    setModalDepartments([]);
    setModalPositions([]);
    try {
      const [d, pos] = await Promise.all([
        getDepartments(emp.companyId),
        getPositions(emp.companyId),
      ]);
      setModalDepartments(d);
      setModalPositions(pos);
    } catch {}
  }, []);

  useEffect(() => {
    loadData(currentCompanyId);
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
          onView={handleView}
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
          departments={modalDepartments}
          positions={modalPositions}
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
  onReject,
  actionLoading,
}: {
  pending: PendingEmployee[];
  onView: (e: PendingEmployee) => void;
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
          <div className="flex flex-col gap-2 flex-shrink-0">
            <Button
              size="sm"
              onClick={() => onView(emp)}
              className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <UserCheck className="h-4 w-4" />
              Рассмотреть
            </Button>
            <Button
              size="sm"
              onClick={() => onReject(emp.id)}
              disabled={actionLoading === emp.id}
              className="gap-1 bg-red-600 hover:bg-red-700 text-white"
            >
              {actionLoading === emp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
              Отклонить
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

  const registerUrl = typeof window !== "undefined"
    ? `${window.location.origin}/register?token=${token.token}`
    : "";

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
    const companyName = token.company?.shortName || token.company?.name || "";
    const svgStr = svgEl.outerHTML;
    printWindow.document.write(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8"/>
  <title>QR — ${companyName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a2e;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
    .page{width:480px;border:2px solid #e2e8f0;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .header{background:linear-gradient(135deg,#065f46,#047857);padding:28px 32px 24px;text-align:center;color:#fff}
    .header .holding{font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:.65;margin-bottom:4px}
    .header .logo{font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:.75;margin-bottom:6px}
    .header h1{font-size:22px;font-weight:700;line-height:1.2;margin-bottom:4px}
    .header .sub{font-size:13px;opacity:.8}
    .qr-wrap{background:#f8fafc;padding:28px;display:flex;flex-direction:column;align-items:center;gap:12px;border-bottom:1px solid #e2e8f0}
    .qr-box{background:#fff;border:3px solid #e2e8f0;border-radius:16px;padding:16px;display:inline-block;box-shadow:0 2px 12px rgba(0,0,0,.06)}
    .qr-hint{font-size:12px;color:#64748b;text-align:center}
    .steps{padding:24px 28px 20px}
    .steps-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#047857;margin-bottom:16px}
    .step{display:flex;align-items:flex-start;gap:14px;margin-bottom:14px}
    .step-num{min-width:30px;height:30px;border-radius:50%;background:#ecfdf5;border:2px solid #6ee7b7;color:#047857;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center}
    .step-text{padding-top:4px;font-size:14px;color:#374151;line-height:1.45}
    .step-text b{color:#1a1a2e;font-weight:600}
    .note{margin:0 28px 24px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:12px 14px;font-size:12px;color:#92400e;line-height:1.5}
    .note b{color:#78350f}
    .footer{background:#f8fafc;border-top:1px solid #e2e8f0;padding:12px 28px;text-align:center;font-size:11px;color:#94a3b8}
    @media print{body{padding:0}@page{margin:12mm}}
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="holding">FAVZ HOLDING</div>
    <div class="logo">КАДРЫ · HR-система</div>
    <h1>Регистрация сотрудника</h1>
    <div class="sub">${companyName}</div>
  </div>

  <div class="qr-wrap">
    <div class="qr-box">${svgStr}</div>
    <div class="qr-hint">📱 Наведите камеру телефона на QR-код</div>
  </div>

  <div class="steps">
    <div class="steps-title">Как зарегистрироваться</div>
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-text"><b>Откройте камеру</b> на своём телефоне и наведите на QR-код выше</div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-text"><b>Нажмите на уведомление</b> — откроется форма регистрации</div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-text"><b>Заполните анкету:</b> ФИО, дата рождения, телефон</div>
    </div>
    <div class="step">
      <div class="step-num">4</div>
      <div class="step-text"><b>Сделайте фото</b> в форме — оно используется для учёта</div>
    </div>
    <div class="step">
      <div class="step-num">5</div>
      <div class="step-text"><b>Отправьте заявку</b> — кадровый отдел рассмотрит её и свяжется с вами</div>
    </div>
  </div>

  <div class="note">
    <b>Важно:</b> Этот QR-код привязан к компании <b>${companyName}</b>.
    Не передавайте его посторонним лицам.
  </div>

  <div class="footer">При возникновении вопросов обратитесь в кадровый отдел · FAVZ HOLDING</div>
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`);
    printWindow.document.close();
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

      {token.isActive && registerUrl && (
        <div ref={qrRef} className="flex justify-center py-2">
          <QRCodeSVG value={registerUrl} size={180} level="M" />
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
  const [failed, setFailed] = useState(false);
  const photoUrl = getEmployeePhotoUrl(employeeId, false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
    let revoked = false;
    fetch(photoUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(res => res.ok ? res.blob() : null)
      .then(blob => {
        if (revoked) return;
        if (blob) setBlobUrl(URL.createObjectURL(blob));
        else setFailed(true);
      })
      .catch(() => { if (!revoked) setFailed(true); });
    return () => {
      revoked = true;
      setBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [photoUrl]);

  if (blobUrl) {
    return (
      <div className="mx-auto w-28 h-36 rounded-2xl overflow-hidden ring-4 ring-gray-100 shadow-md">
        <img src={blobUrl} alt="Фото" className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-28 h-36 rounded-2xl bg-gray-100 ring-4 ring-gray-100 shadow-md flex items-center justify-center">
      <User className="h-14 w-14 text-gray-400" />
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
  const fullName = [employee.lastName, employee.firstName, employee.patronymic].filter(Boolean).join(" ");
  const canApprove = !!approveData.departmentId && !!approveData.positionId;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto p-0 gap-0">

        {/* ── Шапка ── */}
        <div className="px-6 pt-7 pb-6 text-center space-y-3 border-b border-gray-100">
          <EmployeePhotoPortrait employeeId={employee.id} />
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-gray-900 leading-tight">{fullName}</h2>
            {employee.company?.name && (
              <p className="text-emerald-600 text-sm font-medium">{employee.company.name}</p>
            )}
            <span className="inline-block mt-1 bg-gray-100 text-gray-500 text-xs rounded-full px-3 py-0.5">
              Заявка от {employee.createdAt ? new Date(employee.createdAt).toLocaleDateString("ru-RU") : "—"}
            </span>
          </div>
        </div>

        <div className="px-5 pt-5 pb-6 space-y-5">

          {/* ── Контакты ── */}
          {(employee.phone || employee.email || employee.birthDate) && (
            <div className="bg-gray-50 rounded-2xl px-4 py-3 space-y-2.5">
              {employee.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="font-medium text-gray-900">{employee.phone}</span>
                </div>
              )}
              {employee.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="font-medium text-gray-900">{employee.email}</span>
                </div>
              )}
              {employee.birthDate && (
                <div className="flex items-center gap-3 text-sm">
                  <CalendarDays className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="font-medium text-gray-900">
                    {new Date(employee.birthDate).toLocaleDateString("ru-RU")}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Назначение ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <Briefcase className="h-4 w-4 text-emerald-600" />
              </div>
              <span className="text-sm font-semibold text-gray-900">Назначение</span>
            </div>

            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500 pl-0.5">Отдел</Label>
                <Select
                  value={approveData.departmentId ? String(approveData.departmentId) : ""}
                  onValueChange={(v) => setApproveData({ ...approveData, departmentId: v ? parseInt(v) : undefined })}
                >
                  <SelectTrigger className="h-10 rounded-xl">
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                      <SelectValue placeholder="Выберите отдел" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-500 pl-0.5">Должность</Label>
                <Select
                  value={approveData.positionId ? String(approveData.positionId) : ""}
                  onValueChange={(v) => setApproveData({ ...approveData, positionId: v ? parseInt(v) : undefined })}
                >
                  <SelectTrigger className="h-10 rounded-xl">
                    <div className="flex items-center gap-2 text-sm">
                      <Briefcase className="h-4 w-4 text-gray-400 shrink-0" />
                      <SelectValue placeholder="Выберите должность" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {positions.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!canApprove && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>Заполните отдел и должность, чтобы одобрить заявку</span>
              </div>
            )}
          </div>

          {/* ── Кнопки ── */}
          <div className="flex flex-col gap-2 pt-1">
            <Button
              onClick={onApprove}
              disabled={actionLoading || !canApprove}
              className="h-11 gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white w-full rounded-xl"
            >
              {actionLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CheckCircle className="h-4 w-4" />}
              Одобрить заявку
            </Button>
            <Button
              onClick={onReject}
              disabled={actionLoading}
              variant="outline"
              className="h-11 gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 w-full rounded-xl"
            >
              <XCircle className="h-4 w-4" />
              Отклонить
            </Button>
          </div>

        </div>
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
