import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/engine/newGame";
import { advanceWeek } from "../src/engine/clock";
import { trialBalance } from "../src/engine/ledger";
import type { NewCompanyParams } from "../src/types/industry";

describe("save/load round trip", () => {
  it("serializes and restores a game via JSON without losing fidelity", () => {
    const params: NewCompanyParams = {
      name: "Roundtrip Paper Co.",
      difficulty: "easy",
      locationId: "tx-tyler",
      financingSourceId: "personal-savings",
      startingCash: 50_000,
      targetCustomerSegmentId: "print-shops-direct",
      productTemplateId: "copy-paper",
      facilityTemplateId: "small-job-shop",
      foundedWeek: 0,
      foundedDate: "2025-01-06",
    };
    const game = createNewGame("paper-manufacturing", "Roundtrip Save", params);
    for (let i = 0; i < 8; i++) advanceWeek(game);

    const serialized = JSON.stringify(game);
    const restored = JSON.parse(serialized);

    expect(restored.week).toBe(game.week);
    expect(restored.company.entries.length).toBe(game.company.entries.length);
    expect(restored.company.name).toBe(game.company.name);

    // Continuing the simulation on the restored state should behave identically to the engine's contracts.
    for (let i = 0; i < 4; i++) advanceWeek(restored);
    const tb = trialBalance(restored.company.entries, restored.week);
    expect(tb.balanced).toBe(true);
    expect(restored.week).toBe(12);
  });
});
