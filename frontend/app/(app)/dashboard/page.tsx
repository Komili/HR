"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  Building2,
  Briefcase,
  Package,
  UserPlus,
  ArrowUpRight,
  Zap,
  Download,
  FileText,
  Clock,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getEmployees, getDepartments, getPositions, getInventoryItems, getAttendance } from "@/lib/hrms-api";
import type { Employee, Department, Position, AttendanceSummary } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [totalDepartments, setTotalDepartments] = useState(0);
  const [totalPositions, setTotalPositions] = useState(0);
  const [totalInventory, setTotalInventory] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Data for reports
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceSummary[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    Promise.all([
      getEmployees(1, 1000, "").then((r) => {
        setTotalEmployees(r.total);
        setEmployees(r.data);
      }),
      getDepartments().then((r) => {
        setTotalDepartments(r.length);
        setDepartments(r);
      }),
      getPositions().then((r) => {
        setTotalPositions(r.length);
        setPositions(r);
      }),
      getInventoryItems(1, 1, "").then((r) => setTotalInventory(r.total)),
      getAttendance(today).then((r) => setTodayAttendance(r)).catch(() => {}),
    ]).catch((err) => {
      setError(err instanceof Error ? err.message : "Ошибка загрузки данных");
    });
  }, []);

  // --- Report generation ---
  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
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

  const generateEmployeeReport = () => {
    const headers = ["ID", "Фамилия", "Имя", "Отчество", "Email", "Телефон", "Отдел", "Должность"];
    const csvRows = [
      headers.join(";"),
      ...employees.map(emp => [
        emp.id, emp.lastName, emp.firstName, emp.patronymic || "",
        emp.email || "", emp.phone || "", emp.department?.name || "", emp.position?.name || ""
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
      ...deptWithCounts.map(dep => [dep.id, dep.name, dep.count]
        .map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
    ];
    const csvContent = "\uFEFF" + csvRows.join("\n");
    downloadFile(csvContent, `departments_report_${getDate()}.csv`, "text/csv;charset=utf-8;");
    showSuccess("Аналитика отделов сформирована");
  };

  const generateAttendanceReport = () => {
    const headers = ["Сотрудник", "Отдел", "Должность", "Вход", "Выход", "Часы", "Статус"];
    const statusLabels: Record<string, string> = {
      present: "На месте", left: "Ушёл", absent: "Отсутствует", excused: "Уважит.",
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

  // --- Data ---
  const stats = [
    {
      title: "Сотрудники",
      value: totalEmployees,
      icon: Users,
      bgGradient: "from-emerald-500/10 via-teal-500/5 to-transparent",
      iconBg: "bg-gradient-to-br from-emerald-500 to-teal-500",
      shadow: "shadow-emerald-500/20",
      href: "/employees",
    },
    {
      title: "Отделы",
      value: totalDepartments,
      icon: Building2,
      bgGradient: "from-blue-500/10 via-cyan-500/5 to-transparent",
      iconBg: "bg-gradient-to-br from-blue-500 to-cyan-500",
      shadow: "shadow-blue-500/20",
      href: "/departments",
    },
    {
      title: "Должности",
      value: totalPositions,
      icon: Briefcase,
      bgGradient: "from-violet-500/10 via-purple-500/5 to-transparent",
      iconBg: "bg-gradient-to-br from-violet-500 to-purple-500",
      shadow: "shadow-violet-500/20",
      href: "/positions",
    },
    {
      title: "Инвентарь",
      value: totalInventory,
      icon: Package,
      bgGradient: "from-amber-500/10 via-orange-500/5 to-transparent",
      iconBg: "bg-gradient-to-br from-amber-500 to-orange-500",
      shadow: "shadow-amber-500/20",
      href: "/inventory",
    },
  ];

  const quickActions = [
    { title: "Добавить сотрудника", icon: UserPlus, color: "from-emerald-500 to-teal-500", bg: "from-emerald-50 to-teal-50", href: "/employees?action=create" },
    { title: "Создать отдел", icon: Building2, color: "from-blue-500 to-cyan-500", bg: "from-blue-50 to-cyan-50", href: "/departments?action=create" },
    { title: "Создать должность", icon: Briefcase, color: "from-violet-500 to-purple-500", bg: "from-violet-50 to-purple-50", href: "/positions?action=create" },
    { title: "Добавить инвентарь", icon: Package, color: "from-amber-500 to-orange-500", bg: "from-amber-50 to-orange-50", href: "/inventory?action=create" },
  ];

  const reportTypes = [
    { title: "Отчёт по сотрудникам", description: "Полный экспорт данных сотрудников", icon: Users, color: "from-emerald-500 to-teal-500", bg: "from-emerald-50 to-teal-50", action: generateEmployeeReport },
    { title: "Аналитика отделов", description: "Распределение команд и структура", icon: Building2, color: "from-blue-500 to-cyan-500", bg: "from-blue-50 to-cyan-50", action: generateDepartmentReport },
    { title: "Сводка посещаемости", description: "Рабочие часы и статусы", icon: Clock, color: "from-purple-500 to-pink-500", bg: "from-purple-50 to-pink-50", action: generateAttendanceReport },
    { title: "Месячный обзор", description: "Комплексная месячная статистика", icon: Calendar, color: "from-amber-500 to-orange-500", bg: "from-amber-50 to-orange-50", action: generateMonthlyReport },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Success toast */}
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

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 sm:gap-6">
        <div className="space-y-1 sm:space-y-2">
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            <span className="text-gradient">Панель</span> управления
          </h1>
          <p className="max-w-xl text-xs sm:text-base text-muted-foreground">
            Общая сводка по системе управления персоналом
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-9 sm:h-11 px-3 sm:px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-105 text-xs sm:text-sm">
                <Zap className="mr-1 sm:mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Быстрые действия</span>
                <span className="sm:hidden">Действия</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Создать</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/employees?action=create")} className="cursor-pointer">
                <UserPlus className="mr-2 h-4 w-4" />
                Добавить сотрудника
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/departments?action=create")} className="cursor-pointer">
                <Building2 className="mr-2 h-4 w-4" />
                Создать отдел
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/positions?action=create")} className="cursor-pointer">
                <Briefcase className="mr-2 h-4 w-4" />
                Создать должность
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/inventory?action=create")} className="cursor-pointer">
                <Package className="mr-2 h-4 w-4" />
                Добавить инвентарь
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 sm:p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 sm:gap-5 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card
            key={stat.title}
            className={`group relative overflow-hidden border-0 bg-white/80 backdrop-blur-sm shadow-xl ${stat.shadow} hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 cursor-pointer animate-rise`}
            style={{ animationDelay: `${index * 100}ms` }}
            onClick={() => router.push(stat.href)}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-60`} />
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br opacity-20 blur-2xl transition-all duration-500 group-hover:opacity-40 group-hover:scale-150" />
            <CardHeader className="relative flex flex-row items-start justify-between space-y-0 pb-2 sm:pb-3 p-3 sm:p-6">
              <div className="space-y-1">
                <CardTitle className="text-[10px] sm:text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <span className="text-2xl sm:text-4xl font-bold tracking-tight">{stat.value}</span>
              </div>
              <div className={`flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl ${stat.iconBg} shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
                <stat.icon className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-100 to-orange-100">
              <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-600" />
            </div>
            <CardTitle className="text-base sm:text-lg font-bold">Быстрые действия</CardTitle>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">Создание новых записей в системе</p>
        </CardHeader>
        <CardContent className="grid gap-3 grid-cols-2 sm:gap-4 lg:grid-cols-4 p-4 pt-0 sm:p-6 sm:pt-0">
          {quickActions.map((item) => (
            <div
              key={item.title}
              onClick={() => router.push(item.href)}
              className={`group relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br ${item.bg} p-3 sm:p-5 border border-white/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer`}
            >
              <div className={`mb-2 sm:mb-3 flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br ${item.color} shadow-lg transition-transform group-hover:scale-110`}>
                <item.icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div className="text-xs sm:text-base font-semibold text-foreground">{item.title}</div>
              <ArrowUpRight className="absolute right-3 top-3 sm:right-4 sm:top-4 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground/50 opacity-0 transition-all group-hover:opacity-100" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Reports */}
      <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100">
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold">Отчёты</CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground">Экспорт HR-аналитики в CSV</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300 text-xs sm:text-sm h-8 sm:h-9 self-start sm:self-auto"
            onClick={exportAll}
          >
            <Download className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Экспортировать всё
          </Button>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="grid gap-3 grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {reportTypes.map((report) => (
              <div
                key={report.title}
                onClick={report.action}
                className={`group relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br ${report.bg} p-3 sm:p-5 border border-white/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer`}
              >
                <div className={`mb-2 sm:mb-3 flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br ${report.color} shadow-lg transition-transform group-hover:scale-110`}>
                  <report.icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div className="text-xs sm:text-sm font-semibold text-foreground">{report.title}</div>
                <div className="mt-1 text-[10px] sm:text-xs text-muted-foreground hidden sm:block">{report.description}</div>
                <Download className="absolute right-3 top-3 sm:right-4 sm:top-4 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground/50 opacity-0 transition-all group-hover:opacity-100" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
