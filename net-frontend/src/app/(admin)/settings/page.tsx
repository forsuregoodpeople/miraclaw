import React from "react";
import { FiSettings } from "react-icons/fi";

export const metadata = {
  title: "Pengaturan | ACI DATA SOLUSINDO",
  description: "Pengaturan sistem",
};

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg shadow-brand-500/20">
            <FiSettings className="h-6 w-6" />
          </div>
          Pengaturan Umum
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Konfigurasi sistem dan preferensi aplikasi.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
        <FiSettings className="mx-auto mb-4 h-12 w-12 text-gray-300" />
        <p className="text-gray-500 dark:text-gray-400">
          Pengaturan sistem akan segera tersedia.
        </p>
      </div>
    </div>
  );
}
