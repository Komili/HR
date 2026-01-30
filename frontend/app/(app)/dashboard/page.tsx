"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  UserPlus,
  ClipboardCheck,
  Cake,
  Sparkles,
  ArrowUpRight,
  TrendingUp,
  Zap,
  Target,
  CheckCircle2,
} from "lucide-react";
import { getEmployees } from "@/lib/hrms-api";

export default function DashboardPage() {
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEmployees(1, 1, "")
      .then((result) => {
        setError(null);
        setTotalEmployees(result.total);
      })
      .catch((err) => {
        setTotalEmployees(0);
        setError(err instanceof Error ? err.message : "Ошибка загрузки данных");
      });
  }, []);

  const stats = [
    {
      title: "Всего сотрудников",
      value: totalEmployees,
      icon: Users,
      gradient: "from-emerald-500 to-teal-500",
      bgGradient: "from-emerald-500/10 via-teal-500/5 to-transparent",
      iconBg: "bg-gradient-to-br from-emerald-500 to-teal-500",
      shadow: "shadow-emerald-500/20",
      note: "Активные записи",
      trend: "+12%",
      trendUp: true,
    },
    {
      title: "Новые сотрудники",
      value: 0,
      icon: UserPlus,
      gradient: "from-blue-500 to-cyan-500",
      bgGradient: "from-blue-500/10 via-cyan-500/5 to-transparent",
      iconBg: "bg-gradient-to-br from-blue-500 to-cyan-500",
      shadow: "shadow-blue-500/20",
      note: "За последние 30 дней",
      trend: "+5%",
      trendUp: true,
    },
    {
      title: "Адаптация",
      value: 0,
      icon: ClipboardCheck,
      gradient: "from-amber-500 to-orange-500",
      bgGradient: "from-amber-500/10 via-orange-500/5 to-transparent",
      iconBg: "bg-gradient-to-br from-amber-500 to-orange-500",
      shadow: "shadow-amber-500/20",
      note: "В процессе",
      trend: "3 ожидают",
      trendUp: false,
    },
    {
      title: "Дни рождения",
      value: 0,
      icon: Cake,
      gradient: "from-pink-500 to-rose-500",
      bgGradient: "from-pink-500/10 via-rose-500/5 to-transparent",
      iconBg: "bg-gradient-to-br from-pink-500 to-rose-500",
      shadow: "shadow-pink-500/20",
      note: "На этой неделе",
      trend: "Скоро",
      trendUp: true,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-100 to-teal-100 px-4 py-1.5">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              Обзор HR
            </span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">
            <span className="text-gradient">Люди</span>, команды,{" "}
            <span className="text-emerald-600">развитие</span>.
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            Отслеживайте состояние персонала, процесс адаптации и важные события в одном месте.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="h-11 px-5 rounded-xl bg-white/80 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 transition-all"
          >
            Отчёт
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Button>
          <Button className="h-11 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-105">
            <Zap className="mr-2 h-4 w-4" />
            Быстрые действия
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card
            key={stat.title}
            className={`group relative overflow-hidden border-0 bg-white/80 backdrop-blur-sm shadow-xl ${stat.shadow} hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 animate-rise`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-60`} />
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br opacity-20 blur-2xl transition-all duration-500 group-hover:opacity-40 group-hover:scale-150" />
            <CardHeader className="relative flex flex-row items-start justify-between space-y-0 pb-3">
              <div className="space-y-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold tracking-tight">{stat.value}</span>
                  {stat.trendUp && stat.value > 0 && (
                    <span className="flex items-center text-xs font-semibold text-emerald-600">
                      <TrendingUp className="mr-0.5 h-3 w-3" />
                      {stat.trend}
                    </span>
                  )}
                </div>
              </div>
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${stat.iconBg} shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}
              >
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </CardHeader>
            <CardContent className="relative pt-0">
              <p className="text-xs text-muted-foreground">{stat.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-[hsl(155,45%,15%)] via-[hsl(158,40%,12%)] to-[hsl(160,35%,10%)] text-white shadow-2xl shadow-emerald-900/30">
          <div className="absolute inset-0">
            <div className="absolute -left-20 -top-20 h-60 w-60 rounded-full bg-emerald-500/30 blur-3xl" />
            <div className="absolute bottom-0 right-0 h-40 w-40 rounded-full bg-teal-500/20 blur-2xl" />
          </div>
          <CardHeader className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                <Target className="h-4 w-4 text-emerald-400" />
              </div>
              <CardTitle className="text-lg font-bold">Пульс команды</CardTitle>
            </div>
            <p className="text-sm text-white/60">
              Актуальные показатели и области для внимания.
            </p>
          </CardHeader>
          <CardContent className="relative space-y-4">
            <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-white/50 uppercase tracking-wider mb-1">
                    Заполненность профилей
                  </p>
                  <div className="text-4xl font-bold">92%</div>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500">
                  <CheckCircle2 className="h-7 w-7 text-white" />
                </div>
              </div>
              <div className="mt-4 h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-1000"
                  style={{ width: "92%" }}
                />
              </div>
            </div>
            <Button className="w-full h-11 rounded-xl bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-all">
              <Sparkles className="mr-2 h-4 w-4" />
              Открыть аналитику
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-0 bg-white/80 backdrop-blur-sm shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-100 to-orange-100">
                <Zap className="h-4 w-4 text-amber-600" />
              </div>
              <CardTitle className="text-lg font-bold">Фокус на сегодня</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Приоритетные задачи по управлению персоналом.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Завершить адаптацию",
                value: "6 профилей",
                icon: UserPlus,
                color: "from-emerald-500 to-teal-500",
                bg: "from-emerald-50 to-teal-50",
              },
              {
                title: "Согласовать отпуска",
                value: "3 заявки",
                icon: CheckCircle2,
                color: "from-blue-500 to-cyan-500",
                bg: "from-blue-50 to-cyan-50",
              },
              {
                title: "Проверить цели",
                value: "9 встреч",
                icon: Target,
                color: "from-purple-500 to-pink-500",
                bg: "from-purple-50 to-pink-50",
              },
            ].map((item) => (
              <div
                key={item.title}
                className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${item.bg} p-5 border border-white/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer`}
              >
                <div
                  className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${item.color} shadow-lg transition-transform group-hover:scale-110`}
                >
                  <item.icon className="h-5 w-5 text-white" />
                </div>
                <div className="text-base font-semibold text-foreground">{item.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{item.value}</div>
                <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 text-muted-foreground/50 opacity-0 transition-all group-hover:opacity-100" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
