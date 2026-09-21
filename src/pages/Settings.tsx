import { useNavigate } from "react-router-dom";
import { useGameStore } from "../store/useGameStore";
import { Button, Card, CardHeading } from "../components/ui";

export default function Settings() {
  const game = useGameStore((s) => s.game)!;
  const saveCurrentGame = useGameStore((s) => s.saveCurrentGame);
  const exitToMenu = useGameStore((s) => s.exitToMenu);
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Settings</h1>
      <Card>
        <CardHeading>Save</CardHeading>
        <p className="mb-3 text-sm text-ink-400">Save name: {game.meta.saveName} · Difficulty: {game.meta.difficulty} · Created {new Date(game.meta.createdAt).toLocaleDateString()}</p>
        <div className="flex gap-2">
          <Button onClick={saveCurrentGame}>Save Now</Button>
          <Button
            variant="secondary"
            onClick={() => {
              exitToMenu();
              navigate("/");
            }}
          >
            Save &amp; Exit to Menu
          </Button>
        </div>
      </Card>
    </div>
  );
}
