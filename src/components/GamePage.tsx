"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import HexBoard from "./HexBoard";
import SettingsPanel from "./SettingsPanel";
import { Game } from "@/lib/engine";
import { DEFAULT_CONFIG, TRAIL_CONFIG, MINI_CONFIG, withTrailPieces } from "@/lib/engine";
import { TRAIL_FFA_PRESETS, findTrailFfaPreset, seatName, MAX_PLAYERS } from "@/lib/engine";
import type { TrailPiecesVariant } from "@/lib/engine";
import { aiChooseMove } from "@/lib/engine/ai";
import type { AIDifficulty } from "@/lib/engine/ai";
import type { Move, GameState, GameConfig, Winner, PlayerId } from "@/lib/engine";
import { SEAT_COLORS } from "./seatColors";

type PlayerMode = "human" | "ai";

// Human/AI per seat (index = seat). Seats 3-4 only matter in Trail free-for-all.
const DEFAULT_SEAT_MODES: PlayerMode[] = ["human", "ai", "ai", "ai"];

interface HistoryEntry {
  state: GameState;
}

const DIFFICULTY_LABELS: Record<AIDifficulty, string> = {
  1: "Beginner",
  2: "Casual",
  3: "Intermediate",
  4: "Advanced",
  5: "Expert",
  6: "Master",
};

const SETTINGS_KEY = "hexring-settings";

function loadSettings(): { config: GameConfig; seatModes: PlayerMode[]; difficulty: AIDifficulty } | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    // Merge with defaults to handle new fields added after save
    let config: GameConfig = { ...DEFAULT_CONFIG, ...saved.config };
    try {
      new Game(config);
    } catch {
      config = DEFAULT_CONFIG; // a saved config the engine rejects
    }
    // Older saves only have redMode / blueMode
    const seatModes: PlayerMode[] =
      Array.isArray(saved.seatModes) && saved.seatModes.length === MAX_PLAYERS
        ? saved.seatModes
        : [saved.redMode ?? "human", saved.blueMode ?? "ai", ...DEFAULT_SEAT_MODES.slice(2)];
    return {
      config,
      seatModes,
      difficulty: saved.difficulty ?? 4,
    };
  } catch {
    return null;
  }
}

function saveSettings(config: GameConfig, seatModes: PlayerMode[], difficulty: AIDifficulty) {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ config, seatModes, redMode: seatModes[0], blueMode: seatModes[1], difficulty })
    );
  } catch { /* ignore */ }
}

