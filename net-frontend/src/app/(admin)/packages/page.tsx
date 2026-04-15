import { Metadata } from "next";
import { PackageManagementClient } from "@/components/packages/PackageManagementClient";

export const metadata: Metadata = {
  title: "Manajemen Paket | Net Monitoring",
};

export default function PackagesPage() {
  return <PackageManagementClient />;
}
