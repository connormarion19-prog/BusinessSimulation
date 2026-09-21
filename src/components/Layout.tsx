import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useGameStore } from "../store/useGameStore";
import { getCash } from "../engine/company";
import { formatMoney } from "../engine/dateUtils";
import { Button } from "./ui";

const NAV_ITEMS = [
  { to: "/game", label: "Overview", end: true },
  { to: "/game/finance", label: "Finance" },
  { to: "/game/operations", label: "Operations" },
  { to: "/game/products", label: "Products" },
  { to: "/game/employees", label: "Employees" },
  { to: "/game/hiring", label: "Hiring" },
  { to: "/game/customers", label: "Customers" },
  { to: "/game/suppliers", label: "Suppliers" },
  { to: "/game/competitors", label: "Competitors" },
  { to: "/game/market", label: "Market" },
  { to: "/game/reports", label: "Reports" },
  { to: "/game/company", label: "Company" },
  { to: "/game/debug", label: "Debug" },
  { to: "/game/settings", label: "Settings" },
];

export default function Layout() {
  const game = useGameStore((s) => s.game);
  const advanceWeek = useGameStore((s) => s.advanceWeek);
  const navigate = useNavigate();

  useEffect(() => {
    if (!game) navigate("/");
  }, [game, navigate]);

  if (!game) return null;

  const cash = getCash(game.company, game.week);
  const pendingCount = game.pendingDecisions.length;

  return (
    <div className="flex min-h-screen bg-ink-950 text-ink-100">
      <aside className="w-56 shrink-0 border-r border-ink-800 bg-ink-900/60 p-4">
        <div className="mb-6 px-1">
          <div className="text-sm font-bold text-emerald-400">{game.company.name}</div>
          <div className="text-xs text-ink-400">{game.company.stage.replace("-", " ")}</div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  "rounded-md px-3 py-1.5 text-sm",
                  isActive ? "bg-emerald-600/20 text-emerald-300" : "text-ink-300 hover:bg-ink-800 hover:text-ink-100",
                )
              }
            >
              {item.label}
              {item.to === "/game" && pendingCount > 0 && (
                <span className="ml-2 rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] text-white">{pendingCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink-800 bg-ink-900/40 px-6 py-3">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-ink-400">Week</span> <span className="font-semibold">{game.week}</span>
            </div>
            <div>
              <span className="text-ink-400">Date</span> <span className="font-semibold">{game.currentDate}</span>
            </div>
            <div>
              <span className="text-ink-400">Cash</span>{" "}
              <span className={clsx("font-semibold", cash < 0 ? "text-rose-400" : "text-emerald-400")}>{formatMoney(cash)}</span>
            </div>
          </div>
          <Button onClick={advanceWeek}>Advance Week →</Button>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
