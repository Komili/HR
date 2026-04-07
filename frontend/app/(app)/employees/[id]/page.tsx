"use client";

import { useEffect, useState, useRef, useCallback, use, type ReactNode } from "react";
import { notFound, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  File,
  Download,
  ArrowLeft,
  User,
  FileText,
  Building2,
  Briefcase,
  Calendar,
  Mail,
  Phone,
  MapPin,
  Edit,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Eye,
  FileImage,
  FileType,
  X,
  Package,
  Unlink,
  Plus,
  Search,
  Clock,
  History,
  Trash2,
  DoorOpen,
  Loader2,
  ShieldCheck,
  ShieldOff,
  ScanSearch,
  Wifi,
  WifiOff,
  UserCheck,
  UserX,
  Camera,
  CameraOff,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getEmployee,
  getEmployeeDocuments,
  uploadEmployeeDocument,
  downloadDocument,
  viewDocument,
  getEmployeeInventory,
  unassignInventoryFromEmployee,
  getInventoryItems,
  assignInventoryToEmployee,
  getEmployeeAttendance,
  uploadEmployeePhoto,
  getEmployeePhotoUrl,
  getPositionHistory,
  createPositionHistoryEntry,
  deletePositionHistoryEntry,
  type PositionHistoryEntry,
  getEmployeeDoors,
  grantDoorAccess,
  revokeDoorAccess,
  syncEmployeeToDevice,
  removeEmployeeFromDevice,
  checkEmployeeOnDevice,
  type DeviceCheckResult,
  deleteDocument,
} from "@/lib/hrms-api";
import type { EmployeeProfile, EmployeeDocument, InventoryItem, AttendanceSummary, Door } from "@/lib/types";
import PhotoLightbox from "@/components/photo-lightbox";
import { StatusBadge } from "@/components/status-badge";
import { useAuth } from "@/app/contexts/AuthContext";

// Предопределённые типы документов для HR
const DOCUMENT_TYPES = [
  { id: "passport", name: "Паспорт", required: true, icon: FileText },
  { id: "snils", name: "СНИЛС", required: true, icon: FileType },
  { id: "inn", name: "ИНН", required: true, icon: FileType },
  { id: "employment_contract", name: "Трудовой договор", required: true, icon: FileText },
  { id: "employment_order", name: "Приказ о приёме", required: true, icon: FileText },
  { id: "diploma", name: "Диплом / Аттестат", required: false, icon: FileText },
  { id: "photo", name: "Фотография 3x4", required: false, icon: FileImage },
  { id: "medical", name: "Медицинская справка", required: false, icon: FileText },
  { id: "military_id", name: "Военный билет", required: false, icon: FileType },
  { id: "other", name: "Прочие документы", required: false, icon: File },
];

const DataField = ({ label, value, icon: Icon }: { label: string; value?: ReactNode; icon?: React.ElementType }) => (
  <div className="flex items-start gap-3 py-3 border-b border-emerald-100/50 last:border-0">
    {Icon && (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100">
        <Icon className="h-4 w-4 text-emerald-600" />
      </div>
    )}
    <div className="flex-1 min-w-0">
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value ?? "—"}</dd>
    </div>
  </div>
);

