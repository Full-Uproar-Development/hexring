// Variant presets — full GameConfigs that differ from standard HexRing
// by more than a settings tweak.

import { hexDisk, hexKey, hexRing } from "./hex";
import type { GameConfig, PieceKind, PlayerId, TileType } from "./types";
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
// mobility, engaging rate 0.78). Endings are still exhaustion-shaped —
// that is Trail's nature without captures — but the trapping is now
// mostly done TO you, not BY you.
//
// CORRECTION (2026-10-22): an earlier version of this comment claimed
// the starts are not rotationally paired. They ARE: rotating either
// seat's starts 180 degrees gives the other seat's starts exactly, on
// this board and on Mini. The anti-mirror protection was the pits
// alone. The structural answer is now the Fair Start rule (below):
// the second seat's first move may not be the mirror of the first
// seat's, which sims show reduces the copycat to ordinary play on
// every terrain (addendum 8, TRAIL_PROBE.md).
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

// Piece-type variants (simmed 2026-10-21, trail_types.py). Specials
// sit on the same start slots the sim used — {0,2} of each start
// list, or slot {2} alone for the solo hopper:
//   slots {0,2}: P0 (-4,-1) & (5,-2);  P1 (-1,-4) & (4,1)
//   slot  {2}:   P0 (5,-2);            P1 (4,1)
// Sim read: scouts were inert (range never once rescued a trapped
// piece in 66 games); hoppers had a real mechanism (~3.5 escapes
// per game at two, ~1.8 at one; two hoppers made 55% of all moves,
// one hopper a balanced ~32%).
export type TrailPiecesVariant = GameConfig["trailPieces"];

const SPECIAL_SLOTS: Record<string, number[]> = {
  scouts: [0, 2],
  hoppers: [0, 2],
  hopper1: [2],
};

export function trailPieceKinds(
  variant: TrailPiecesVariant
): Record<string, PieceKind> {
  const kinds: Record<string, PieceKind> = {};
  const slots = SPECIAL_SLOTS[variant];
  if (!slots) return kinds;
  const kind: PieceKind = variant === "scouts" ? "scout" : "hopper";
  for (const starts of TRAIL_STARTS) {
    for (const i of slots) {
      const [q, r] = starts[i];
      kinds[hexKey(q, r)] = kind;
    }
  }
  return kinds;
}

export function withTrailPieces(
  config: GameConfig,
  variant: TrailPiecesVariant
): GameConfig {
  return {
    ...config,
    trailPieces: variant,
    pieceKinds: trailPieceKinds(variant),
  };
}

