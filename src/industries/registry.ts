import type { IndustryDefinition } from "../types/industry";
import { PAPER_MANUFACTURING } from "./paperManufacturing/definition";

export const INDUSTRY_REGISTRY: Record<string, IndustryDefinition> = {
  [PAPER_MANUFACTURING.id]: PAPER_MANUFACTURING,
};

export function getIndustryDefinition(industryId: string): IndustryDefinition | undefined {
  return INDUSTRY_REGISTRY[industryId];
}
