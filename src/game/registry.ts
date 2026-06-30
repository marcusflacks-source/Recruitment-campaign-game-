import type { GameModule } from "./engine/types";
import { breakTheCeiling } from "./modules/breakTheCeiling/game";

// Game registry. To add a new game (Cast for the catch, The puzzle, Trust
// better diagnostic), implement a GameModule and add it here — nothing else in
// the hub, leaderboard or capture services needs to change.
export const GAMES: GameModule[] = [breakTheCeiling];

export const DEFAULT_GAME_ID = breakTheCeiling.id;

export function getGame(id: string): GameModule | undefined {
  return GAMES.find((g) => g.id === id);
}