export const TRAIL_CONFIG: GameConfig = {
  ...DEFAULT_CONFIG,
  boardRadius: TRAIL_RADIUS,
  killboxRadius: 0, // no centre pit in Trail v2; pits come from customTiles
  piecesPerPlayer: 5,
  winCondition: "no_move_loses",
  trailMode: true,
  trailMoveRange: 2,
  fairStart: true,
  trailBoardKind: "trail",
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

// ---------------------------------------------------------------------------
// TRAIL MINI — the pocket version (founder pick from the mini sweep,
// 2026-10-22). Radius-3 disk, 3 pieces per side, move range 1: at
// range 1 the dying hex is exactly your own past path, so this is
// the Surround/Tron-shaped end of Trail. The sweep (trail_small.py)
// found 1v1 range-1 thin (deep play converges on one seat; bigger
// boards become partition-then-fill), but 3v3 at radius 3 stayed
// balanced in both agent families (P0 0.50 greedy / 0.562 deep),
// ran ~22 plies, and kept 89-91% of moves within striking distance
// of an enemy. Layout below is the exact sim cell: pits and starts
// as generated there. Balance at this size is layout-sensitive, so
// treat this specific layout as the tested one, not a sample.
// ---------------------------------------------------------------------------

export const MINI_RADIUS = 3;

export const MINI_PITS: [number, number][] = [
  [1, 1],
  [3, -1],
  [0, -1],
];

export const MINI_STARTS: [[number, number][], [number, number][]] = [
  [
    [-2, -1],
    [3, -2],
    [-1, 3],
  ],
  [
    [1, -3],
    [2, 1],
    [-3, 2],
  ],
];

function buildMiniTiles(): Record<string, TileType> {
  const tiles: Record<string, TileType> = {};
  const pitSet = new Set(MINI_PITS.map(([q, r]) => hexKey(q, r)));
  const start0 = new Set(MINI_STARTS[0].map(([q, r]) => hexKey(q, r)));
  const start1 = new Set(MINI_STARTS[1].map(([q, r]) => hexKey(q, r)));

  for (const key of hexDisk(MINI_RADIUS)) {
    if (pitSet.has(key)) tiles[key] = "killbox";
    else if (start0.has(key)) tiles[key] = "start0";
    else if (start1.has(key)) tiles[key] = "start1";
    else tiles[key] = "normal";
  }
  return tiles;
}

export const MINI_CONFIG: GameConfig = {
  ...TRAIL_CONFIG,
  boardRadius: MINI_RADIUS,
  piecesPerPlayer: 3,
  trailMoveRange: 1,
  trailPieces: "uniform",
  pieceKinds: undefined,
  trailBoardKind: "mini",
  customTiles: buildMiniTiles(),
};

// ---------------------------------------------------------------------------
// TRAIL FREE-FOR-ALL — 3-4 players, local only.
//
// Rules are Trail's, generalized: on your turn move one of your pieces
// up to the configured range through empty hexes; the hex it leaves
// dies; no captures. Turns cycle through the seats still in the game
// (config.turnOrder, default 0, 1, 2, ...). A seat that starts its turn
// with no legal move is eliminated: it never moves again, and its
// pieces and dead hexes stay on the board as obstacles. Last seat left
// wins. With 2 seats this is exactly 2-player Trail.
//
// Every multiplayer parameter lives in the GameConfig (playerCount,
// turnOrder, trailMoveRange, pits and starts in customTiles, optional
// pieceKinds), so a board is pure data: describe it with a
// TrailBoardSpec, build it with buildTrailBoard, and list it in
// TRAIL_FFA_PRESETS to make it selectable in the UI.
// ---------------------------------------------------------------------------

export interface TrailBoardSpec {
  radius: number;
  pits: [number, number][];
  starts: [number, number][][]; // one list per seat, in seat order (2-4 seats)
  moveRange?: number; // default: Trail's (2)
  turnOrder?: PlayerId[]; // default: seat order
  pieceKinds?: Record<string, PieceKind>; // start hex "q,r" -> kind
}

const START_TILES: TileType[] = ["start0", "start1", "start2", "start3"];

export function buildTrailBoard(spec: TrailBoardSpec): GameConfig {
  const pitSet = new Set(spec.pits.map(([q, r]) => hexKey(q, r)));
  const startOf = new Map<string, TileType>();
  spec.starts.forEach((cells, seat) => {
    for (const [q, r] of cells) {
      const key = hexKey(q, r);
      if (pitSet.has(key) || startOf.has(key)) {
        throw new Error(`buildTrailBoard: start ${key} overlaps a pit or another start`);
      }
      startOf.set(key, START_TILES[seat]);
    }
  });
  const disk = hexDisk(spec.radius);
  for (const key of [...pitSet, ...startOf.keys()]) {
    if (!disk.has(key)) throw new Error(`buildTrailBoard: ${key} is off the radius-${spec.radius} board`);
  }

  const tiles: Record<string, TileType> = {};
  for (const key of disk) {
    tiles[key] = pitSet.has(key) ? "killbox" : (startOf.get(key) ?? "normal");
  }
  return {
    ...TRAIL_CONFIG,
    playerCount: spec.starts.length,
    turnOrder: spec.turnOrder,
    boardRadius: spec.radius,
    piecesPerPlayer: Math.max(...spec.starts.map((s) => s.length)),
    trailMoveRange: spec.moveRange ?? TRAIL_CONFIG.trailMoveRange,
    trailPieces: "uniform",
    pieceKinds: spec.pieceKinds,
    customTiles: tiles,
  };
}

// SIM boards — these replace Sam's placeholder boards (radius 5,
// Trail pits, 3 per seat; his greedy self-play had Blue winning 44%
// of 3-player games). Data is the exact cells from the multiplayer
// probe (~/workspace/hexring/search/trail_ffa.py, addendum 6):
// radius 6, 4 pieces per seat, move range 1, starts interspersed
// round the rim cycling seats. Greedy win shares there: 3P
// 0.35/0.30/0.35; 4P pitted 0.425/0.20/0.175/0.20 (stronger max^n
// play flatter: 0.25/0.25/0.167/0.333); the no-pit 4P control was
// the flattest greedy board of the sweep (0.325/0.225/0.25/0.20).
// Seat fairness in FFA is a match-level property (rotate seats
// between games), not a single-layout promise — see addendum 6.
export const TRAIL_FFA_SIM_3: TrailBoardSpec = {
  radius: 6,
  moveRange: 1,
  pits: [[2, 0], [-3, -3], [0, -5], [5, -5], [-1, 3], [3, -5], [5, 0], [3, 2]],
  starts: [
    [[-5, -1], [4, -6], [5, 1], [-4, 6]],
    [[-2, -4], [6, -5], [2, 4], [-6, 5]],
    [[1, -6], [6, -2], [-1, 6], [-6, 2]],
  ],
};

export const TRAIL_FFA_SIM_4: TrailBoardSpec = {
  radius: 6,
  moveRange: 1,
  pits: [[0, -6], [3, -3], [-5, 3], [-3, 1], [-2, -2], [1, -3], [-2, -4], [4, -2]],
  starts: [
    [[-5, -1], [3, -6], [6, -1], [-1, 6]],
    [[-3, -3], [5, -6], [5, 1], [-3, 6]],
    [[-1, -5], [6, -5], [3, 3], [-5, 6]],
    [[1, -6], [6, -3], [1, 5], [-6, 5]],
  ],
};

export const TRAIL_FFA_SIM_4_OPEN: TrailBoardSpec = {
  radius: 6,
  moveRange: 1,
  pits: [],
  starts: TRAIL_FFA_SIM_4.starts,
};

export interface TrailFfaPreset {
  id: string;
  label: string; // shown in the Players dropdown
  config: GameConfig;
}

// Boards offered in the UI's Players dropdown, in order. The first
// preset for a given player count is that count's default.
export const TRAIL_FFA_PRESETS: TrailFfaPreset[] = [
  {
    id: "ffa3-sim",
    label: "3 players · radius 6 · step 1 (sim board)",
    config: buildTrailBoard(TRAIL_FFA_SIM_3),
  },
  {
    id: "ffa4-sim",
    label: "4 players · radius 6 · step 1 (sim board)",
    config: buildTrailBoard(TRAIL_FFA_SIM_4),
  },
  {
    id: "ffa4-open",
    label: "4 players · radius 6 · no pits (sim board)",
    config: buildTrailBoard(TRAIL_FFA_SIM_4_OPEN),
  },
];

/** The preset a config came from (matched on seats and tiles), if any. */
export function findTrailFfaPreset(config: GameConfig): TrailFfaPreset | undefined {
  if ((config.playerCount ?? 2) <= 2 || !config.customTiles) return undefined;
  const tiles = JSON.stringify(config.customTiles);
  return TRAIL_FFA_PRESETS.find(
    (p) =>
      p.config.playerCount === config.playerCount &&
      JSON.stringify(p.config.customTiles) === tiles
  );
}

// ---------------------------------------------------------------------------
// GENERATED 2-PLAYER BOARDS — the grid-size parameter (founder,
// 2026-10-22). Pick a radius (3-6) and get a fresh board: starts
// interspersed round the outer ring alternating seats (the v2
// recipe), pieces per side equal to the radius, move range 1 at
// radius 3-4 and 2 at 5-6 (the simmed combinations), and pits
// RANDOM per board under the founder's pit ruling — scattered by
// the same constrained chooser as the sims (spread at least 2
// apart, never on or opposite a start, board stays connected).
// Random terrain plus Fair Start is what makes a generated board
// fair: no fixed geography to prefer a seat on, and the copycat
// is banned at move one regardless of terrain.
// ---------------------------------------------------------------------------

const GEN_PIT_COUNT: Record<number, number> = { 3: 3, 4: 4, 5: 6, 6: 8 };
const GEN_DIRS: [number, number][] = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hdist(q: number, r: number): number {
  return (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2;
}

function ringByAngle(radius: number): [number, number][] {
  const cells = hexRing(radius).map((h) => [h.q, h.r] as [number, number]);
  const ang = ([q, r]: [number, number]) =>
    Math.atan2(1.5 * r, Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  return cells.sort((a, b) => ang(a) - ang(b));
}

function generatedPits(
  radius: number,
  starts: [number, number][][],
  seed: number
): [number, number][] {
  const rand = mulberry32(seed);
  const flat = new Set(
    starts.flat().map(([q, r]) => hexKey(q, r))
  );
  const disk: [number, number][] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (hdist(q, r) <= radius) disk.push([q, r]);
    }
  }
  const cands = disk
    .filter(([q, r]) => {
      const k = hexKey(q, r);
      return (
        hdist(q, r) >= 1 &&
        !flat.has(k) &&
        !flat.has(hexKey(-q, -r))
      );
    })
    .sort(() => rand() - 0.5);
  const want = GEN_PIT_COUNT[radius] ?? 3;
  const chosen: [number, number][] = [];
  const connected = (blocked: Set<string>): boolean => {
    const rest = disk.filter(([q, r]) => !blocked.has(hexKey(q, r)));
    if (!rest.length) return false;
    const seen = new Set<string>([hexKey(rest[0][0], rest[0][1])]);
    const stack = [rest[0]];
    while (stack.length) {
      const [cq, cr] = stack.pop()!;
      for (const [dq, dr] of GEN_DIRS) {
        const n: [number, number] = [cq + dq, cr + dr];
        const k = hexKey(n[0], n[1]);
        if (
          hdist(n[0], n[1]) <= radius &&
          !blocked.has(k) &&
          !seen.has(k)
        ) {
          seen.add(k);
          stack.push(n);
        }
      }
    }
    return seen.size === rest.length;
  };
  for (const p of cands) {
    if (chosen.length >= want) break;
    if (chosen.some((c) => hdist(p[0] - c[0], p[1] - c[1]) < 2)) continue;
    const blocked = new Set(
      [...chosen, p].map(([q, r]) => hexKey(q, r))
    );
    if (!connected(blocked)) continue;
    chosen.push(p);
  }
  return chosen;
}

export function generatedTrailConfig(radius: number, seed: number): GameConfig {
  const ring = ringByAngle(radius);
  const per = radius; // pieces per side scale with the board
  const total = 2 * per;
  const step = Math.max(1, Math.floor(ring.length / total));
  const picks = Array.from({ length: total }, (_, i) => ring[(i * step) % ring.length]);
  const starts: [number, number][][] = [
    picks.filter((_, i) => i % 2 === 0),
    picks.filter((_, i) => i % 2 === 1),
  ];
  const pits = generatedPits(radius, starts, seed);
  const config = buildTrailBoard({
    radius,
    pits,
    starts,
    moveRange: radius <= 4 ? 1 : 2,
  });
  return { ...config, trailBoardKind: `gen-${radius}` };
}
