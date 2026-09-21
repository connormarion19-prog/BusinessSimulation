import { addWeeks, format } from "date-fns";

export function weekDate(foundedDateIso: string, weekNumber: number): string {
  return format(addWeeks(new Date(foundedDateIso), weekNumber), "yyyy-MM-dd");
}

export function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function formatMoneyPrecise(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
