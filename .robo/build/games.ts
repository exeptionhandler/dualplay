/**
 * DuoPlay — Game Stubs (Fase 2)
 *
 * Each game exports a class with a common interface:
 *   init(canvas, role, sendFn)  — set up canvas, start game loop
 *   destroy()                   — clean up, cancel RAF, remove listeners
 *
 * Sync protocol for each game is documented in comments below.
 * Real logic will be filled in Fase 2, one game at a time.
 */

import type { DuoPlayMessage } from './types';

export type Role = 'host' | 'guest'; // We will map Discord users to host/guest later
export type SendFn = (msg: DuoPlayMessage) => void;

export interface GameModule {
  init(canvas: HTMLCanvasElement, role: Role, send: SendFn): void;
  onMessage(msg: DuoPlayMessage): void;
  destroy(): void;
}

// ─────────────────────────────────────────────────────────
// 1. TETRIS DUAL (Simultáneo)
//
// Sync protocol:
//   Host & Guest both send game-state every frame (or on piece move):
//   payload: {
//     board: number[][]        // 20×20 shared matrix (0=empty, 1..7=color)
//     myPiece:  { x,y,shape }  // sender's active piece
//     oppPiece: { x,y,shape }  // opponent's active piece (echoed back)
//     score: number
//   }
// ─────────────────────────────────────────────────────────
export class TetrisDual implements GameModule {
  init(_canvas: HTMLCanvasElement, _role: Role, _send: SendFn): void {
    // TODO: Fase 2 — draw grid, spawn pieces, game loop, P2P sync
    console.log('[TetrisDual] stub — Fase 2');
  }
  onMessage(_msg: DuoPlayMessage): void { /* TODO */ }
  destroy(): void { /* TODO */ }
}

// ─────────────────────────────────────────────────────────
// 2. NO DEJES CAER EL GLOBO (Co-op)
//
// Sync protocol:
//   Either player sends on touch:
//   payload: { posY: number, velY: number, ts: number }
//   Host is authoritative; guest applies received state with lerp.
// ─────────────────────────────────────────────────────────
export class BalloonGame implements GameModule {
  init(_canvas: HTMLCanvasElement, _role: Role, _send: SendFn): void {
    console.log('[BalloonGame] stub — Fase 2');
  }
  onMessage(_msg: DuoPlayMessage): void { /* TODO */ }
  destroy(): void { /* TODO */ }
}

// ─────────────────────────────────────────────────────────
// 3. BUSCAMINAS EN PAREJA
//
// Sync protocol:
//   On reveal/flag:
//   payload: {
//     action: 'reveal' | 'flag' | 'unflag'
//     x: number, y: number
//     board?: CellState[][]  // full board sent after reveal (from host)
//   }
// ─────────────────────────────────────────────────────────
export class MinesweeperGame implements GameModule {
  init(_canvas: HTMLCanvasElement, _role: Role, _send: SendFn): void {
    console.log('[MinesweeperGame] stub — Fase 2');
  }
  onMessage(_msg: DuoPlayMessage): void { /* TODO */ }
  destroy(): void { /* TODO */ }
}

// ─────────────────────────────────────────────────────────
// 4. PUENTE DE CRISTAL (Memoria asimétrica)
//
// Sync protocol:
//   Guest (mover) sends input:
//   payload: { action: 'step', tileIndex: number }
//
//   Host (seer) responds:
//   payload: { result: 'safe' | 'break', avatarX: number, avatarY: number }
// ─────────────────────────────────────────────────────────
export class CrystalBridgeGame implements GameModule {
  init(_canvas: HTMLCanvasElement, _role: Role, _send: SendFn): void {
    console.log('[CrystalBridgeGame] stub — Fase 2');
  }
  onMessage(_msg: DuoPlayMessage): void { /* TODO */ }
  destroy(): void { /* TODO */ }
}

// ─────────────────────────────────────────────────────────
// 5. PESCA ESTELAR (Simultaneous tap sync)
//
// Sync protocol:
//   On star tap:
//   payload: { starId: string, ts: number, x: number, y: number }
//   Host compares timestamps; if |ts1 - ts2| < 200ms, star is caught.
//
//   Star positions broadcast by host:
//   payload: { stars: Array<{ id, x, y, vel }> }
// ─────────────────────────────────────────────────────────
export class StarFishingGame implements GameModule {
  init(_canvas: HTMLCanvasElement, _role: Role, _send: SendFn): void {
    console.log('[StarFishingGame] stub — Fase 2');
  }
  onMessage(_msg: DuoPlayMessage): void { /* TODO */ }
  destroy(): void { /* TODO */ }
}

// ─────────────────────────────────────────────────────────
// 6. GRAVEDAD INVERTIDA (Auto-scroller)
//
// Sync protocol:
//   Host (P1) sends on gravity flip:
//   payload: { gravityFlipped: boolean, posY: number, obstacles: ObstacleState[] }
//
//   Guest (P2) sends on jump/shield:
//   payload: { action: 'jump' | 'shield' }
// ─────────────────────────────────────────────────────────
export class InverseGravityGame implements GameModule {
  init(_canvas: HTMLCanvasElement, _role: Role, _send: SendFn): void {
    console.log('[InverseGravityGame] stub — Fase 2');
  }
  onMessage(_msg: DuoPlayMessage): void { /* TODO */ }
  destroy(): void { /* TODO */ }
}

// ─────────────────────────────────────────────────────────
// 7. HOCKEY DE DEDOS (2 jugadores vs IA)
//
// Sync protocol:
//   Host is physics authority; sends every frame:
//   payload: { puck: { x,y,vx,vy }, aiMallet: { x,y } }
//
//   Each player sends their mallet position on touch move:
//   payload: { mallet: { x, y } }
// ─────────────────────────────────────────────────────────
export class FingerHockeyGame implements GameModule {
  init(_canvas: HTMLCanvasElement, _role: Role, _send: SendFn): void {
    console.log('[FingerHockeyGame] stub — Fase 2');
  }
  onMessage(_msg: DuoPlayMessage): void { /* TODO */ }
  destroy(): void { /* TODO */ }
}

// ── Factory ────────────────────────────────────────────
export const GAME_MODULES: Record<string, () => GameModule> = {
  'tetris-dual':       () => new TetrisDual(),
  'balloon':           () => new BalloonGame(),
  'minesweeper':       () => new MinesweeperGame(),
  'crystal-bridge':    () => new CrystalBridgeGame(),
  'star-fishing':      () => new StarFishingGame(),
  'inverse-gravity':   () => new InverseGravityGame(),
  'finger-hockey':     () => new FingerHockeyGame(),
};
