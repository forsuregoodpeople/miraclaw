"use client";

import { useState } from "react";
import Link from "next/link";
import { FiArrowLeft, FiRefreshCw, FiSend } from "react-icons/fi";
import { useTicket } from "@/lib/hooks/useTickets";
import { useUsers } from "@/lib/hooks/useUsers";
import { TicketApi, TicketStatus } from "@/lib/api/ticket";
import { TicketStatusBadge, TicketPriorityBadge } from "./TicketStatusBadge";
import { TicketTimeline } from "./TicketTimeline";
import { SweetAlert } from "@/lib/sweetalert";

const NEXT_STATUS: Record<TicketStatus, { label: string; next: TicketStatus } | null> = {
  OPEN:        null, // handled by assign
  ASSIGNED:    { label: "Mulai Kerjakan", next: "IN_PROGRESS" },
  IN_PROGRESS: { label: "Tandai Selesai", next: "RESOLVED" },
  RESOLVED:    { label: "Tutup Tiket", next: "CLOSED" },
  CLOSED:      null,
};

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

interface Props { id: number; }

export function TicketDetailComponent({ id }: Props) {
  const { ticket, timeline, loading, error, refresh } = useTicket(id);
  const { users } = useUsers();
  const [comment, setComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState(false);
  const [assigningTo, setAssigningTo] = useState("");

  const teknisiList = users.filter((u) => u.role === "teknisi");

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-600 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400">
        {error ?? "Tiket tidak ditemukan"}
      </div>
    );
  }

  const nextAction = NEXT_STATUS[ticket.status];

  const handleStatusUpdate = async () => {
    if (!nextAction) return;
    setSubmittingStatus(true);
    try {
      await TicketApi.updateStatus(ticket.id, nextAction.next);
      SweetAlert.success("Status berhasil diperbarui");
      await refresh();
    } catch {
      SweetAlert.error("Gagal", "Tidak dapat memperbarui status");
    } finally {
      setSubmittingStatus(false);
    }
  };

  const handleAssign = async () => {
    const techID = parseInt(assigningTo, 10);
    if (!techID || techID <= 0) {
      SweetAlert.error("Error", "Pilih teknisi terlebih dahulu");
      return;
    }
    setSubmittingStatus(true);
    try {
      await TicketApi.assign(ticket.id, techID);
      SweetAlert.success("Tiket berhasil di-assign");
      setAssigningTo("");
      await refresh();
    } catch {
      SweetAlert.error("Gagal", "Tidak dapat assign tiket");
    } finally {
      setSubmittingStatus(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setSubmittingComment(true);
    try {
      await TicketApi.addComment(ticket.id, comment.trim());
      setComment("");
      await refresh();
    } catch {
      SweetAlert.error("Gagal", "Tidak dapat menambahkan komentar");
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            href="/tickets"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <FiArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="font-mono text-sm text-gray-400">{ticket.ticket_number}</p>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{ticket.title}</h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{ticket.customer_name}</p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <FiRefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: detail + actions + comment */}
        <div className="space-y-4 lg:col-span-2">
          {/* Description */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Deskripsi</h2>
            <p className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{ticket.description}</p>
          </div>

          {/* Actions */}
          {ticket.status !== "CLOSED" && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Aksi</h2>
              <div className="flex flex-wrap items-center gap-2">
                {ticket.status === "OPEN" && (
                  <>
                    <select
                      value={assigningTo}
                      onChange={(e) => setAssigningTo(e.target.value)}
                      className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="">Pilih Teknisi</option>
                      {teknisiList.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAssign}
                      disabled={submittingStatus || !assigningTo}
                      className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:opacity-60"
                    >
                      Assign
                    </button>
                  </>
                )}
                {nextAction && (
                  <button
                    onClick={handleStatusUpdate}
                    disabled={submittingStatus}
                    className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
                  >
                    {nextAction.label}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Add comment */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Tambah Komentar</h2>
            <div className="flex gap-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="Tulis komentar..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
              />
              <button
                onClick={handleAddComment}
                disabled={submittingComment || !comment.trim()}
                className="flex items-center gap-1.5 self-start rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
              >
                <FiSend className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Riwayat Aktivitas</h2>
            <TicketTimeline entries={timeline} />
          </div>
        </div>

        {/* Right: metadata */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Detail</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-gray-400 dark:text-gray-500">Status</dt>
                <dd className="mt-0.5"><TicketStatusBadge status={ticket.status} /></dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400 dark:text-gray-500">Prioritas</dt>
                <dd className="mt-0.5"><TicketPriorityBadge priority={ticket.priority} /></dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400 dark:text-gray-500">Kategori</dt>
                <dd className="text-gray-700 dark:text-gray-300">{ticket.category.replace("_", " ")}</dd>
              </div>
              {ticket.location_odp && (
                <div>
                  <dt className="text-xs text-gray-400 dark:text-gray-500">Lokasi ODP</dt>
                  <dd className="font-mono text-xs text-gray-700 dark:text-gray-300">{ticket.location_odp}</dd>
                </div>
              )}
              {ticket.mikrotik_ref && (
                <div>
                  <dt className="text-xs text-gray-400 dark:text-gray-500">PPPoE / ONU Ref</dt>
                  <dd className="font-mono text-xs text-gray-700 dark:text-gray-300">{ticket.mikrotik_ref}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-gray-400 dark:text-gray-500">SLA Deadline</dt>
                <dd className={`text-sm ${ticket.is_overdue ? "font-medium text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}>
                  {formatDateTime(ticket.sla_deadline)}
                  {ticket.is_overdue && <span className="ml-1 text-red-500">⚠</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400 dark:text-gray-500">Dibuat</dt>
                <dd className="text-gray-700 dark:text-gray-300">{formatDateTime(ticket.created_at)}</dd>
              </div>
              {ticket.assigned_at && (
                <div>
                  <dt className="text-xs text-gray-400 dark:text-gray-500">Di-assign</dt>
                  <dd className="text-gray-700 dark:text-gray-300">{formatDateTime(ticket.assigned_at)}</dd>
                </div>
              )}
              {ticket.resolved_at && (
                <div>
                  <dt className="text-xs text-gray-400 dark:text-gray-500">Diselesaikan</dt>
                  <dd className="text-gray-700 dark:text-gray-300">{formatDateTime(ticket.resolved_at)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
