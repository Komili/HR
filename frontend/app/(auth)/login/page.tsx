"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/app/contexts/AuthContext";
import { login } from "@/lib/auth";
import {
  Sparkles,
  Users,
  FileCheck,
  Shield,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = React.useState("hr@example.com");
  const [password, setPassword] = React.useState("password");
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const { login: authLogin } = useAuth();

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { token, user } = await login(email, password);
      authLogin(token, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка при входе.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) {
      handleLogin();
    }
  };

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

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute right-0 top-1/4 h-80 w-80 rounded-full bg-teal-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid w-full max-w-5xl gap-12 lg:grid-cols-[1.2fr_1fr] items-center">
          <div className="hidden lg:flex lg:flex-col lg:justify-center space-y-8">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-100 to-teal-100 px-4 py-2 shadow-sm">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-700">
                  Платформа КАДРЫ
                </span>
              </div>

              <h1 className="text-5xl font-bold tracking-tight leading-tight">
                <span className="text-gradient">Современное</span>{" "}
                <br />
                управление
                <br />
                <span className="text-emerald-600">персоналом</span>
              </h1>

              <p className="text-lg text-muted-foreground max-w-md">
                Оптимизируйте управление персоналом с помощью мощных инструментов
                для работы с данными сотрудников, документами и процессами.
              </p>
            </div>

            <div className="space-y-4">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className="group flex items-start gap-4 rounded-2xl bg-white/60 backdrop-blur-sm p-4 border border-white/50 hover:bg-white/80 hover:shadow-lg transition-all duration-300 animate-rise"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} shadow-lg`}
                  >
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full max-w-md mx-auto lg:mx-0">
            <Card className="relative overflow-hidden border-0 bg-white/80 backdrop-blur-sm shadow-2xl shadow-emerald-500/10">
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 blur-2xl" />
              <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-gradient-to-br from-cyan-500/15 to-blue-500/15 blur-2xl" />

              <CardHeader className="relative space-y-4 pb-6">
                <div className="flex items-center gap-3 lg:hidden">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-xl font-bold">КАДРЫ</span>
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold">Добро пожаловать</CardTitle>
                  <CardDescription className="text-base mt-1">
                    Войдите для доступа к системе управления персоналом
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="relative space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Электронная почта
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@company.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                    className="h-12 rounded-xl bg-white/80 border-emerald-100 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium">
                      Пароль
                    </Label>
                    <button className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                      Забыли пароль?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                    className="h-12 rounded-xl bg-white/80 border-emerald-100 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                </div>

                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    {error}
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Ваши данные защищены корпоративной системой безопасности</span>
                </div>
              </CardContent>

              <CardFooter className="relative flex flex-col gap-4 pt-2">
                <Button
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-[1.02] text-base font-semibold"
                  onClick={handleLogin}
                  disabled={isLoading}
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
                  Нужен доступ?{" "}
                  <span className="text-emerald-600 font-medium">Обратитесь к администратору</span>
                </p>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
