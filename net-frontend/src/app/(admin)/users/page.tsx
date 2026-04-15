import { Metadata } from "next";
import { UsersTableComponent } from "@/components/users/UsersTable";

export const metadata: Metadata = {
  title: "Manajemen Pengguna | Net Monitoring",
};

export default function UsersPage() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <div className="mb-5 lg:mb-7">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Manajemen Pengguna
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Kelola akun pengguna dan hak akses dalam sistem
        </p>
      </div>
      <UsersTableComponent />
    </div>
  );
}
