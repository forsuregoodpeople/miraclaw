"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { User } from "@/lib/api/users";
import AuthApi from "@/lib/api/users";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: User | null;
  sessionId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    setIsLoading(true);
    try {
      const result = await AuthApi.getProfileWithSession();
      setUser(result?.user ?? null);
      setSessionId(result?.session_id ?? null);
    } catch (error) {
      setUser(null);
      setSessionId(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshAuth = async () => {
    try {
      const result = await AuthApi.getProfileWithSession();
      setUser(result?.user ?? null);
      setSessionId(result?.session_id ?? null);
    } catch (error) {
      setUser(null);
      setSessionId(null);
      throw error;
    }
  };

  const login = async (identifier: string, password: string) => {
    const result = await AuthApi.loginWithSession({ username: identifier, password });
    if (result.user.role === "teknisi" || result.user.role === "admin") {
      await AuthApi.logout().catch(() => {});
      throw new Error("Akun teknisi dan admin tidak diizinkan login melalui web.");
    }
    setUser(result.user);
    setSessionId(result.session_id ?? null);
  };

  const logout = async () => {
    try {
      await AuthApi.logout();
    } catch (error) {
      console.warn("Logout error:", error);
    } finally {
      setUser(null);
      setSessionId(null);
      router.push("/auth");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        sessionId,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        checkAuth,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}