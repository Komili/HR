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
} from "lucide-react";
import {
  getEmployee,
  getEmployeeDocuments,
  uploadEmployeeDocument,
  downloadDocument,
  viewDocument,
} from "@/lib/hrms-api";
import type { EmployeeProfile, EmployeeDocument } from "@/lib/types";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const employeeId = Number(id);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [employeeData, documentsData] = await Promise.all([
        getEmployee(employeeId),
        getEmployeeDocuments(employeeId),
      ]);
      setEmployee(employeeData);
      setDocuments(documentsData);
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

  useEffect(() => {
    if (!Number.isFinite(employeeId)) return;
    loadData();
  }, [employeeId, loadData]);

  // Очистка URL при закрытии превью
  useEffect(() => {
    return () => {
      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

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
    <div className="space-y-6">
      <Link
        href="/employees"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-emerald-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад к списку
      </Link>

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[hsl(155,45%,15%)] via-[hsl(158,40%,12%)] to-[hsl(160,35%,10%)] p-8 shadow-2xl shadow-emerald-900/20">
        <div className="absolute inset-0">
          <div className="absolute -left-20 -top-20 h-60 w-60 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute right-0 bottom-0 h-40 w-40 rounded-full bg-teal-500/15 blur-2xl" />
        </div>

        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-2xl font-bold text-white shadow-lg shadow-emerald-500/30">
              {initials}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{fullName}</h1>
              <div className="mt-2 flex items-center gap-4 text-white/70">
                <span className="flex items-center gap-1.5">
                  <Briefcase className="h-4 w-4" />
                  {employee.position?.name || "—"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                  {employee.department?.name || "—"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300 border border-emerald-500/30">
                  Активен
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/70 border border-white/10">
                  ID: {employeeId}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20"
              onClick={() => router.push(`/employees?action=edit&id=${employeeId}`)}
            >
              <Edit className="mr-2 h-4 w-4" />
              Редактировать
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20"
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
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-600 px-5 py-4 text-white shadow-2xl shadow-emerald-500/30">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <span className="font-medium">{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="ml-2 rounded-lg p-1 hover:bg-white/20 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <Tabs defaultValue="main-data" className="space-y-6">
        <TabsList className="bg-white/80 backdrop-blur-sm border border-emerald-100/50 rounded-xl p-1">
          <TabsTrigger
            value="main-data"
            className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
          >
            <User className="mr-2 h-4 w-4" />
            Основные данные
          </TabsTrigger>
          <TabsTrigger
            value="documents"
            className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
          >
            <FileText className="mr-2 h-4 w-4" />
            Документы
            {documents.length > 0 && (
              <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-xs">
                {documents.length}
              </span>
            )}
          </TabsTrigger>
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
                  label="ФИО (латиница)"
                  value={`${employee.latinLastName || ""} ${employee.latinFirstName || ""}`}
                  icon={User}
                />
                <DataField label="Дата рождения" value={employee.birthDate} icon={Calendar} />
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
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                    <TableHead className="w-12 text-center">Статус</TableHead>
                    <TableHead>Тип документа</TableHead>
                    <TableHead>Файл</TableHead>
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
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
    </div>
  );
}
