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
  Move,
  MoveType,
  ChainHop,
  Winner,
  WinCondition,
  StartLayout,
  TileType,
  GameState,
  GameConfig,
} from "./types";
export { DEFAULT_CONFIG } from "./types";
export {
  TRAIL_CONFIG,
  TRAIL_PITS,
  TRAIL_STARTS,
  TRAIL_RADIUS,
  trailPieceKinds,
  withTrailPieces,
} from "./presets";
export type { TrailPiecesVariant } from "./presets";
