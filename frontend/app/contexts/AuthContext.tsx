"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { jwtDecode } from "jwt-decode";
import type { AuthUser, Company } from "@/lib/types";

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isLoading: boolean;
  // Мультитенантность
  currentCompanyId: number | null;
  currentCompanyName: string | null;
  setCurrentCompany: (companyId: number, companyName: string) => void;
  companies: Company[];
  loadCompanies: () => Promise<void>;
  isHoldingAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function decodeUser(token: string): AuthUser | null {
  try {
    const decoded = jwtDecode<AuthUser>(token);
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentCompanyId, setCurrentCompanyId] = useState<number | null>(null);
  const [currentCompanyName, setCurrentCompanyName] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const router = useRouter();

  const loadCompanies = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch("/api/companies", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setCompanies(data);
      }
    } catch (error) {
      console.error("Failed to load companies:", error);
    }
  }, [token]);

  useEffect(() => {
    try {
      const storedToken = localStorage.getItem("authToken");
      const storedCompanyId = localStorage.getItem("currentCompanyId");
      const storedCompanyName = localStorage.getItem("currentCompanyName");

      if (storedToken) {
        const decoded = decodeUser(storedToken);
        if (decoded) {
          setToken(storedToken);
          setUser(decoded);

          // Устанавливаем текущую компанию
          if (decoded.isHoldingAdmin && storedCompanyId) {
            // Суперадмин - восстанавливаем выбранную компанию
            setCurrentCompanyId(parseInt(storedCompanyId, 10));
            setCurrentCompanyName(storedCompanyName || null);
          } else if (decoded.companyId) {
            // Обычный пользователь - его компания
            setCurrentCompanyId(decoded.companyId);
            setCurrentCompanyName(decoded.companyName);
          }
        } else {
          localStorage.removeItem("authToken");
          localStorage.removeItem("currentCompanyId");
          localStorage.removeItem("currentCompanyName");
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Загружаем компании при наличии токена
  useEffect(() => {
    if (token && user?.isHoldingAdmin) {
      loadCompanies();
    }
  }, [token, user?.isHoldingAdmin, loadCompanies]);

  const login = (newToken: string, userData: AuthUser) => {
    localStorage.setItem("authToken", newToken);
    setToken(newToken);
    setUser(userData);

    // Устанавливаем текущую компанию
    if (userData.companyId) {
      setCurrentCompanyId(userData.companyId);
      setCurrentCompanyName(userData.companyName);
      localStorage.setItem("currentCompanyId", userData.companyId.toString());
      localStorage.setItem("currentCompanyName", userData.companyName || "");
    } else if (userData.isHoldingAdmin) {
      // Суперадмин - изначально без выбранной компании (видит все)
      setCurrentCompanyId(null);
      setCurrentCompanyName(null);
    }

    router.push("/dashboard");
  };

  const logout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("currentCompanyId");
    localStorage.removeItem("currentCompanyName");
    setToken(null);
    setUser(null);
    setCurrentCompanyId(null);
    setCurrentCompanyName(null);
    setCompanies([]);
    router.push("/login");
  };

  const setCurrentCompany = (companyId: number, companyName: string) => {
    setCurrentCompanyId(companyId);
    setCurrentCompanyName(companyName);
    localStorage.setItem("currentCompanyId", companyId.toString());
    localStorage.setItem("currentCompanyName", companyName);
  };

  const value = {
    user,
    token,
    login,
    logout,
    isLoading,
    currentCompanyId,
    currentCompanyName,
    setCurrentCompany,
    companies,
    loadCompanies,
    isHoldingAdmin: user?.isHoldingAdmin || false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
