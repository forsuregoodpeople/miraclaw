import { Pelanggan } from "@/lib/api/pelanggan";

interface TypeBadgeProps {
  type: Pelanggan["type"];
}

const styles: Record<Pelanggan["type"], string> = {
  DHCP:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  PPPOE:  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  STATIC: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

export function TypeBadge({ type }: TypeBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[type]}`}>
      {type}
    </span>
  );
}