export default function GamePage() {
  const [config, setConfig] = useState<GameConfig>(() => {
    if (typeof window !== "undefined") {
      const saved = loadSettings();
      if (saved) return saved.config;
    }
    return DEFAULT_CONFIG;
  });
  const gameRef = useRef(new Game(config));
  const [state, setState] = useState<GameState>(() => gameRef.current.state);
  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [message, setMessage] = useState("Red goes first — select a piece.");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [animOverride, setAnimOverride] = useState<{ pieceId: number; q: number; r: number } | null>(null);
  const animating = useRef(false);
  const [seatModes, setSeatModes] = useState<PlayerMode[]>(() => {
    if (typeof window !== "undefined") {
      const saved = loadSettings();
      if (saved) return saved.seatModes;
    }
    return DEFAULT_SEAT_MODES;
  });
  const redMode = seatModes[0];
  const blueMode = seatModes[1];
  // 3-4 = Trail free-for-all
  const playerCount = config.playerCount ?? 2;
  const seatsInPlay = Array.from({ length: playerCount }, (_, i) => i as PlayerId);
  const ffaPreset = findTrailFfaPreset(config);
  // Rules-only engine instance for render-time queries (legal-move counts)
  const rules = useMemo(() => new Game(config), [config]);
  const [difficulty, setDifficulty] = useState<AIDifficulty>(() => {
    if (typeof window !== "undefined") {
      const saved = loadSettings();
      if (saved) return saved.difficulty;
    }
    return 4;
  });
  const aiThinking = useRef(false);

  // Persist settings to localStorage
  useEffect(() => {
    saveSettings(config, seatModes, difficulty);
  }, [config, seatModes, difficulty]);

  const isAI = useCallback(
    (player: PlayerId) => seatModes[player] === "ai",
    [seatModes]
  );

  const playerName = useCallback(
    (player: PlayerId) => {
      const color = seatName(player);
      return isAI(player) ? `AI ${color}` : color;
    },
    [isAI]
  );

  const [deployMode, setDeployMode] = useState(false);
  // Pending follow-up push: after a jump lands, player picks which enemy to push (or skips)
  const [pendingPush, setPendingPush] = useState<{
    baseMove: Move; // the jump/chain_jump move WITHOUT followUpPush
    pushMoves: Move[]; // variants WITH followUpPush (one per push target)
  } | null>(null);
  const killTarget = config.killTarget;
  const piecesPerPlayer = config.piecesPerPlayer;

  const redCount = Object.values(state.pieces).filter(
    (p) => p.player === 0
  ).length;
  const blueCount = Object.values(state.pieces).filter(
    (p) => p.player === 1
  ).length;
  const redTotalDeployed = state.totalDeployed?.[0] ?? 0;
  const blueTotalDeployed = state.totalDeployed?.[1] ?? 0;
  const redKills = (piecesPerPlayer + blueTotalDeployed) - blueCount;
  const blueKills = (piecesPerPlayer + redTotalDeployed) - redCount;

  // --- Finalize a move (apply game state, update messages) ---
  const finishMove = useCallback(
    (move: Move, desc: string, game: Game) => {
      const result = game.executeTurn(move);
      setSelectedPieceId(null);
      setValidMoves([]);
      setAnimOverride(null);
      animating.current = false;

      // Free-for-all: name any seats knocked out by this move
      const out =
        game.playerCount > 2 && result.eliminated?.length
          ? ` — ${result.eliminated.map(seatName).join(" & ")} out of moves, eliminated`
          : "";

      if (result.winner !== null) {
        const winMsg =
          result.winner === "draw"
            ? "DRAW!"
            : `${seatName(result.winner).toUpperCase()} WINS!`;
        setMessage(`${desc}${out} — ${winMsg}`);
        setState({ ...game.state });
        return;
      }

      const nextName = playerName(game.state.currentPlayer);
      const nextIsAI = seatModes[game.state.currentPlayer] === "ai";
      if (nextIsAI) {
        setMessage(`${desc}${out} — ${nextName} is thinking...`);
      } else {
        setMessage(`${desc}${out} — ${nextName}'s turn.`);
      }
      setState({ ...game.state });
    },
    [playerName, seatModes]
  );

  // --- Execute a move (human or AI) ---
  const executeMove = useCallback(
    (move: Move, game: Game, currentState: GameState) => {
      // Save history
      const snap = game.snapshot(currentState);
      setHistory((prev) => [...prev, { state: snap }]);

      const name = playerName(currentState.currentPlayer);
      let desc = "";
      if (move.type === "MOVE")
        desc = `${name} moves to (${move.destQ},${move.destR})`;
      else if (move.type === "PUSH") {
        const [pq, pr] = move.pushDest!;
        if (!game.board.onBoard(pq, pr))
          desc = `${name} PUSHES enemy OFF THE BOARD!`;
        else if (game.board.isKillbox(pq, pr))
          desc = `${name} PUSHES enemy INTO KILLBOX!`;
        else desc = `${name} pushes enemy to (${pq},${pr})`;
      } else if (move.type === "JUMP") {
        desc = move.isCapture
          ? `${name} JUMP CAPTURES enemy!`
          : `${name} jumps over friendly`;
        if (move.sacrifice) desc += " (SACRIFICE!)";
        if (move.followUpPush) desc += " + PUSH!";
      } else if (move.type === "CHAIN_JUMP") {
        desc = `${name} CHAIN JUMPS (${move.chainTargets!.length} hops)`;
        if (move.enemyKills) desc += ` — ${move.enemyKills} CAPTURED!`;
        if (move.followUpPush) desc += " + PUSH!";
      } else if (move.type === "DEPLOY") {
        desc = `${name} DEPLOYS reinforcement to (${move.destQ},${move.destR})`;
      }

      setSelectedPieceId(null);
      setValidMoves([]);

      // Animate chain jumps through intermediate hops
      if (move.type === "CHAIN_JUMP" && move.chainHops && move.chainHops.length > 1) {
        animating.current = true;
        const piece = currentState.pieces[move.pieceId];
        if (!piece) {
          finishMove(move, desc, game);
          return;
        }
        // Build hop positions: start -> hop1 -> hop2 -> ... -> final
        const hops = move.chainHops;
        let step = 0;

        // Start at piece's current position
        setAnimOverride({ pieceId: piece.id, q: piece.q, r: piece.r });

        const stepThrough = () => {
          if (step < hops.length) {
            setAnimOverride({ pieceId: piece.id, q: hops[step].q, r: hops[step].r });
            step++;
            setTimeout(stepThrough, 280);
          } else {
            finishMove(move, desc, game);
          }
        };
        // Start first hop after a brief delay for the transition to pick up the start position
        setTimeout(stepThrough, 50);
        return;
      }

      finishMove(move, desc, game);
    },
    [playerName, finishMove]
  );

  // --- AI turn ---
  useEffect(() => {
    if (state.winner !== null) return;
    if (!isAI(state.currentPlayer)) return;
    if (aiThinking.current) return;
    if (animating.current) return;

    aiThinking.current = true;
    const timer = setTimeout(() => {
      const game = gameRef.current;
      const move = aiChooseMove(game, game.state, difficulty);
      aiThinking.current = false;
      if (move) {
        executeMove(move, game, game.state);
      } else {
        // No moves — skip
        const stuck = game.state.currentPlayer;
        game.state.currentPlayer = game.nextAlive(game.state, stuck);
        setMessage(
          `${playerName(stuck)} has no moves. ${playerName(game.state.currentPlayer)}'s turn.`
        );
        setState({ ...game.state });
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      aiThinking.current = false;
    };
  }, [state, isAI, difficulty, executeMove, playerName]);

  // --- Click handler ---
  const handleHexClick = useCallback(
    (q: number, r: number) => {
      if (state.winner !== null) return;
      if (isAI(state.currentPlayer)) return;
      if (animating.current) return;

      const game = gameRef.current;

      // --- Handle pending push-after-jump ---
      if (pendingPush) {
        // Check if clicking a push target
        const pushMatch = pendingPush.pushMoves.find((m) => {
          const fup = m.followUpPush!;
          const target = game.state.pieces[fup.targetId];
          return target && target.q === q && target.r === r;
        });
        if (pushMatch) {
          // Execute the jump+push combo
          setPendingPush(null);
          executeMove(pushMatch, game, game.state);
          return;
        }
        // Clicking elsewhere — execute base jump without push
        setPendingPush(null);
        executeMove(pendingPush.baseMove, game, game.state);
        return;
      }

      // Check if clicking a valid move destination (including deploy targets)
      // For jumps with push options: prefer the base jump (no followUpPush)
      // so we can enter pending push mode
      const matchingMoves = validMoves.filter(
        (m) => m.destQ === q && m.destR === r
      );
      // Separate base moves from follow-up push variants
      const baseMoves = matchingMoves.filter((m) => !m.followUpPush);
      const pushVariants = matchingMoves.filter((m) => !!m.followUpPush);

      // Pick the best base move (prefer chain push over simple push)
      const clickedMove = baseMoves.length > 1
        ? baseMoves.sort((a, b) => {
            const scoreA = (a.chainPushIds && a.chainPushIds.length > 1 ? 2 : 0);
            const scoreB = (b.chainPushIds && b.chainPushIds.length > 1 ? 2 : 0);
            return scoreB - scoreA;
          })[0]
        : baseMoves[0];

      if (clickedMove) {
        setDeployMode(false);
        // If this is a jump/chain_jump and push variants exist, enter pending push mode
        if (
          (clickedMove.type === "JUMP" || clickedMove.type === "CHAIN_JUMP") &&
          !clickedMove.sacrifice &&
          pushVariants.length > 0
        ) {
          setPendingPush({ baseMove: clickedMove, pushMoves: pushVariants });
          setSelectedPieceId(null);
          setValidMoves([]);
          setMessage("Click an adjacent enemy to PUSH, or click elsewhere to skip.");
          return;
        }
        executeMove(clickedMove, game, game.state);
        return;
      }
      // If only push variants matched (no base move), just execute the first
      if (pushVariants.length > 0 && baseMoves.length === 0) {
        setDeployMode(false);
        executeMove(pushVariants[0], game, game.state);
        return;
      }

      // Check if clicking own piece (exit deploy mode)
      const clickedPiece = Object.values(state.pieces).find(
        (p) => p.q === q && p.r === r && p.player === state.currentPlayer
      );
      if (clickedPiece) {
        setDeployMode(false);
        setSelectedPieceId(clickedPiece.id);
        const moves = game.genMoves(game.state, clickedPiece);
        setValidMoves(moves);
        const captures = moves.filter(
          (m) =>
            (m.type === "JUMP" && m.isCapture) ||
            (m.type === "CHAIN_JUMP" && (m.enemyKills ?? 0) > 0)
        ).length;
        const pushes = moves.filter((m) => m.type === "PUSH").length;
        let msg = `Selected piece. ${moves.length} moves.`;
        if (captures) msg += ` ${captures} capture(s)!`;
        if (pushes) msg += ` ${pushes} push(es).`;
        setMessage(msg);
        return;
      }

      // Check if clicking an empty deploy zone hex — auto-deploy
      if (
        config.deployEnabled &&
        (state.reservePieces?.[state.currentPlayer] ?? 0) > 0
      ) {
        const allM = game.allMoves(game.state);
        const deployMove = allM.find(
          (m) => m.type === "DEPLOY" && m.destQ === q && m.destR === r
        );
        if (deployMove) {
          executeMove(deployMove, game, game.state);
          return;
        }
      }

      // Deselect
      setDeployMode(false);
      setSelectedPieceId(null);
      setValidMoves([]);
      setMessage(`${playerName(state.currentPlayer)}: select a piece.`);
    },
    [state, validMoves, isAI, executeMove, playerName, config]
  );

  // --- Deploy mode ---
  const handleDeployClick = useCallback(() => {
    if (state.winner !== null) return;
    if (isAI(state.currentPlayer)) return;
    if (animating.current) return;

    const game = gameRef.current;
    const allM = game.allMoves(game.state);
    const deployMoves = allM.filter((m) => m.type === "DEPLOY");
    if (!deployMoves.length) return;

    setDeployMode(true);
    setSelectedPieceId(null);
    setValidMoves(deployMoves);
    setMessage(`Select a deploy zone hex to place a reinforcement.`);
  }, [state, isAI]);

  // --- Undo ---
  const handleUndo = useCallback(() => {
    if (!history.length || state.winner !== null) return;
    const game = gameRef.current;

    if (playerCount > 2) {
      // Free-for-all: on your turn, step back past the AI seats' moves to
      // your own last turn (a human seat's undo never strands you on an AI turn)
      const newHistory = [...history];
      let prev = newHistory.pop()!;
      if (!isAI(state.currentPlayer)) {
        while (isAI(prev.state.currentPlayer) && newHistory.length) {
          prev = newHistory.pop()!;
        }
      }
      game.state = game.snapshot(prev.state);
      setHistory(newHistory);
    } else if (
      // If playing vs AI, undo both moves
      history.length >= 2 &&
      !isAI(state.currentPlayer) &&
      isAI((1 - state.currentPlayer) as 0 | 1)
    ) {
      const newHistory = [...history];
      newHistory.pop(); // AI move
      const prev = newHistory.pop()!; // player move
      game.state = game.snapshot(prev.state);
      setHistory(newHistory);
    } else {
      const newHistory = [...history];
      const prev = newHistory.pop()!;
      game.state = game.snapshot(prev.state);
      setHistory(newHistory);
    }

    setSelectedPieceId(null);
    setValidMoves([]);
    setMessage(
      `Move undone. ${playerName(game.state.currentPlayer)}'s turn.`
    );
    setState({ ...game.state });
  }, [history, state.winner, state.currentPlayer, isAI, playerName, playerCount]);

  // --- New game ---
  const handleNewGame = useCallback(() => {
    const game = gameRef.current;
    game.reset();
    setHistory([]);
    setSelectedPieceId(null);
    setValidMoves([]);
    setDeployMode(false);
    setPendingPush(null);
    aiThinking.current = false;
    setMessage(`New game! ${playerName(game.state.currentPlayer)}'s turn.`);
    setState({ ...game.state });
  }, [playerName]);

  // --- Apply new config ---
  const handleConfigChange = useCallback(
    (newConfig: GameConfig) => {
      let game: Game;
      try {
        game = new Game(newConfig);
      } catch (e) {
        // e.g. Settings changes that a 3-4 player board can't support
        setMessage(`Can't use those settings: ${(e as Error).message}`);
        return;
      }
      setConfig(newConfig);
      gameRef.current = game;
      setHistory([]);
      setSelectedPieceId(null);
      setValidMoves([]);
      setDeployMode(false);
      setPendingPush(null);
      aiThinking.current = false;
      setMessage(`Settings applied! ${playerName(game.state.currentPlayer)}'s turn.`);
      setState({ ...game.state });
    },
    [playerName]
  );

  // Reset game when a seat switches between Human and AI
  const handleSeatModeChange = useCallback(
    (seat: PlayerId, mode: PlayerMode) => {
      setSeatModes((prev) => prev.map((m, i) => (i === seat ? mode : m)));
      // Defer reset to after state update
      setTimeout(() => {
        const game = gameRef.current;
        game.reset();
        setHistory([]);
        setSelectedPieceId(null);
        setValidMoves([]);
        aiThinking.current = false;
        const first = game.state.currentPlayer;
        const firstName =
          seat === first && mode === "ai" ? `AI ${seatName(first)}` : seatName(first);
        setMessage(`New game! ${firstName} goes first.`);
        setState({ ...game.state });
      }, 0);
    },
    []
  );

  // Turn indicator
  let turnText: string;
  let turnColor: string;
  if (state.winner !== null) {
    turnText =
      state.winner === "draw"
        ? "DRAW!"
        : `${seatName(state.winner).toUpperCase()} WINS!`;
    turnColor = "border-yellow-500 text-yellow-500";
  } else {
    const cp = state.currentPlayer;
    const name = seatName(cp).toUpperCase();
    turnText = isAI(cp) ? `${name} AI THINKING...` : `${name}'S TURN`;
    turnColor = `${SEAT_COLORS[cp].border} ${SEAT_COLORS[cp].text}`;
  }

  // Free-for-all only: turn order, and legal-move counts for the scoreboard
  const turnOrder = config.turnOrder ?? seatsInPlay;
  const humanSeats = seatsInPlay.filter((p) => !isAI(p));
  const ffaSubtitle =
    humanSeats.length === 0
      ? `AI free-for-all — ${playerCount} AIs, watch them battle!`
      : humanSeats.length === 1
        ? `You are ${seatName(humanSeats[0])} — ${playerCount}-player free-for-all, last one able to move wins`
        : `${playerCount}-player free-for-all — ${seatName(turnOrder[0])} goes first`;

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-gray-200 flex flex-col items-center p-4">
      <h1 className="text-3xl font-bold tracking-[4px] text-[#e8dcc8] mb-1">
        HEXRING
      </h1>
      <p className="text-sm text-gray-500 mb-3">
        {playerCount > 2
          ? ffaSubtitle
          : redMode === "ai" && blueMode === "ai"
            ? "AI vs AI — watch them battle!"
            : redMode === "human" && blueMode === "human"
              ? "2 Player — Red goes first"
              : redMode === "ai"
                ? "You are Blue — click a piece, then click where to move"
                : "You are Red — click a piece, then click where to move"}
      </p>

      <div className="flex gap-5 items-start flex-wrap justify-center">
        {/* Board */}
        <div className="bg-[#16213e] border-2 border-[#333] rounded-xl p-4">
          <HexBoard
            pieces={state.pieces}
            validMoves={pendingPush
              ? pendingPush.pushMoves.reduce<Move[]>((acc, m) => {
                  const fup = m.followUpPush!;
                  const target = state.pieces[fup.targetId];
                  if (target) {
                    acc.push({ type: "PUSH", pieceId: m.pieceId, destQ: target.q, destR: target.r, targetId: fup.targetId, pushDest: fup.pushDest });
                  }
                  return acc;
                }, [])
              : validMoves
            }
            selectedPieceId={selectedPieceId}
            currentPlayer={state.currentPlayer}
            isInteractive={!isAI(state.currentPlayer) && state.winner === null && !animating.current}
            onHexClick={handleHexClick}
            config={config}
            animOverride={animOverride}
            deadCells={state.deadCells ?? []}
            eliminated={playerCount > 2 ? state.eliminated : undefined}
          />
        </div>

        {/* Info panel */}
        <div className="w-[300px] flex flex-col gap-3">
          {/* Turn indicator */}
          <div
            className={`bg-[#16213e] border-2 rounded-xl p-3 text-center text-lg font-bold ${turnColor}`}
          >
            {turnText}
          </div>

          {/* Mode selectors (one per seat) */}
          <div className={playerCount > 2 ? "grid grid-cols-2 gap-2" : "flex gap-2"}>
            {seatsInPlay.map((seat) => (
              <label key={seat} className="flex-1 text-sm text-gray-400">
                {seatName(seat)}:{" "}
                <select
                  value={seatModes[seat]}
                  onChange={(e) =>
                    handleSeatModeChange(seat, e.target.value as PlayerMode)
                  }
                  className="bg-[#1a1a2e] text-gray-200 border border-[#555] rounded px-1 py-0.5"
                >
                  <option value="human">Human</option>
                  <option value="ai">AI</option>
                </select>
              </label>
            ))}
          </div>

          {/* Free-for-all AI has no levels */}
          {playerCount > 2 && seatsInPlay.some((p) => isAI(p)) && (
            <div className="text-xs text-gray-500">
              AI seats play greedy: the move that leaves them the most moves
              and the strongest rival the fewest.
            </div>
          )}

          {/* AI difficulty */}
          {playerCount === 2 && (redMode === "ai" || blueMode === "ai") && (
            <label className="text-sm text-gray-400">
              AI Level:{" "}
              <select
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(Number(e.target.value) as AIDifficulty)
                }
                className="bg-[#1a1a2e] text-gray-200 border border-[#555] rounded px-1 py-0.5"
              >
                {([1, 2, 3, 4, 5, 6] as AIDifficulty[]).map((d) => (
                  <option key={d} value={d}>
                    {d} — {DIFFICULTY_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Trail piece types (full Trail board only: the special
              slots are defined on the radius-5 starts) */}
          {config.trailMode && config.boardRadius > 3 && playerCount === 2 && (
            <label className="text-sm text-gray-400">
              Pieces:{" "}
              <select
                value={config.trailPieces}
                onChange={(e) =>
                  handleConfigChange(
                    withTrailPieces(config, e.target.value as TrailPiecesVariant)
                  )
                }
                className="bg-[#1a1a2e] text-gray-200 border border-[#555] rounded px-1 py-0.5"
              >
                <option value="uniform">Uniform (all soldiers)</option>
                <option value="scouts">Scouts ×2 (range 3)</option>
                <option value="hoppers">Hoppers ×2</option>
                <option value="hopper1">Hopper ×1</option>
              </select>
            </label>
          )}

          {/* Trail player count: 2-player Trail or a free-for-all board */}
          {config.trailMode && (
            <label className="text-sm text-gray-400">
              Players:{" "}
              <select
                value={playerCount > 2 ? (ffaPreset?.id ?? "custom") : "2p"}
                onChange={(e) => {
                  const preset = TRAIL_FFA_PRESETS.find((p) => p.id === e.target.value);
                  if (e.target.value === "2p") handleConfigChange(TRAIL_CONFIG);
                  else if (preset) handleConfigChange(preset.config);
                }}
                className="bg-[#1a1a2e] text-gray-200 border border-[#555] rounded px-1 py-0.5"
              >
                <option value="2p">2 players (Trail)</option>
                {TRAIL_FFA_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                {playerCount > 2 && !ffaPreset && (
                  <option value="custom" disabled>
                    {playerCount} players (custom board)
                  </option>
                )}
              </select>
            </label>
          )}

          {/* Scoreboard */}
          {playerCount > 2 ? (
            <div className="bg-[#16213e] border-2 border-[#333] rounded-xl p-3 flex flex-col gap-1.5">
              {turnOrder.map((seat) => {
                const outAt = state.eliminated.indexOf(seat);
                const toMove = state.winner === null && state.currentPlayer === seat;
                const pieces = Object.values(state.pieces).filter((p) => p.player === seat).length;
                return (
                  <div
                    key={seat}
                    className={`flex items-center justify-between text-sm ${outAt >= 0 ? "opacity-50" : ""}`}
                  >
                    <span className={`font-bold ${SEAT_COLORS[seat].text}`}>
                      {toMove ? "▶ " : ""}
                      {playerName(seat)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {state.winner === seat
                        ? "WINNER"
                        : outAt >= 0
                          ? `out ${outAt + 1}${["st", "nd", "rd"][outAt] ?? "th"}`
                          : `${pieces} pieces · ${rules.allMoves(state, seat).length} moves`}
                    </span>
                  </div>
                );
              })}
              <div className="text-xs text-gray-500 text-center mt-1">
                {state.deadCells?.length ?? 0} hexes dead · no move = out
              </div>
            </div>
          ) : (
          <div className="bg-[#16213e] border-2 border-[#333] rounded-xl p-4 flex justify-around">
            <div className="text-center">
              <div className="text-sm font-bold text-red-500">
                {isAI(0) ? "AI Red" : "Red"}
              </div>
              <div className="text-4xl font-bold text-red-500">{redCount}</div>
              <div className="text-xs text-gray-500">
                {config.trailMode
                  ? `${state.deadCells?.length ?? 0} hexes dead`
                  : `${redKills}/${killTarget} kills`}
              </div>
              {config.deployEnabled && (
                <div className="text-xs text-cyan-400 mt-0.5">
                  +{state.reservePieces?.[0] ?? 0} reserve
                </div>
              )}
            </div>
            <div className="text-2xl text-gray-600 self-center">vs</div>
            <div className="text-center">
              <div className="text-sm font-bold text-blue-500">
                {isAI(1) ? "AI Blue" : "Blue"}
              </div>
              <div className="text-4xl font-bold text-blue-500">
                {blueCount}
              </div>
              <div className="text-xs text-gray-500">
                {config.trailMode
                  ? "no move = loss"
                  : `${blueKills}/${killTarget} kills`}
              </div>
              {config.deployEnabled && (
                <div className="text-xs text-cyan-400 mt-0.5">
                  +{state.reservePieces?.[1] ?? 0} reserve
                </div>
              )}
            </div>
          </div>
          )}

          {/* Status */}
          <div className="bg-[#16213e] border-2 border-[#333] rounded-xl p-4 min-h-[70px]">
            <div className="text-xs text-gray-500 uppercase tracking-wider">
              Status
            </div>
            <div className="text-sm mt-1 leading-relaxed">{message}</div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleNewGame}
              className="flex-1 py-2.5 text-base cursor-pointer border-2 border-[#555] rounded-md bg-[#1a1a2e] text-gray-200 hover:bg-[#2d3a5c] hover:border-gray-400 transition-all"
            >
              New Game
            </button>
            <button
              onClick={handleUndo}
              className="flex-1 py-2.5 text-base cursor-pointer border-2 border-[#555] rounded-md bg-[#1a1a2e] text-gray-200 hover:bg-[#2d3a5c] hover:border-gray-400 transition-all"
            >
              Undo
            </button>
          </div>
          {config.deployEnabled && !isAI(state.currentPlayer) && state.winner === null && (state.reservePieces?.[state.currentPlayer] ?? 0) > 0 && (
            <button
              onClick={handleDeployClick}
              className={`w-full py-2 text-sm cursor-pointer border-2 rounded-md transition-all ${
                deployMode
                  ? "border-cyan-400 bg-cyan-900/30 text-cyan-300"
                  : "border-cyan-700 bg-[#1a1a2e] text-cyan-400 hover:bg-cyan-900/20 hover:border-cyan-500"
              }`}
            >
              Deploy Reinforcement ({state.reservePieces?.[state.currentPlayer] ?? 0} left)
            </button>
          )}
          <a
            href={`/play/${Math.random().toString(36).slice(2, 8)}`}
            className="w-full py-2.5 text-base text-center cursor-pointer border-2 border-emerald-700 rounded-md bg-[#1a1a2e] text-emerald-400 hover:bg-emerald-900/30 hover:border-emerald-500 transition-all block"
          >
            Play Online
          </a>
          <button
            onClick={() =>
              handleConfigChange(config.trailMode ? DEFAULT_CONFIG : TRAIL_CONFIG)
            }
            className="w-full py-2.5 text-base cursor-pointer border-2 border-amber-700 rounded-md bg-[#1a1a2e] text-amber-400 hover:bg-amber-900/30 hover:border-amber-500 transition-all"
          >
            {config.trailMode
              ? "Back to Standard HexRing"
              : "Play Trail — asymmetric pits"}
          </button>
          {config.trailMode && (
            <button
              onClick={() =>
                handleConfigChange(
                  config.trailMoveRange === 1 && config.boardRadius === 3
                    ? TRAIL_CONFIG
                    : MINI_CONFIG
                )
              }
              className="w-full py-2 text-sm cursor-pointer border-2 border-teal-700 rounded-md bg-[#1a1a2e] text-teal-400 hover:bg-teal-900/30 hover:border-teal-500 transition-all"
            >
              {config.trailMoveRange === 1 && config.boardRadius === 3
                ? "Back to Full Trail"
                : "Play Trail Mini — 3v3, step 1"}
            </button>
          )}

          {/* Settings */}
          <SettingsPanel config={config} onApply={handleConfigChange} />

          {/* Legend */}
          <div className="bg-[#16213e] border-2 border-[#333] rounded-xl p-3 text-xs leading-relaxed text-gray-400">
            <div className="text-sm text-gray-300 font-bold mb-1">
              How to Play
            </div>
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#0d0d1a] border border-[#555] mr-1 align-middle" />{" "}
            Killbox (death){" "}
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#5c4d3a] mr-1 align-middle" />{" "}
            Fortress (no push)
            {config.deployEnabled && (
              <>
                {" "}
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#2e1a1a] border border-[#6b2d2d] mr-1 align-middle" />{" "}
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#1a1a2e] border border-[#2d2d6b] mr-1 align-middle" />{" "}
                Deploy
              </>
            )}
            <br />
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#4f4] mr-1 align-middle" />{" "}
            Move{" "}
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#f90] mr-1 align-middle" />{" "}
            Push{" "}
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#f44] mr-1 align-middle" />{" "}
            Capture{" "}
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#f0f] mr-1 align-middle" />{" "}
            Chain
            {config.deployEnabled && (
              <>
                {" "}
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0cf] mr-1 align-middle" />{" "}
                Deploy
              </>
            )}
            <br />
            {config.winCondition === "first_to_kills"
              ? `First to ${killTarget} kills wins!`
              : config.winCondition === "last_standing"
                ? "Reduce opponent to 1 piece to win!"
                : config.winCondition === "no_move_loses" && playerCount > 2
                  ? `Trail free-for-all (${playerCount} players): move one of your pieces up to ${config.trailMoveRange} hex${config.trailMoveRange === 1 ? "" : "es"} through empty hexes. The hex it leaves dies forever (✕). Pits cannot be entered. Turns go ${turnOrder.map(seatName).join(" → ")}. Start your turn with no legal move and you are out: your pieces stay as grey obstacles. Last player left wins.`
                : config.winCondition === "no_move_loses"
                  ? `Trail: move a piece up to ${config.trailMoveRange} hex${config.trailMoveRange === 1 ? "" : "es"} through empty hexes. The hex it leaves dies forever (✕). Pits cannot be entered. Start your turn with no legal move and you lose.` +
                    (config.trailPieces === "scouts"
                      ? " Scouts (S) move up to 3 hexes."
                      : config.trailPieces === "hoppers" || config.trailPieces === "hopper1"
                        ? " Hoppers (H) can also hop exactly 2 hexes in a straight line over anything (piece, pit, or dead hex) to a live empty hex."
                        : "")
                  : "Eliminate all enemy pieces to win!"}
          </div>
        </div>
      </div>
    </div>
  );
}
