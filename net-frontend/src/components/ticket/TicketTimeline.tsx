"use client";

import { TimelineEntry } from "@/lib/api/ticket";
import { FiUser, FiMessageSquare, FiRefreshCw, FiUserCheck, FiPlusCircle, FiEdit } from "react-icons/fi";

const ACTION_ICON: Record<string, React.ReactNode> = {
  CREATED:       <FiPlusCircle className="h-4 w-4 text-green-500" />,
  STATUS_CHANGED: <FiRefreshCw className="h-4 w-4 text-blue-500" />,
  ASSIGNED:      <FiUserCheck className="h-4 w-4 text-purple-500" />,
  COMMENT:       <FiMessageSquare className="h-4 w-4 text-gray-500" />,
  FIELD_UPDATED: <FiEdit className="h-4 w-4 text-orange-500" />,
};

const ACTION_LABEL: Record<string, string> = {
  CREATED:       "Tiket dibuat",
  STATUS_CHANGED: "Status diubah",
  ASSIGNED:      "Di-assign ke teknisi",
  COMMENT:       "Komentar",
  FIELD_UPDATED: "Field diperbarui",
};

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

interface Props {
  entries: TimelineEntry[];
}

export function TicketTimeline({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
        Belum ada aktivitas
      </p>
    );
  }

  return (
    <div className="relative space-y-0">
      {entries.map((entry, i) => (
        <div key={entry.id} className="flex gap-3">
          {/* Timeline line */}
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white ring-2 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
              {ACTION_ICON[entry.action] ?? <FiUser className="h-4 w-4 text-gray-400" />}
            </div>
            {i < entries.length - 1 && (
              <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700" style={{ minHeight: 24 }} />
            )}
          </div>

          {/* Content */}
          <div className="pb-5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-gray-800 dark:text-white/90">
                {entry.actor_name}
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                {ACTION_LABEL[entry.action] ?? entry.action}
              </span>
              {entry.from_status && entry.to_status && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {entry.from_status} → {entry.to_status}
                </span>
              )}
            </div>
            {entry.comment && (
              <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
                {entry.comment}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {formatDateTime(entry.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
