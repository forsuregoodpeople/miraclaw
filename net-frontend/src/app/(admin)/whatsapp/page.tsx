import React from "react";
import { WhatsAppManager } from "@/components/whatsapp/WhatsAppManager";
import { FiMessageSquare } from "react-icons/fi";

export const metadata = {
  title: "WhatsApp Settings | ACI DATA SOLUSINDO",
  description: "Manage WhatsApp sessions and billing reminders",
};

export default function WhatsAppPage() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg shadow-brand-500/20">
            <FiMessageSquare className="h-6 w-6" />
          </div>
          WhatsApp Billing Reminder
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Kelola sesi WhatsApp dan konfigurasi pesan pengingat tagihan otomatis.
        </p>
      </div>

      <WhatsAppManager />
    </div>
  );
}
