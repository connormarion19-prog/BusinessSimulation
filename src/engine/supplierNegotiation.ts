import type { Company, SupplierNegotiationOffer, SupplierNegotiationResult } from "../types/core";
import { round2 } from "./ledger";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * A real negotiation, not a coin flip: how much a supplier will actually give up depends on how
 * aggressive the ask is relative to their current price, the company's purchasing skill, how much
 * volume is being committed in exchange, and how many times this relationship has already been
 * renegotiated (each round gets harder — a supplier doesn't keep conceding indefinitely). A
 * reasonable-but-too-aggressive ask gets a real counter instead of a flat rejection.
 */
export function negotiateSupplierTerms(
  company: Company,
  supplierId: string,
  offer: SupplierNegotiationOffer,
  purchasingSkillFactor: number, // ~0.5-1.6
  week: number,
  date: string,
): SupplierNegotiationResult {
  const supplier = company.suppliers.find((s) => s.id === supplierId);
  if (!supplier) return { ok: false, accepted: false, reason: "Unknown supplier." };
  if (supplier.lastNegotiationWeek !== null && week - supplier.lastNegotiationWeek < 4) {
    return { ok: false, accepted: false, reason: `${supplier.name} isn't willing to revisit terms again so soon — try again in a few weeks.` };
  }
  if (offer.volumeCommitmentUnits < supplier.minimumOrderUnits) {
    return { ok: false, accepted: false, reason: `${supplier.name}'s minimum order is ${supplier.minimumOrderUnits} units — this commitment falls short of that.` };
  }

  const askedDiscount = clamp((supplier.pricePerUnit - offer.targetPricePerUnit) / supplier.pricePerUnit, -1, 1);
  const volumeBonus = offer.volumeCommitmentUnits > supplier.minimumOrderUnits * 3 ? 0.02 : 0;
  const skillBonus = clamp((purchasingSkillFactor - 0.8) * 0.05, -0.03, 0.05);
  const roundPenalty = supplier.negotiationRounds * 0.018;
  const maxRealisticDiscount = clamp(0.035 + skillBonus + volumeBonus - roundPenalty, 0.01, 0.15);
  const termsAsk = offer.paymentTermsDaysRequested - supplier.paymentTermsDays;

  const priceReasonable = askedDiscount <= maxRealisticDiscount;
  const termsReasonable = termsAsk <= 21; // asking for up to 3 more weeks of terms is a normal ask

  if (askedDiscount <= 0 || (priceReasonable && termsReasonable)) {
    // Asking for no discount (or even offering to pay more) always succeeds; a reasonable ask within
    // what this round of negotiation could realistically move also succeeds outright.
    supplier.pricePerUnit = round2(offer.targetPricePerUnit);
    if (offer.paymentTermsDaysRequested > supplier.paymentTermsDays) {
      supplier.paymentTermsDays = Math.round((supplier.paymentTermsDays + offer.paymentTermsDaysRequested) / 2);
    }
    supplier.negotiationRounds += 1;
    supplier.lastNegotiationWeek = week;
    company.historyLog.push({
      week,
      date,
      headline: `Renegotiated terms with ${supplier.name}`,
      detail: `New price $${supplier.pricePerUnit.toFixed(2)}/unit, ${supplier.paymentTermsDays}-day terms.`,
      category: "finance",
    });
    return { ok: true, accepted: true, reason: `${supplier.name} agreed to the new terms.` };
  }

  // Too aggressive to accept outright, but not absurd — a real counter, not a flat no.
  const wayTooAggressive = askedDiscount > maxRealisticDiscount * 2.5 || termsAsk > 60;
  if (wayTooAggressive) {
    return { ok: true, accepted: false, reason: `${supplier.name} isn't willing to move anywhere near that far — this ask is well outside what they'd consider.` };
  }

  const counterOffer = {
    priceAcceptable: round2(supplier.pricePerUnit * (1 - maxRealisticDiscount)),
    paymentTermsAcceptable: supplier.paymentTermsDays + Math.min(14, Math.max(0, termsAsk)),
    minimumOrderAcceptable: supplier.minimumOrderUnits,
  };
  return {
    ok: true,
    accepted: false,
    reason: `${supplier.name} won't go that far, but they've indicated what they would actually accept.`,
    counterOffer,
  };
}
