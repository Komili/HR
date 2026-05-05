"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PhotoCapture from "@/components/photo-capture";

export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function validateToken(token: string) {
  const res = await fetch(`${API_URL}/registration/validate?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Неверный токен");
  }
  return res.json() as Promise<{ valid: boolean; companyId: number; companyName: string }>;
}

async function submitRegistration(formData: FormData) {
  const res = await fetch(`${API_URL}/registration/submit`, { method: "POST", body: formData });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Ошибка отправки");
  }
  return res.json();
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [tokenError, setTokenError] = useState("");

  const [form, setForm] = useState({ firstName: "", lastName: "", patronymic: "", phone: "", email: "", birthDate: "" });
  const PHONE_PREFIX = "+992";
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!token) { setTokenValid(false); setTokenError("Токен не найден. Отсканируйте QR-код заново."); return; }
    validateToken(token)
      .then((data) => { setTokenValid(true); setCompanyName(data.companyName); })
      .catch((err) => { setTokenValid(false); setTokenError(err.message); });
  }, [token]);

  const handlePhotoCapture = useCallback((blob: Blob) => { setPhotoBlob(blob); }, []);

  const canSubmit =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.phone.length === 9 &&
    form.email.trim() &&
    form.birthDate &&
    photoBlob;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setSubmitError("");
    try {
      const fd = new FormData();
      fd.append("token", token);
      fd.append("firstName", form.firstName.trim());
      fd.append("lastName", form.lastName.trim());
      if (form.patronymic) fd.append("patronymic", form.patronymic.trim());
      fd.append("phone", PHONE_PREFIX + form.phone.trim());
      fd.append("email", form.email.trim());
      fd.append("birthDate", form.birthDate);
      if (photoBlob) fd.append("photo", photoBlob, "photo.jpg");
      await submitRegistration(fd);
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || "Ошибка отправки заявки");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-emerald-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Спасибо!</h1>
          <p className="text-gray-600">
            Ваша заявка в компанию <span className="font-semibold text-emerald-700">{companyName}</span> отправлена.
          </p>
          <p className="text-sm text-gray-500">Сотрудник отдела кадров рассмотрит заявку и сообщит о решении.</p>
        </div>
      </div>
    );
  }

  if (tokenValid === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-10 w-10 text-red-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Ошибка</h1>
          <p className="text-gray-600">{tokenError}</p>
        </div>
      </div>
    );
  }

  if (tokenValid === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 py-6 px-4">
      <div className="max-w-sm mx-auto">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Регистрация</h1>
          <p className="text-emerald-700 font-medium mt-1">{companyName}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-xl p-6 space-y-4">
          <div className="space-y-3">
            <div>
              <Label htmlFor="lastName">Фамилия *</Label>
              <Input id="lastName" value={form.lastName} onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))} required placeholder="Ваша фамилия" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="firstName">Имя *</Label>
              <Input id="firstName" value={form.firstName} onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} required placeholder="Ваше имя" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="patronymic">Отчество</Label>
              <Input id="patronymic" value={form.patronymic} onChange={(e) => setForm(f => ({ ...f, patronymic: e.target.value }))} placeholder="Ваше отчество" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="birthDate">Дата рождения *</Label>
              <Input
                id="birthDate"
                type="date"
                value={form.birthDate}
                onChange={(e) => setForm(f => ({ ...f, birthDate: e.target.value }))}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                required
                placeholder="example@mail.com"
                className="mt-1"
                inputMode="email"
              />
            </div>
            <div>
              <Label htmlFor="phone">Телефон *</Label>
              <div className="flex mt-1">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground select-none">
                  +992
                </span>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                    setForm(f => ({ ...f, phone: digits }));
                  }}
                  placeholder="XX XXX XXXX"
                  className="rounded-l-none"
                  inputMode="numeric"
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Фото для пропуска <span className="text-red-500">*</span></Label>
            <PhotoCapture onCapture={handlePhotoCapture} hideUpload={true} />
            {!photoBlob && (
              <p className="text-xs text-red-500">Сфотографируйтесь — фото обязательно</p>
            )}
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{submitError}</div>
          )}

          <Button
            type="submit"
            disabled={submitting || !canSubmit}
            className="w-full h-12 text-base bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 rounded-xl shadow-lg"
          >
            {submitting ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Отправка...</> : "Отправить заявку"}
          </Button>
        </form>
      </div>
    </div>
  );
}
