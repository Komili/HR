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
  Cake,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import * as XLSX from "xlsx";
import { getEmployees, getDepartments, getPositions, getInventoryItems, getAttendance } from "@/lib/hrms-api";
import type { Employee, Department, Position, AttendanceSummary } from "@/lib/types";

const ATT_STATUS_LABELS: Record<string, string> = {
  present: "На месте",
  left: "Ушёл",
  absent: "Отсутствует",
  excused: "Уважит.",
};

const ATT_STATUS_STYLES: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700 border-emerald-200",
  left: "bg-red-100 text-red-700 border-red-200",
  absent: "bg-gray-100 text-gray-600 border-gray-200",
  excused: "bg-amber-100 text-amber-700 border-amber-200",
};

function formatAttTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatAttHours(minutes: number) {
  if (!minutes || minutes <= 0) return "—";
  return `${Math.floor(minutes / 60)}ч ${minutes % 60}м`;
}

// Цвет строки по статусу: зелёный — на месте, красный — ушёл, жёлтый — отпросился, серый — не пришёл
const ATT_ROW_BG: Record<string, string> = {
  present: "bg-emerald-100 hover:bg-emerald-200",
  left: "bg-red-100 hover:bg-red-200",
  excused: "bg-amber-100 hover:bg-amber-200",
  absent: "bg-slate-100 hover:bg-slate-200",
};

type Birthday = { employee: Employee; date: Date; daysUntil: number; age: number | null };

// Ближайшие дни рождения в пределах N дней (включая сегодня), отсортированные
function getUpcomingBirthdays(employees: Employee[], withinDays = 30): Birthday[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result: Birthday[] = [];
  for (const emp of employees) {
    if (!emp.birthDate) continue;
    const bd = new Date(emp.birthDate);
    if (isNaN(bd.getTime())) continue;
    let next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
    next.setHours(0, 0, 0, 0);
    if (next < today) next = new Date(today.getFullYear() + 1, bd.getMonth(), bd.getDate());
    const daysUntil = Math.round((next.getTime() - today.getTime()) / 86400000);
    if (daysUntil <= withinDays) {
      const age = next.getFullYear() - bd.getFullYear();
      result.push({ employee: emp, date: next, daysUntil, age: isNaN(age) ? null : age });
    }
  }
  result.sort((a, b) => a.daysUntil - b.daysUntil);
  return result;
}

function birthdayWhenLabel(daysUntil: number): string {
  if (daysUntil === 0) return "Сегодня 🎉";
  if (daysUntil === 1) return "Завтра";
  return `через ${daysUntil} дн.`;
}

