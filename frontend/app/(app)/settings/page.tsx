import {
  Settings,
  User,
  Bell,
  Shield,
  Palette,
  Globe,
  Database,
  Key,
  Mail,
  Smartphone,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const settingsSections = [
    {
      title: "Профиль",
      description: "Управление личной информацией",
      icon: User,
      color: "from-emerald-500 to-teal-500",
      bg: "bg-emerald-100",
      iconColor: "text-emerald-600",
    },
    {
      title: "Уведомления",
      description: "Настройка оповещений и сообщений",
      icon: Bell,
      color: "from-blue-500 to-cyan-500",
      bg: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      title: "Безопасность",
      description: "Пароль и аутентификация",
      icon: Shield,
      color: "from-purple-500 to-pink-500",
      bg: "bg-purple-100",
      iconColor: "text-purple-600",
    },
    {
      title: "Внешний вид",
      description: "Тема и настройки отображения",
      icon: Palette,
      color: "from-amber-500 to-orange-500",
      bg: "bg-amber-100",
      iconColor: "text-amber-600",
    },
    {
      title: "Язык",
      description: "Региональные и языковые настройки",
      icon: Globe,
      color: "from-cyan-500 to-blue-500",
      bg: "bg-cyan-100",
      iconColor: "text-cyan-600",
    },
    {
      title: "Данные и хранение",
      description: "Управление данными и экспортом",
      icon: Database,
      color: "from-rose-500 to-pink-500",
      bg: "bg-rose-100",
      iconColor: "text-rose-600",
    },
  ];

  const quickActions = [
    { label: "Сменить пароль", icon: Key },
    { label: "Настройки почты", icon: Mail },
    { label: "Мобильное приложение", icon: Smartphone },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 shadow-lg shadow-slate-500/25">
              <Settings className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Настройки</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Управление аккаунтом и системными параметрами
              </p>
            </div>
          </div>
        </div>
        <Button className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-105 text-xs sm:text-sm">
          <Sparkles className="mr-1 sm:mr-2 h-4 w-4" />
          Сохранить изменения
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-1 sm:gap-4 sm:grid-cols-3">
        {quickActions.map((action) => (
          <button
            key={action.label}
            className="group flex items-center gap-3 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm hover:shadow-md hover:bg-emerald-50/50 transition-all text-left"
          >
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-emerald-100 group-hover:bg-emerald-200 transition-colors">
              <action.icon className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
            </div>
            <span className="font-medium text-sm sm:text-base">{action.label}</span>
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-emerald-600 transition-colors" />
          </button>
        ))}
      </div>

      <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
        <CardHeader className="border-b border-emerald-100/50 bg-gradient-to-r from-slate-50/50 to-gray-50/50 p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Settings className="h-4 w-4 sm:h-5 sm:w-5 text-slate-600" />
            Системные настройки
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {settingsSections.map((section) => (
              <button
                key={section.title}
                className="group flex items-center gap-3 sm:gap-4 rounded-xl border border-emerald-100/50 bg-gradient-to-r from-white to-emerald-50/30 p-3 sm:p-4 hover:shadow-md transition-all text-left"
              >
                <div className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg sm:rounded-xl ${section.bg} transition-transform group-hover:scale-110`}>
                  <section.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${section.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm sm:text-base text-foreground">{section.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">{section.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground/50 group-hover:text-emerald-500 transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-200/50 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-amber-100 flex-shrink-0">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm sm:text-base text-amber-900">Настройки скоро появятся</h3>
            <p className="text-xs sm:text-sm text-amber-700/70">
              Полный функционал настроек находится в разработке.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
