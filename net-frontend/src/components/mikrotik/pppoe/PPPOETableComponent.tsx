"use client";

import React, { useState, useRef, memo, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PPPOESession, PPPOESecret, MikrotikApi } from "@/lib/api/mikrotik";
import { PPPoEApi, PPPoEProfile } from "@/lib/api/pppoe";
import { useMikrotikPPPOE } from "@/lib/hooks/useMikrotikPPPOE";
import { usePPPoEProfiles } from "@/lib/hooks/usePPPoEProfiles";
import { SweetAlert } from "@/lib/sweetalert";
import {
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiTrash2,
  FiEdit2,
  FiSave,
  FiX,
  FiWifi,
  FiLoader,
  FiRefreshCw,
  FiPlus,
  FiPackage,
  FiFilter,
  FiSlash,
  FiUser,
} from "react-icons/fi";
import { timeAgo } from "../pelanggan/components/utils/timeAgo";

// ─────────────────────────────────────────────────────────────
// SessionRow — already memoized, no changes needed
// ─────────────────────────────────────────────────────────────
interface SessionRowProps {
  session: PPPOESession;
  index: number;
  startIndex: number;
  formatUptime: (uptime: string | undefined | null) => string;
  onDisconnect: (sessionName: string) => void;
  onEditSecret: (session: PPPOESession) => void;
  onDeleteSecret: (sessionName: string, secretId?: number) => void;
  onBlock: (sessionName: string, secretId?: number) => void;
}

