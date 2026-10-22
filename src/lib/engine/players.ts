// Seat names, shared by the engine's win messages and the UI.

import type { PlayerId } from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export const SEAT_NAMES: readonly string[] = ["Red", "Blue", "Green", "Purple"];

export function seatName(player: PlayerId): string {
  return SEAT_NAMES[player] ?? `Player ${player + 1}`;
}
