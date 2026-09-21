import type { CausalBreakdown } from "../types/core";
import type { IncomeStatement } from "../types/finance";
import { round2 } from "./ledger";

export function computeRevenueCausal(
  priorPrice: number,
  priorVolume: number,
  currentPrice: number,
  currentVolume: number,
): CausalBreakdown {
  const priorRevenue = priorPrice * priorVolume;
  const currentRevenue = currentPrice * currentVolume;
  const priceEffect = round2((currentPrice - priorPrice) * priorVolume);
  const volumeEffect = round2((currentVolume - priorVolume) * currentPrice);
  return {
    metric: "revenue",
    totalChange: round2(currentRevenue - priorRevenue),
    drivers: [
      { label: "Price effect", amount: priceEffect },
      { label: "Volume effect", amount: volumeEffect },
    ],
  };
}

export function computeProfitCausal(prior: IncomeStatement, current: IncomeStatement): CausalBreakdown {
  const revenueEffect = round2(current.revenue - prior.revenue);
  const cogsEffect = round2(-(current.cogs - prior.cogs));
  const opexEffect = round2(-(current.totalOperatingExpenses - prior.totalOperatingExpenses));
  const interestEffect = round2(-(current.interestExpense - prior.interestExpense));
  const taxEffect = round2(-(current.taxExpense - prior.taxExpense));
  return {
    metric: "profit",
    totalChange: round2(current.netIncome - prior.netIncome),
    drivers: [
      { label: "Revenue", amount: revenueEffect },
      { label: "Cost of goods sold", amount: cogsEffect },
      { label: "Operating expenses", amount: opexEffect },
      { label: "Interest expense", amount: interestEffect },
      { label: "Income tax", amount: taxEffect },
    ],
  };
}
