"use client";

import Link from "next/link";
import { FiAlertTriangle, FiX } from "react-icons/fi";
import { Ticket } from "@/lib/api/ticket";
import { TicketStatusBadge } from "./TicketStatusBadge";

interface Props {
  tickets: Ticket[];
  onIgnore: () => void;
  onCancel: () => void;
}

export function DuplicateWarningModal({ tickets, onIgnore, onCancel }: Props) {
  return (
    <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="animate-modal-panel w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <FiAlertTriangle className="h-5 w-5" />
            <h3 className="text-base font-semibold">Tiket Duplikat Terdeteksi</h3>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
            Tiket berikut sudah ada untuk pelanggan/perangkat yang sama dalam 30 menit terakhir:
          </p>
          <div className="space-y-2">
            {tickets.map((t) => (
              <Link
                key={t.id}
                href={`/tickets/${t.id}`}
                target="_blank"
                className="flex items-center justify-between rounded-lg border border-gray-200 p-3 text-sm transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                <div>
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{t.ticket_number}</span>
                  <p className="font-medium text-gray-800 dark:text-white/90">{t.title}</p>
                </div>
                <TicketStatusBadge status={t.status} />
              </Link>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Batal
          </button>
          <button
            onClick={onIgnore}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
          >
            Tetap Buat Tiket
          </button>
        </div>
      </div>
    </div>
  );
}
