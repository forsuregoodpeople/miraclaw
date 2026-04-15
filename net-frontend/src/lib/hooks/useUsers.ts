"use client";

import { useState, useCallback, useEffect } from "react";
import { User, UserApi } from "../api/users";

interface UseUsersReturn {
  users: User[];
  loading: boolean;
  error: string | null;
  refresh: (silent?: boolean) => Promise<void>;
}

export function useUsers(): UseUsersReturn {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await UserApi.getAll();
      setUsers(data);
      setError(null);
    } catch {
      setError("Gagal memuat data pengguna");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { users, loading, error, refresh };
}
