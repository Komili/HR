"use client";

import React, { useState } from "react";
import {
  Home,
  Users,
  Briefcase,
  Settings,
  Bell,
  Plus,
  Search,
  Sparkles,
  ChevronRight,
  Building2,
  LogOut,
  UserPlus,
  ChevronDown,
  Building,
  Check,
  Package,
  Clock,
  Menu,
  X,
  AlertTriangle,
  Banknote,
  Network,
  Shield,
  UserPlus2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/app/contexts/AuthContext";

const menuItems = [
  { name: "Главная", path: "/dashboard", icon: Home, description: "Обзор" },
  { name: "Сотрудники", path: "/employees", icon: Users, description: "Команда" },
  { name: "Отделы", path: "/departments", icon: Building2, description: "Структура" },
  { name: "Должности", path: "/positions", icon: Briefcase, description: "Роли" },
  { name: "Инвентарь", path: "/inventory", icon: Package, description: "Имущество" },
  { name: "Посещаемость", path: "/attendance", icon: Clock, description: "Учёт времени" },
  { name: "Зарплата", path: "/salary", icon: Banknote, description: "Ведомости" },
  { name: "Оргструктура", path: "/org-structure", icon: Network, description: "Иерархия" },
  { name: "Регистрации", path: "/registrations", icon: UserPlus2, description: "Заявки" },
];

const settingsNav = { name: "Настройки", path: "/settings", icon: Settings, description: "Конфиг" };

function NavLink({
  path,
  icon: Icon,
  name,
  description,
  onClick,
}: {
  path: string;
  icon: React.ElementType;
  name: string;
  description?: string;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(path);

  return (
    <Link
      href={path}
      onClick={onClick}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
        isActive
          ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25"
          : "text-gray-600 hover:bg-emerald-50 hover:text-gray-900"
      }`}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all ${
          isActive
            ? "bg-white/20"
            : "bg-emerald-100 group-hover:bg-emerald-200"
        }`}
      >
        <Icon className={`h-[18px] w-[18px] ${isActive ? "text-white" : "text-emerald-600"}`} />
      </div>
      <div className="flex flex-col">
        <span>{name}</span>
        {description && (
          <span className={`text-[10px] font-normal ${isActive ? "text-white/70" : "text-gray-400"}`}>{description}</span>
        )}
      </div>
      {isActive && (
        <ChevronRight className="ml-auto h-4 w-4 text-white/70" />
      )}
    </Link>
  );
}

