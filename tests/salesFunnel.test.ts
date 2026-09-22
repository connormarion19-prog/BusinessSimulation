import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/engine/newGame";
import { trialBalance } from "../src/engine/ledger";
import { contactProspect, qualifyProspect, pitchProspect, acceptProspectCounterOffer, researchProspect } from "../src/engine/prospecting";
import { createRng } from "../src/engine/rng";
import type { NewCompanyParams } from "../src/types/industry";
import type { CustomerPitch } from "../src/types/core";

function baseParams(overrides: Partial<NewCompanyParams> = {}): NewCompanyParams {
  return {
    name: "Micro Startup Co.",
    difficulty: "realistic",
    locationId: "wi-greenbay",
    financingSourceId: "personal-savings",
    startingCash: 15_000,
    targetCustomerSegmentId: "regional-distributors",
    productTemplateId: "copy-paper",
    facilityTemplateId: "small-job-shop",
    foundedWeek: 0,
    foundedDate: "2025-01-06",
    ...overrides,
  };
}

describe("sales funnel: outreach and qualification", () => {
  it("a prospect must be contacted before it can be qualified, and qualified before it can be pitched", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const prospect = game.company.prospects[0];
    const qualifyBeforeContact = qualifyProspect(game.company, prospect.id, game.rng);
    expect(qualifyBeforeContact.ok).toBe(false);

    const pitch: CustomerPitch = { productId: game.company.products[0].id, priceOffered: 5, volumeCommitmentUnits: 100, paymentTermsDaysOffered: 30, contractLengthWeeks: 12 };
    const pitchBeforeQualify = pitchProspect(game.company, prospect.id, pitch, 1, 1, game.week, game.currentDate, game.rng);
    expect(pitchBeforeQualify.ok).toBe(false);
  });

  it("in-person meetings advance a prospect to interested far more reliably than cold outreach, at a real cost difference", () => {
    let meetingAdvances = 0;
    let coldAdvances = 0;
    const trials = 60;
    for (let i = 0; i < trials; i++) {
      const rng = createRng(3000 + i);
      const game = createNewGame("paper-manufacturing", "Test", baseParams());
      const prospect = game.company.prospects[0];
      const cashBefore = 15_000;
      const result = contactProspect(game.company, prospect.id, "in-person-meeting", 1.0, game.week, game.currentDate, rng);
      expect(result.entries.length).toBe(1);
      const cost = result.entries[0].lines.find((l) => l.accountId === "cash")!.credit;
      expect(cost).toBe(160);
      expect(cashBefore).toBeGreaterThan(0);
      if (result.advanced) meetingAdvances++;
    }
    for (let i = 0; i < trials; i++) {
      const rng = createRng(4000 + i);
      const game = createNewGame("paper-manufacturing", "Test", baseParams());
      const prospect = game.company.prospects[0];
      const result = contactProspect(game.company, prospect.id, "cold-outreach", 1.0, game.week, game.currentDate, rng);
      const cost = result.entries[0].lines.find((l) => l.accountId === "cash")!.credit;
      expect(cost).toBe(25);
      if (result.advanced) coldAdvances++;
    }
    expect(meetingAdvances).toBeGreaterThan(coldAdvances);
  });

  it("researching first makes qualification meaningfully more reliable than skipping it", () => {
    let researchedQualifies = 0;
    let unresearchedQualifies = 0;
    const trials = 60;
    for (let i = 0; i < trials; i++) {
      const rng = createRng(5000 + i);
      const game = createNewGame("paper-manufacturing", "Test", baseParams());
      const prospect = game.company.prospects[0];
      researchProspect(game.company, prospect.id, game.week, game.currentDate);
      prospect.status = "interested";
      const result = qualifyProspect(game.company, prospect.id, rng);
      if (result.qualified) researchedQualifies++;
    }
    for (let i = 0; i < trials; i++) {
      const rng = createRng(6000 + i);
      const game = createNewGame("paper-manufacturing", "Test", baseParams());
      const prospect = game.company.prospects[0];
      prospect.status = "interested";
      const result = qualifyProspect(game.company, prospect.id, rng);
      if (result.qualified) unresearchedQualifies++;
    }
    expect(researchedQualifies).toBeGreaterThan(unresearchedQualifies);
  });

  it("a full contact -> qualify -> pitch walk stays balanced and only creates a customer on an actual win", () => {
    const rng = createRng(11);
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const prospect = game.company.prospects[0];
    researchProspect(game.company, prospect.id, game.week, game.currentDate);

    let contacted = false;
    for (let i = 0; i < 5 && !contacted; i++) {
      const r = contactProspect(game.company, prospect.id, "in-person-meeting", 1.4, game.week, game.currentDate, rng);
      game.company.entries.push(...r.entries);
      contacted = r.advanced;
    }
    expect(contacted).toBe(true);
    expect(prospect.status).toBe("interested");

    const qualified = qualifyProspect(game.company, prospect.id, rng);
    expect(prospect.status === "qualified" || prospect.status === "lost").toBe(true);

    if (qualified.qualified) {
      const pitch: CustomerPitch = {
        productId: game.company.products[0].id,
        priceOffered: prospect.trueWillingnessToPayPerUnit * 0.85,
        volumeCommitmentUnits: prospect.trueAnnualVolumeUnits,
        paymentTermsDaysOffered: prospect.truePaymentTermsDays + 10,
        contractLengthWeeks: 26,
      };
      const pitchResult = pitchProspect(game.company, prospect.id, pitch, 1.4, 1.0, game.week, game.currentDate, rng);
      game.company.entries.push(...pitchResult.entries);
      if (pitchResult.won) {
        expect(game.company.customers.some((c) => c.id === prospect.wonCustomerId)).toBe(true);
      } else {
        expect(game.company.customers.length).toBe(0);
      }
    }
    const tb = trialBalance(game.company.entries, game.week);
    expect(tb.balanced).toBe(true);
  });
});

