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
import { getEmployees, getDepartments, getPositions, getAttendance } from "@/lib/hrms-api";
import type { Employee, Department, Position, AttendanceSummary } from "@/lib/types";

export default function ReportsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    Promise.all([
      getEmployees(1, 1000, ""),
      getDepartments(),
      getPositions(),
      getAttendance(today).catch(() => []),
    ]).then(([empRes, deps, pos, att]) => {
      setEmployees(empRes.data);
      setDepartments(deps);
      setPositions(pos);
      setTodayAttendance(att);
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
    const headers = ["Сотрудник", "Отдел", "Должность", "Вход", "Выход", "Часы", "Статус"];
    const statusLabels: Record<string, string> = {
      present: "На месте",
      left: "Ушёл",
      absent: "Отсутствует",
      excused: "Уважит.",
    };
    const csvRows = [
      headers.join(";"),
      ...todayAttendance.map(att => {
        const totalH = Math.floor(att.totalMinutes / 60);
        const totalM = att.totalMinutes % 60;
        return [
          att.employeeName,
          att.departmentName || "—",
          att.positionName || "—",
          att.firstEntry ? new Date(att.firstEntry).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—",
          att.lastExit ? new Date(att.lastExit).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—",
          att.totalMinutes > 0 ? `${totalH}ч ${totalM}м` : "—",
          statusLabels[att.status] || att.status,
        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(";");
      })
    ];

    const csvContent = "\uFEFF" + csvRows.join("\n");
    downloadFile(csvContent, `attendance_report_${getDate()}.csv`, "text/csv;charset=utf-8;");
    showSuccess("Сводка посещаемости сформирована");
  };

  const generateMonthlyReport = () => {
    const headers = ["Показатель", "Значение"];
    const presentToday = todayAttendance.filter(a => a.status === "present").length;
    const data = [
      ["Всего сотрудников", employees.length],
      ["Всего отделов", departments.length],
      ["Всего должностей", positions.length],
      ["На месте сегодня", presentToday],
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
    setTimeout(() => generateAttendanceReport(), 1000);
    setTimeout(() => generateMonthlyReport(), 1500);
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

  const presentToday = todayAttendance.filter(a => a.status === "present").length;
  const currentMonth = new Date().toLocaleString("ru-RU", { month: "short" }).replace(".", "");
  const currentMonthCap = currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1);

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
      description: "Рабочие часы и статусы за сегодня",
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
    <div className="space-y-4 sm:space-y-6">
      {successMessage && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-600 px-4 py-3 sm:px-5 sm:py-4 text-white shadow-2xl shadow-emerald-500/30">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-white/20">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <span className="font-medium text-sm sm:text-base">{successMessage}</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/25">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Отчёты</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Генерация и экспорт HR-аналитики
              </p>
            </div>
          </div>
        </div>
        <Button
          className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-105 text-xs sm:text-sm"
          onClick={exportAll}
        >
          <Download className="mr-1 sm:mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Экспортировать всё</span>
          <span className="sm:hidden">Все отчёты</span>
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:gap-4 sm:grid-cols-4">
        <div className="flex items-center gap-2 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-indigo-100">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-bold">{employees.length}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Сотрудников</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-emerald-100">
            <PieChart className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-bold">4</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Типов отчётов</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-amber-100">
            <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-bold">{presentToday}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">На месте сегодня</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-purple-100">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-bold">{currentMonthCap}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Текущий период</div>
          </div>
        </div>
      </div>

      <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
        <CardHeader className="border-b border-emerald-100/50 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
            Доступные отчёты
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
            {reportTypes.map((report) => (
              <div
                key={report.title}
                className={`group relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br ${report.bg} p-4 sm:p-6 border border-white/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer`}
              >
                <div
                  className={`mb-3 sm:mb-4 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br ${report.color} shadow-lg transition-transform group-hover:scale-110`}
                >
                  <report.icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-foreground">{report.title}</h3>
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{report.description}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 sm:mt-4 h-8 sm:h-9 rounded-lg border-white/50 bg-white/50 hover:bg-white text-xs sm:text-sm"
                  onClick={report.action}
                >
                  <Download className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Сформировать
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl sm:rounded-2xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-200/50 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-indigo-100 flex-shrink-0">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm sm:text-base text-indigo-900">Скоро появится</h3>
            <p className="text-xs sm:text-sm text-indigo-700/70">
              Расширенная аналитика и конструктор отчётов находятся в разработке.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
