/**
 * DuoPlay — P2P Message Protocol
 * All messages sent over PeerJS use this union type.
 */
export type GameId =
  | 'tetris-dual'
  | 'balloon'
  | 'minesweeper'
  | 'crystal-bridge'
  | 'star-fishing'
  | 'inverse-gravity'
  | 'finger-hockey';

export type MessageType =
  | 'navigate'          // Host tells guest to switch game/view
  | 'game-start'        // Both players are ready
  | 'game-state'        // Generic game state update (game-specific payload)
  | 'player-input'      // Raw input from a player
  | 'ping'              // Latency measurement
  | 'pong';             // Latency response

// ── Navigate ─────────────────────────────────────
export interface NavigateMessage {
  type: 'navigate';
  target: 'lobby' | GameId;
}

// ── Game Start ───────────────────────────────────
export interface GameStartMessage {
  type: 'game-start';
  gameId: GameId;
}

// ── Ping / Pong ──────────────────────────────────
export interface PingMessage { type: 'ping'; ts: number; }
export interface PongMessage { type: 'pong'; ts: number; }

// ── Generic game-state / input ───────────────────
export interface GameStateMessage {
  type: 'game-state';
  gameId: GameId;
  payload: unknown; // typed per-game in each game module
}
export interface PlayerInputMessage {
  type: 'player-input';
  gameId: GameId;
  payload: unknown;
}

export type DuoPlayMessage =
  | NavigateMessage
  | GameStartMessage
  | PingMessage
  | PongMessage
  | GameStateMessage
  | PlayerInputMessage;
