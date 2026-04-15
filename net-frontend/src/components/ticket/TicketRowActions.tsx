"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FiEdit2,
  FiEye,
  FiUserCheck,
  FiRotateCcw,
  FiXCircle,
} from "react-icons/fi";
import { Ticket, TicketApi } from "@/lib/api/ticket";
import { useUsers } from "@/lib/hooks/useUsers";
import { SweetAlert } from "@/lib/sweetalert";

interface Props {
  ticket: Ticket;
  currentUserRole: string;
  onRefresh: () => void;
}

export function TicketRowActions({ ticket, currentUserRole, onRefresh }: Props) {
  const router = useRouter();
  const [assigningTo, setAssigningTo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { users } = useUsers();

  const canEdit = ["superadmin", "mitra", "admin"].includes(currentUserRole);
  const canAssign = ["superadmin", "mitra", "admin"].includes(currentUserRole);
  const canReopen = ["superadmin", "mitra"].includes(currentUserRole);
  const canClose = ["superadmin", "mitra", "admin"].includes(currentUserRole);

  const isAssignable = ticket.status === "OPEN";
  const isReopenable = ticket.status === "RESOLVED" || ticket.status === "CLOSED";
  const isCloseable =
    ticket.status === "OPEN" ||
    ticket.status === "ASSIGNED" ||
    ticket.status === "IN_PROGRESS" ||
    ticket.status === "RESOLVED";

  const teknisiList = users.filter((u) => u.role === "teknisi");

  const handleAssign = async () => {
    const techID = parseInt(assigningTo, 10);
    if (!techID) return;
    setSubmitting(true);
    try {
      await TicketApi.assign(ticket.id, techID);
      setAssigningTo("");
      onRefresh();
    } catch {
      SweetAlert.error("Gagal", "Tidak dapat assign tiket");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopen = async () => {
    const result = await SweetAlert.confirm("Buka Kembali Tiket", `Buka kembali tiket "${ticket.title}"?`);
    if (!result.isConfirmed) return;
    try {
      await TicketApi.updateStatus(ticket.id, "OPEN", "Tiket dibuka kembali");
      onRefresh();
    } catch {
      SweetAlert.error("Gagal", "Tidak dapat membuka kembali tiket");
    }
  };

  const handleClose = async () => {
    const result = await SweetAlert.confirm("Tutup Tiket", `Tutup tiket "${ticket.title}"?`);
    if (!result.isConfirmed) return;
    try {
      await TicketApi.updateStatus(ticket.id, "CLOSED", "Tiket ditutup dari daftar");
      onRefresh();
    } catch {
      SweetAlert.error("Gagal", "Tidak dapat menutup tiket");
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => router.push(`/tickets/${ticket.id}`)}
        className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        title="Lihat Detail"
      >
        <FiEye className="h-3 w-3" />
        <span className="hidden sm:inline">Detail</span>
      </button>

      {canEdit && (
        <button
          type="button"
          onClick={() => router.push(`/tickets/${ticket.id}/edit`)}
          className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
          title="Edit Tiket"
        >
          <FiEdit2 className="h-3 w-3" />
          <span className="hidden sm:inline">Edit</span>
        </button>
      )}

      {canAssign && isAssignable && (
        <>
          <select
            value={assigningTo}
            onChange={(e) => setAssigningTo(e.target.value)}
            className="rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="">Pilih Teknisi</option>
            {teknisiList.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAssign}
            disabled={!assigningTo || submitting}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50"
            title="Assign Teknisi"
          >
            <FiUserCheck className="h-3 w-3" />
            <span className="hidden sm:inline">Assign</span>
          </button>
        </>
      )}

      {canReopen && isReopenable && (
        <button
          type="button"
          onClick={handleReopen}
          className="inline-flex items-center gap-1 rounded-md bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
          title="Buka Kembali"
        >
          <FiRotateCcw className="h-3 w-3" />
          <span className="hidden sm:inline">Buka</span>
        </button>
      )}

      {canClose && isCloseable && (
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
          title="Tutup Tiket"
        >
          <FiXCircle className="h-3 w-3" />
          <span className="hidden sm:inline">Tutup</span>
        </button>
      )}
    </div>
  );
}