const SessionRow = memo(function SessionRow({
  session,
  index,
  startIndex,
  formatUptime,
  onDisconnect,
  onEditSecret,
  onDeleteSecret,
  onBlock,
}: SessionRowProps) {
  const isActive = !!session.uptime && session.uptime !== "undefined";
  const isDisabled = session.disabled === "true" || session.disabled === true;

  return (
    <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]">
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-500 dark:text-gray-400">
        {startIndex + index + 1}
      </td>
      {/* Mobile: Show Comment, Desktop: Show Name/IP */}
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 max-w-[120px] md:max-w-none truncate" title={session.name}>
        {/* Mobile View */}
        <div className="flex flex-col gap-0.5 sm:hidden">
          <span className="text-sm font-medium text-gray-900 dark:text-white/90">
            {session.comment && session.comment !== "undefined" ? session.comment : session.name}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {session.address && session.address !== "undefined" ? session.address : session.name}
          </span>
          {session.profile && (
            <span className="inline-flex w-fit items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {session.profile}
            </span>
          )}
        </div>
        {/* Desktop View */}
        <div className="hidden sm:flex flex-col gap-0.5">
          <span className="text-sm font-medium text-gray-900 dark:text-white/90">{session.name}</span>
          {session.profile && (
            <span className="inline-flex w-fit items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {session.profile}
            </span>
          )}
          {session.comment && session.comment !== "undefined" && (
            <p className="max-w-[200px] truncate text-xs text-gray-400 dark:text-gray-500" title={session.comment}>
              {session.comment}
            </p>
          )}
        </div>
      </td>
      {/* Desktop: IP Address column */}
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">
        {session.address && session.address !== "undefined" ? session.address : <span className="text-gray-400">-</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">
        {session["caller-id"] && session["caller-id"] !== "undefined" ? session["caller-id"] : <span className="text-gray-400">-</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">
        {formatUptime(session.uptime)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm">
        {isDisabled ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            BLOCKED
          </span>
        ) : (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            isActive
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-500" : "bg-gray-400"}`} />
            {isActive ? "UP" : "DOWN"}
          </span>
        )}
      </td>

      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEditSecret(session)}
            className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
          >
            <FiEdit2 className="h-3 w-3" />
            <span className="hidden sm:inline">Edit</span>
          </button>
          {!isDisabled && (
            <button
              onClick={() => onBlock(session.name, (session as any).id)}
              className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
            >
              <FiSlash className="h-3 w-3" />
              <span className="hidden sm:inline">Blokir</span>
            </button>
          )}
          <button
            onClick={() => onDisconnect(session.name)}
            className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50"
          >
            <FiTrash2 className="h-3 w-3" />
            <span className="hidden sm:inline">Isolir</span>
          </button>
          <button
            onClick={() => onDeleteSecret(session.name, (session as any).id)}
            className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
          >
            <FiTrash2 className="h-3 w-3" />
            <span className="hidden sm:inline">Hapus</span>
          </button>
        </div>
      </td>
    </tr>
  );
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function isValidIP(value: string): boolean {
  if (!value) return true; // optional field
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value) &&
    value.split(".").every((seg) => parseInt(seg, 10) <= 255);
}

// ─────────────────────────────────────────────────────────────
// CreateSecretModal
// ─────────────────────────────────────────────────────────────
interface CreateSecretModalProps {
  isOpen: boolean;
  formData: Partial<PPPOESecret>;
  pppoeProfiles: PPPoEProfile[];
  isLoadingProfiles: boolean;
  isSaving: boolean;
  onChange: (field: keyof PPPOESecret, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const CreateSecretModal = memo(function CreateSecretModal({
  isOpen,
  formData,
  pppoeProfiles,
  isLoadingProfiles,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: CreateSecretModalProps) {
  if (!isOpen) return null;

  const localAddrError = formData.local_address && !isValidIP(formData.local_address)
    ? "Format IP tidak valid (contoh: 192.168.88.1)" : "";
  const remoteAddrError = formData.remote_address && !isValidIP(formData.remote_address)
    ? "Format IP tidak valid (contoh: 192.168.88.100)" : "";
  const hasAddressError = !!localAddrError || !!remoteAddrError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Tambah PPPoE Secret</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Nama Pengguna <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name ?? ""}
                onChange={(e) => onChange("name", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="user123"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.password ?? ""}
                onChange={(e) => onChange("password", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="password123"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Paket (Profile)</label>
              <select
                value={formData.profile ?? ""}
                onChange={(e) => onChange("profile", e.target.value)}
                disabled={isLoadingProfiles}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white disabled:opacity-50"
              >
                <option value="">-- Pilih Paket --</option>
                {pppoeProfiles.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.rate_limit ? `(${p.rate_limit})` : ""}
                  </option>
                ))}
              </select>
              {isLoadingProfiles && <span className="text-xs text-gray-500 dark:text-gray-400">Memuat paket...</span>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Layanan (Service)</label>
              <select
                value={formData.service ?? "any"}
                onChange={(e) => onChange("service", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="any">any</option>
                <option value="pppoe">pppoe</option>
                <option value="pptp">pptp</option>
                <option value="l2tp">l2tp</option>
                <option value="ovpn">ovpn</option>
                <option value="sstp">sstp</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Alamat Lokal</label>
              <input
                type="text"
                value={formData.local_address ?? ""}
                onChange={(e) => onChange("local_address", e.target.value)}
                className={`w-full rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-white ${localAddrError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-gray-300 focus:border-brand-500 focus:ring-brand-500 dark:border-gray-700"}`}
                placeholder="192.168.88.1"
              />
              {localAddrError && <p className="mt-1 text-xs text-red-500">{localAddrError}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Alamat Remote</label>
              <input
                type="text"
                value={formData.remote_address ?? ""}
                onChange={(e) => onChange("remote_address", e.target.value)}
                className={`w-full rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-white ${remoteAddrError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-gray-300 focus:border-brand-500 focus:ring-brand-500 dark:border-gray-700"}`}
                placeholder="192.168.88.100"
              />
              {remoteAddrError && <p className="mt-1 text-xs text-red-500">{remoteAddrError}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Komentar</label>
              <textarea
                value={formData.comment ?? ""}
                onChange={(e) => onChange("comment", e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="Tambahkan komentar..."
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
            Batal
          </button>
          <button onClick={onSubmit} disabled={isSaving || !formData.name || !formData.password || hasAddressError}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-700">
            {isSaving ? <><FiLoader className="h-4 w-4 animate-spin" />Menyimpan...</> : <><FiSave className="h-4 w-4" />Simpan</>}
          </button>
        </div>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// EditSecretModal
// ─────────────────────────────────────────────────────────────
interface EditSecretModalProps {
  isOpen: boolean;
  editingSecret: PPPOESecret | null;
  isFetchingSecret: boolean;
  pppoeProfiles: PPPoEProfile[];
  isLoadingProfiles: boolean;
  isSaving: boolean;
  onChange: (field: keyof PPPOESecret, value: string | boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const EditSecretModal = memo(function EditSecretModal({
  isOpen,
  editingSecret,
  isFetchingSecret,
  pppoeProfiles,
  isLoadingProfiles,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: EditSecretModalProps) {
  if (!isOpen) return null;

  const localAddrError = editingSecret?.local_address && !isValidIP(editingSecret.local_address)
    ? "Format IP tidak valid (contoh: 192.168.88.1)" : "";
  const remoteAddrError = editingSecret?.remote_address && !isValidIP(editingSecret.remote_address)
    ? "Format IP tidak valid (contoh: 192.168.88.100)" : "";
  const hasAddressError = !!localAddrError || !!remoteAddrError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Data PPPoE</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-6">
          {isFetchingSecret || !editingSecret ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FiLoader className="h-8 w-8 animate-spin text-brand-500" />
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Sedang mengambil data secret...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Nama Pengguna</label>
                <input
                  type="text"
                  value={editingSecret.name}
                  onChange={(e) => onChange("name", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Kata Sandi</label>
                <input
                  type="text"
                  value={editingSecret.password}
                  onChange={(e) => onChange("password", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Paket (Profile)</label>
                <select
                  value={editingSecret.profile ?? ""}
                  onChange={(e) => onChange("profile", e.target.value)}
                  disabled={isLoadingProfiles}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white disabled:opacity-50"
                >
                  <option value="">-- Pilih Profile --</option>
                  {pppoeProfiles.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} {p.rate_limit ? `(${p.rate_limit})` : ""}
                    </option>
                  ))}
                </select>
                {isLoadingProfiles && <span className="text-xs text-gray-500 dark:text-gray-400">Memuat profile...</span>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Alamat Lokal</label>
                <input
                  type="text"
                  value={editingSecret.local_address}
                  onChange={(e) => onChange("local_address", e.target.value)}
                  className={`w-full rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-white ${localAddrError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-gray-300 focus:border-brand-500 focus:ring-brand-500 dark:border-gray-700"}`}
                />
                {localAddrError && <p className="mt-1 text-xs text-red-500">{localAddrError}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Alamat Remote</label>
                <input
                  type="text"
                  value={editingSecret.remote_address}
                  onChange={(e) => onChange("remote_address", e.target.value)}
                  className={`w-full rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-white ${remoteAddrError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-gray-300 focus:border-brand-500 focus:ring-brand-500 dark:border-gray-700"}`}
                />
                {remoteAddrError && <p className="mt-1 text-xs text-red-500">{remoteAddrError}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Layanan (Service)</label>
                <select
                  value={editingSecret.service}
                  onChange={(e) => onChange("service", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="any">any</option>
                  <option value="pppoe">pppoe</option>
                  <option value="pptp">pptp</option>
                  <option value="l2tp">l2tp</option>
                  <option value="ovpn">ovpn</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status Akun</label>
                <select
                  value={editingSecret.disabled ? "true" : "false"}
                  onChange={(e) => onChange("disabled", e.target.value === "true")}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="false">Aktif</option>
                  <option value="true">Diblokir</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Komentar</label>
                <textarea
                  value={editingSecret.comment}
                  onChange={(e) => onChange("comment", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  placeholder="Tambahkan komentar..."
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
            Batal
          </button>
          <button onClick={onSubmit} disabled={isSaving || isFetchingSecret || !editingSecret || hasAddressError}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-700">
            {isSaving ? <><FiLoader className="h-4 w-4 animate-spin" />Menyimpan...</> : <><FiSave className="h-4 w-4" />Simpan</>}
          </button>
        </div>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// CreateProfileModal
// ─────────────────────────────────────────────────────────────
interface CreateProfileModalProps {
  isOpen: boolean;
  formData: Partial<PPPoEProfile>;
  isSaving: boolean;
  onChange: (field: keyof PPPoEProfile, value: string) => void;
  onTemplateSelect: (name: string, rateLimit: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const CreateProfileModal = memo(function CreateProfileModal({
  isOpen,
  formData,
  isSaving,
  onChange,
  onTemplateSelect,
  onClose,
  onSubmit,
}: CreateProfileModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Tambah Profile PPPoE</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-6">
          <div className="space-y-4">
            {/* Template Preset */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Template Paket (Opsional)
              </label>
              <select
                onChange={(e) => {
                  const template = e.target.value;
                  if (template) {
                    const [name, rateLimit] = template.split("|");
                    onTemplateSelect(name, rateLimit);
                  }
                }}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="">-- Pilih Template --</option>
                <option value="Paket-2M|2M/2M">Paket 2 Mbps (2M/2M)</option>
                <option value="Paket-5M|5M/5M">Paket 5 Mbps (5M/5M)</option>
                <option value="Paket-10M|10M/10M">Paket 10 Mbps (10M/10M)</option>
                <option value="Paket-20M|20M/20M">Paket 20 Mbps (20M/20M)</option>
                <option value="Paket-30M|30M/15M">Paket 30 Mbps (30M/15M)</option>
                <option value="Paket-50M|50M/25M">Paket 50 Mbps (50M/25M)</option>
                <option value="Paket-100M|100M/50M">Paket 100 Mbps (100M/50M)</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Nama Profile <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name ?? ""}
                onChange={(e) => onChange("name", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="Paket-10Mbps"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Rate Limit (Bandwidth)
              </label>
              <input
                type="text"
                value={formData.rate_limit ?? ""}
                onChange={(e) => onChange("rate_limit", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="10M/10M"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Format: download/upload (contoh: 10M/10M, 1M/512k)
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Local Address</label>
              <input
                type="text"
                value={formData.local_address ?? ""}
                onChange={(e) => onChange("local_address", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="192.168.88.1"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Remote Address</label>
              <input
                type="text"
                value={formData.remote_address ?? ""}
                onChange={(e) => onChange("remote_address", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="192.168.88.100-192.168.88.200"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Bridge</label>
              <input
                type="text"
                value={formData.bridge ?? ""}
                onChange={(e) => onChange("bridge", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="bridge1"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
            Batal
          </button>
          <button onClick={onSubmit} disabled={isSaving || !formData.name}
            className="flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-purple-600 dark:hover:bg-purple-700">
            {isSaving ? <><FiLoader className="h-4 w-4 animate-spin" />Menyimpan...</> : <><FiSave className="h-4 w-4" />Simpan</>}
          </button>
        </div>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
interface PPPOETableComponentProps {
  routerId: number;
  routerName: string;
}

export function PPPOETableComponent({ routerId, routerName }: PPPOETableComponentProps) {
  const router = useRouter();
  const { data: liveSessions, isConnected, isLoading, error, lastUpdate, refetch, patchSession } = useMikrotikPPPOE({
    routerId,
    enabled: true,
  });

  const [secrets, setSecrets] = useState<PPPOESecret[]>([]);
  const [isLoadingSecrets, setIsLoadingSecrets] = useState(true);

  useEffect(() => {
    if (!routerId) return;
    setIsLoadingSecrets(true);
    MikrotikApi.getPPPOESecrets(routerId)
      .then((data) => setSecrets(data ?? []))
      .catch(() => setSecrets([]))
      .finally(() => setIsLoadingSecrets(false));
  }, [routerId]);

  // Merge secrets (base) with live session data (overlay by name).
  // All secrets appear; active ones get address/uptime/bytes from WS.
  const sessions: PPPOESession[] = useMemo(() => {
    const liveMap = new Map((liveSessions ?? []).map((s) => [s.name, s]));
    return secrets.map((secret) => {
      const live = liveMap.get(secret.name);
      return {
        name: secret.name,
        address: live?.address ?? "",
        "caller-id": live?.["caller-id"] ?? "",
        uptime: live?.uptime ?? "",
        encoding: live?.encoding ?? "",
        "limit-bytes-in": live?.["limit-bytes-in"] ?? "0",
        "limit-bytes-out": live?.["limit-bytes-out"] ?? "0",
        "bytes-in": live?.["bytes-in"] ?? "0",
        "bytes-out": live?.["bytes-out"] ?? "0",
        disabled: secret.disabled,
        profile: secret.profile || live?.profile || "",
        service: secret.service || live?.service || "",
        comment: secret.comment || live?.comment || "",
        // carry DB id so edit/delete work
        id: secret.id,
        router_id: secret.router_id,
      } as PPPOESession & { id: number; router_id: number };
    });
  }, [secrets, liveSessions]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "disabled">("all");
  const [profileFilter, setProfileFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"default" | "longest_uptime" | "shortest_uptime">("default");

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateProfileModalOpen, setIsCreateProfileModalOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [editingSecret, setEditingSecret] = useState<PPPOESecret | null>(null);

  const [createFormData, setCreateFormData] = useState<Partial<PPPOESecret>>({
    name: "", password: "", profile: "", service: "any",
    local_address: "", remote_address: "", comment: "",
  });
  const [profileFormData, setProfileFormData] = useState<Partial<PPPoEProfile>>({
    name: "", local_address: "", remote_address: "", rate_limit: "", bridge: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: pppoeProfiles = [], isLoading: isLoadingProfiles, refetch: refetchProfiles } = usePPPoEProfiles({
    routerId,
    enabled: isEditModalOpen || isCreateModalOpen || isCreateProfileModalOpen,
  });

  const refetchSecrets = useCallback(async () => {
    try {
      const data = await MikrotikApi.getPPPOESecrets(routerId);
      setSecrets(data ?? []);
    } catch {
      // keep existing secrets on error
    }
  }, [routerId]);

  const smoothRefetch = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetch(), refetchSecrets()]);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [refetch, refetchSecrets]);

  const formatUptime = useCallback((uptime: string | undefined | null): string => {
    if (!uptime || uptime === "undefined" || uptime === "null") return "-";
    return timeAgo(uptime);
  }, []);

  const handleDisconnect = useCallback(async (sessionName: string) => {
    const result = await SweetAlert.confirm(
      "Isolir Session PPPoE",
      `Apakah Anda yakin ingin mengisolir session "${sessionName}"? Ini akan menghentikan koneksi aktif.`
    );
    if (result.isConfirmed) {
      try {
        await MikrotikApi.disconnectPPPOESession(routerId, sessionName);
        patchSession(sessionName, { uptime: undefined, "bytes-in": "0", "bytes-out": "0", address: "" });
        SweetAlert.success("Berhasil", "Session PPPoE berhasil diisolir");
        await smoothRefetch();
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          SweetAlert.warning("Info", "Klien sudah offline atau tidak ada session aktif.");
        } else {
          SweetAlert.error("Error", "Gagal mengisolir session PPPoE");
        }
      }
    }
  }, [routerId, smoothRefetch, patchSession]);

  const handleDeleteSecret = useCallback(async (sessionName: string, secretId?: number) => {
    const result = await SweetAlert.confirm(
      "Hapus Akun PPPoE",
      `Apakah Anda yakin ingin menghapus akun "${sessionName}" secara permanen dari router?`
    );
    if (!result.isConfirmed) return;

    try {
      const id = secretId ?? secrets.find((s) => s.name === sessionName)?.id;
      if (!id) {
        SweetAlert.error("Error", "Gagal menemukan ID akun di database");
        return;
      }
      await MikrotikApi.deletePPPOESecret(routerId, id);
      setSecrets((prev) => prev.filter((s) => s.id !== id));
      SweetAlert.success("Berhasil", "Akun PPPoE berhasil dihapus");
      await smoothRefetch();
    } catch {
      SweetAlert.error("Error", "Gagal menghapus akun PPPoE");
    }
  }, [routerId, secrets, smoothRefetch]);

  const handleBlock = useCallback(async (sessionName: string, secretId?: number) => {
    const id = secretId ?? secrets.find((s) => s.name === sessionName)?.id;
    if (!id) {
      SweetAlert.error("Error", "Gagal menemukan ID akun di database");
      return;
    }

    const result = await SweetAlert.confirm(
      "Blokir Akun PPPoE",
      `Apakah Anda yakin ingin memblokir akun "${sessionName}"?\n\nAkun akan dinonaktifkan dan ditambahkan ke firewall isolir list.`
    );
    if (!result.isConfirmed) return;

    // Optimistic update
    patchSession(sessionName, { disabled: true });

    try {
      await MikrotikApi.blockPPPOESecret(routerId, id);
      SweetAlert.success("Berhasil", "Akun PPPoE berhasil diblokir");
      await smoothRefetch();
    } catch (err: unknown) {
      patchSession(sessionName, { disabled: false });
      SweetAlert.error("Error", "Gagal memblokir akun PPPoE");
    }
  }, [routerId, secrets, smoothRefetch, patchSession]);

  const handleOpenEditModal = useCallback((session: PPPOESession) => {
    const secret = secrets.find((s) => s.name === session.name);
    if (!secret) {
      SweetAlert.error("Error", "Gagal menemukan data PPPoE Secret di database");
      return;
    }
    setEditingSecret(secret);
    setIsEditModalOpen(true);
  }, [secrets]);

  const handleCloseEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    setEditingSecret(null);
    setIsSaving(false);
  }, []);

  const handleOpenCreateModal = useCallback(() => {
    setCreateFormData({ name: "", password: "", profile: "", service: "any", local_address: "", remote_address: "", comment: "" });
    setIsCreateModalOpen(true);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
    setCreateFormData({ name: "", password: "", profile: "", service: "any", local_address: "", remote_address: "", comment: "" });
    setIsSaving(false);
  }, []);

  const handleOpenCreateProfileModal = useCallback(() => {
    setProfileFormData({ name: "", local_address: "", remote_address: "", rate_limit: "", bridge: "" });
    setIsCreateProfileModalOpen(true);
  }, []);

  const handleCloseCreateProfileModal = useCallback(() => {
    setIsCreateProfileModalOpen(false);
    setProfileFormData({ name: "", local_address: "", remote_address: "", rate_limit: "", bridge: "" });
    setIsSaving(false);
  }, []);

  // Stable change handlers — functional updates, no closure over state
  const handleCreateFormChange = useCallback((field: keyof PPPOESecret, value: string) => {
    setCreateFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleEditFormChange = useCallback((field: keyof PPPOESecret, value: string | boolean) => {
    setEditingSecret((prev) => (prev ? { ...prev, [field]: value } : null));
  }, []);

  const handleProfileFormChange = useCallback((field: keyof PPPoEProfile, value: string) => {
    setProfileFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Separate handler for template select so it doesn't require inline setProfileFormData in modal
  const handleProfileTemplateSelect = useCallback((name: string, rateLimit: string) => {
    setProfileFormData((prev) => ({ ...prev, name, rate_limit: rateLimit }));
  }, []);

  const handleCreateSecret = useCallback(async () => {
    if (isSaving || !createFormData.name || !createFormData.password) return;
    setIsSaving(true);
    try {
      await MikrotikApi.createPPPOESecret(routerId, createFormData);
      SweetAlert.success("Berhasil", "PPPoE Secret berhasil ditambahkan");
      handleCloseCreateModal();
      await smoothRefetch();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        SweetAlert.fire({
          icon: "warning",
          title: "Secret Sudah Ada",
          html: `Secret <strong>"${createFormData.name}"</strong> sudah ada di router ini.`,
          confirmButtonText: "OK",
          showCancelButton: false,
        });
      } else {
        SweetAlert.error("Error", err?.response?.data?.message || "Gagal menambahkan PPPoE Secret");
      }
    } finally {
      setIsSaving(false);
    }
  }, [createFormData, handleCloseCreateModal, routerId, isSaving, smoothRefetch]);

  const handleCreateProfile = useCallback(async () => {
    if (isSaving || !profileFormData.name) return;
    setIsSaving(true);
    try {
      await PPPoEApi.createProfile(routerId, profileFormData);
      SweetAlert.success("Berhasil", `Profile "${profileFormData.name}" berhasil dibuat`);
      handleCloseCreateProfileModal();
      await refetchProfiles();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        SweetAlert.fire({
          icon: "warning",
          title: "Profile Sudah Ada",
          html: `Profile <strong>"${profileFormData.name}"</strong> sudah ada di router.`,
          confirmButtonText: "OK",
          showCancelButton: false,
        });
      } else {
        SweetAlert.error("Error", err?.response?.data?.message || "Gagal membuat profile");
      }
    } finally {
      setIsSaving(false);
    }
  }, [profileFormData, handleCloseCreateProfileModal, routerId, isSaving, refetchProfiles]);

  const handleSaveSecret = useCallback(async () => {
    if (!editingSecret || isSaving) return;
    setIsSaving(true);
    try {
      await MikrotikApi.updatePPPOESecret(routerId, editingSecret.id, editingSecret);
      patchSession(editingSecret.name, {
        disabled: editingSecret.disabled,
        profile: editingSecret.profile ?? undefined,
        comment: editingSecret.comment ?? undefined,
      });
      SweetAlert.success("Berhasil", "Data PPPoE berhasil diperbarui");
      handleCloseEditModal();
      await smoothRefetch();
    } catch {
      SweetAlert.error("Error", "Gagal memperbarui data PPPoE");
    } finally {
      setIsSaving(false);
    }
  }, [editingSecret, handleCloseEditModal, routerId, isSaving, smoothRefetch, patchSession]);

  const handleManualSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await MikrotikApi.syncPPPOESessions(routerId);
      SweetAlert.success("Berhasil", "Data berhasil disinkronkan");
    } catch {
      SweetAlert.error("Error", "Gagal menyinkronkan data");
    } finally {
      setIsSyncing(false);
    }
  }, [routerId, isSyncing]);

  // ESC + scroll lock per modal
  useEffect(() => {
    if (!isEditModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleCloseEditModal(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = "unset"; };
  }, [isEditModalOpen, handleCloseEditModal]);

  useEffect(() => {
    if (!isCreateModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleCloseCreateModal(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = "unset"; };
  }, [isCreateModalOpen, handleCloseCreateModal]);

  useEffect(() => {
    if (!isCreateProfileModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleCloseCreateProfileModal(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = "unset"; };
  }, [isCreateProfileModalOpen, handleCloseCreateProfileModal]);

  const availableProfiles = useMemo(() =>
    Array.from(new Set((sessions ?? []).map((s) => s.profile).filter(Boolean))).sort() as string[]
  , [sessions]);

  const availableServices = useMemo(() =>
    Array.from(new Set((sessions ?? []).map((s) => s.service).filter(Boolean))).sort() as string[]
  , [sessions]);

  const filteredSessions = useMemo(() => {
    let list = sessions ?? [];
    if (statusFilter === "active") list = list.filter((s) => !!s.uptime && s.uptime !== "undefined");
    else if (statusFilter === "disabled") list = list.filter((s) => s.disabled === "true" || s.disabled === true);
    else if (statusFilter === "inactive") list = list.filter((s) => (!s.uptime || s.uptime === "undefined") && s.disabled !== "true" && s.disabled !== true);
    if (profileFilter !== "all") list = list.filter((s) => s.profile === profileFilter);
    if (serviceFilter !== "all") list = list.filter((s) => s.service === serviceFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        (s.address && s.address.toLowerCase().includes(q)) ||
        (s["caller-id"] && s["caller-id"].toLowerCase().includes(q)) ||
        (s.profile && s.profile.toLowerCase().includes(q)) ||
        (s.comment && s.comment.toLowerCase().includes(q))
      );
    }
    if (sortBy !== "default") {
      list = [...list].sort((a, b) => {
        const ua = a.uptime || "", ub = b.uptime || "";
        return sortBy === "longest_uptime" ? ub.localeCompare(ua) : ua.localeCompare(ub);
      });
    }
    return list;
  }, [sessions, searchQuery, statusFilter, profileFilter, serviceFilter, sortBy]);

  const totalPages = Math.ceil(filteredSessions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayedSessions = filteredSessions.slice(startIndex, startIndex + itemsPerPage);

  const visiblePageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      pages.push(1, 2, 3, 4, "...", totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
    }
    return pages;
  }, [totalPages, currentPage]);

  const activeCount = useMemo(() => (sessions ?? []).filter((s) => !!s.uptime && s.uptime !== "undefined").length, [sessions]);
  const disabledCount = useMemo(() => (sessions ?? []).filter((s) => s.disabled === true).length, [sessions]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
        <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <input
          type="text"
          placeholder="Cari nama, IP, paket, komentar..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
        />
        <div className="hidden sm:flex flex-wrap gap-2">
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Putus</option>
            <option value="disabled">Diblokir</option>
          </select>

          {availableProfiles.length > 0 && (
            <select value={profileFilter} onChange={(e) => { setProfileFilter(e.target.value); setCurrentPage(1); }}
              className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
              <option value="all">Semua Paket</option>
              {availableProfiles.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}

          {availableServices.length > 0 && (
            <select value={serviceFilter} onChange={(e) => { setServiceFilter(e.target.value); setCurrentPage(1); }}
              className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
              <option value="all">Semua Layanan</option>
              {availableServices.map((sv) => <option key={sv} value={sv}>{sv}</option>)}
            </select>
          )}

          <select value={sortBy} onChange={(e) => { setSortBy(e.target.value as typeof sortBy); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
            <option value="default">Urutan Default</option>
            <option value="longest_uptime">Uptime Terlama</option>
            <option value="shortest_uptime">Uptime Terbaru</option>
          </select>

          {/* Desktop: Reset Button */}
          {(statusFilter !== "all" || profileFilter !== "all" || serviceFilter !== "all" || searchQuery) && (
            <button onClick={() => { setStatusFilter("all"); setProfileFilter("all"); setServiceFilter("all"); setSearchQuery(""); setCurrentPage(1); }}
              className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              Reset Filter
            </button>
          )}
        </div>

        {/* Mobile: Filter Button */}
        <div className="flex sm:hidden items-center gap-2">
          <button
            onClick={() => setIsFilterOpen(true)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
              (statusFilter !== "all" || profileFilter !== "all" || serviceFilter !== "all")
                ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-400"
                : "border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            <FiFilter className="h-3.5 w-3.5" />
            Filter
            {(statusFilter !== "all" || profileFilter !== "all" || serviceFilter !== "all") && (
              <span className="ml-1 rounded-full bg-brand-500 px-1.5 text-xs text-white">!</span>
            )}
          </button>
          {(statusFilter !== "all" || profileFilter !== "all" || serviceFilter !== "all" || searchQuery) && (
            <button onClick={() => { setStatusFilter("all"); setProfileFilter("all"); setServiceFilter("all"); setSearchQuery(""); setCurrentPage(1); }}
              className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Mobile Filter Modal */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsFilterOpen(false)} />
          <div className="relative w-full rounded-t-2xl bg-white p-4 dark:bg-gray-900 animate-in slide-in-from-bottom">
            <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filter PPPoE</h3>
              <button onClick={() => setIsFilterOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pb-20">
              {/* Status */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "all", label: "Semua" },
                    { key: "active", label: "Aktif" },
                    { key: "inactive", label: "Putus" },
                    { key: "disabled", label: "Diblokir" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setStatusFilter(opt.key as typeof statusFilter)}
                      className={`rounded-lg px-3 py-1.5 text-sm ${
                        statusFilter === opt.key
                          ? "bg-brand-100 text-brand-700 border border-brand-300 dark:bg-brand-900/30 dark:text-brand-400"
                          : "border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Profile */}
              {availableProfiles.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Paket</label>
                  <select
                    value={profileFilter}
                    onChange={(e) => setProfileFilter(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="all">Semua Paket</option>
                    {availableProfiles.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}
              {/* Service */}
              {availableServices.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Layanan</label>
                  <select
                    value={serviceFilter}
                    onChange={(e) => setServiceFilter(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="all">Semua Layanan</option>
                    {availableServices.map((sv) => <option key={sv} value={sv}>{sv}</option>)}
                  </select>
                </div>
              )}
              {/* Sort */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Urutan</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="default">Default</option>
                  <option value="longest_uptime">Uptime Terlama</option>
                  <option value="shortest_uptime">Uptime Terbaru</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className={`overflow-hidden rounded-2xl border border-gray-200 transition-opacity duration-200 dark:border-gray-800 ${isRefreshing ? "opacity-60" : "opacity-100"}`}>
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Session PPPoE — {routerName}
                </h2>
                {isRefreshing && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <FiRefreshCw className="h-3 w-3 animate-spin" />
                    <span>Memperbarui...</span>
                  </div>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                <span className="text-green-600 dark:text-green-400">{activeCount} Aktif</span>
                {disabledCount > 0 && <span className="ml-2 text-gray-500">• {disabledCount} Putus</span>}
                <span className="ml-2 text-gray-400">Total: {sessions?.length ?? 0}</span>
                {lastUpdate && (
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                    • Diperbarui {lastUpdate.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleOpenCreateModal}
                className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700">
                <FiPlus className="h-3.5 w-3.5" />
                Tambah Secret
              </button>
              <button onClick={() => router.push("/mikrotik/pppoe/profile")}
                className="flex items-center gap-2 rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50">
                <FiUser className="h-3.5 w-3.5" />
                Kelola Profile
              </button>
              <button onClick={handleManualSync} disabled={isSyncing}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                <FiRefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Sinkron..." : "Sinkronkan"}
              </button>
              <div className="flex items-center gap-2 border-l border-gray-200 pl-3 dark:border-gray-800">
                <span className={`h-2 w-2 rounded-full ${isConnected ? "animate-pulse bg-green-500" : "bg-gray-400"}`} />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {isConnected ? "Langsung" : "Terputus"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30">
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">#</th>
                {/* Mobile: Komentar/Nama, Desktop: Nama/Paket */}
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:hidden">Komentar / Nama</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden sm:table-cell">Nama Pengguna / Paket</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden sm:table-cell">Alamat IP</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">Caller ID</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">Uptime</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>

                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/[0.02]">
              {(isLoading || isLoadingSecrets) && sessions.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="animate-pulse">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-3 py-2 md:px-6 md:py-4">
                        <div className="h-4 rounded bg-gray-200 dark:bg-gray-700" style={{ width: j === 0 ? 24 : j === 1 ? 120 : 80 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredSessions.length > 0 ? (
                displayedSessions.map((session, index) => (
                  <SessionRow
                    key={session.name}
                    session={session}
                    index={index}
                    startIndex={startIndex}
                    formatUptime={formatUptime}
                    onDisconnect={handleDisconnect}
                    onEditSecret={handleOpenEditModal}
                    onDeleteSecret={handleDeleteSecret}
                    onBlock={handleBlock}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-3 py-2 md:px-6 md:py-4">
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                        <FiWifi className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {searchQuery || statusFilter !== "all"
                          ? "Tidak ada session yang cocok dengan filter"
                          : "Tidak ada session PPPoE aktif"}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredSessions.length > itemsPerPage && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span>
                {startIndex + 1}–{Math.min(startIndex + itemsPerPage, filteredSessions.length)} dari {filteredSessions.length}
                {searchQuery && sessions && filteredSessions.length < sessions.length && (
                  <span className="ml-1 text-gray-400">(difilter dari {sessions.length})</span>
                )}
              </span>
              <span className="text-gray-300">|</span>
              <label className="flex items-center gap-1.5">
                <span>Per halaman:</span>
                <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                  {[50, 100, 250, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                <FiChevronsLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                <FiChevronLeft className="h-4 w-4" />
              </button>
              {visiblePageNumbers.map((page, i) =>
                page === "..." ? (
                  <span key={`e-${i}`} className="px-2 text-gray-400">…</span>
                ) : (
                  <button key={page} onClick={() => setCurrentPage(page as number)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${currentPage === page
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}>
                    {page}
                  </button>
                )
              )}
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                <FiChevronRight className="h-4 w-4" />
              </button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                <FiChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals — stable memoized components, defined outside main component tree */}
      <CreateSecretModal
        isOpen={isCreateModalOpen}
        formData={createFormData}
        pppoeProfiles={pppoeProfiles}
        isLoadingProfiles={isLoadingProfiles}
        isSaving={isSaving}
        onChange={handleCreateFormChange}
        onClose={handleCloseCreateModal}
        onSubmit={handleCreateSecret}
      />
      <EditSecretModal
        isOpen={isEditModalOpen}
        editingSecret={editingSecret}
        isFetchingSecret={false}
        pppoeProfiles={pppoeProfiles}
        isLoadingProfiles={isLoadingProfiles}
        isSaving={isSaving}
        onChange={handleEditFormChange}
        onClose={handleCloseEditModal}
        onSubmit={handleSaveSecret}
      />
      <CreateProfileModal
        isOpen={isCreateProfileModalOpen}
        formData={profileFormData}
        isSaving={isSaving}
        onChange={handleProfileFormChange}
        onTemplateSelect={handleProfileTemplateSelect}
        onClose={handleCloseCreateProfileModal}
        onSubmit={handleCreateProfile}
      />
    </div>
  );
}
