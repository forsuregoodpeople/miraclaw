import axios from "axios";
import { api } from "../axios";
import { CookieManager } from "../utils/cookies";

export interface User {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  parent_id?: number;
  created_at?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponseData {
  user: User;
  session_id: string;
}

export interface LoginResponse {
  status_code: number;
  message: string;
  data?: AuthResponseData;
}

export interface ProfileResponse {
  status_code: number;
  message: string;
  data?: AuthResponseData;
}

const handleError = (error: unknown, defaultMessage: string): never => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) throw new Error("Username/Email atau password salah");
    if (status === 422) throw new Error("Data tidak valid");
  }
  throw new Error(defaultMessage);
};

export const AuthApi = {
  login: async (credentials: LoginRequest): Promise<User> => {
    const result = await AuthApi.loginWithSession(credentials);
    return result.user;
  },

  loginWithSession: async (credentials: LoginRequest): Promise<AuthResponseData> => {
    const response = await api.post<LoginResponse>("/v1/login", credentials);
    const loginData = response.data.data;
    if (!loginData || !loginData.user) throw new Error("Invalid response from server");
    return loginData;
  },

  logout: async (): Promise<void> => {
    try {
      await api.post("/v1/logout");
    } catch {
      // ignore logout errors — session is cleared regardless
    } finally {
      if (typeof window !== "undefined") {
        CookieManager.clearSessionId();
      }
    }
  },

  getProfile: async (): Promise<User | null> => {
    const result = await AuthApi.getProfileWithSession();
    return result?.user ?? null;
  },

  getProfileWithSession: async (): Promise<AuthResponseData | null> => {
    try {
      const response = await api.get<ProfileResponse>("/v1/profile");
      const authData = response.data.data;
      if (!authData || !authData.user) return null;
      return authData;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        return null;
      }
      throw error;
    }
  },

  refreshSessionIfNeeded: async (): Promise<User | null> => {
    return AuthApi.getProfile();
  },

  updateProfile: async (data: { name: string }): Promise<void> => {
    const response = await api.put<ProfileResponse>("/v1/profile", data);
    if (response.data.status_code !== 200) {
      throw new Error(response.data.message || "Failed to update profile");
    }
  },
};

export default AuthApi;

export interface CreateUserRequest {
  username: string;
  name: string;
  email?: string;
  password: string;
  role: string;
  parent_id?: number;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  role?: string;
}

interface UsersListResponse {
  status_code: number;
  data?: User[];
}

interface UserResponse {
  status_code: number;
  data?: User;
}

export const UserApi = {
  getAll: async (): Promise<User[]> => {
    const response = await api.get<UsersListResponse>("/v1/users/");
    return response.data.data ?? [];
  },

  getById: async (id: number): Promise<User> => {
    const response = await api.get<UserResponse>(`/v1/users/${id}`);
    if (!response.data.data) throw new Error("User not found");
    return response.data.data;
  },

  create: async (data: CreateUserRequest): Promise<User> => {
    const response = await api.post<UserResponse>("/v1/users/", data);
    if (!response.data.data) throw new Error("Failed to create user");
    return response.data.data;
  },

  update: async (id: number, data: UpdateUserRequest): Promise<void> => {
    await api.put(`/v1/users/${id}`, data);
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/v1/users/${id}`);
  },
};