import { OpportunityRankingView } from "@/components/opportunities/OpportunityRankingView";
import { getOpportunitiesData } from "@/lib/data/opportunities";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const data = await getOpportunitiesData();
  return <OpportunityRankingView data={data} />;
}
