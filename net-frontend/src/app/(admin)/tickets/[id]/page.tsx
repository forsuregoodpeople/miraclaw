import { TicketDetailComponent } from "@/components/ticket/TicketDetailComponent";

export const metadata = { title: "Detail Tiket - Net Monitoring" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TicketDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <TicketDetailComponent id={Number(id)} />
    </div>
  );
}
