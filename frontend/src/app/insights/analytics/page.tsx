import { AnalyticsView } from "@/components/analytics/AnalyticsView";
import { getAnalyticsData } from "@/lib/data/analytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const data = await getAnalyticsData();
  return <AnalyticsView data={data} />;
}
