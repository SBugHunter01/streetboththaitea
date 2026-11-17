import { requireUser } from "@/lib/auth-guard";
import { PERIOD_LABEL, periodFromParams } from "@/lib/period";
import { sp } from "@/lib/search-params";
import { salesSummary, expenseSummary, profitSummary, ingredientUsage } from "@/lib/services/report";
import { allocationSummary } from "@/lib/services/allocation";
import { PageHeader } from "@/components/page-header";
import { PeriodFilter } from "@/components/period-filter";
import { ReportsTabs } from "./reports-tabs";

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requireUser();
  const p = await searchParams;
  const { period, from, to } = periodFromParams({ period: sp(p.period), from: sp(p.from), to: sp(p.to) });

  const [sales, expenses, profit, usage, allocation] = await Promise.all([
    salesSummary(from, to),
    expenseSummary(from, to),
    profitSummary(from, to),
    ingredientUsage(from, to),
    allocationSummary(from, to),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Laporan" description={PERIOD_LABEL[period]} actions={<PeriodFilter />} />
      <ReportsTabs
        sales={sales}
        expenses={expenses}
        profit={profit}
        usage={usage}
        allocation={allocation}
        canEditAllocation={user.role === "admin"}
      />
    </div>
  );
}
