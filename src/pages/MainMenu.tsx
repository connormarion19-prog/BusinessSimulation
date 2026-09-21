import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useGameStore } from "../store/useGameStore";
import { Button, Card, CardHeading } from "../components/ui";

export default function MainMenu() {
  const saves = useGameStore((s) => s.saves);
  const refreshSaves = useGameStore((s) => s.refreshSaves);
  const loadGame = useGameStore((s) => s.loadGame);
  const deleteSave = useGameStore((s) => s.deleteSave);
  const navigate = useNavigate();

  useEffect(() => {
    refreshSaves();
  }, [refreshSaves]);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 bg-ink-950 px-6 py-12 text-ink-100">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-emerald-400">Ledger &amp; Ledger</h1>
        <p className="mt-2 text-ink-400">Found a company. Run it for decades. Live with the decisions.</p>
      </div>

      <div className="w-full">
        <Button onClick={() => navigate("/new")} className="w-full py-3 text-base">
          Start a New Company
        </Button>
      </div>

      <Card className="w-full">
        <CardHeading>Continue a save</CardHeading>
        {saves.length === 0 && <p className="text-sm text-ink-400">No saved companies yet.</p>}
        <div className="flex flex-col gap-2">
          {saves.map((save) => (
            <div key={save.saveId} className="flex items-center justify-between rounded-md border border-ink-700 px-3 py-2">
              <div>
                <div className="text-sm font-medium">{save.companyName}</div>
                <div className="text-xs text-ink-400">
                  {save.saveName} · Week {save.week} · {save.difficulty} · last played {new Date(save.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    loadGame(save.saveId);
                    navigate("/game");
                  }}
                >
                  Continue
                </Button>
                <Button variant="danger" onClick={() => deleteSave(save.saveId)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
