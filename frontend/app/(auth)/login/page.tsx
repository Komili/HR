"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/app/contexts/AuthContext";
import { login } from "@/lib/auth";
import { Sparkles, Users, FileCheck, Shield, ArrowRight, Lock, Mail, Eye, EyeOff } from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Управление персоналом",
    description: "Централизованные профили сотрудников и структура организации",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: FileCheck,
    title: "Хранилище документов",
    description: "Безопасное хранение с разграничением доступа",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Shield,
    title: "Корпоративная безопасность",
    description: "Защита данных с журналированием действий",
    color: "from-purple-500 to-pink-500",
  },
];

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const { login: authLogin } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError("Введите электронную почту"); return; }
    if (!password) { setError("Введите пароль"); return; }
    setIsLoading(true);
    setError(null);
    try {
      const { token, user } = await login(email.trim(), password);
      authLogin(token, user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("unauthorized") || msg.includes("Неверный email")) {
        setError("Неверный email или пароль");
      } else if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
        setError("Не удалось подключиться к серверу. Проверьте соединение.");
      } else {
        setError(msg || "Произошла ошибка при входе");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/20">
      {/* Background blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute right-0 top-1/4 h-80 w-80 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid w-full max-w-5xl gap-12 lg:grid-cols-[1.2fr_1fr] items-center">

          {/* Left side — branding */}
          <div className="hidden lg:flex lg:flex-col lg:justify-center space-y-8">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-100 to-teal-100 px-4 py-2 shadow-sm border border-emerald-200/50">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-700">Платформа КАДРЫ</span>
              </div>

              <h1 className="text-5xl font-bold tracking-tight leading-tight">
                Современное
                <br />
                управление
                <br />
                <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                  персоналом
                </span>
              </h1>

              <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
                Оптимизируйте управление персоналом с помощью мощных инструментов
                для работы с данными сотрудников, документами и процессами.
              </p>
            </div>

            <div className="space-y-3">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className="group flex items-start gap-4 rounded-2xl bg-white/60 backdrop-blur-sm p-4 border border-white/60 hover:bg-white/90 hover:shadow-md transition-all duration-200"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} shadow-md`}>
                    <feature.icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground">{feature.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right side — login form */}
          <div className="w-full max-w-md mx-auto lg:mx-0">
            <Card className="relative overflow-hidden border-0 bg-white/90 backdrop-blur-sm shadow-2xl shadow-emerald-500/10">
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-emerald-500/15 to-teal-500/15 blur-2xl" />
              <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-gradient-to-br from-cyan-500/10 to-blue-500/10 blur-2xl" />

              <CardHeader className="relative space-y-4 pb-4">
                {/* Mobile logo */}
                <div className="flex items-center gap-3 lg:hidden">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-xl font-bold tracking-tight">КАДРЫ</span>
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold">Добро пожаловать</CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Войдите в систему управления персоналом
                  </CardDescription>
                </div>
              </CardHeader>

              <form onSubmit={handleLogin} autoComplete="on">
              <CardContent className="relative space-y-4">
                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Электронная почта
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="user@company.tj"
                      required
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(null); }}
                      disabled={isLoading}
                      autoComplete="email"
                      autoFocus
                      className="pl-10 h-11 rounded-xl bg-white border-gray-200 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Пароль
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Введите пароль"
                      required
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(null); }}
                      disabled={isLoading}
                      autoComplete="current-password"
                      className="pl-10 pr-10 h-11 rounded-xl bg-white border-gray-200 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                    {error}
                  </div>
                )}
              </CardContent>

              <CardFooter className="relative flex flex-col gap-3 pt-2">
                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-[1.01] text-sm font-semibold"
                  disabled={isLoading || !email || !password}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Вход...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Войти
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Нет доступа?{" "}
                  <span className="text-emerald-600 font-medium">Обратитесь к администратору</span>
                </p>
              </CardFooter>
              </form>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
