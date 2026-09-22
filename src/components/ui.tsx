import { useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import { glossaryText } from "../data/financialGlossary";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("rounded-lg border border-ink-700 bg-ink-900 p-4", className)}>{children}</div>;
}

export function CardHeading({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-300">{children}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
    </div>
  );
}

export function StatCard({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "neutral" | "good" | "bad" }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <div className={clsx("mt-1 text-2xl font-semibold tabular-nums", tone === "good" && "text-emerald-400", tone === "bad" && "text-rose-400", tone === "neutral" && "text-ink-50")}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-400">{sub}</div>}
    </Card>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-emerald-600 text-white hover:bg-emerald-500",
        variant === "secondary" && "bg-ink-700 text-ink-100 hover:bg-ink-600",
        variant === "danger" && "bg-rose-700 text-white hover:bg-rose-600",
        variant === "ghost" && "bg-transparent text-ink-300 hover:bg-ink-800",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "bad" | "warn" | "info" }) {
  return (
    <span
      className={clsx(
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-ink-700 text-ink-200",
        tone === "good" && "bg-emerald-900 text-emerald-300",
        tone === "bad" && "bg-rose-900 text-rose-300",
        tone === "warn" && "bg-amber-900 text-amber-300",
        tone === "info" && "bg-sky-900 text-sky-300",
      )}
    >
      {children}
    </span>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, align = "left" }: { children?: ReactNode; align?: "left" | "right" }) {
  return <th className={clsx("border-b border-ink-700 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-400", align === "right" ? "text-right" : "text-left")}>{children}</th>;
}

export function Td({ children, align = "left", className, colSpan }: { children: ReactNode; align?: "left" | "right"; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={clsx("border-b border-ink-800 py-1.5", align === "right" ? "text-right tabular-nums" : "text-left", className)}>{children}</td>;
}

/** A small "?" that reveals a plain-language explanation of a financial term on click — the "click to learn" education pattern used throughout Finance/Reports. */
export function InfoTip({ term, text }: { term?: string; text?: string }) {
  const [open, setOpen] = useState(false);
  const body = text ?? (term ? glossaryText(term) : "");
  if (!body) return null;
  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink-700 text-[10px] font-bold text-ink-300 hover:bg-ink-600"
        aria-label="What is this?"
      >
        ?
      </button>
      {open && (
        <span className="absolute left-0 top-5 z-10 w-64 rounded-md border border-ink-600 bg-ink-950 p-2.5 text-left text-xs font-normal normal-case text-ink-200 shadow-lg">
          {body}
        </span>
      )}
    </span>
  );
}

export function ProgressBar({ value, max = 100, tone = "neutral" }: { value: number; max?: number; tone?: "neutral" | "good" | "bad" | "warn" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
      <div
        className={clsx(
          "h-full rounded-full",
          tone === "neutral" && "bg-sky-500",
          tone === "good" && "bg-emerald-500",
          tone === "bad" && "bg-rose-500",
          tone === "warn" && "bg-amber-500",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
