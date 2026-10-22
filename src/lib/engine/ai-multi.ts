// AI for Trail free-for-all (3-4 players): greedy margin play.
// For each legal move, score = own mobility after the move minus the
// mobility of the strongest (most mobile) opponent still in the game.
// Mobility = number of legal moves. Pick the best score; ties are broken
// at random. In Trail nothing ever reopens (left hexes die), so a seat
// with zero mobility is certain to be eliminated on its next turn.
// 2-player games never come here; they keep the minimax AI in ai.ts.

import type { Game } from "./game";
import type { GameState, Move, PlayerId } from "./types";

export function mobility(game: Game, state: GameState, player: PlayerId): number {
  return game.allMoves(state, player).length;
}

export function greedyMarginMove(
  game: Game,
  state: GameState,
  rng: () => number = Math.random
): Move | null {
  const me = state.currentPlayer;
  const moves = game.allMoves(state, me);
  if (!moves.length) return null;
  const opponents = game.alivePlayers(state).filter((p) => p !== me);

  let best = -Infinity;
  let bestMoves: Move[] = [];
  for (const m of moves) {
    const after = game.snapshot(state);
    game.applyMove(after, m);
    let strongest = 0;
    for (const opp of opponents) {
      strongest = Math.max(strongest, mobility(game, after, opp));
    }
    const score = mobility(game, after, me) - strongest;
    if (score > best) {
      best = score;
      bestMoves = [m];
    } else if (score === best) {
      bestMoves.push(m);
    }
  }
  return bestMoves[Math.floor(rng() * bestMoves.length)];
}
