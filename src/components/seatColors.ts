// Per-seat colours for the board and side panel (index = seat).
// Tailwind classes are written out in full so the build picks them up.

export interface SeatColor {
  piece: string; // piece fill
  startFill: string; // start-tile fill on custom boards
  text: string; // Tailwind text colour
  border: string; // Tailwind border colour
}

export const SEAT_COLORS: readonly SeatColor[] = [
  { piece: "#e74c3c", startFill: "#3d1a1a", text: "text-red-500", border: "border-red-500" },
  { piece: "#3498db", startFill: "#1a1a3d", text: "text-blue-500", border: "border-blue-500" },
  { piece: "#2ecc71", startFill: "#163322", text: "text-green-500", border: "border-green-500" },
  { piece: "#a66be0", startFill: "#2a1a3d", text: "text-purple-400", border: "border-purple-400" },
];

// Pieces of an eliminated seat: neutral obstacles
export const ELIMINATED_PIECE = "#5b5f6b";
