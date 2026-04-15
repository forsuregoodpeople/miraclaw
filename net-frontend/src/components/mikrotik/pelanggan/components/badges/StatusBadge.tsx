interface StatusBadgeProps {
  status: "UP" | "DOWN";
  isIsolir: boolean;
}

export function StatusBadge({ status, isIsolir }: StatusBadgeProps) {
  if (isIsolir) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        ISO
      </span>
    );
  }
  if (status === "UP") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        UP
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      DOWN
    </span>
  );
}
