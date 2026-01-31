"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  BarChart3,
  PieChart,
  TrendingUp,
  Download,
  Calendar,
  Users,
  Building2,
  Clock,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEmployees, getDepartments, getPositions } from "@/lib/hrms-api";
import type { Employee, Department, Position } from "@/lib/types";

export default function ReportsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getEmployees(1, 1000, ""),
      getDepartments(),
      getPositions(),
    ]).then(([empRes, deps, pos]) => {
      setEmployees(empRes.data);
      setDepartments(deps);
      setPositions(pos);
    }).catch(() => {});
  }, []);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const generateEmployeeReport = () => {
    const headers = ["ID", "Фамилия", "Имя", "Отчество", "Email", "Телефон", "Отдел", "Должность"];
    const csvRows = [
      headers.join(";"),
      ...employees.map(emp => [
        emp.id,
        emp.lastName,
        emp.firstName,
        emp.patronymic || "",
        emp.email || "",
        emp.phone || "",
        emp.department?.name || "",
        emp.position?.name || ""
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
    ];

    const csvContent = "\uFEFF" + csvRows.join("\n");
    downloadFile(csvContent, `employees_report_${getDate()}.csv`, "text/csv;charset=utf-8;");
    showSuccess("Отчёт по сотрудникам сформирован");
  };

  const generateDepartmentReport = () => {
    const headers = ["ID", "Название отдела", "Кол-во сотрудников"];
    const deptWithCounts = departments.map(dep => ({
      ...dep,
      count: employees.filter(e => e.departmentId === dep.id).length
    }));

    const csvRows = [
      headers.join(";"),
      ...deptWithCounts.map(dep => [
        dep.id,
        dep.name,
        dep.count
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
    ];

    const csvContent = "\uFEFF" + csvRows.join("\n");
    downloadFile(csvContent, `departments_report_${getDate()}.csv`, "text/csv;charset=utf-8;");
    showSuccess("Аналитика отделов сформирована");
  };

  const generateAttendanceReport = () => {
    // Заглушка - отчёт посещаемости
    const headers = ["Сотрудник", "Отдел", "Статус"];
    const csvRows = [
      headers.join(";"),
      ...employees.map(emp => [
        `${emp.lastName} ${emp.firstName}`,
        emp.department?.name || "Не указан",
        "Активен"
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
    ];

    const csvContent = "\uFEFF" + csvRows.join("\n");
    downloadFile(csvContent, `attendance_report_${getDate()}.csv`, "text/csv;charset=utf-8;");
    showSuccess("Сводка посещаемости сформирована");
  };

  const generateMonthlyReport = () => {
    const headers = ["Показатель", "Значение"];
    const data = [
      ["Всего сотрудников", employees.length],
      ["Всего отделов", departments.length],
      ["Всего должностей", positions.length],
      ["Дата отчёта", new Date().toLocaleDateString("ru-RU")],
    ];

    const csvRows = [
      headers.join(";"),
      ...data.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
    ];

    const csvContent = "\uFEFF" + csvRows.join("\n");
    downloadFile(csvContent, `monthly_report_${getDate()}.csv`, "text/csv;charset=utf-8;");
    showSuccess("Месячный обзор сформирован");
  };

  const exportAll = () => {
    generateEmployeeReport();
    setTimeout(() => generateDepartmentReport(), 500);
    setTimeout(() => generateMonthlyReport(), 1000);
  };

  const getDate = () => new Date().toISOString().split("T")[0];

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  const reportTypes = [
    {
      title: "Отчёт по сотрудникам",
      description: "Полный экспорт данных сотрудников",
      icon: Users,
      color: "from-emerald-500 to-teal-500",
      bg: "from-emerald-50 to-teal-50",
      action: generateEmployeeReport,
    },
    {
      title: "Аналитика отделов",
      description: "Распределение команд и структура",
      icon: Building2,
      color: "from-blue-500 to-cyan-500",
      bg: "from-blue-50 to-cyan-50",
      action: generateDepartmentReport,
    },
    {
      title: "Сводка посещаемости",
      description: "Рабочие часы и отпуска",
      icon: Clock,
      color: "from-purple-500 to-pink-500",
      bg: "from-purple-50 to-pink-50",
      action: generateAttendanceReport,
    },
    {
      title: "Месячный обзор",
      description: "Комплексная месячная статистика",
      icon: Calendar,
      color: "from-amber-500 to-orange-500",
      bg: "from-amber-50 to-orange-50",
      action: generateMonthlyReport,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Уведомление об успешном создании отчёта */}
      {successMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-600 px-5 py-4 text-white shadow-2xl shadow-emerald-500/30">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <span className="font-medium">{successMessage}</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/25">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Отчёты</h1>
              <p className="text-sm text-muted-foreground">
                Генерация и экспорт комплексной HR-аналитики
              </p>
            </div>
          </div>
        </div>
        <Button
          className="h-10 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-105"
          onClick={exportAll}
        >
          <Download className="mr-2 h-4 w-4" />
          Экспортировать всё
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="flex items-center gap-4 rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <div className="text-2xl font-bold">12</div>
            <div className="text-xs text-muted-foreground">Отчётов создано</div>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
            <PieChart className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-2xl font-bold">4</div>
            <div className="text-xs text-muted-foreground">Типов отчётов</div>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
            <TrendingUp className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <div className="text-2xl font-bold">+15%</div>
            <div className="text-xs text-muted-foreground">За этот месяц</div>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100">
            <Calendar className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <div className="text-2xl font-bold">Янв</div>
            <div className="text-xs text-muted-foreground">Текущий период</div>
          </div>
        </div>
      </div>

      <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
        <CardHeader className="border-b border-emerald-100/50 bg-gradient-to-r from-indigo-50/50 to-purple-50/50">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            Доступные отчёты
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid gap-4 md:grid-cols-2">
            {reportTypes.map((report) => (
              <div
                key={report.title}
                className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${report.bg} p-6 border border-white/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer`}
              >
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${report.color} shadow-lg transition-transform group-hover:scale-110`}
                >
                  <report.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{report.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{report.description}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 h-9 rounded-lg border-white/50 bg-white/50 hover:bg-white"
                  onClick={report.action}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Сформировать
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-2xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-200/50 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
            <Sparkles className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-indigo-900">Скоро появится</h3>
            <p className="text-sm text-indigo-700/70">
              Расширенная аналитика и конструктор отчётов находятся в разработке.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