function initials(emp: Employee): string {
  return `${emp.firstName?.charAt(0) || ""}${emp.lastName?.charAt(0) || ""}`.toUpperCase();
}

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

  const writeXlsx = (wsData: (string | number)[][], filename: string, sheetName: string, cols?: { wch: number }[]) => {
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    if (cols) ws["!cols"] = cols;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  };

  const generateEmployeeReport = () => {
    const headers = ["ID", "Фамилия", "Имя", "Отчество", "Email", "Телефон", "Отдел", "Должность"];
    const rows = employees.map(emp => [
      emp.id, emp.lastName, emp.firstName, emp.patronymic || "",
      emp.email || "", emp.phone || "", emp.department?.name || "", emp.position?.name || ""
    ]);
    writeXlsx([headers, ...rows], `Сотрудники_${getDate()}.xlsx`, "Сотрудники", [
      { wch: 5 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 25 }, { wch: 16 }, { wch: 22 }, { wch: 22 },
    ]);
    showSuccess("Отчёт по сотрудникам сформирован");
  };

  const generateDepartmentReport = () => {
    const headers = ["ID", "Название отдела", "Кол-во сотрудников"];
    const rows = departments.map(dep => [
      dep.id, dep.name, employees.filter(e => e.departmentId === dep.id).length
    ]);
    writeXlsx([headers, ...rows], `Отделы_${getDate()}.xlsx`, "Отделы", [
      { wch: 5 }, { wch: 30 }, { wch: 20 },
    ]);
    showSuccess("Аналитика отделов сформирована");
  };

  const generateAttendanceReport = () => {
    const headers = ["Сотрудник", "Отдел", "Должность", "Вход", "Выход", "Часы", "Статус"];
    const statusLabels: Record<string, string> = {
      present: "На месте", left: "Ушёл", absent: "Отсутствует", excused: "Уважит.",
    };
    const rows = todayAttendance.map(att => {
      const h = Math.floor(att.totalMinutes / 60), m = att.totalMinutes % 60;
      return [
        att.employeeName, att.departmentName || "—", att.positionName || "—",
        att.firstEntry ? new Date(att.firstEntry).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—",
        att.lastExit ? new Date(att.lastExit).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—",
        att.totalMinutes > 0 ? `${h}ч ${m}м` : "—", statusLabels[att.status] || att.status,
      ];
    });
    writeXlsx([headers, ...rows], `Посещаемость_${getDate()}.xlsx`, "Посещаемость", [
      { wch: 30 }, { wch: 20 }, { wch: 22 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 14 },
    ]);
    showSuccess("Сводка посещаемости сформирована");
  };

  const generateMonthlyReport = () => {
    const presentCount = todayAttendance.filter(a => a.status === "present").length;
    const rows: (string | number)[][] = [
      ["Показатель", "Значение"],
      ["Всего сотрудников", employees.length],
      ["Всего отделов", departments.length],
      ["Всего должностей", positions.length],
      ["На месте сегодня", presentCount],
      ["Дата отчёта", new Date().toLocaleDateString("ru-RU")],
    ];
    writeXlsx(rows, `Месячный_обзор_${getDate()}.xlsx`, "Обзор", [
      { wch: 25 }, { wch: 20 },
    ]);
    showSuccess("Месячный обзор сформирован");
  };

  const exportAll = () => {
    const wb = XLSX.utils.book_new();

    const empH = ["ID", "Фамилия", "Имя", "Отчество", "Email", "Телефон", "Отдел", "Должность"];
    const empR = employees.map(emp => [emp.id, emp.lastName, emp.firstName, emp.patronymic || "", emp.email || "", emp.phone || "", emp.department?.name || "", emp.position?.name || ""]);
    const ws1 = XLSX.utils.aoa_to_sheet([empH, ...empR]);
    ws1["!cols"] = [{ wch: 5 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 25 }, { wch: 16 }, { wch: 22 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Сотрудники");

    const depH = ["ID", "Название отдела", "Кол-во сотрудников"];
    const depR = departments.map(dep => [dep.id, dep.name, employees.filter(e => e.departmentId === dep.id).length]);
    const ws2 = XLSX.utils.aoa_to_sheet([depH, ...depR]);
    ws2["!cols"] = [{ wch: 5 }, { wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Отделы");

    const presentCount = todayAttendance.filter(a => a.status === "present").length;
    const overviewData = [["Показатель", "Значение"], ["Всего сотрудников", employees.length], ["Всего отделов", departments.length], ["Всего должностей", positions.length], ["На месте сегодня", presentCount], ["Дата отчёта", new Date().toLocaleDateString("ru-RU")]];
    const ws3 = XLSX.utils.aoa_to_sheet(overviewData);
    ws3["!cols"] = [{ wch: 25 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Обзор");

    XLSX.writeFile(wb, `HR_Отчёты_${getDate()}.xlsx`);
    showSuccess("Все отчёты экспортированы");
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

  const reportTypes = [
    { title: "Отчёт по сотрудникам", description: "Полный экспорт данных сотрудников", icon: Users, color: "from-emerald-500 to-teal-500", bg: "from-emerald-50 to-teal-50", action: generateEmployeeReport },
    { title: "Аналитика отделов", description: "Распределение команд и структура", icon: Building2, color: "from-blue-500 to-cyan-500", bg: "from-blue-50 to-cyan-50", action: generateDepartmentReport },
    { title: "Сводка посещаемости", description: "Рабочие часы и статусы", icon: Clock, color: "from-purple-500 to-pink-500", bg: "from-purple-50 to-pink-50", action: generateAttendanceReport },
    { title: "Месячный обзор", description: "Комплексная месячная статистика", icon: Calendar, color: "from-amber-500 to-orange-500", bg: "from-amber-50 to-orange-50", action: generateMonthlyReport },
  ];

  const upcomingBirthdays = getUpcomingBirthdays(employees, 30);

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

      {/* Посещаемость сегодня */}
      <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100">
              <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold">Посещаемость сегодня</CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 text-xs sm:text-sm h-8 sm:h-9 self-start sm:self-auto"
            onClick={() => router.push("/attendance")}
          >
            Открыть полную посещаемость
            <ArrowUpRight className="ml-1 sm:ml-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {todayAttendance.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
              <Clock className="h-10 w-10 text-gray-300" />
              <span className="text-sm">Нет данных за сегодня</span>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-blue-100/50">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100/50">
                    <th className="text-blue-700 text-xs sm:text-sm font-semibold uppercase tracking-wider py-3 px-3 sm:px-4 text-left">ФИО</th>
                    <th className="text-blue-700 text-xs sm:text-sm font-semibold uppercase tracking-wider py-3 px-3 sm:px-4 text-left hidden sm:table-cell">Вход</th>
                    <th className="text-blue-700 text-xs sm:text-sm font-semibold uppercase tracking-wider py-3 px-3 sm:px-4 text-left hidden sm:table-cell">Выход</th>
                    <th className="text-blue-700 text-xs sm:text-sm font-semibold uppercase tracking-wider py-3 px-3 sm:px-4 text-left hidden sm:table-cell">Часы</th>
                    <th className="text-blue-700 text-xs sm:text-sm font-semibold uppercase tracking-wider py-3 px-3 sm:px-4 text-left">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {todayAttendance.map((row) => (
                    <tr key={row.id} className={`border-b border-white/60 last:border-0 transition-colors ${ATT_ROW_BG[row.status] || "hover:bg-blue-50/40"}`}>
                      <td className="py-2.5 px-3 sm:px-4">
                        <a
                          href={`/employees/${row.employeeId}`}
                          className="font-medium text-sm sm:text-base text-foreground hover:text-blue-600 hover:underline transition-colors"
                        >
                          {row.employeeName}
                        </a>
                        {/* Время под именем — только на телефоне */}
                        <div className="sm:hidden mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>Вход: <span className="font-medium text-foreground">{formatAttTime(row.firstEntry)}</span></span>
                          <span>Выход: <span className="font-medium text-foreground">{formatAttTime(row.lastExit)}</span></span>
                          {row.isLate && row.firstEntry && (
                            <span className="font-semibold text-orange-600">Опоздал</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 sm:px-4 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm sm:text-base font-medium">{formatAttTime(row.firstEntry)}</span>
                          {row.isLate && row.firstEntry && (
                            <span className="inline-flex items-center rounded-full bg-orange-100 border border-orange-200 px-1.5 py-0.5 text-xs font-medium text-orange-700">Опоздал</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 sm:px-4 text-sm sm:text-base font-medium hidden sm:table-cell">{formatAttTime(row.lastExit)}</td>
                      <td className="py-2.5 px-3 sm:px-4 text-sm sm:text-base font-medium hidden sm:table-cell">{formatAttHours(row.totalMinutes)}</td>
                      <td className="py-2.5 px-3 sm:px-4">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs sm:text-sm font-medium ${ATT_STATUS_STYLES[row.status] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                          {ATT_STATUS_LABELS[row.status] || row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* Дни рождения */}
      <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink-100 to-rose-100">
              <Cake className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-600" />
            </div>
            <CardTitle className="text-base sm:text-lg font-bold">Дни рождения</CardTitle>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">Ближайшие 30 дней</p>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {upcomingBirthdays.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <Cake className="h-10 w-10 text-gray-300" />
              <span className="text-sm">Нет дней рождения в ближайшие 30 дней</span>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingBirthdays.map((b) => {
                const isToday = b.daysUntil === 0;
                return (
                  <div
                    key={b.employee.id}
                    onClick={() => router.push(`/employees/${b.employee.id}`)}
                    className={`group flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${isToday ? "border-pink-300 bg-gradient-to-br from-pink-50 to-rose-50 ring-1 ring-pink-200" : "border-gray-200 bg-white hover:border-pink-200"}`}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white bg-gradient-to-br ${isToday ? "from-pink-500 to-rose-500" : "from-violet-400 to-purple-400"}`}>
                      {initials(b.employee)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-foreground truncate">{b.employee.lastName} {b.employee.firstName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {b.employee.position?.name || "—"}{b.age ? ` · ${b.age} лет` : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-foreground capitalize">
                        {b.date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
                      </div>
                      <div className={`text-xs ${isToday ? "text-pink-600 font-semibold" : "text-muted-foreground"}`}>
                        {birthdayWhenLabel(b.daysUntil)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
              <p className="text-xs sm:text-sm text-muted-foreground">Экспорт HR-аналитики в Excel</p>
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
