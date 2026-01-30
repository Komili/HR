"use client";

import { useEffect, useState, useRef, useCallback, use, type ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import {
  getEmployee,
  getEmployeeDocuments,
  uploadEmployeeDocument,
  downloadDocument,
} from "@/lib/hrms-api";
import type { EmployeeProfile, EmployeeDocument } from "@/lib/types";

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
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!Number.isFinite(employeeId)) return;
    loadData();
  }, [employeeId, loadData]);

  const handleUpload = async (file: File) => {
    const documentType = prompt("Введите тип документа", "document");
    if (!documentType) return;

    try {
      await uploadEmployeeDocument(employeeId, documentType, file);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки файла");
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
            <CardHeader className="flex flex-row items-center justify-between border-b border-emerald-100/50 bg-gradient-to-r from-emerald-50/50 to-teal-50/50">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-emerald-600" />
                Документы сотрудника
              </CardTitle>
              <Button
                size="sm"
                className="h-9 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Загрузить
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => e.target.files && handleUpload(e.target.files[0])}
              />
            </CardHeader>
            <CardContent className="p-6">
              {documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 mb-4">
                    <FileText className="h-8 w-8 text-emerald-600" />
                  </div>
                  <p className="text-muted-foreground">Нет загруженных документов</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    Нажмите &quot;Загрузить&quot; чтобы добавить документы
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="group flex items-center justify-between rounded-xl border border-emerald-100/50 bg-gradient-to-r from-white to-emerald-50/30 p-4 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100">
                          <File className="h-6 w-6 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{doc.type}</p>
                          <p className="text-sm text-muted-foreground">{doc.fileName}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-xl border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDownload(doc)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Скачать
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