function CompanySelector() {
  const { isHoldingAdmin, companies, currentCompanyId, currentCompanyName, setCurrentCompany } = useAuth();

  if (!isHoldingAdmin) {
    if (currentCompanyName) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
          <Building className="h-4 w-4 text-emerald-600" />
          <span className="text-sm text-gray-700 truncate max-w-[140px]">{currentCompanyName}</span>
        </div>
      );
    }
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-2 px-3 py-2 h-auto rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 text-gray-700 hover:from-amber-100 hover:to-orange-100 hover:text-gray-900 w-full justify-start"
        >
          <Building className="h-4 w-4 text-amber-600" />
          <span className="text-sm truncate max-w-[140px]">
            {currentCompanyName || "Все компании"}
          </span>
          <ChevronDown className="h-4 w-4 text-amber-600 ml-auto" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-amber-600">
          Выбор компании
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            localStorage.removeItem("currentCompanyId");
            localStorage.removeItem("currentCompanyName");
            window.location.reload();
          }}
          className="cursor-pointer"
        >
          <Building className="mr-2 h-4 w-4" />
          Все компании
          {!currentCompanyId && <Check className="ml-auto h-4 w-4 text-amber-500" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {companies.map((company) => (
          <DropdownMenuItem
            key={company.id}
            onClick={() => {
              setCurrentCompany(company.id, company.shortName || company.name);
              window.location.reload();
            }}
            className="cursor-pointer"
          >
            <Building2 className="mr-2 h-4 w-4" />
            <span className="truncate">{company.shortName || company.name}</span>
            {currentCompanyId === company.id && (
              <Check className="ml-auto h-4 w-4 text-amber-500" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, logout, isHoldingAdmin, currentCompanyId } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const needsCompanySelection = isHoldingAdmin && !currentCompanyId;

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (globalSearch.trim()) {
      router.push(`/employees?search=${encodeURIComponent(globalSearch.trim())}`);
      setGlobalSearch("");
    }
  };

  return (
    <div className="min-h-screen">
      <div className="flex min-h-screen">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:w-72 lg:flex-col bg-white border-r border-gray-200 shadow-sm">
          <div className="flex h-20 items-center gap-3 px-6 border-b border-gray-100">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div className="leading-tight">
              <div className="text-lg font-bold text-gray-900 tracking-tight">КАДРЫ</div>
              <div className={`text-[11px] font-medium ${isHoldingAdmin ? "text-amber-600" : "text-emerald-600"}`}>
                {isHoldingAdmin ? "Холдинг" : "Управление персоналом"}
              </div>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-gray-100">
            <CompanySelector />
          </div>

          <nav className="flex-1 space-y-1 px-4 py-6 overflow-y-auto">
            <div className="mb-4 px-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Меню
              </span>
            </div>
            {menuItems.map((item) => (
              <NavLink key={item.path} {...item} />
            ))}
            {isHoldingAdmin && (
              <>
                <div className="my-3 border-t border-gray-100" />
                <div className="mb-2 px-3">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-500">
                    Администрирование
                  </span>
                </div>
                <NavLink path="/admin" icon={Shield} name="Админ-панель" description="Управление" />
              </>
            )}
          </nav>

          <div className="border-t border-gray-100 px-4 py-4 space-y-3">
            <NavLink {...settingsNav} />

            {user && (
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-200 px-3 py-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white shadow-lg ${
                  isHoldingAdmin
                    ? "bg-gradient-to-br from-amber-400 to-orange-500"
                    : "bg-gradient-to-br from-emerald-400 to-teal-500"
                }`}>
                  {user.email?.charAt(0).toUpperCase() || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{user.email}</div>
                  <div className={`text-[11px] ${isHoldingAdmin ? "text-amber-600" : "text-emerald-600"}`}>
                    {isHoldingAdmin ? "Суперадмин" : user.role || "Пользователь"}
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
                  title="Выйти"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Mobile Sidebar Sheet */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="flex h-16 flex-row items-center gap-3 px-6 border-b border-gray-100">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-lg ${
                isHoldingAdmin
                  ? "bg-gradient-to-br from-amber-500 to-orange-500"
                  : "bg-gradient-to-br from-emerald-500 to-teal-500"
              }`}>
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <SheetTitle className="text-lg font-bold">КАДРЫ</SheetTitle>
            </SheetHeader>

            <div className="px-4 py-3 border-b border-gray-100">
              <CompanySelector />
            </div>

            <nav className="flex-1 space-y-1 px-4 py-4 overflow-y-auto">
              <div className="mb-3 px-3">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  Меню
                </span>
              </div>
              {menuItems.map((item) => (
                <NavLink key={item.path} {...item} onClick={() => setMobileMenuOpen(false)} />
              ))}
              {isHoldingAdmin && (
                <>
                  <div className="my-3 border-t border-gray-100" />
                  <div className="mb-2 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-500">
                      Администрирование
                    </span>
                  </div>
                  <NavLink path="/admin" icon={Shield} name="Админ-панель" description="Управление" onClick={() => setMobileMenuOpen(false)} />
                </>
              )}
              <div className="my-3 border-t border-gray-100" />
              <NavLink {...settingsNav} onClick={() => setMobileMenuOpen(false)} />
            </nav>

            {user && (
              <div className="border-t border-gray-100 px-4 py-4">
                <div className="flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-200 px-3 py-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white shadow-lg ${
                    isHoldingAdmin
                      ? "bg-gradient-to-br from-amber-400 to-orange-500"
                      : "bg-gradient-to-br from-emerald-400 to-teal-500"
                  }`}>
                    {user.email?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{user.email}</div>
                    <div className={`text-[11px] ${isHoldingAdmin ? "text-amber-600" : "text-emerald-600"}`}>
                      {isHoldingAdmin ? "Суперадмин" : user.role || "Пользователь"}
                    </div>
                  </div>
                  <button
                    onClick={() => { setMobileMenuOpen(false); logout(); }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
                    title="Выйти"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-emerald-100/50 shadow-sm">
            <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center gap-3 px-3 sm:px-6 lg:px-8">
              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="flex lg:hidden h-10 w-10 items-center justify-center rounded-xl hover:bg-emerald-50 transition-colors"
              >
                <Menu className="h-5 w-5 text-gray-600" />
              </button>

              <div className="flex items-center gap-2 lg:hidden">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg shadow-md ${
                  isHoldingAdmin
                    ? "bg-gradient-to-br from-amber-500 to-orange-500"
                    : "bg-gradient-to-br from-emerald-500 to-teal-500"
                }`}>
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-bold">КАДРЫ</span>
              </div>

              <div className="flex-1">
                <form onSubmit={handleGlobalSearch} className="relative hidden max-w-md items-center sm:flex">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск сотрудников..."
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                    className="pl-10 h-10 w-72 rounded-xl bg-emerald-50/50 border-emerald-100 focus:bg-white focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                </form>
              </div>

              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className={`h-9 sm:h-10 px-3 sm:px-4 rounded-xl shadow-lg transition-all hover:scale-105 text-xs sm:text-sm ${
                      isHoldingAdmin
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-500/25 hover:shadow-amber-500/40"
                        : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-emerald-500/25 hover:shadow-emerald-500/40"
                    }`}>
                      <Plus className="mr-1 sm:mr-2 h-4 w-4" />
                      <span className="hidden sm:inline">Создать</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Создать</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {needsCompanySelection ? (
                      <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 rounded-md mx-1">
                        <AlertTriangle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                        Сначала выберите компанию в боковой панели
                      </div>
                    ) : (
                      <>
                        <DropdownMenuItem onClick={() => router.push("/employees?action=create")} className="cursor-pointer">
                          <UserPlus className="mr-2 h-4 w-4" />
                          Нового сотрудника
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push("/departments?action=create")} className="cursor-pointer">
                          <Building2 className="mr-2 h-4 w-4" />
                          Новый отдел
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push("/positions?action=create")} className="cursor-pointer">
                          <Briefcase className="mr-2 h-4 w-4" />
                          Новую должность
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push("/inventory?action=create")} className="cursor-pointer">
                          <Package className="mr-2 h-4 w-4" />
                          Новый инвентарь
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl hover:bg-emerald-50">
                  <Bell className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </header>

          <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 sm:gap-8 px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
            {needsCompanySelection && (
              <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3 sm:p-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div className="text-sm text-amber-800">
                  <span className="font-medium">Выберите компанию</span> в боковой панели для создания и редактирования записей. В режиме «Все компании» доступен только просмотр.
                </div>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
