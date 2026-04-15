"use client";

import { TicketStatus, TicketPriority } from "@/lib/api/ticket";

const STATUS_STYLES: Record<TicketStatus, string> = {
  OPEN:        "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  ASSIGNED:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  RESOLVED:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  CLOSED:      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN:        "Terbuka",
  ASSIGNED:    "Di-assign",
  IN_PROGRESS: "Dikerjakan",
  RESOLVED:    "Selesai",
  CLOSED:      "Ditutup",
};

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  LOW:      "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  MEDIUM:   "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  HIGH:     "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? ""}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[priority] ?? ""}`}>
      {priority}
    </span>
  );
}
