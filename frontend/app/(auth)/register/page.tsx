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

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    patronymic: "",
    birthDate: "",
    phone: "",
    email: "",
    address: "",
    passportSerial: "",
    passportNumber: "",
    passportIssuedBy: "",
    passportIssueDate: "",
    inn: "",
  });

  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      setTokenError("Токен не найден. Отсканируйте QR-код заново.");
      return;
    }
    validateToken(token)
      .then((data) => {
        setTokenValid(true);
        setCompanyName(data.companyName);
      })
      .catch((err) => {
        setTokenValid(false);
        setTokenError(err.message);
      });
  }, [token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handlePhotoCapture = useCallback((blob: Blob) => {
    setPhotoBlob(blob);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const fd = new FormData();
      fd.append("token", token);
      fd.append("firstName", form.firstName.trim());
      fd.append("lastName", form.lastName.trim());
      if (form.patronymic) fd.append("patronymic", form.patronymic.trim());
      if (form.birthDate) fd.append("birthDate", form.birthDate);
      if (form.phone) fd.append("phone", form.phone.trim());
      if (form.email) fd.append("email", form.email.trim());
      if (form.address) fd.append("address", form.address.trim());
      if (form.passportSerial) fd.append("passportSerial", form.passportSerial.trim());
      if (form.passportNumber) fd.append("passportNumber", form.passportNumber.trim());
      if (form.passportIssuedBy) fd.append("passportIssuedBy", form.passportIssuedBy.trim());
      if (form.passportIssueDate) fd.append("passportIssueDate", form.passportIssueDate);
      if (form.inn) fd.append("inn", form.inn.trim());
      if (photoBlob) fd.append("photo", photoBlob, "photo.jpg");

      await submitRegistration(fd);
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || "Ошибка отправки заявки");
    } finally {
      setSubmitting(false);
    }
  };

  // Экран "Спасибо"
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
            Ваша заявка на регистрацию в компании <span className="font-semibold text-emerald-700">{companyName}</span> успешно отправлена.
          </p>
          <p className="text-sm text-gray-500">
            Сотрудник отдела кадров рассмотрит вашу заявку. Вам сообщат о решении.
          </p>
        </div>
      </div>
    );
  }

  // Токен невалиден
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

  // Загрузка
  if (tokenValid === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 py-6 px-4">
      <div className="max-w-lg mx-auto">
        {/* Шапка */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Регистрация сотрудника</h1>
          <p className="text-emerald-700 font-medium mt-1">{companyName}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-xl p-6 space-y-5">
          {/* ФИО */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Личные данные</h2>
            <div>
              <Label htmlFor="lastName">Фамилия *</Label>
              <Input id="lastName" name="lastName" value={form.lastName} onChange={handleChange} required />
            </div>
            <div>
              <Label htmlFor="firstName">Имя *</Label>
              <Input id="firstName" name="firstName" value={form.firstName} onChange={handleChange} required />
            </div>
            <div>
              <Label htmlFor="patronymic">Отчество</Label>
              <Input id="patronymic" name="patronymic" value={form.patronymic} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="birthDate">Дата рождения</Label>
              <Input id="birthDate" name="birthDate" type="date" value={form.birthDate} onChange={handleChange} />
            </div>
          </div>

          {/* Контакты */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Контакты</h2>
            <div>
              <Label htmlFor="phone">Телефон</Label>
              <Input id="phone" name="phone" type="tel" placeholder="+992 ..." value={form.phone} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" value={form.email} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="address">Адрес</Label>
              <Input id="address" name="address" value={form.address} onChange={handleChange} />
            </div>
          </div>

          {/* Документы */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Документы</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="passportSerial">Серия паспорта</Label>
                <Input id="passportSerial" name="passportSerial" value={form.passportSerial} onChange={handleChange} />
              </div>
              <div>
                <Label htmlFor="passportNumber">Номер паспорта</Label>
                <Input id="passportNumber" name="passportNumber" value={form.passportNumber} onChange={handleChange} />
              </div>
            </div>
            <div>
              <Label htmlFor="passportIssuedBy">Кем выдан</Label>
              <Input id="passportIssuedBy" name="passportIssuedBy" value={form.passportIssuedBy} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="passportIssueDate">Дата выдачи</Label>
              <Input id="passportIssueDate" name="passportIssueDate" type="date" value={form.passportIssueDate} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="inn">ИНН</Label>
              <Input id="inn" name="inn" value={form.inn} onChange={handleChange} />
            </div>
          </div>

          {/* Фото */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Фото для пропуска</h2>
            <PhotoCapture onCapture={handlePhotoCapture} />
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting || !form.firstName.trim() || !form.lastName.trim()}
            className="w-full h-12 text-base bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 rounded-xl shadow-lg"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Отправка...
              </>
            ) : (
              "Отправить заявку"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