describe("customer negotiation", () => {
  it("a near-miss pitch can reveal a real counter-offer, which is guaranteed to close when accepted", () => {
    // Find a seed where the first pitch lands in negotiation rather than an outright win/loss.
    for (let seed = 0; seed < 200; seed++) {
      const rng = createRng(seed);
      const game = createNewGame("paper-manufacturing", "Test", baseParams());
      const prospect = game.company.prospects[0];
      prospect.status = "qualified";
      const pitch: CustomerPitch = {
        productId: game.company.products[0].id,
        // Deliberately close-but-not-quite: right at willingness to pay, full volume, terms met.
        priceOffered: prospect.trueWillingnessToPayPerUnit,
        volumeCommitmentUnits: prospect.trueAnnualVolumeUnits,
        paymentTermsDaysOffered: prospect.truePaymentTermsDays,
        contractLengthWeeks: 26,
      };
      const result = pitchProspect(game.company, prospect.id, pitch, 0.75, 0.9, game.week, game.currentDate, rng);
      const statusAfterPitch: string = prospect.status;
      if (!result.won && statusAfterPitch === "negotiation") {
        expect(result.counterOffer).toBeDefined();
        const accept = acceptProspectCounterOffer(game.company, prospect.id, pitch.productId, game.week, game.currentDate);
        expect(accept.ok).toBe(true);
        expect(accept.won).toBe(true);
        expect(game.company.customers.some((c) => c.id === prospect.wonCustomerId)).toBe(true);
        game.company.entries.push(...result.entries, ...accept.entries);
        expect(trialBalance(game.company.entries, game.week).balanced).toBe(true);
        return;
      }
    }
    throw new Error("Expected at least one negotiable near-miss across 200 seeds — probability model may have drifted.");
  });

  it("accepting a counter-offer is refused when there's no open negotiation", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const prospect = game.company.prospects[0];
    const result = acceptProspectCounterOffer(game.company, prospect.id, game.company.products[0].id, game.week, game.currentDate);
    expect(result.ok).toBe(false);
  });
});