export default function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<EmployeeDocument | null>(null);
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [availableItems, setAvailableItems] = useState<InventoryItem[]>([]);
  const [assignSearch, setAssignSearch] = useState("");
  const [assigningItemId, setAssigningItemId] = useState<number | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [photoVersion, setPhotoVersion] = useState(0);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoBlobUrl, setPhotoBlobUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Attendance state
  const [attendanceData, setAttendanceData] = useState<AttendanceSummary[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceMonth, setAttendanceMonth] = useState(() => new Date().getMonth() + 1);
  const [attendanceYear, setAttendanceYear] = useState(() => new Date().getFullYear());

  // Position history state
  const [positionHistory, setPositionHistory] = useState<PositionHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [historyForm, setHistoryForm] = useState({
    departmentName: "", positionName: "", startDate: "", endDate: "", note: "",
  });
  const [savingHistory, setSavingHistory] = useState(false);

  // Doors state
  const [employeeDoors, setEmployeeDoors] = useState<Door[]>([]);
  const [doorsLoading, setDoorsLoading] = useState(false);
  const [doorsError, setDoorsError] = useState<string | null>(null);
  const [togglingDoorId, setTogglingDoorId] = useState<number | null>(null);
  const [doorResults, setDoorResults] = useState<Record<number, { ok: boolean; message: string; isWarning?: boolean } | null>>({});
  const [checkingDevices, setCheckingDevices] = useState(false);
  const [deviceChecks, setDeviceChecks] = useState<Record<number, DeviceCheckResult | { error: string } | null>>({});

  const { user } = useAuth();

  const employeeId = Number(id);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [employeeData, documentsData, inventoryData] = await Promise.all([
        getEmployee(employeeId),
        getEmployeeDocuments(employeeId),
        getEmployeeInventory(employeeId).catch(() => []),
      ]);
      setEmployee(employeeData);
      setDocuments(documentsData);
      setInventoryItems(inventoryData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  // Загрузка только документов (без перезагрузки страницы)
  const loadDocuments = useCallback(async () => {
    try {
      const documentsData = await getEmployeeDocuments(employeeId);
      setDocuments(documentsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки документов");
    }
  }, [employeeId]);

  const loadAttendance = useCallback(async () => {
    setAttendanceLoading(true);
    try {
      const data = await getEmployeeAttendance(employeeId, attendanceMonth, attendanceYear);
      setAttendanceData(data);
    } catch {
      setAttendanceData([]);
    } finally {
      setAttendanceLoading(false);
    }
  }, [employeeId, attendanceMonth, attendanceYear]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await getPositionHistory(employeeId);
      setPositionHistory(data);
    } catch {
      setPositionHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    if (!Number.isFinite(employeeId)) return;
    loadData();
  }, [employeeId, loadData]);

  useEffect(() => {
    if (!Number.isFinite(employeeId)) return;
    loadAttendance();
  }, [employeeId, loadAttendance]);

  useEffect(() => {
    if (!Number.isFinite(employeeId)) return;
    loadHistory();
  }, [employeeId, loadHistory]);

  const loadDoors = useCallback(async () => {
    setDoorsLoading(true);
    setDoorsError(null);
    try {
      const doors = await getEmployeeDoors(employeeId);
      setEmployeeDoors(doors);
    } catch (e: any) {
      setDoorsError(e.message || "Ошибка загрузки дверей");
    } finally {
      setDoorsLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    if (!Number.isFinite(employeeId)) return;
    loadDoors();
  }, [employeeId, loadDoors]);

  // Загрузка фото сотрудника через авторизованный fetch
  useEffect(() => {
    if (!employee?.photoPath) {
      setPhotoBlobUrl(null);
      return;
    }
    let revoked = false;
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
    fetch(getEmployeePhotoUrl(employeeId), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(res => res.ok ? res.blob() : null)
      .then(blob => {
        if (blob && !revoked) setPhotoBlobUrl(URL.createObjectURL(blob));
      })
      .catch(() => {});
    return () => {
      revoked = true;
      setPhotoBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [employee?.photoPath, employeeId, photoVersion]);

  // Очистка URL при закрытии превью
  useEffect(() => {
    return () => {
      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleToggleDoor = async (door: Door) => {
    const hasAccess = door.hasAccess;
    setTogglingDoorId(door.id);
    setDoorResults(prev => ({ ...prev, [door.id]: null }));
    try {
      if (hasAccess) {
        await revokeDoorAccess(door.id, employeeId);
        try {
          await removeEmployeeFromDevice(door.id, employeeId);
          setDoorResults(prev => ({ ...prev, [door.id]: { ok: true, message: 'Доступ закрыт, сотрудник удалён с устройства' } }));
        } catch {
          setDoorResults(prev => ({ ...prev, [door.id]: { ok: true, message: 'Доступ закрыт в системе (устройство недоступно)', isWarning: true } }));
        }
      } else {
        await grantDoorAccess(door.id, employeeId);
        try {
          const result = await syncEmployeeToDevice(door.id, employeeId);
          setDoorResults(prev => ({ ...prev, [door.id]: { ok: true, message: result.message || 'Доступ выдан, лицо загружено на устройство' } }));
        } catch (e: any) {
          setDoorResults(prev => ({ ...prev, [door.id]: { ok: true, message: 'Доступ выдан в системе (не удалось загрузить на устройство)', isWarning: true } }));
        }
      }
      await loadDoors();
    } catch (e: any) {
      setDoorResults(prev => ({ ...prev, [door.id]: { ok: false, message: e.message || 'Ошибка изменения доступа' } }));
    } finally {
      setTogglingDoorId(null);
    }
  };

  const handleCheckAllDevices = async () => {
    if (employeeDoors.length === 0) return;
    setCheckingDevices(true);
    setDeviceChecks({});
    await Promise.all(
      employeeDoors.map(async (door) => {
        try {
          const result = await checkEmployeeOnDevice(door.id, employeeId);
          setDeviceChecks(prev => ({ ...prev, [door.id]: result }));
        } catch (e: any) {
          setDeviceChecks(prev => ({ ...prev, [door.id]: { error: e.message || 'Ошибка связи' } }));
        }
      }),
    );
    setCheckingDevices(false);
  };

  const handleUpload = async (file: File, documentType: string) => {
    setUploading(documentType);
    setError(null);
    try {
      await uploadEmployeeDocument(employeeId, documentType, file);
      await loadDocuments();
      const docName = DOCUMENT_TYPES.find(t => t.id === documentType)?.name || documentType;
      setSuccessMessage(`Документ "${docName}" успешно загружен`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки файла");
    } finally {
      setUploading(null);
    }
  };

  const handleDownload = async (doc: EmployeeDocument) => {
    try {
      const blob = await downloadDocument(doc.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.fileName || "document";
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка скачивания файла");
    }
  };

  const handlePreview = async (doc: EmployeeDocument) => {
    setPreviewDoc(doc);
    setPreviewLoading(true);
    try {
      const blob = await viewDocument(doc.id);
      // Создаём URL с правильным типом
      const url = window.URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки документа");
      setPreviewDoc(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
    }
    setPreviewDoc(null);
    setPreviewUrl(null);
  };

  const handleDeleteDocument = async (doc: EmployeeDocument) => {
    setDeletingDocId(doc.id);
    setDeleteConfirmDoc(null);
    try {
      await deleteDocument(doc.id);
      await loadDocuments();
      const docName = DOCUMENT_TYPES.find(t => t.id === doc.type || t.name === doc.type)?.name || doc.type;
      setSuccessMessage(`Документ "${docName}" удалён`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления документа");
    } finally {
      setDeletingDocId(null);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    setUploadingPhoto(true);
    setError(null);
    try {
      const updated = await uploadEmployeePhoto(employeeId, file);
      setPhotoVersion(v => v + 1);
      setEmployee(prev => prev ? { ...prev, photoPath: (updated as any).photoPath } : prev);
      setSuccessMessage("Фото успешно загружено");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки фото");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleOpenAssignModal = async () => {
    setAssignSearch("");
    setAssignModalOpen(true);
    try {
      const result = await getInventoryItems(1, 200, "");
      // Показываем только свободные предметы (В наличии, без сотрудника)
      setAvailableItems(result.data.filter(item => !item.employeeId && item.status === "В наличии"));
    } catch {
      setAvailableItems([]);
    }
  };

  const handleAssign = async (itemId: number) => {
    setAssigningItemId(itemId);
    try {
      await assignInventoryToEmployee(itemId, employeeId);
      const updatedInventory = await getEmployeeInventory(employeeId).catch(() => []);
      setInventoryItems(updatedInventory);
      // Убираем из списка доступных
      setAvailableItems(prev => prev.filter(i => i.id !== itemId));
      setSuccessMessage("Имущество успешно закреплено");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка закрепления имущества");
    } finally {
      setAssigningItemId(null);
    }
  };

  const filteredAvailableItems = availableItems.filter(item => {
    if (!assignSearch) return true;
    const q = assignSearch.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      (item.model && item.model.toLowerCase().includes(q)) ||
      (item.inventoryNumber && item.inventoryNumber.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q))
    );
  });

  const handleUnassign = async (itemId: number) => {
    try {
      await unassignInventoryFromEmployee(itemId);
      const updatedInventory = await getEmployeeInventory(employeeId).catch(() => []);
      setInventoryItems(updatedInventory);
      setSuccessMessage("Имущество успешно откреплено");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка открепления имущества");
    }
  };

  // Получить загруженный документ по типу
  const getDocumentByType = (typeId: string): EmployeeDocument | undefined => {
    return documents.find((doc) => doc.type === typeId || doc.type === DOCUMENT_TYPES.find(t => t.id === typeId)?.name);
  };

  // Проверить, является ли файл изображением или PDF
  const isPreviewable = (fileName: string): boolean => {
    const ext = fileName.toLowerCase().split('.').pop();
    return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
  };

  // Статистика документов
  const requiredDocs = DOCUMENT_TYPES.filter(t => t.required);
  const uploadedRequiredCount = requiredDocs.filter(t => getDocumentByType(t.id)).length;
  const totalUploadedCount = documents.length;

  if (!Number.isFinite(employeeId)) return notFound();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-5 w-5 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
          <span>Загрузка профиля...</span>
        </div>
      </div>
    );
  }

  if (!employee) return notFound();

  const fullName = `${employee.lastName} ${employee.firstName} ${employee.patronymic || ""}`.trim();
  const initials = `${employee.firstName?.charAt(0) || ""}${employee.lastName?.charAt(0) || ""}`.toUpperCase();

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/employees"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-emerald-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад к списку
      </Link>

      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[hsl(155,45%,15%)] via-[hsl(158,40%,12%)] to-[hsl(160,35%,10%)] p-4 sm:p-8 shadow-2xl shadow-emerald-900/20">
        <div className="absolute inset-0">
          <div className="absolute -left-20 -top-20 h-60 w-60 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute right-0 bottom-0 h-40 w-40 rounded-full bg-teal-500/15 blur-2xl" />
        </div>

        <div className="relative flex flex-wrap items-start justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="relative group flex-shrink-0">
              <button
                onClick={() => photoBlobUrl && setLightboxOpen(true)}
                disabled={uploadingPhoto || !photoBlobUrl}
                className="block focus:outline-none"
                title={photoBlobUrl ? "Нажмите для просмотра фото" : undefined}
              >
                {photoBlobUrl ? (
                  <img
                    src={photoBlobUrl}
                    alt={fullName}
                    className="h-14 w-14 sm:h-20 sm:w-20 rounded-xl sm:rounded-2xl object-cover shadow-lg shadow-emerald-500/30 group-hover:brightness-75 transition-all cursor-pointer"
                  />
                ) : (
                  <div className="flex h-14 w-14 sm:h-20 sm:w-20 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-lg sm:text-2xl font-bold text-white shadow-lg shadow-emerald-500/30">
                    {initials}
                  </div>
                )}
              </button>
              {uploadingPhoto && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl sm:rounded-2xl bg-black/50">
                  <div className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold text-white truncate">{fullName}</h1>
              <div className="mt-1 sm:mt-2 flex flex-wrap items-center gap-2 sm:gap-4 text-white/70 text-xs sm:text-sm">
                <span className="flex items-center gap-1 sm:gap-1.5">
                  <Briefcase className="h-3 w-3 sm:h-4 sm:w-4" />
                  {employee.position?.name || "—"}
                </span>
                <span className="flex items-center gap-1 sm:gap-1.5">
                  <Building2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  {employee.department?.name || "—"}
                </span>
              </div>
              <div className="mt-2 sm:mt-3 flex flex-wrap gap-2">
                <StatusBadge status={employee.status} size="sm" />
                <span className="rounded-full bg-white/10 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium text-white/70 border border-white/10">
                  ID: {employeeId}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 sm:h-9 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs sm:text-sm"
              onClick={() => router.push(`/employees?action=edit&id=${employeeId}`)}
            >
              <Edit className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Редактировать</span>
              <span className="sm:hidden">Ред.</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Уведомление об успешной загрузке */}
      {successMessage && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="flex items-center gap-2 sm:gap-3 rounded-xl bg-emerald-600 px-3 py-3 sm:px-5 sm:py-4 text-white shadow-2xl shadow-emerald-500/30">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-white/20">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <span className="font-medium text-sm sm:text-base">{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="ml-2 rounded-lg p-1 hover:bg-white/20 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Заполненность документов */}
      {(() => {
        const totalUploaded = DOCUMENT_TYPES.filter((t) => !!getDocumentByType(t.id)).length;
        const requiredDocs = DOCUMENT_TYPES.filter((t) => t.required);
        const requiredDone = requiredDocs.filter((t) => !!getDocumentByType(t.id)).length;
        const pct = Math.round((totalUploaded / DOCUMENT_TYPES.length) * 100);
        const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-400" : "bg-red-400";
        const ringColor = pct >= 80 ? "text-emerald-600" : pct >= 40 ? "text-amber-500" : "text-red-500";
        const bgCard = pct >= 80 ? "from-emerald-50 to-teal-50 border-emerald-200" : pct >= 40 ? "from-amber-50 to-yellow-50 border-amber-200" : "from-red-50 to-rose-50 border-red-200";

        return (
          <div className={`rounded-2xl border bg-gradient-to-r ${bgCard} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              {/* Круговой индикатор */}
              <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-200" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none" strokeWidth="2.5"
                    strokeDasharray={`${pct} ${100 - pct}`}
                    strokeLinecap="round"
                    className={ringColor}
                    stroke="currentColor"
                  />
                </svg>
                <span className={`absolute text-base sm:text-lg font-bold ${ringColor}`}>{pct}%</span>
              </div>

              {/* Текст и прогресс */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-foreground">Заполненность документов</h3>
                  <span className="text-xs text-muted-foreground">{totalUploaded} из {DOCUMENT_TYPES.length}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/60 overflow-hidden mb-3">
                  <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                </div>

                {/* Обязательные документы */}
                <div className="flex flex-wrap gap-1.5">
                  {requiredDocs.map((doc) => {
                    const done = !!getDocumentByType(doc.id);
                    return (
                      <span
                        key={doc.id}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                          done
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : "bg-white/70 text-muted-foreground border-gray-200"
                        }`}
                      >
                        {done ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                        {doc.name}
                      </span>
                    );
                  })}
                  {requiredDone < requiredDocs.length && (
                    <span className="inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-muted-foreground border border-gray-200">
                      необяз: {totalUploaded - requiredDone}/{DOCUMENT_TYPES.length - requiredDocs.length}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <Tabs defaultValue="main-data" className="space-y-4 sm:space-y-6">
        <TabsList className="bg-white/80 backdrop-blur-sm border border-emerald-100/50 rounded-xl p-1 flex flex-wrap h-auto gap-1">
          <TabsTrigger
            value="main-data"
            className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm px-2 sm:px-3"
          >
            <User className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Основные данные</span>
            <span className="sm:hidden">Данные</span>
          </TabsTrigger>
          <TabsTrigger
            value="documents"
            className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm px-2 sm:px-3"
          >
            <FileText className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Документы</span>
            <span className="sm:hidden">Док.</span>
            {documents.length > 0 && (
              <span className="ml-1 sm:ml-2 flex h-4 sm:h-5 min-w-4 sm:min-w-5 items-center justify-center rounded-full bg-white/20 px-1 sm:px-1.5 text-[10px] sm:text-xs">
                {documents.length}
              </span>
            )}
          </TabsTrigger>
          {/* Таб Имущество скрыт по решению руководства
          <TabsTrigger
            value="inventory"
            className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm px-2 sm:px-3"
          >
            <Package className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Имущество</span>
            <span className="sm:hidden">Имущ.</span>
            {inventoryItems.length > 0 && (
              <span className="ml-1 sm:ml-2 flex h-4 sm:h-5 min-w-4 sm:min-w-5 items-center justify-center rounded-full bg-white/20 px-1 sm:px-1.5 text-[10px] sm:text-xs">
                {inventoryItems.length}
              </span>
            )}
          </TabsTrigger>
          */}
          <TabsTrigger
            value="attendance"
            className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm px-2 sm:px-3"
          >
            <Clock className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Посещаемость</span>
            <span className="sm:hidden">Посещ.</span>
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm px-2 sm:px-3"
          >
            <History className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">История</span>
            <span className="sm:hidden">Ист.</span>
            {positionHistory.length > 0 && (
              <span className="ml-1 sm:ml-2 flex h-4 sm:h-5 min-w-4 sm:min-w-5 items-center justify-center rounded-full bg-white/20 px-1 sm:px-1.5 text-[10px] sm:text-xs">
                {positionHistory.length}
              </span>
            )}
          </TabsTrigger>
          {(user?.isHoldingAdmin || user?.role === "Кадровик") && (
            <TabsTrigger
              value="doors"
              className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm px-2 sm:px-3"
            >
              <DoorOpen className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Доступ к дверям</span>
              <span className="sm:hidden">Двери</span>
              {employeeDoors.filter(d => d.hasAccess).length > 0 && (
                <span className="ml-1 sm:ml-2 flex h-4 sm:h-5 min-w-4 sm:min-w-5 items-center justify-center rounded-full bg-white/20 px-1 sm:px-1.5 text-[10px] sm:text-xs">
                  {employeeDoors.filter(d => d.hasAccess).length}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="main-data" className="mt-0">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
              <CardHeader className="border-b border-emerald-100/50 bg-gradient-to-r from-emerald-50/50 to-teal-50/50">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="h-5 w-5 text-emerald-600" />
                  Личные данные
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-1">
                <DataField label="Фамилия" value={employee.lastName} icon={User} />
                <DataField label="Имя" value={employee.firstName} icon={User} />
                <DataField label="Отчество" value={employee.patronymic} icon={User} />
                <DataField
                  label="Дата рождения"
                  value={employee.birthDate ? new Date(employee.birthDate).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : undefined}
                  icon={Calendar}
                />
              </CardContent>
            </Card>

            <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
              <CardHeader className="border-b border-emerald-100/50 bg-gradient-to-r from-blue-50/50 to-cyan-50/50">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Briefcase className="h-5 w-5 text-blue-600" />
                  Рабочая информация
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-1">
                <DataField label="Отдел" value={employee.department?.name} icon={Building2} />
                <DataField label="Должность" value={employee.position?.name} icon={Briefcase} />
                <DataField label="Email" value={employee.email} icon={Mail} />
                <DataField label="Телефон" value={employee.phone} icon={Phone} />
                <DataField label="Адрес" value={employee.address} icon={MapPin} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-0">
          <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
            <CardHeader className="border-b border-emerald-100/50 bg-gradient-to-r from-emerald-50/50 to-teal-50/50">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-emerald-600" />
                  Документы сотрудника
                </CardTitle>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Обязательные:</span>
                    <span className={`font-semibold ${uploadedRequiredCount === requiredDocs.length ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {uploadedRequiredCount} / {requiredDocs.length}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-gray-300" />
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Всего:</span>
                    <span className="font-semibold text-gray-700">{totalUploadedCount}</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                    <TableHead className="w-12 text-center">Статус</TableHead>
                    <TableHead>Тип документа</TableHead>
                    <TableHead className="hidden sm:table-cell">Файл</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DOCUMENT_TYPES.map((docType) => {
                    const uploadedDoc = getDocumentByType(docType.id);
                    const isUploaded = !!uploadedDoc;
                    const IconComponent = docType.icon;

                    return (
                      <TableRow
                        key={docType.id}
                        className={`group transition-colors ${isUploaded ? 'bg-emerald-50/30 hover:bg-emerald-50/50' : 'hover:bg-gray-50/50'}`}
                      >
                        <TableCell className="text-center">
                          {isUploaded ? (
                            <div className="flex justify-center">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-center">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                                <XCircle className="h-5 w-5 text-red-500" />
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isUploaded ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                              <IconComponent className={`h-5 w-5 ${isUploaded ? 'text-emerald-600' : 'text-gray-400'}`} />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{docType.name}</p>
                              {docType.required && (
                                <span className="text-xs text-red-500 font-medium">Обязательный</span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isUploaded ? (
                            <div className="flex items-center gap-2">
                              <File className="h-4 w-4 text-emerald-600" />
                              <span className="text-sm text-gray-600 truncate max-w-[200px]">
                                {uploadedDoc.fileName}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400 italic">Не загружен</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isUploaded ? (
                              <>
                                {isPreviewable(uploadedDoc.fileName) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-lg border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300"
                                    onClick={() => handlePreview(uploadedDoc)}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    Просмотр
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 rounded-lg border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300"
                                  onClick={() => handleDownload(uploadedDoc)}
                                >
                                  <Download className="h-4 w-4 mr-1" />
                                  Скачать
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 rounded-lg border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300"
                                  disabled={deletingDocId === uploadedDoc.id}
                                  onClick={() => setDeleteConfirmDoc(uploadedDoc)}
                                >
                                  {deletingDocId === uploadedDoc.id ? (
                                    <div className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </>
                            ) : null}
                            <Button
                              variant={isUploaded ? "ghost" : "default"}
                              size="sm"
                              className={`h-8 rounded-lg ${
                                isUploaded
                                  ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                  : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white'
                              }`}
                              disabled={uploading === docType.id}
                              onClick={() => fileInputRefs.current[docType.id]?.click()}
                            >
                              {uploading === docType.id ? (
                                <>
                                  <div className="h-4 w-4 mr-1 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                  Загрузка...
                                </>
                              ) : (
                                <>
                                  <Upload className="h-4 w-4 mr-1" />
                                  {isUploaded ? 'Заменить' : 'Загрузить'}
                                </>
                              )}
                            </Button>
                            <input
                              type="file"
                              ref={(el) => { fileInputRefs.current[docType.id] = el; }}
                              className="hidden"
                              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                              onChange={(e) => {
                                if (e.target.files?.[0]) {
                                  handleUpload(e.target.files[0], docType.id);
                                  e.target.value = '';
                                }
                              }}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Прочие загруженные документы, которые не входят в стандартный список */}
              {documents.filter(doc => !DOCUMENT_TYPES.some(t => t.id === doc.type || t.name === doc.type)).length > 0 && (
                <div className="border-t border-gray-100 p-4">
                  <h4 className="text-sm font-medium text-gray-500 mb-3">Дополнительные документы</h4>
                  <div className="space-y-2">
                    {documents
                      .filter(doc => !DOCUMENT_TYPES.some(t => t.id === doc.type || t.name === doc.type))
                      .map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{doc.type}</p>
                              <p className="text-xs text-gray-500">{doc.fileName}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isPreviewable(doc.fileName) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs rounded-md"
                                onClick={() => handlePreview(doc)}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Просмотр
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs rounded-md"
                              onClick={() => handleDownload(doc)}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              Скачать
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs rounded-md border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300"
                              disabled={deletingDocId === doc.id}
                              onClick={() => setDeleteConfirmDoc(doc)}
                            >
                              {deletingDocId === doc.id ? (
                                <div className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* TabsContent inventory скрыт по решению руководства
        <TabsContent value="inventory" className="mt-0">
          ...
        </TabsContent>
        */}
        <TabsContent value="attendance" className="mt-0">
          <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden overflow-x-auto">
            <CardHeader className="border-b border-emerald-100/50 bg-gradient-to-r from-blue-50/50 to-cyan-50/50">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5 text-blue-600" />
                  Посещаемость за месяц
                </CardTitle>
                <div className="flex items-center gap-3">
                  <select
                    value={attendanceMonth}
                    onChange={(e) => setAttendanceMonth(Number(e.target.value))}
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    {[
                      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
                      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
                    ].map((name, i) => (
                      <option key={i} value={i + 1}>{name}</option>
                    ))}
                  </select>
                  <select
                    value={attendanceYear}
                    onChange={(e) => setAttendanceYear(Number(e.target.value))}
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    {[2024, 2025, 2026].map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {attendanceLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <div className="h-5 w-5 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
                    <span>Загрузка...</span>
                  </div>
                </div>
              ) : attendanceData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Clock className="h-12 w-12 text-gray-300 mb-3" />
                  <p className="text-sm">Нет данных за выбранный месяц</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                        <TableHead>Дата</TableHead>
                        <TableHead>Вход</TableHead>
                        <TableHead>Выход</TableHead>
                        <TableHead>Часов</TableHead>
                        <TableHead>Корректировка</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead>Офис</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendanceData.map((row) => {
                        const statusStyles: Record<string, string> = {
                          present: "bg-emerald-50/40",
                          left: "bg-red-50/40",
                          absent: "bg-gray-50/40",
                          excused: "bg-amber-50/40",
                        };
                        const statusLabels: Record<string, string> = {
                          present: "На месте",
                          left: "Ушёл",
                          absent: "Отсутствует",
                          excused: "Уважит.",
                        };
                        const statusBadgeStyles: Record<string, string> = {
                          present: "bg-emerald-100 text-emerald-700 border-emerald-200",
                          left: "bg-red-100 text-red-700 border-red-200",
                          absent: "bg-gray-100 text-gray-600 border-gray-200",
                          excused: "bg-amber-100 text-amber-700 border-amber-200",
                        };
                        const formatT = (iso: string | null) => {
                          if (!iso) return "—";
                          return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false });
                        };
                        const h = Math.floor(row.totalMinutes / 60);
                        const m = row.totalMinutes % 60;
                        return (
                          <TableRow key={row.id} className={statusStyles[row.status] || ""}>
                            <TableCell className="font-medium">
                              {new Date(row.date + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", weekday: "short" })}
                            </TableCell>
                            <TableCell>{formatT(row.firstEntry)}</TableCell>
                            <TableCell>{formatT(row.lastExit)}</TableCell>
                            <TableCell className="font-medium">{h}ч {m}м</TableCell>
                            <TableCell>
                              {row.correctionMinutes !== 0 ? (
                                <span className={`text-sm font-medium ${row.correctionMinutes > 0 ? "text-emerald-600" : "text-red-500"}`}>
                                  {row.correctionMinutes > 0 ? "+" : ""}{row.correctionMinutes}м
                                  {row.correctionNote && (
                                    <span className="ml-1 text-xs text-muted-foreground" title={row.correctionNote}>
                                      ({row.correctionNote})
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeStyles[row.status] || "bg-gray-100 text-gray-700"}`}>
                                {statusLabels[row.status] || row.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.officeName || "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {/* Итого */}
                  <div className="border-t border-gray-100 px-3 sm:px-6 py-3 sm:py-4 bg-blue-50/30">
                    <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs sm:text-sm">
                      <div>
                        <span className="text-muted-foreground">Дней присутствия: </span>
                        <span className="font-bold text-emerald-600">
                          {attendanceData.filter((d) => d.status === "present" || d.status === "left").length}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Всего часов: </span>
                        <span className="font-bold text-blue-600">
                          {Math.floor(attendanceData.reduce((sum, d) => sum + d.totalMinutes, 0) / 60)}ч{" "}
                          {attendanceData.reduce((sum, d) => sum + d.totalMinutes, 0) % 60}м
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Отсутствий: </span>
                        <span className="font-bold text-gray-600">
                          {attendanceData.filter((d) => d.status === "absent").length}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* История должностей */}
        <TabsContent value="history" className="mt-0">
          <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
            <CardHeader className="border-b border-emerald-100/50 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <History className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
                  История должностей
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => { setShowHistoryForm(true); setHistoryForm({ departmentName: employee?.department?.name || "", positionName: employee?.position?.name || "", startDate: "", endDate: "", note: "" }); }}
                  className="h-8 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Добавить запись
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              {/* Форма добавления */}
              {showHistoryForm && (
                <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                  <p className="text-sm font-medium text-emerald-800">Новая запись</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Должность</Label>
                      <Input
                        value={historyForm.positionName}
                        onChange={e => setHistoryForm(f => ({ ...f, positionName: e.target.value }))}
                        placeholder="Название должности"
                        className="h-9 rounded-lg text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Отдел</Label>
                      <Input
                        value={historyForm.departmentName}
                        onChange={e => setHistoryForm(f => ({ ...f, departmentName: e.target.value }))}
                        placeholder="Название отдела"
                        className="h-9 rounded-lg text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Дата начала *</Label>
                      <Input
                        type="date"
                        value={historyForm.startDate}
                        onChange={e => setHistoryForm(f => ({ ...f, startDate: e.target.value }))}
                        className="h-9 rounded-lg text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Дата окончания</Label>
                      <Input
                        type="date"
                        value={historyForm.endDate}
                        onChange={e => setHistoryForm(f => ({ ...f, endDate: e.target.value }))}
                        className="h-9 rounded-lg text-sm"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Примечание</Label>
                      <Input
                        value={historyForm.note}
                        onChange={e => setHistoryForm(f => ({ ...f, note: e.target.value }))}
                        placeholder="Причина перевода, приказ и т.д."
                        className="h-9 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      disabled={savingHistory || !historyForm.startDate}
                      onClick={async () => {
                        if (!historyForm.startDate) return;
                        setSavingHistory(true);
                        try {
                          await createPositionHistoryEntry(employeeId, {
                            departmentName: historyForm.departmentName || undefined,
                            positionName: historyForm.positionName || undefined,
                            startDate: historyForm.startDate,
                            endDate: historyForm.endDate || undefined,
                            note: historyForm.note || undefined,
                          });
                          setShowHistoryForm(false);
                          loadHistory();
                        } catch {}
                        setSavingHistory(false);
                      }}
                      className="h-8 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-xs"
                    >
                      {savingHistory ? "Сохранение..." : "Сохранить"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowHistoryForm(false)} className="h-8 rounded-lg text-xs">
                      Отмена
                    </Button>
                  </div>
                </div>
              )}

              {historyLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                  Загрузка...
                </div>
              ) : positionHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <History className="h-12 w-12 text-gray-200 mb-3" />
                  <p className="text-sm">История должностей пуста</p>
                  <p className="text-xs mt-1">Нажмите «Добавить запись» чтобы внести историю</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline */}
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-emerald-100" />
                  <div className="space-y-4">
                    {positionHistory.map((entry, i) => (
                      <div key={entry.id} className="relative flex gap-4 pl-10">
                        {/* Dot */}
                        <div className={`absolute left-2.5 top-3 h-3 w-3 rounded-full border-2 border-white shadow-sm ${i === 0 ? "bg-emerald-500" : "bg-gray-300"}`} />
                        <div className="flex-1 rounded-xl border border-emerald-100 bg-white p-3 sm:p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1 min-w-0">
                              {entry.positionName && (
                                <div className="flex items-center gap-1.5 text-sm font-semibold">
                                  <Briefcase className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                                  {entry.positionName}
                                  {i === 0 && !entry.endDate && (
                                    <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Текущая</span>
                                  )}
                                </div>
                              )}
                              {entry.departmentName && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Building2 className="h-3 w-3 flex-shrink-0" />
                                  {entry.departmentName}
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3 flex-shrink-0" />
                                {new Date(entry.startDate).toLocaleDateString("ru-RU")}
                                {entry.endDate && ` — ${new Date(entry.endDate).toLocaleDateString("ru-RU")}`}
                                {!entry.endDate && " — по настоящее время"}
                              </div>
                              {entry.note && (
                                <p className="text-xs text-muted-foreground italic mt-1">{entry.note}</p>
                              )}
                            </div>
                            <button
                              onClick={async () => {
                                if (!confirm("Удалить запись?")) return;
                                await deletePositionHistoryEntry(entry.id).catch(() => {});
                                loadHistory();
                              }}
                              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Доступ к дверям */}
        <TabsContent value="doors" className="mt-0">
          <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl">
            <CardHeader className="border-b border-emerald-100/50 bg-gradient-to-r from-emerald-50/50 to-teal-50/50">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DoorOpen className="h-5 w-5 text-emerald-600" />
                  Доступ к дверям (СКУД Face ID)
                </CardTitle>
                {employeeDoors.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCheckAllDevices}
                    disabled={checkingDevices}
                    className="border-violet-200 text-violet-600 hover:bg-violet-50 hover:border-violet-300 shrink-0"
                  >
                    {checkingDevices ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <ScanSearch className="h-4 w-4 mr-1.5" />
                    )}
                    Проверить устройства
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              {doorsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
                </div>
              ) : employeeDoors.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DoorOpen className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">Нет настроенных дверей</p>
                  <p className="text-sm mt-1">Суперадмин должен сначала добавить двери</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {employeeDoors.map(door => {
                    const isToggling = togglingDoorId === door.id;
                    const result = doorResults[door.id];
                    const check = deviceChecks[door.id];
                    return (
                      <div
                        key={door.id}
                        className={`rounded-2xl border overflow-hidden transition-all ${
                          door.hasAccess
                            ? "border-emerald-200 shadow-sm shadow-emerald-100"
                            : "border-slate-200"
                        }`}
                      >
                        {/* Основная строка */}
                        <div className={`flex items-center justify-between px-4 py-3.5 ${
                          door.hasAccess ? "bg-emerald-50/60" : "bg-white"
                        }`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`shrink-0 p-2.5 rounded-xl ${door.hasAccess ? "bg-emerald-100" : "bg-slate-100"}`}>
                              <DoorOpen className={`h-5 w-5 ${door.hasAccess ? "text-emerald-600" : "text-slate-400"}`} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-sm truncate">{door.name}</div>
                              <div className="text-xs text-slate-400 truncate">{door.inDeviceIp}</div>
                            </div>
                          </div>

                          {/* Toggle switch */}
                          <button
                            onClick={() => handleToggleDoor(door)}
                            disabled={isToggling || !door.isActive}
                            className={`relative shrink-0 inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${
                              door.hasAccess ? "bg-emerald-500" : "bg-slate-200"
                            }`}
                            title={door.hasAccess ? "Закрыть доступ" : "Открыть доступ"}
                          >
                            {isToggling ? (
                              <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-white" />
                            ) : (
                              <span
                                className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
                                  door.hasAccess ? "translate-x-6" : "translate-x-1"
                                }`}
                              />
                            )}
                          </button>
                        </div>

                        {/* Строка статуса */}
                        <div className={`flex items-center gap-1.5 px-4 py-2 border-t text-xs ${
                          door.hasAccess
                            ? "bg-emerald-50/40 border-emerald-100 text-emerald-700"
                            : "bg-slate-50 border-slate-100 text-slate-400"
                        }`}>
                          {door.hasAccess ? (
                            <>
                              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                              <span>Доступ разрешён</span>
                              {door.grantedBy && (
                                <span className="text-emerald-500">· {door.grantedBy}</span>
                              )}
                              {door.grantedAt && (
                                <span className="text-emerald-400">
                                  {new Date(door.grantedAt).toLocaleDateString("ru-RU")}
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <ShieldOff className="h-3.5 w-3.5 shrink-0" />
                              <span>Нет доступа</span>
                            </>
                          )}
                        </div>

                        {/* Результат проверки устройства */}
                        {check && (
                          <div className="border-t border-violet-100 bg-violet-50/60 px-4 py-3 text-xs space-y-1.5">
                            {'error' in check ? (
                              <div className="flex items-center gap-1.5 text-red-600">
                                <WifiOff className="h-3.5 w-3.5 shrink-0" />
                                <span>Устройство недоступно: {check.error}</span>
                              </div>
                            ) : (
                              check.deviceResults.map((dr) => (
                                <div key={dr.ip} className="space-y-1">
                                  <div className={`flex items-center gap-1.5 font-medium ${dr.error ? 'text-red-600' : 'text-violet-700'}`}>
                                    {dr.error ? (
                                      <WifiOff className="h-3.5 w-3.5 shrink-0" />
                                    ) : (
                                      <Wifi className="h-3.5 w-3.5 shrink-0" />
                                    )}
                                    <span>{dr.ip}:{dr.port}</span>
                                    {dr.error && <span className="text-red-500 font-normal">— {dr.error}</span>}
                                  </div>
                                  {!dr.error && (
                                    <div className="pl-5 flex gap-3">
                                      <span className={`flex items-center gap-1 ${dr.userFound ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {dr.userFound ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                                        {dr.userFound ? `Есть на устройстве${dr.userName ? ` (${dr.userName})` : ''}` : 'Нет на устройстве'}
                                      </span>
                                      <span className={`flex items-center gap-1 ${dr.faceFound ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {dr.faceFound ? <Camera className="h-3.5 w-3.5" /> : <CameraOff className="h-3.5 w-3.5" />}
                                        {dr.faceFound ? 'Фото есть' : 'Фото нет'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}

                        {/* Результат последнего действия */}
                        {result && (
                          <div className={`flex items-start gap-2 px-4 py-2.5 border-t text-xs ${
                            !result.ok
                              ? "bg-red-50 border-red-100 text-red-700"
                              : result.isWarning
                              ? "bg-amber-50 border-amber-100 text-amber-700"
                              : "bg-emerald-50 border-emerald-100 text-emerald-700"
                          }`}>
                            <span className="shrink-0 font-bold">
                              {!result.ok ? "✗" : result.isWarning ? "⚠" : "✓"}
                            </span>
                            <span>{result.message}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Диалог подтверждения удаления документа */}
      <Dialog open={!!deleteConfirmDoc} onOpenChange={() => setDeleteConfirmDoc(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Удалить документ?
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-gray-600">
            <p>Вы уверены, что хотите удалить документ?</p>
            {deleteConfirmDoc && (
              <p className="mt-1 font-medium text-gray-900">
                {DOCUMENT_TYPES.find(t => t.id === deleteConfirmDoc.type || t.name === deleteConfirmDoc.type)?.name || deleteConfirmDoc.type}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-400">Файл будет удалён безвозвратно.</p>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmDoc(null)}>
              Отмена
            </Button>
            <Button
              size="sm"
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => deleteConfirmDoc && handleDeleteDocument(deleteConfirmDoc)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Удалить
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Модальное окно для просмотра документа */}
      <Dialog open={!!previewDoc} onOpenChange={() => closePreview()}>
        <DialogContent className="max-w-5xl h-[90vh] p-0 overflow-hidden" showCloseButton={false}>
          <DialogHeader className="px-6 py-4 border-b bg-gray-50/80 flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-600" />
                <span className="truncate max-w-md">
                  {DOCUMENT_TYPES.find(t => t.id === previewDoc?.type)?.name || previewDoc?.type} — {previewDoc?.fileName}
                </span>
              </DialogTitle>
              <div className="flex items-center gap-2">
                {previewDoc && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg"
                    onClick={() => handleDownload(previewDoc)}
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
                  <div className="h-6 w-6 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
                  <span>Загрузка документа...</span>
                </div>
              </div>
            ) : previewUrl && previewDoc ? (
              <div className="h-full w-full p-4">
                {previewDoc.fileName.toLowerCase().endsWith('.pdf') ? (
                  <object
                    data={previewUrl}
                    type="application/pdf"
                    className="w-full h-full rounded-lg shadow-lg bg-white"
                    style={{ minHeight: 'calc(90vh - 100px)' }}
                  >
                    <div className="flex flex-col items-center justify-center h-full min-h-[400px] bg-white rounded-lg p-8">
                      <FileText className="h-16 w-16 text-gray-300 mb-4" />
                      <p className="text-gray-500 mb-4">Не удалось отобразить PDF в браузере</p>
                      <Button onClick={() => handleDownload(previewDoc)}>
                        <Download className="h-4 w-4 mr-2" />
                        Скачать файл
                      </Button>
                    </div>
                  </object>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <img
                      src={previewUrl}
                      alt={previewDoc.fileName}
                      className="max-w-full max-h-[calc(90vh-150px)] rounded-lg shadow-lg object-contain bg-white"
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Модальное окно для закрепления имущества */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-indigo-600" />
              Закрепить имущество за сотрудником
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Поиск по названию, модели, инв. номеру..."
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
            />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
            {filteredAvailableItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Package className="h-10 w-10 text-gray-300 mb-2" />
                <p className="text-sm">Нет доступного имущества</p>
                <p className="text-xs text-gray-400 mt-1">Все предметы уже закреплены или отсутствуют</p>
              </div>
            ) : (
              <div className="space-y-2 py-2">
                {filteredAvailableItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-gray-200 p-3 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100">
                        <Package className="h-5 w-5 text-indigo-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{item.name}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          {item.model && <span>{item.model}</span>}
                          {item.model && item.inventoryNumber && <span>·</span>}
                          {item.inventoryNumber && <span className="font-mono">{item.inventoryNumber}</span>}
                          {(item.model || item.inventoryNumber) && item.category && <span>·</span>}
                          {item.category && <span>{item.category}</span>}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shrink-0 ml-3"
                      disabled={assigningItemId === item.id}
                      onClick={() => handleAssign(item.id)}
                    >
                      {assigningItemId === item.id ? (
                        <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-1" />
                          Закрепить
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {lightboxOpen && photoBlobUrl && (
        <PhotoLightbox
          src={photoBlobUrl}
          fullName={fullName}
          onUpload={async (file) => {
            await handlePhotoUpload(file);
            setLightboxOpen(false);
          }}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
