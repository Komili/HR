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
  DialogDescription,
  DialogFooter,
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
  ChevronLeft,
  ChevronRight,
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
  getActiveHikvisionDevices,
  getEmployeeHikvisionDevices,
  grantHikvisionAccess,
  revokeHikvisionAccess,
  checkHikvisionAccess,
  getAgentStatus,
  getAttendanceSelfieUrl,
  deleteEmployee,
  updateEmployee,
  getDepartments,
  getPositions,
} from "@/lib/hrms-api";
import type { EmployeeProfile, EmployeeDocument, InventoryItem, AttendanceSummary, Door, HikvisionDevice, Department, Position } from "@/lib/types";
import { CrudModal } from "@/components/crud-modal";
import PhotoLightbox from "@/components/photo-lightbox";
import { StatusBadge } from "@/components/status-badge";
import { AgentStatusBanner } from "@/components/agent-status-banner";
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
  const photoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoBlobUrl, setPhotoBlobUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [deleteEmployeeDialog, setDeleteEmployeeDialog] = useState(false);
  const [deletingEmployee, setDeletingEmployee] = useState(false);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "", lastName: "", patronymic: "",
    latinFirstName: "", latinLastName: "",
    email: "", phone: "", status: "Активен",
    departmentId: undefined as number | undefined,
    positionId: undefined as number | undefined,
    managerId: undefined as number | undefined,
  });
  const [editDepartments, setEditDepartments] = useState<Department[]>([]);
  const [editPositions, setEditPositions] = useState<Position[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  // Attendance state
  const [attendanceData, setAttendanceData] = useState<AttendanceSummary[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceMonth, setAttendanceMonth] = useState(() => new Date().getMonth() + 1);
  const [attendanceYear, setAttendanceYear] = useState(() => new Date().getFullYear());
  const [selfieModal, setSelfieModal] = useState<{ events: NonNullable<AttendanceSummary["selfieEvents"]>; idx: number } | null>(null);
  const selfieModalEventId = selfieModal ? selfieModal.events[selfieModal.idx].id : null;
  const [selfieBlobUrl, setSelfieBlobUrl] = useState<string | null>(null);
  const [selfieLoading, setSelfieLoading] = useState(false);

  // Position history state
  const [positionHistory, setPositionHistory] = useState<PositionHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [historyForm, setHistoryForm] = useState({
    departmentName: "", positionName: "", startDate: "", endDate: "", note: "",
  });
  const [savingHistory, setSavingHistory] = useState(false);

  // Relay-agent doors state
  const [employeeDoors, setEmployeeDoors] = useState<Door[]>([]);
  const [doorsLoading, setDoorsLoading] = useState(false);
  const [doorsError, setDoorsError] = useState<string | null>(null);
  const [togglingDoorId, setTogglingDoorId] = useState<number | null>(null);
  const [doorResults, setDoorResults] = useState<Record<number, { ok: boolean; message: string; isWarning?: boolean } | null>>({});
  const [checkingDevices, setCheckingDevices] = useState(false);
  const [deviceChecks, setDeviceChecks] = useState<Record<number, DeviceCheckResult | { error: string } | null>>({});

  // Hikvision devices state
  const [hikDevices, setHikDevices] = useState<HikvisionDevice[]>([]);
  const [hikLoading, setHikLoading] = useState(false);
  const [togglingHikId, setTogglingHikId] = useState<number | null>(null);
  const [hikResults, setHikResults] = useState<Record<number, { ok: boolean; message: string } | null>>({});
  const [checkingHikId, setCheckingHikId] = useState<number | null>(null);
  const [hikChecks, setHikChecks] = useState<Record<number, any>>({});
  const [agentStatus, setAgentStatus] = useState<{ online: boolean; secondsAgo: number | null; pendingCommands: number } | null>(null);

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

  const loadSelfieById = useCallback(async (eventId: number) => {
    setSelfieBlobUrl(null);
    setSelfieLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
      const res = await fetch(getAttendanceSelfieUrl(eventId), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setSelfieBlobUrl(URL.createObjectURL(await res.blob()));
    } catch { /* ignore */ } finally {
      setSelfieLoading(false);
    }
  }, []);

  const openSelfieModal = useCallback((events: NonNullable<AttendanceSummary["selfieEvents"]>, idx = 0) => {
    setSelfieModal({ events, idx });
    loadSelfieById(events[idx].id);
  }, [loadSelfieById]);

  const navigateSelfieModal = useCallback((dir: 1 | -1) => {
    setSelfieModal(prev => {
      if (!prev) return null;
      const next = prev.idx + dir;
      if (next < 0 || next >= prev.events.length) return prev;
      loadSelfieById(prev.events[next].id);
      return { ...prev, idx: next };
    });
  }, [loadSelfieById]);

  const closeSelfieModal = useCallback(() => {
    setSelfieModal(null);
    setSelfieBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  }, []);

  const openEditDialog = useCallback(async () => {
    if (!employee) return;
    setEditForm({
      firstName: employee.firstName,
      lastName: employee.lastName,
      patronymic: employee.patronymic || "",
      latinFirstName: employee.latinFirstName || "",
      latinLastName: employee.latinLastName || "",
      email: employee.email || "",
      phone: employee.phone || "",
      status: employee.status || "Активен",
      departmentId: (employee as any).departmentId || undefined,
      positionId: (employee as any).positionId || undefined,
      managerId: (employee as any).managerId || undefined,
    });
    setEditOpen(true);
    try {
      const [deps, pos] = await Promise.all([getDepartments(), getPositions()]);
      setEditDepartments(deps);
      setEditPositions(pos);
    } catch { /* ignore */ }
  }, [employee]);

  const handleEditSave = useCallback(async () => {
    if (!editForm.firstName || !editForm.lastName) return;
    setEditSaving(true);
    try {
      await updateEmployee(employeeId, editForm);
      setEditOpen(false);
      // Reload employee data
      const updated = await getEmployee(employeeId);
      setEmployee(updated as any);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setEditSaving(false);
    }
  }, [employeeId, editForm]);

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

  const loadHikDevices = useCallback(async () => {
    if (!Number.isFinite(employeeId)) return;
    setHikLoading(true);
    try {
      const devs = await getEmployeeHikvisionDevices(employeeId);
      setHikDevices(devs);
    } catch {
      setHikDevices([]);
    } finally {
      setHikLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadHikDevices();
  }, [loadHikDevices]);

  useEffect(() => {
    const load = async () => {
      try { setAgentStatus(await getAgentStatus()); } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  // Загрузка фото сотрудника через авторизованный fetch
  useEffect(() => {
    if (!employee?.photoPath) {
      setPhotoBlobUrl(null);
      return;
    }
    let revoked = false;
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
    const photoUrl = `${getEmployeePhotoUrl(employeeId)}${photoVersion > 0 ? `?v=${photoVersion}` : ''}`;
    fetch(photoUrl, {
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

  const handleToggleHik = async (dev: HikvisionDevice) => {
    setTogglingHikId(dev.id);
    setHikResults(prev => ({ ...prev, [dev.id]: null }));
    try {
      let result: { ok: boolean; message: string };
      if (dev.hasAccess) {
        result = await revokeHikvisionAccess(dev.id, employeeId);
      } else {
        result = await grantHikvisionAccess(dev.id, employeeId);
      }
      setHikResults(prev => ({ ...prev, [dev.id]: result }));
      await loadHikDevices();
    } catch (e: any) {
      setHikResults(prev => ({ ...prev, [dev.id]: { ok: false, message: e.message || 'Ошибка' } }));
    } finally {
      setTogglingHikId(null);
    }
  };

  const handleCheckHik = async (dev: HikvisionDevice) => {
    setCheckingHikId(dev.id);
    setHikChecks(prev => ({ ...prev, [dev.id]: null }));
    try {
      const result = await checkHikvisionAccess(dev.id, employeeId);
      setHikChecks(prev => ({ ...prev, [dev.id]: result }));
    } catch (e: any) {
      setHikChecks(prev => ({ ...prev, [dev.id]: { checked: false, message: e.message || 'Ошибка' } }));
    } finally {
      setCheckingHikId(null);
    }
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
                onClick={() => {
                  if (photoBlobUrl) setLightboxOpen(true);
                  else photoFileInputRef.current?.click();
                }}
                disabled={uploadingPhoto}
                className="block focus:outline-none"
                title={photoBlobUrl ? "Нажмите для просмотра фото" : "Добавить фото"}
              >
                {photoBlobUrl ? (
                  <img
                    src={photoBlobUrl}
                    alt={fullName}
                    className="h-14 w-14 sm:h-20 sm:w-20 rounded-xl sm:rounded-2xl object-cover shadow-lg shadow-emerald-500/30 group-hover:brightness-75 transition-all cursor-pointer"
                  />
                ) : (
                  <div className="relative flex h-14 w-14 sm:h-20 sm:w-20 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-lg sm:text-2xl font-bold text-white shadow-lg shadow-emerald-500/30 cursor-pointer group-hover:brightness-75 transition-all">
                    {initials}
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl sm:rounded-2xl bg-black/0 group-hover:bg-black/30 transition-all">
                      <Upload className="h-5 w-5 sm:h-6 sm:w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                )}
              </button>
              {uploadingPhoto && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl sm:rounded-2xl bg-black/50">
                  <div className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                </div>
              )}
              <input
                ref={photoFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload(file);
                  e.target.value = "";
                }}
              />
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
                {employee.company && (
                  <span className="flex items-center gap-1 sm:gap-1.5 text-white/50">
                    <span className="hidden sm:inline opacity-40">·</span>
                    {employee.company.name}
                  </span>
                )}
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
              onClick={openEditDialog}
            >
              <Edit className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Редактировать</span>
              <span className="sm:hidden">Ред.</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-red-500/20 border-red-400/30 text-red-300 hover:bg-red-500/40 hover:text-red-200"
              onClick={() => setDeleteEmployeeDialog(true)}
              title="Удалить сотрудника"
            >
              <Trash2 className="h-4 w-4" />
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
              {(employeeDoors.filter(d => d.hasAccess).length + hikDevices.filter(d => d.hasAccess).length) > 0 && (
                <span className="ml-1 sm:ml-2 flex h-4 sm:h-5 min-w-4 sm:min-w-5 items-center justify-center rounded-full bg-white/20 px-1 sm:px-1.5 text-[10px] sm:text-xs">
                  {employeeDoors.filter(d => d.hasAccess).length + hikDevices.filter(d => d.hasAccess).length}
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
                      <TableRow className="bg-gradient-to-r from-blue-50/80 to-cyan-50/80 hover:bg-blue-50/80">
                        <TableHead className="text-blue-700 font-semibold text-xs uppercase tracking-wider">Дата</TableHead>
                        <TableHead className="text-blue-700 font-semibold text-xs uppercase tracking-wider">Вход</TableHead>
                        <TableHead className="text-blue-700 font-semibold text-xs uppercase tracking-wider">Выход</TableHead>
                        <TableHead className="text-blue-700 font-semibold text-xs uppercase tracking-wider">Часов</TableHead>
                        <TableHead className="text-blue-700 font-semibold text-xs uppercase tracking-wider">Корректировка</TableHead>
                        <TableHead className="text-blue-700 font-semibold text-xs uppercase tracking-wider">Статус</TableHead>
                        <TableHead className="text-blue-700 font-semibold text-xs uppercase tracking-wider w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendanceData.map((row) => {
                        const rowBg: Record<string, string> = {
                          present: "bg-emerald-50/60 hover:bg-emerald-100/60",
                          left:    "bg-red-50/60 hover:bg-red-100/60",
                          absent:  "bg-gray-50/60 hover:bg-gray-100/60",
                          excused: "bg-amber-50/60 hover:bg-amber-100/60",
                        };
                        const statusLabels: Record<string, string> = {
                          present: "На месте", left: "Ушёл", absent: "Отсутствует", excused: "Уважит.",
                        };
                        const statusBadge: Record<string, string> = {
                          present: "bg-emerald-100 text-emerald-700 border-emerald-200",
                          left:    "bg-red-100 text-red-700 border-red-200",
                          absent:  "bg-gray-100 text-gray-600 border-gray-200",
                          excused: "bg-amber-100 text-amber-700 border-amber-200",
                        };
                        const fmtT = (iso: string | null) => {
                          if (!iso) return "—";
                          return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false });
                        };
                        const h = Math.floor(row.totalMinutes / 60);
                        const m = row.totalMinutes % 60;
                        const hasSelfies = row.selfieEvents && row.selfieEvents.length > 0;
                        return (
                          <TableRow key={row.id} className={`border-b border-blue-50 ${rowBg[row.status] || ""}`}>
                            <TableCell className="font-medium text-sm py-2.5">
                              {new Date(row.date + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", weekday: "short" })}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium">{fmtT(row.firstEntry)}</span>
                                {row.isLate && row.firstEntry && (
                                  <span className="inline-flex items-center rounded-full bg-orange-100 border border-orange-200 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">Опоздал</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium">{fmtT(row.lastExit)}</span>
                                {row.isEarlyLeave && row.lastExit && (
                                  <span className="inline-flex items-center rounded-full bg-purple-100 border border-purple-200 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">Ранний</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium text-sm py-2.5">
                              {h}ч {m}м
                              {row.correctionMinutes !== 0 && (
                                <span className={`ml-1 text-xs ${row.correctionMinutes > 0 ? "text-emerald-600" : "text-red-500"}`}>
                                  ({row.correctionMinutes > 0 ? "+" : ""}{row.correctionMinutes}м)
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5">
                              {row.correctionNote ? (
                                <span className="text-xs text-muted-foreground" title={row.correctionNote}>
                                  {row.correctionNote.length > 30 ? row.correctionNote.slice(0, 30) + "…" : row.correctionNote}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge[row.status] || "bg-gray-100 text-gray-700"}`}>
                                {statusLabels[row.status] || row.status}
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5 pr-3">
                              {hasSelfies && (
                                <button
                                  onClick={() => openSelfieModal(row.selfieEvents!, 0)}
                                  className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-violet-100 transition-colors"
                                  title={`Фото чекина (${row.selfieEvents!.length})`}
                                >
                                  <Camera className="h-3.5 w-3.5 text-violet-500" />
                                </button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {/* Итого */}
                  <div className="border-t border-gray-100 px-4 sm:px-6 py-3 sm:py-4 bg-blue-50/30">
                    <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs sm:text-sm">
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
                        <span className="text-muted-foreground">Опозданий: </span>
                        <span className="font-bold text-orange-600">
                          {attendanceData.filter((d) => d.isLate).length}
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

          {/* Selfie Modal */}
          {selfieModal && (() => {
            const ev = selfieModal.events[selfieModal.idx];
            const isIn = ev.direction === "IN";
            const isMobile = ev.source === "QR_CHECKIN" || ev.deviceName?.includes("Мобильный");
            const camName = isMobile ? "Телефон" : (ev.deviceName?.replace(/_/g, " ") || "Камера");
            const dt = new Date(ev.timestamp);
            const dateStr = dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
            const timeStr = dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
            const total = selfieModal.events.length;
            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                onClick={closeSelfieModal}
              >
                <div
                  className="relative bg-white rounded-2xl shadow-2xl max-w-xs w-full mx-4 overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                    <div className="flex items-center gap-2">
                      <Camera className="h-4 w-4 text-violet-500" />
                      <span className="text-sm font-semibold">Фото чекина</span>
                      {total > 1 && (
                        <span className="text-xs text-muted-foreground bg-gray-200 rounded-full px-2 py-0.5">
                          {selfieModal.idx + 1} / {total}
                        </span>
                      )}
                    </div>
                    <button onClick={closeSelfieModal} className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Photo */}
                  <div className="relative aspect-[3/4] bg-gray-100 flex items-center justify-center">
                    {selfieLoading ? (
                      <div className="h-8 w-8 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
                    ) : selfieBlobUrl ? (
                      <img src={selfieBlobUrl} alt="Фото чекина" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Camera className="h-10 w-10 text-gray-300" />
                        <span className="text-sm">Фото недоступно</span>
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="px-4 py-3 border-t space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${isIn ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                        {isIn ? "▲ Вход" : "▼ Выход"}
                      </span>
                      <span className="text-xs text-muted-foreground">{isMobile ? "📱" : "🖥"} {camName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{timeStr}</span>{" — "}{dateStr}
                    </div>
                  </div>

                  {/* Navigation */}
                  {total > 1 && (
                    <div className="flex items-center justify-between px-4 py-2.5 border-t bg-gray-50">
                      <button
                        onClick={() => navigateSelfieModal(-1)}
                        disabled={selfieModal.idx === 0}
                        className="h-8 w-8 flex items-center justify-center rounded-full border hover:bg-white disabled:opacity-30 transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-xs text-muted-foreground">листать фото</span>
                      <button
                        onClick={() => navigateSelfieModal(1)}
                        disabled={selfieModal.idx === total - 1}
                        className="h-8 w-8 flex items-center justify-center rounded-full border hover:bg-white disabled:opacity-30 transition-colors"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
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
            <CardContent className="p-4 sm:p-6 space-y-6">
              {/* ── Agent status ── */}
              <AgentStatusBanner
                status={agentStatus}
                onRefresh={async () => {
                  try { setAgentStatus(await getAgentStatus()); } catch { /* ignore */ }
                }}
                compact
              />

              {/* ── Hikvision устройства ── */}
              {hikLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>
              ) : hikDevices.length > 0 ? (
                <div className="space-y-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Устройства Hikvision (Face ID)</p>
                  {(() => {
                    // Группируем по компании
                    const groups: { companyId: number | null; companyName: string; devices: typeof hikDevices }[] = [];
                    for (const dev of hikDevices) {
                      const cId = dev.companyId ?? null;
                      const cName = dev.company ? (dev.company.shortName || dev.company.name) : 'Без компании';
                      let group = groups.find(g => g.companyId === cId);
                      if (!group) { group = { companyId: cId, companyName: cName, devices: [] }; groups.push(group); }
                      group.devices.push(dev);
                    }
                    const showGroupHeaders = user?.isHoldingAdmin && groups.length > 1;
                    return groups.map(group => (
                      <div key={group.companyId ?? 'none'}>
                        {showGroupHeaders && (
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">{group.companyName}</span>
                            <div className="flex-1 h-px bg-amber-100" />
                            <span className="text-xs text-slate-400">{group.devices.filter(d => d.hasAccess).length}/{group.devices.length} доступов</span>
                          </div>
                        )}
                        <div className="space-y-3">
                    {group.devices.map(dev => {
                      const isToggling = togglingHikId === dev.id;
                      const isChecking = checkingHikId === dev.id;
                      const result = hikResults[dev.id];
                      const check = hikChecks[dev.id];
                      return (
                        <div key={dev.id} className={`rounded-2xl border overflow-hidden transition-all ${dev.hasAccess ? "border-emerald-200 shadow-sm shadow-emerald-100" : "border-slate-200"}`}>
                          <div className={`flex items-center justify-between px-4 py-3.5 ${dev.hasAccess ? "bg-emerald-50/60" : "bg-white"}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`shrink-0 p-2.5 rounded-xl ${dev.hasAccess ? "bg-emerald-100" : "bg-slate-100"}`}>
                                <DoorOpen className={`h-5 w-5 ${dev.hasAccess ? "text-emerald-600" : "text-slate-400"}`} />
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-sm truncate">{dev.officeName}</div>
                                <div className="text-xs text-slate-400">{dev.direction === 'IN' ? '🟢 Вход (снаружи)' : dev.direction === 'OUT' ? '🔴 Выход (внутри)' : '—'}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleCheckHik(dev)}
                                disabled={isChecking || isToggling}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-40"
                                title="Проверить на устройстве"
                              >
                                {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                              </button>
                              <button
                                onClick={() => handleToggleHik(dev)}
                                disabled={isToggling || isChecking}
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${dev.hasAccess ? "bg-emerald-500" : "bg-slate-200"}`}
                                title={dev.hasAccess ? "Закрыть доступ" : "Открыть доступ"}
                              >
                                {isToggling ? (
                                  <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-white" />
                                ) : (
                                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${dev.hasAccess ? "translate-x-6" : "translate-x-1"}`} />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Статус доступа */}
                          <div className={`flex items-center gap-1.5 px-4 py-2 border-t text-xs ${dev.hasAccess ? "bg-emerald-50/40 border-emerald-100 text-emerald-700" : "bg-slate-50 border-slate-100 text-slate-400"}`}>
                            {dev.hasAccess ? (
                              <>
                                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                                <span>Доступ разрешён</span>
                                {dev.grantedBy && <span className="text-emerald-500">· {dev.grantedBy}</span>}
                                {dev.grantedAt && <span className="text-emerald-400">{new Date(dev.grantedAt).toLocaleDateString("ru-RU")}</span>}
                              </>
                            ) : (
                              <>
                                <ShieldOff className="h-3.5 w-3.5 shrink-0" />
                                <span>Нет доступа</span>
                              </>
                            )}
                          </div>

                          {/* Результат проверки статуса */}
                          {check && (
                            <div className="border-t border-violet-100 bg-violet-50/60 px-4 py-3 text-xs space-y-1.5">
                              {check.checked === false ? (
                                <span className="text-slate-500">{check.message || 'Ошибка проверки'}</span>
                              ) : (
                                <>
                                  <div className="flex flex-wrap gap-3">
                                    <span className={`flex items-center gap-1 font-medium ${check.hasAccess ? 'text-emerald-600' : 'text-slate-400'}`}>
                                      {check.hasAccess ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
                                      {check.hasAccess ? 'Доступ в системе' : 'Нет в системе'}
                                    </span>
                                    <span className={`flex items-center gap-1 ${check.isupConnected ? 'text-emerald-600' : check.deviceOnline ? 'text-amber-500' : 'text-slate-400'}`}>
                                      <Wifi className="h-3.5 w-3.5" />
                                      {check.isupConnected ? '⚡ ISUP подключён' : check.deviceOnline ? `Сигнал есть (${check.secondsAgo < 3600 ? Math.floor(check.secondsAgo / 60) + ' мин' : Math.floor(check.secondsAgo / 3600) + ' ч'} назад)` : 'Нет сигнала'}
                                    </span>
                                  </div>
                                  {/* Статус синхронизации relay-агента */}
                                  {check.syncStatus && (
                                    <div className={`flex items-center gap-1.5 font-medium ${
                                      check.syncStatus === 'done' ? 'text-emerald-600' :
                                      check.syncStatus === 'failed' ? 'text-red-600' :
                                      'text-amber-500'
                                    }`}>
                                      {check.syncStatus === 'done' && <UserCheck className="h-3.5 w-3.5" />}
                                      {check.syncStatus === 'failed' && <UserX className="h-3.5 w-3.5" />}
                                      {(check.syncStatus === 'pending' || check.syncStatus === 'processing') && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                      {check.syncStatus === 'done' && check.syncAction === 'grant' && 'Записан на устройство (Face ID)'}
                                      {check.syncStatus === 'done' && check.syncAction === 'revoke' && 'Удалён с устройства'}
                                      {check.syncStatus === 'failed' && `Ошибка синхр.: ${check.syncError || 'неизвестно'}`}
                                      {check.syncStatus === 'pending' && 'Ожидает relay-агент...'}
                                      {check.syncStatus === 'processing' && 'Выполняется...'}
                                    </div>
                                  )}
                                  {!check.syncStatus && check.hasAccess && (
                                    <div className="text-amber-500 flex items-center gap-1">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      Relay-агент ещё не запущен — запусти агент на локальном ПК
                                    </div>
                                  )}
                                  {check.grantedBy && (
                                    <div className="text-slate-400">Выдан: {check.grantedBy}{check.grantedAt ? ` · ${new Date(check.grantedAt).toLocaleDateString('ru-RU')}` : ''}</div>
                                  )}
                                </>
                              )}
                            </div>
                          )}

                          {/* Результат последнего действия */}
                          {result && (
                            <div className={`flex items-start gap-2 px-4 py-2.5 border-t text-xs ${result.ok ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-red-50 border-red-100 text-red-700"}`}>
                              <span className="shrink-0 font-bold">{result.ok ? "✓" : "✗"}</span>
                              <span>{result.message}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : null}

              {/* ── Relay-агент двери ── */}
              {doorsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
                </div>
              ) : employeeDoors.length === 0 && hikDevices.length === 0 && !hikLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DoorOpen className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">Нет настроенных дверей</p>
                  <p className="text-sm mt-1">Суперадмин должен сначала добавить и привязать устройства</p>
                </div>
              ) : employeeDoors.length > 0 ? (
                <div>
                  {hikDevices.length > 0 && (
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Relay-агент (Face ID)</p>
                  )}
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
                </div>
              ) : null}
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

      {/* Диалог удаления сотрудника */}
      <Dialog open={deleteEmployeeDialog} onOpenChange={setDeleteEmployeeDialog}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <DialogTitle>Удалить сотрудника?</DialogTitle>
            </div>
            <DialogDescription className="pl-[52px]">
              <span className="font-medium text-foreground">{fullName}</span> будет удалён безвозвратно вместе со всеми документами и данными.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2 mt-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setDeleteEmployeeDialog(false)} disabled={deletingEmployee}>
              Отмена
            </Button>
            <Button
              size="sm"
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
              disabled={deletingEmployee}
              onClick={async () => {
                setDeletingEmployee(true);
                try {
                  await deleteEmployee(employeeId);
                  router.push('/employees');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Ошибка удаления');
                  setDeleteEmployeeDialog(false);
                } finally {
                  setDeletingEmployee(false);
                }
              }}
            >
              {deletingEmployee ? (
                <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-1" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Employee Dialog */}
      <CrudModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title="Редактировать сотрудника"
        description="Измените данные сотрудника"
        onSave={handleEditSave}
        isSaving={editSaving}
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-lastName">Фамилия *</Label>
              <Input id="edit-lastName" value={editForm.lastName}
                onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                placeholder="Фамилия" className="h-10 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-firstName">Имя *</Label>
              <Input id="edit-firstName" value={editForm.firstName}
                onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                placeholder="Имя" className="h-10 rounded-xl" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-patronymic">Отчество</Label>
            <Input id="edit-patronymic" value={editForm.patronymic}
              onChange={(e) => setEditForm({ ...editForm, patronymic: e.target.value })}
              placeholder="Отчество" className="h-10 rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="Email" className="h-10 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Телефон</Label>
              <Input id="edit-phone" value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="Телефон" className="h-10 rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Отдел</Label>
              <select value={editForm.departmentId || ""}
                onChange={(e) => setEditForm({ ...editForm, departmentId: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm">
                <option value="">Без отдела</option>
                {editDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Должность</Label>
              <select value={editForm.positionId || ""}
                onChange={(e) => setEditForm({ ...editForm, positionId: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm">
                <option value="">Без должности</option>
                {editPositions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Статус</Label>
            <select value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm">
              {["Активен","Стажёр","Руководитель","Дистанционно","В отпуске","Больничный","Декрет","Уволен"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </CrudModal>
    </div>
  );
}
