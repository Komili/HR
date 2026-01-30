"use client";

import {
  Home,
  Users,
  Briefcase,
  FileText,
  Settings,
  Bell,
  Plus,
  Search,
  Sparkles,
  ChevronRight,
  Building2,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/app/contexts/AuthContext";

const menuItems = [
  { name: "Главная", path: "/dashboard", icon: Home, description: "Обзор" },
  { name: "Сотрудники", path: "/employees", icon: Users, description: "Команда" },
  { name: "Отделы", path: "/departments", icon: Building2, description: "Структура" },
  { name: "Должности", path: "/positions", icon: Briefcase, description: "Роли" },
  { name: "Отчёты", path: "/reports", icon: FileText, description: "Аналитика" },
];

const settingsNav = { name: "Настройки", path: "/settings", icon: Settings, description: "Конфиг" };

function NavLink({
  path,
  icon: Icon,
  name,
  description,
}: {
  path: string;
  icon: React.ElementType;
  name: string;
  description?: string;
}) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(path);

  return (
    <Link
      href={path}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
        isActive
          ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-white shadow-lg shadow-emerald-500/10"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all ${
          isActive
            ? "bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/30"
            : "bg-white/10 group-hover:bg-white/20"
        }`}
      >
        <Icon className={`h-[18px] w-[18px] ${isActive ? "text-white" : ""}`} />
      </div>
      <div className="flex flex-col">
        <span>{name}</span>
        {description && (
          <span className="text-[10px] text-white/50 font-normal">{description}</span>
        )}
      </div>
      {isActive && (
        <ChevronRight className="ml-auto h-4 w-4 text-emerald-400" />
      )}
    </Link>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <div className="flex min-h-screen">
        <aside className="hidden lg:flex lg:w-72 lg:flex-col bg-gradient-to-b from-[hsl(155,35%,12%)] via-[hsl(158,32%,10%)] to-[hsl(160,30%,8%)] shadow-2xl shadow-emerald-900/20">
          <div className="flex h-20 items-center gap-3 px-6 border-b border-white/10">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/30">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div className="leading-tight">
              <div className="text-lg font-bold text-white tracking-tight">КАДРЫ</div>
              <div className="text-[11px] text-emerald-400/80 font-medium">Управление персоналом</div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-4 py-6 overflow-y-auto">
            <div className="mb-4 px-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                Меню
              </span>
            </div>
            {menuItems.map((item) => (
              <NavLink key={item.path} {...item} />
            ))}
          </nav>

          <div className="border-t border-white/10 px-4 py-4 space-y-3">
            <NavLink {...settingsNav} />

            {user && (
              <div className="flex items-center gap-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 px-3 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-sm font-bold text-white shadow-lg">
                  {user.email?.charAt(0).toUpperCase() || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{user.email}</div>
                  <div className="text-[11px] text-emerald-400/70">
                    {user.role || "Пользователь"}
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-red-500/20 hover:text-red-400 transition-all"
                  title="Выйти"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-emerald-100/50 shadow-sm">
            <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-2 lg:hidden">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <span className="text-base font-bold">КАДРЫ</span>
              </div>

              <div className="flex-1">
                <div className="relative hidden max-w-md items-center sm:flex">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск..."
                    className="pl-10 h-10 w-72 rounded-xl bg-emerald-50/50 border-emerald-100 focus:bg-white focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button size="sm" className="h-10 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-105">
                  <Plus className="mr-2 h-4 w-4" />
                  Создать
                </Button>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-emerald-50">
                  <Bell className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </header>

          <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
