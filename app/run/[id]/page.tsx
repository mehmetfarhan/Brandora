import { notFound } from "next/navigation";
import { getRun } from "@/lib/runs";
import { RunView } from "@/components/RunView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initial = getRun(id);
  if (!initial) notFound();
  return <RunView initial={initial} />;
}
