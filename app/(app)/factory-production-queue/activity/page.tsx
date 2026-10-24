import { ProductionSummaryPage } from "../_components/production-summary-page";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  return <ProductionSummaryPage initialPlanner={value("planner")} initialYear={value("year")} initialMonth={value("month")} />;
}
