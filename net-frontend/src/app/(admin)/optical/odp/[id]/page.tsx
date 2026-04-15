"use client";

import { useParams } from "next/navigation";
import ODPDetailPage from "@/components/optical/odp/ODPDetailPage";

export default function ODPDetailRoute() {
  const params = useParams();
  const id = parseInt(params.id as string, 10);
  if (isNaN(id)) return <p className="p-6 text-red-500">ID ODP tidak valid</p>;
  return <ODPDetailPage odpId={id} />;
}
