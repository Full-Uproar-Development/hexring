// Variant presets — full GameConfigs that differ from standard HexRing
// by more than a settings tweak.

import { hexDisk, hexKey } from "./hex";
import type { GameConfig, TileType } from "./types";
import { DEFAULT_CONFIG } from "./types";

// ---------------------------------------------------------------------------
// TRAIL — the "Surround, but more cerebral" variant (sim core B2-TRAIL).
//
// Rules: each turn, move one of your pieces up to 2 hexes through empty
// hexes. The hex it leaves dies permanently and can never be entered
// again. No captures, no pushes, no jumps. If you start your turn with
// no legal move, you lose.
//
// Why the pits are asymmetric (founder ruling, 2026-10-21): on any
// board with 180-degree rotational symmetry, the second player has a
// perfect mirror strategy — copy the first player's moves rotated 180
// degrees and the first player runs out of moves first (played out
// explicitly in simulation: 52/52 mirror wins). Fixed, non-symmetric
// pits break the mirror: a move that ends opposite a pit has no mirror
// reply. On this exact board the mirror broke in every simulated game
// (median first break ply 8-11) and a mirror attempt won 0/12 against
// deep search, while ordinary play stayed balanced. The control board
// (same radius, no extra pits) mirrored perfectly, 16/16 — it is the
// asymmetry that does the work, not the size.
// Evidence: ~/workspace/hexring/search/TRAIL_PROBE.md (addendum).
//
// Layout v2 (founder, after playing v1 on prod, 2026-10-21): v1 felt
// like "waiting to see who traps themselves first" — home arcs plus a
// dead centre made it parallel solitaire (in sim, 61% of v1 moves did
// not reduce the opponent's options at all, and contact began around
// ply 12). v2 removes the centre pit (open disk, crossable middle)
// and intersperses the starts: every 3rd hex of the outer ring,
// colours alternating, so an enemy is 3 hexes away on both sides and
// moves hurt the opponent from ply 0 (sim: 66% of moves reduce enemy
// mobility, engaging rate 0.78). The starts are also not rotationally
// paired (a start's 180-degree rotation is never a start), so the
// mirror has no opening to copy from, on top of the pits. Endings are
// still exhaustion-shaped — that is Trail's nature without captures —
// but the trapping is now mostly done TO you, not BY you.
// Evidence: ~/workspace/hexring/search/trail_mix.py.
// ---------------------------------------------------------------------------

export const TRAIL_RADIUS = 5;

// Extra pit hexes (axial q,r). No hex's 180-degree rotation is also a
// pit; the set is spread across the board, ring connectivity preserved.
export const TRAIL_PITS: [number, number][] = [
  [4, -5],
  [-2, -1],
  [-4, 4],
  [1, -3],
  [0, 4],
  [-1, 2],
];

// Interspersed starts (layout v2): every 3rd hex of the outer ring,
// colours alternating around the ring (R,B,R,B,... in angular order:
// (-4,-1) R, (-1,-4) B, (2,-5) R, (5,-5) B, (5,-2) R, (4,1) B,
// (1,4) R, (-2,5) B, (-5,5) R, (-5,2) B).
export const TRAIL_STARTS: [[number, number][], [number, number][]] = [
  [
    [-4, -1],
    [2, -5],
    [5, -2],
    [1, 4],
    [-5, 5],
  ],
  [
    [-1, -4],
    [5, -5],
    [4, 1],
    [-2, 5],
    [-5, 2],
  ],
];

function buildTrailTiles(): Record<string, TileType> {
  const tiles: Record<string, TileType> = {};
  const pitSet = new Set(TRAIL_PITS.map(([q, r]) => hexKey(q, r)));
  const start0 = new Set(TRAIL_STARTS[0].map(([q, r]) => hexKey(q, r)));
  const start1 = new Set(TRAIL_STARTS[1].map(([q, r]) => hexKey(q, r)));

  for (const key of hexDisk(TRAIL_RADIUS)) {
    if (pitSet.has(key)) tiles[key] = "killbox"; // asymmetric pits only; centre is open (v2)
    else if (start0.has(key)) tiles[key] = "start0";
    else if (start1.has(key)) tiles[key] = "start1";
    else tiles[key] = "normal";
  }
  return tiles;
}

export const TRAIL_CONFIG: GameConfig = {
  ...DEFAULT_CONFIG,
  boardRadius: TRAIL_RADIUS,
  killboxRadius: 0, // no centre pit in Trail v2; pits come from customTiles
  piecesPerPlayer: 5,
  winCondition: "no_move_loses",
  trailMode: true,
  trailMoveRange: 2,
  // Everything that is not a plain move is off in Trail
  pushEnabled: false,
  chainPush: false,
  pushAfterJump: false,
  jumpOverFriendly: false,
  jumpOverEnemy: false,
  captureOnJump: false,
  chainJumps: false,
  sacrificeJumps: false,
  deployEnabled: false,
  reservePieces: 0,
  threefoldRepetition: false, // impossible anyway: dead hexes only accumulate
  turnLimit: 0,
  customTiles: buildTrailTiles(),
};
