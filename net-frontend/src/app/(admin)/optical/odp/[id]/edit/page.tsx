"use client";
import { useParams } from "next/navigation";
import ODPFormPage from "@/components/optical/odp/ODPFormPage";

export default function ODPEditPage() {
  const params = useParams();
  const id = parseInt(params.id as string, 10);
  if (isNaN(id)) return <p className="p-6 text-red-500">ID ODP tidak valid</p>;
  return <ODPFormPage mode="edit" odpId={id} />;
}
