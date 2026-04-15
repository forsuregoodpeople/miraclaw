import { GenieACSTable } from "./GenieACSTable";

export default function GenieACSPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white/90">GenieACS Devices</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Daftar perangkat yang terdaftar di server GenieACS melalui protokol TR-069
        </p>
      </div>
      <GenieACSTable />
    </div>
  );
}
