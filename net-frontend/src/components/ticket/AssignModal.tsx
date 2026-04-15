"use client";

import { useEffect, useState } from "react";
import { FiUserCheck, FiX } from "react-icons/fi";
import { UserApi, User } from "@/lib/api/users";
import { TicketApi } from "@/lib/api/ticket";

interface Props {
  ticketId: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function AssignModal({ ticketId, onClose, onSuccess }: Props) {
  const [teknisi, setTeknisi] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    UserApi.getAll()
      .then((users) => setTeknisi(users.filter((u) => u.role === "teknisi")))
      .catch(() => setError("Gagal memuat daftar teknisi"))
      .finally(() => setLoading(false));
  }, []);

  const handleAssign = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await TicketApi.assign(ticketId, Number(selectedId));
      onSuccess();
    } catch {
      setError("Gagal melakukan assign tiket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="animate-modal-panel w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
            <FiUserCheck className="h-5 w-5" />
            <h3 className="text-base font-semibold">Assign Teknisi</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {loading ? (
            <div className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
          ) : teknisi.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada teknisi tersedia</p>
          ) : (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="">-- Pilih Teknisi --</option>
              {teknisi.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Batal
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedId || submitting}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            {submitting ? "Menyimpan..." : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
