import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Key } from "chessground/types";
import { useEffect, useRef } from "react";
import { isInCheck, legalDests, turnColor, type Color } from "../chess/moves";

export interface BoardArrow {
  from: string;
  to: string;
  brush: "best" | "played";
}

interface BoardProps {
  fen: string;
  orientation: Color;
  lastMove?: { from: string; to: string };
  interactive: boolean;
  arrows: BoardArrow[];
  /** Changing this puts the pieces back on `fen`, undoing the user's attempt. */
  resetKey: number;
  onMove: (from: string, to: string) => void;
}

export function Board(props: BoardProps) {
  const { fen, orientation, lastMove, interactive, arrows, resetKey, onMove } = props;
  const element = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const moveHandler = useRef(onMove);
  moveHandler.current = onMove;

  useEffect(() => {
    if (!element.current) return;
    const board = Chessground(element.current, {
      animation: { enabled: true, duration: 220 },
      coordinates: true,
      draggable: { showGhost: true },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      drawable: {
        enabled: false,
        brushes: {
          green: { key: "g", color: "#57c7a3", opacity: 0.92, lineWidth: 9 },
          red: { key: "r", color: "#ef7a5f", opacity: 0.8, lineWidth: 7 },
          blue: { key: "b", color: "#6ba8d8", opacity: 0.8, lineWidth: 10 },
          yellow: { key: "y", color: "#e4b655", opacity: 0.8, lineWidth: 10 },
        },
      },
      movable: { events: { after: (from, to) => moveHandler.current(from, to) } },
    });
    api.current = board;
    return () => {
      board.destroy();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    api.current?.set({
      fen,
      orientation,
      turnColor: turnColor(fen),
      check: isInCheck(fen),
      lastMove: lastMove ? [lastMove.from as Key, lastMove.to as Key] : undefined,
    });
  }, [fen, orientation, lastMove, resetKey]);

  useEffect(() => {
    api.current?.set({
      movable: {
        free: false,
        showDests: true,
        color: interactive ? turnColor(fen) : undefined,
        dests: interactive ? (legalDests(fen) as Map<Key, Key[]>) : new Map(),
      },
    });
  }, [fen, interactive, resetKey]);

  useEffect(() => {
    api.current?.setAutoShapes(
      arrows.map(({ from, to, brush }) => ({
        orig: from as Key,
        dest: to as Key,
        brush: brush === "best" ? "green" : "red",
      })),
    );
  }, [arrows]);

  return <div ref={element} className="cg-wrap board" />;
}
