import { Metadata } from "next";
import { CustomerDetailForm } from "@/components/customers/CustomerDetailForm";

export const metadata: Metadata = {
  title: "Profil Pelanggan | Net Monitoring",
};

export default async function CustomerDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return (
    <div className="w-full">
      <CustomerDetailForm id={Number(params.id)} />
    </div>
  );
}
