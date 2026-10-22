// Core types for the HexRing game engine

export interface Hex {
  q: number;
  r: number;
}

export type PieceKind = "soldier" | "scout" | "hopper";

export interface Piece {
  id: number;
  player: 0 | 1;
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

export type Winner = 0 | 1 | "draw" | null;

export interface GameState {
  pieces: Record<number, Piece>;
  nextPieceId: number;
  currentPlayer: 0 | 1;
  winner: Winner;
  winReason?: string;
  positionHistory: Record<string, number>;
  turnCount: number;
  reservePieces: [number, number]; // undeployed pieces per player
  totalDeployed: [number, number]; // how many pieces each player has deployed from reserve
  deadCells: string[]; // Trail mode: hexes ("q,r") that died when a piece left them; permanently unplayable
}

export type WinCondition =
  | "first_to_kills"
  | "last_standing"
  | "eliminate_all"
  | "no_move_loses";
export type StartLayout = "clustered" | "spread";
export type TileType = "normal" | "killbox" | "fortress" | "deploy0" | "deploy1" | "start0" | "start1";

export interface GameConfig {
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

  // Deploy / reinforcement
  deployEnabled: boolean;
  deployZone: number; // which ring new pieces deploy onto (0 = center)
  reservePieces: number; // how many reserve pieces each player starts with

  // Custom board (overrides radius-based generation when set)
  customTiles?: Record<string, TileType>;
}

export const DEFAULT_CONFIG: GameConfig = {
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
  deployEnabled: false,
  deployZone: 3,
  reservePieces: 0,
};
