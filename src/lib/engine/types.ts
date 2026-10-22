// Core types for the HexRing game engine

export interface Hex {
  q: number;
  r: number;
}

export type PieceKind = "soldier" | "scout" | "hopper";

// Seat index. Standard HexRing and 2-player Trail only ever use 0 and 1;
// Trail free-for-all (playerCount 3-4) also uses 2 and 3.
export type PlayerId = 0 | 1 | 2 | 3;

export interface Piece {
  id: number;
  player: PlayerId;
  q: number;
  r: number;
  kind?: PieceKind; // Trail piece types; absent = soldier
}

export type MoveType = "MOVE" | "PUSH" | "JUMP" | "CHAIN_JUMP" | "DEPLOY";

export interface ChainHop {
  q: number;
  r: number;
  targetId: number;
  isEnemy: boolean;
}

export interface FollowUpPush {
  targetId: number;
  pushDest: [number, number];
  chainPushIds?: number[]; // if chain push, all pieces shifted
}

export interface Move {
  type: MoveType;
  pieceId: number;
  destQ: number;
  destR: number;
  // PUSH
  targetId?: number;
  pushDest?: [number, number];
  chainPushIds?: number[]; // chain push: all pieces shifted (closest to farthest)
  // JUMP
  isCapture?: boolean;
  jumpOver?: [number, number];
  sacrifice?: boolean;
  // CHAIN_JUMP
  chainHops?: ChainHop[];
  chainTargets?: number[];
  enemyKills?: number;
  // Push after jump
  followUpPush?: FollowUpPush;
}

export type Winner = PlayerId | "draw" | null;

export interface GameState {
  pieces: Record<number, Piece>;
  nextPieceId: number;
  currentPlayer: PlayerId;
  winner: Winner;
  winReason?: string;
  positionHistory: Record<string, number>;
  turnCount: number;
  reservePieces: number[]; // undeployed pieces per player (index = seat)
  totalDeployed: number[]; // how many pieces each player has deployed from reserve
  deadCells: string[]; // Trail mode: hexes ("q,r") that died when a piece left them; permanently unplayable
  // Trail (no_move_loses): seats knocked out, in the order they went out.
  // An eliminated seat never moves again; its pieces stay on the board
  // as neutral obstacles. In a 2-player game the loser ends up here.
  eliminated: PlayerId[];
  // Fair Start (Trail): the first move of the game, recorded so the
  // next seat's first move can be checked against its mirror image.
  firstMove?: {
    player: PlayerId;
    srcQ: number;
    srcR: number;
    destQ: number;
    destR: number;
  };
}

// What executeTurn reports back to the caller.
export interface TurnResult {
  winner: Winner;
  winReason?: string;
  // Trail: seats eliminated while settling whose turn it is next
  eliminated?: PlayerId[];
}

export type WinCondition =
  | "first_to_kills"
  | "last_standing"
  | "eliminate_all"
  | "no_move_loses";
export type StartLayout = "clustered" | "spread";
export type TileType =
  | "normal"
  | "killbox"
  | "fortress"
  | "deploy0"
  | "deploy1"
  | "start0"
  | "start1"
  | "start2" // seat 3 start (Trail free-for-all)
  | "start3"; // seat 4 start (Trail free-for-all)

export interface GameConfig {
  // Players. 2 = standard head-to-head (every mode). 3-4 = Trail
  // free-for-all only: requires trailMode, winCondition "no_move_loses"
  // and customTiles with start tiles for every seat (start0..start3).
  playerCount: number;
  // Seat order for turns, e.g. [0, 2, 1, 3]. Omitted = 0, 1, 2, ...
  // Eliminated seats are skipped.
  turnOrder?: PlayerId[];

  // Board geometry
  boardRadius: number;
  killboxRadius: number;
  fortressRing: number;

  // Pieces
  piecesPerPlayer: number;
  startLayout: StartLayout;

  // Win condition
  winCondition: WinCondition;
  killTarget: number;

  // Rules toggles
  pushEnabled: boolean;
  pushOffBoard: boolean;
  pushIntoKillbox: boolean;
  fortressBlocksPush: boolean;
  fortressBlocksJump: boolean;
  sacrificeJumps: boolean;
  chainJumps: boolean;
  maxChainLength: number;
  jumpOverFriendly: boolean;
  jumpOverEnemy: boolean;
  captureOnJump: boolean;
  chainPush: boolean; // push shifts entire line of pieces
  pushAfterJump: boolean; // can push an adjacent enemy after landing from a jump
  threefoldRepetition: boolean;
  turnLimit: number; // 0 = no limit

  // Trail variant: move up to 2 hexes through empty hexes; the hex a
  // piece leaves dies permanently; no captures; a player who starts
  // their turn with no legal move loses (winCondition: no_move_loses)
  trailMode: boolean;
  trailMoveRange: number; // hexes a soldier may travel per turn in Trail mode

  // Trail piece types (setting): uniform = all soldiers;
  // scouts = slots {0,2} are scouts (range 3); hoppers = slots {0,2}
  // are hoppers (soldier move, or a straight 2-hex hop over anything
  // to a live empty hex); hopper1 = only slot {2} is a hopper.
  // pieceKinds maps a start hex "q,r" to its kind (both players).
  trailPieces: "uniform" | "scouts" | "hoppers" | "hopper1";
  pieceKinds?: Record<string, PieceKind>;

  // Fair Start (Trail, founder ruling 2026-10-22): the next seat's
  // first move may not be the 180-degree mirror of the first move of
  // the game. One forced deviation breaks the copycat permanently;
  // sims (TRAIL_PROBE.md addendum 8) show the mirror attempt falls to
  // exactly the ordinary second-seat win rate on every terrain, with
  // ordinary balance undisturbed. The ban lifts if it would leave
  // the mover with no legal move at all. On in all Trail presets.
  fairStart: boolean;

  // Which named Trail board this config is, for UI selectors:
  // "trail" (fixed radius-5), "mini" (fixed radius-3), "gen-<radius>"
  // (generated). Undefined for standard/custom games.
  trailBoardKind?: string;

  // Deploy / reinforcement
  deployEnabled: boolean;
  deployZone: number; // which ring new pieces deploy onto (0 = center)
  reservePieces: number; // how many reserve pieces each player starts with

  // Custom board (overrides radius-based generation when set)
  customTiles?: Record<string, TileType>;
}

export const DEFAULT_CONFIG: GameConfig = {
  playerCount: 2,
  boardRadius: 4,
  killboxRadius: 1,
  fortressRing: 2,
  piecesPerPlayer: 5,
  startLayout: "clustered",
  winCondition: "first_to_kills",
  killTarget: 3,
  pushEnabled: true,
  pushOffBoard: true,
  pushIntoKillbox: true,
  fortressBlocksPush: true,
  fortressBlocksJump: false,
  sacrificeJumps: true,
  chainJumps: true,
  maxChainLength: 5,
  jumpOverFriendly: true,
  jumpOverEnemy: true,
  captureOnJump: true,
  chainPush: false,
  pushAfterJump: false,
  threefoldRepetition: true,
  turnLimit: 0,
  trailMode: false,
  trailMoveRange: 2,
  trailPieces: "uniform",
  fairStart: false,
  deployEnabled: false,
  deployZone: 3,
  reservePieces: 0,
};
