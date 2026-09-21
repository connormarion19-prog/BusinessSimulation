import type { GameState } from "../types/core";
import { migrateGameState } from "../engine/migrate";

const INDEX_KEY = "biz-sim:index";
const SAVE_PREFIX = "biz-sim:save:";

export interface SaveIndexEntry {
  saveId: string;
  saveName: string;
  companyName: string;
  week: number;
  difficulty: string;
  updatedAt: string;
}

function readIndex(): SaveIndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as SaveIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(index: SaveIndexEntry[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export function listSaves(): SaveIndexEntry[] {
  return readIndex().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function saveGame(state: GameState): void {
  localStorage.setItem(SAVE_PREFIX + state.meta.saveId, JSON.stringify(state));
  const index = readIndex().filter((e) => e.saveId !== state.meta.saveId);
  index.push({
    saveId: state.meta.saveId,
    saveName: state.meta.saveName,
    companyName: state.company.name,
    week: state.week,
    difficulty: state.meta.difficulty,
    updatedAt: new Date().toISOString(),
  });
  writeIndex(index);
}

export function loadGame(saveId: string): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_PREFIX + saveId);
    if (!raw) return null;
    return migrateGameState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function deleteGame(saveId: string): void {
  localStorage.removeItem(SAVE_PREFIX + saveId);
  writeIndex(readIndex().filter((e) => e.saveId !== saveId));
}
