import { PrioritizationView } from "@/components/opportunities/PrioritizationView";
import { getPrioritizationData } from "@/lib/data/prioritization";

export const dynamic = "force-dynamic";

export default async function PrioritizationPage() {
  const data = await getPrioritizationData();
  return <PrioritizationView data={data} />;
}
