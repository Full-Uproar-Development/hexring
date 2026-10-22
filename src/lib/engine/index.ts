export { Game } from "./game";
export { Board } from "./board";
export {
  DIRS,
  hexKey,
  parseKey,
  hexDist,
  hexDisk,
  hexRing,
  hexToPixel,
  pixelToHex,
  hexRound,
} from "./hex";
export type {
  Hex,
  Piece,
  PieceKind,
  PlayerId,
  Move,
  MoveType,
  ChainHop,
  Winner,
  WinCondition,
  StartLayout,
  TileType,
  GameState,
  GameConfig,
  TurnResult,
} from "./types";
export { DEFAULT_CONFIG } from "./types";
export {
  TRAIL_CONFIG,
  TRAIL_PITS,
  TRAIL_STARTS,
  TRAIL_RADIUS,
  MINI_CONFIG,
  MINI_PITS,
  MINI_STARTS,
  MINI_RADIUS,
  trailPieceKinds,
  withTrailPieces,
  buildTrailBoard,
  TRAIL_FFA_SIM_3,
  TRAIL_FFA_SIM_4,
  TRAIL_FFA_SIM_4_OPEN,
  TRAIL_FFA_PRESETS,
  findTrailFfaPreset,
  generatedTrailConfig,
} from "./presets";
export type { TrailPiecesVariant, TrailBoardSpec, TrailFfaPreset } from "./presets";
export { SEAT_NAMES, seatName, MIN_PLAYERS, MAX_PLAYERS } from "./players";
