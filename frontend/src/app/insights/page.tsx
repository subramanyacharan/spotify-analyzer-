import { InsightsView } from "@/components/insights/InsightsView";
import { getInsightsData } from "@/lib/data/insights";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const data = await getInsightsData();
  return <InsightsView data={data} />;
}
