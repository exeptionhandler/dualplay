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

import type { Sync } from '@robojs/sync';

export interface GameContext {
  canvas: HTMLCanvasElement;
  sync: Sync;
  me: any;
  isHost: boolean;
}

export interface GameModule {
  init(ctx: GameContext): void;
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
const TETROMINOS = [
  [], // 0 = empty
  // 1: I (Cyan/Blue)
  [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
  // 2: J (Blue/Purple)
  [[2,0,0], [2,2,2], [0,0,0]],
  // 3: L (Orange)
  [[0,0,3], [3,3,3], [0,0,0]],
  // 4: O (Yellow)
  [[4,4], [4,4]],
  // 5: S (Green)
  [[0,5,5], [5,5,0], [0,0,0]],
  // 6: T (Purple/Pink)
  [[0,6,0], [6,6,6], [0,0,0]],
  // 7: Z (Red)
  [[7,7,0], [0,7,7], [0,0,0]]
];

const COLORS = [
  'transparent',
  'var(--accent-blue)',   // I
  '#a29bfe',              // J
  'var(--accent-yellow)', // L (using yellow, or an orange if available, let's use yellow)
  '#ffeaa7',              // O
  'var(--accent-green)',  // S
  'var(--accent-purple)', // T
  'var(--accent-red)'     // Z
];

interface PieceState {
  x: number;
  y: number;
  id: number;
  rot: number;
  active: boolean;
}

export class TetrisDual implements GameModule {
  private ctx!: GameContext;
  private animId = 0;
  private canvasCtx!: CanvasRenderingContext2D;
  
  private COLS = 20;
  private ROWS = 20;
  
  // Host state
  private board: number[][] = [];
  private p1: PieceState = { x: 5, y: 0, id: 1, rot: 0, active: false };
  private p2: PieceState = { x: 13, y: 0, id: 2, rot: 0, active: false };
  
  private tickTimer = 0;
  private tickRate = 600; // ms per drop
  private lastTime = 0;
  
  // UI Buttons
  private buttons = [
    { id: 'left',  x: 0.1, y: 0.85, w: 0.18, h: 0.1, text: '◀' },
    { id: 'right', x: 0.3, y: 0.85, w: 0.18, h: 0.1, text: '▶' },
    { id: 'drop',  x: 0.5, y: 0.85, w: 0.18, h: 0.1, text: '▼' },
    { id: 'rot',   x: 0.72, y: 0.85, w: 0.18, h: 0.1, text: '↻' }
  ];
  
  private lastInputTs = 0;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;
    
    // Init board
    for (let r = 0; r < this.ROWS; r++) {
      this.board[r] = new Array(this.COLS).fill(0);
    }
    
    ctx.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('keydown', this.onKeyDown);
    
    if (ctx.isHost) {
      this.spawn(this.p1, 4);
      this.spawn(this.p2, 14);
      this.broadcastState();
    }

    ctx.sync.on('stateChange', this.onStateChange);
    this.lastTime = Date.now();
    this.loop();
  }

  private spawn(p: PieceState, startX: number) {
    p.id = Math.floor(Math.random() * 7) + 1;
    p.rot = 0;
    p.x = startX;
    p.y = 0;
    p.active = true;
    if (this.collides(p)) {
      // Game over logic could go here
      this.board = Array(this.ROWS).fill(0).map(() => new Array(this.COLS).fill(0));
    }
  }

  private getShape(id: number, rot: number): number[][] {
    const shape = TETROMINOS[id];
    let res = shape;
    for (let i = 0; i < rot % 4; i++) {
      const N = res.length;
      const rotated = Array(N).fill(0).map(() => new Array(N).fill(0));
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          rotated[c][N - 1 - r] = res[r][c];
        }
      }
      res = rotated;
    }
    return res;
  }

  private collides(p: PieceState, dx=0, dy=0, dr=0): boolean {
    if (!p.active) return false;
    const shape = this.getShape(p.id, p.rot + dr);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] !== 0) {
          const nx = p.x + c + dx;
          const ny = p.y + r + dy;
          if (nx < 0 || nx >= this.COLS || ny >= this.ROWS) return true;
          if (ny >= 0 && this.board[ny][nx] !== 0) return true;
        }
      }
    }
    return false;
  }

  // Check collision against the OTHER active piece
  private collidesWithOther(p1: PieceState, p2: PieceState, dx=0, dy=0, dr=0): boolean {
    if (!p1.active || !p2.active) return false;
    const s1 = this.getShape(p1.id, p1.rot + dr);
    const s2 = this.getShape(p2.id, p2.rot);
    for (let r1 = 0; r1 < s1.length; r1++) {
      for (let c1 = 0; c1 < s1[r1].length; c1++) {
        if (s1[r1][c1] === 0) continue;
        const x1 = p1.x + c1 + dx;
        const y1 = p1.y + r1 + dy;
        
        for (let r2 = 0; r2 < s2.length; r2++) {
          for (let c2 = 0; c2 < s2[r2].length; c2++) {
            if (s2[r2][c2] === 0) continue;
            if (x1 === p2.x + c2 && y1 === p2.y + r2) return true;
          }
        }
      }
    }
    return false;
  }

  private lock(p: PieceState) {
    if (!p.active) return;
    const shape = this.getShape(p.id, p.rot);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] !== 0 && p.y + r >= 0) {
          this.board[p.y + r][p.x + c] = p.id;
        }
      }
    }
    p.active = false;
  }

  private clearLines() {
    let linesCleared = 0;
    for (let r = this.ROWS - 1; r >= 0; r--) {
      if (this.board[r].every(val => val !== 0)) {
        this.board.splice(r, 1);
        this.board.unshift(new Array(this.COLS).fill(0));
        r++; // check same row again
        linesCleared++;
      }
    }
  }

  private processInput(playerId: string, action: string) {
    const p = (this.ctx.isHost && playerId === this.ctx.me.id) ? this.p1 : 
              (!this.ctx.isHost && playerId !== this.ctx.me.id) ? this.p2 : 
              (playerId === this.ctx.me.id ? this.p2 : this.p1); // Simplified mapping
    // To be precise: Let's assume P1 is always Host, P2 is Guest.
    const isP1 = (playerId === (this.ctx.isHost ? this.ctx.me.id : this.getOpponentId()));
    const targetP = isP1 ? this.p1 : this.p2;
    const otherP = isP1 ? this.p2 : this.p1;

    if (!targetP.active) return;

    let dx = 0, dy = 0, dr = 0;
    if (action === 'left') dx = -1;
    if (action === 'right') dx = 1;
    if (action === 'rot') dr = 1;
    if (action === 'drop') dy = 1;

    if (!this.collides(targetP, dx, dy, dr) && !this.collidesWithOther(targetP, otherP, dx, dy, dr)) {
      targetP.x += dx;
      targetP.y += dy;
      targetP.rot += dr;
    }
    
    if (this.ctx.isHost) this.broadcastState();
  }

  private getOpponentId() {
    // In a 2 player game, the one who is not me
    return 'guest_id'; // Robo Sync doesn't easily expose participant list outside, but we can rely on state ownership or just a generic ID since Discord SDK handles connection. 
    // Actually, we'll just check if the input came from me. If so, P1 (if host) or P2 (if guest).
  }

  private onPointerDown = (e: PointerEvent) => {
    const rect = this.ctx.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    for (const b of this.buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        this.sendInput(b.id);
        break;
      }
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') this.sendInput('left');
    if (e.key === 'ArrowRight') this.sendInput('right');
    if (e.key === 'ArrowUp') this.sendInput('rot');
    if (e.key === 'ArrowDown') this.sendInput('drop');
  };

  private sendInput(action: string) {
    // Predict locally for instant feedback if we know which piece is ours
    const myPiece = this.ctx.isHost ? this.p1 : this.p2;
    const otherPiece = this.ctx.isHost ? this.p2 : this.p1;
    
    let dx = 0, dy = 0, dr = 0;
    if (action === 'left') dx = -1;
    if (action === 'right') dx = 1;
    if (action === 'rot') dr = 1;
    if (action === 'drop') dy = 1;

    if (!this.collides(myPiece, dx, dy, dr) && !this.collidesWithOther(myPiece, otherPiece, dx, dy, dr)) {
      myPiece.x += dx;
      myPiece.y += dy;
      myPiece.rot += dr;
    }

    // Send to host
    this.ctx.sync.setState({ tInput: { act: action, ts: Date.now(), by: this.ctx.me.id } });
  }

  private broadcastState() {
    this.ctx.sync.setState({
      tState: {
        b: this.board,
        p1: this.p1,
        p2: this.p2,
        ts: Date.now()
      }
    });
  }

  private onStateChange = (state: any) => {
    if (this.ctx.isHost && state.tInput && state.tInput.ts !== this.lastInputTs) {
      this.lastInputTs = state.tInput.ts;
      // Map 'by' to the correct piece
      const isMe = state.tInput.by === this.ctx.me.id;
      // If host got input from guest:
      if (!isMe) {
        const targetP = this.p2;
        let dx = 0, dy = 0, dr = 0;
        if (state.tInput.act === 'left') dx = -1;
        if (state.tInput.act === 'right') dx = 1;
        if (state.tInput.act === 'rot') dr = 1;
        if (state.tInput.act === 'drop') dy = 1;

        if (!this.collides(targetP, dx, dy, dr) && !this.collidesWithOther(targetP, this.p1, dx, dy, dr)) {
          targetP.x += dx;
          targetP.y += dy;
          targetP.rot += dr;
          this.broadcastState();
        }
      }
    } else if (!this.ctx.isHost && state.tState) {
      // Guest receives authoritative state
      this.board = state.tState.b;
      // Snap positions (might cause slight jitter if predicting, but acceptable for simple tetris)
      this.p1 = state.tState.p1;
      this.p2 = state.tState.p2;
    }
  };

  private loop = () => {
    this.update();
    this.draw();
    this.animId = requestAnimationFrame(this.loop);
  };

  private update() {
    if (!this.ctx.isHost) return;

    const now = Date.now();
    if (now - this.lastTime > this.tickRate) {
      this.lastTime = now;
      
      // Move P1 down
      if (this.p1.active) {
        if (!this.collides(this.p1, 0, 1) && !this.collidesWithOther(this.p1, this.p2, 0, 1)) {
          this.p1.y++;
        } else {
          this.lock(this.p1);
          this.clearLines();
          this.spawn(this.p1, 4);
        }
      }

      // Move P2 down
      if (this.p2.active) {
        if (!this.collides(this.p2, 0, 1) && !this.collidesWithOther(this.p2, this.p1, 0, 1)) {
          this.p2.y++;
        } else {
          this.lock(this.p2);
          this.clearLines();
          this.spawn(this.p2, 14);
        }
      }
      
      this.broadcastState();
    }
  }

  private draw() {
    const c = this.canvasCtx;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;
    
    c.clearRect(0, 0, w, h);
    
    // Draw Area (Top 80% for board, bottom 20% for buttons)
    const boardH = h * 0.8;
    const cellSize = Math.min(w / this.COLS, boardH / this.ROWS);
    const offsetX = (w - (cellSize * this.COLS)) / 2;
    const offsetY = (boardH - (cellSize * this.ROWS)) / 2;

    c.save();
    c.translate(offsetX, offsetY);

    // Draw Grid Background
    c.strokeStyle = 'rgba(0,0,0,0.05)';
    c.lineWidth = 1;
    for (let r = 0; r <= this.ROWS; r++) {
      c.beginPath(); c.moveTo(0, r * cellSize); c.lineTo(this.COLS * cellSize, r * cellSize); c.stroke();
    }
    for (let col = 0; col <= this.COLS; col++) {
      c.beginPath(); c.moveTo(col * cellSize, 0); c.lineTo(col * cellSize, this.ROWS * cellSize); c.stroke();
    }

    // Draw Locked Board
    for (let r = 0; r < this.ROWS; r++) {
      for (let col = 0; col < this.COLS; col++) {
        if (this.board[r][col] !== 0) {
          this.drawBlock(c, col, r, cellSize, this.board[r][col]);
        }
      }
    }

    // Draw Active Pieces
    if (this.p1.active) this.drawPiece(c, this.p1, cellSize);
    if (this.p2.active) this.drawPiece(c, this.p2, cellSize);

    // Border
    c.strokeStyle = 'var(--ink-primary)';
    c.lineWidth = 4;
    c.strokeRect(0, 0, this.COLS * cellSize, this.ROWS * cellSize);
    c.restore();

    // Draw Buttons (Bottom 20%)
    c.font = '30px "Patrick Hand", cursive';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    
    for (const b of this.buttons) {
      const bx = b.x * w;
      const by = b.y * h;
      const bw = b.w * w;
      const bh = b.h * h;

      c.fillStyle = 'white';
      c.strokeStyle = 'var(--ink-primary)';
      c.lineWidth = 3;
      c.beginPath();
      c.roundRect(bx, by, bw, bh, 10);
      c.fill();
      c.stroke();
      
      c.fillStyle = 'var(--ink-primary)';
      c.fillText(b.text, bx + bw/2, by + bh/2);
    }
  }

  private drawPiece(c: CanvasRenderingContext2D, p: PieceState, size: number) {
    const shape = this.getShape(p.id, p.rot);
    for (let r = 0; r < shape.length; r++) {
      for (let col = 0; col < shape[r].length; col++) {
        if (shape[r][col] !== 0) {
          this.drawBlock(c, p.x + col, p.y + r, size, p.id);
        }
      }
    }
  }

  private drawBlock(c: CanvasRenderingContext2D, x: number, y: number, size: number, id: number) {
    const pad = 2;
    c.fillStyle = COLORS[id];
    c.strokeStyle = 'var(--ink-primary)';
    c.lineWidth = 2;
    
    // Doodle slightly irregular fill
    c.beginPath();
    c.rect(x * size + pad, y * size + pad, size - pad*2, size - pad*2);
    c.fill();
    c.stroke();
    
    // Mini highlight
    c.fillStyle = 'rgba(255,255,255,0.4)';
    c.beginPath();
    c.arc(x * size + pad + 4, y * size + pad + 4, 2, 0, Math.PI*2);
    c.fill();
  }

  destroy(): void {
    cancelAnimationFrame(this.animId);
    this.ctx.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('keydown', this.onKeyDown);
    this.ctx.sync.off('stateChange', this.onStateChange);
  }
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
  private ctx!: GameContext;
  private animId = 0;
  private canvasCtx!: CanvasRenderingContext2D;
  
  // Physics state
  private balloon = { x: 0, y: 0, vy: 0, radius: 40 };
  private gravity = 0.4;
  private jumpForce = -9;
  private syncInterval: any = null;
  private lastPulseTs = 0;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;
    
    this.balloon.x = ctx.canvas.width / 2;
    this.balloon.y = ctx.canvas.height / 2;
    
    ctx.canvas.addEventListener('pointerdown', this.onTap);
    
    if (ctx.isHost) {
      this.syncInterval = setInterval(() => {
        ctx.sync.setState({
          balloonState: { y: this.balloon.y, vy: this.balloon.vy, ts: Date.now() }
        });
      }, 100);
    }

    ctx.sync.on('stateChange', this.onStateChange);
    this.loop();
  }

  private onTap = () => {
    this.balloon.vy = this.jumpForce;
    if (!this.ctx.isHost) {
      // Guest sends pulse to host
      this.ctx.sync.setState({ pulse: { ts: Date.now(), by: this.ctx.me.id } });
    }
  };

  private onStateChange = (state: any) => {
    if (this.ctx.isHost && state.pulse && state.pulse.ts !== this.lastPulseTs) {
      this.lastPulseTs = state.pulse.ts;
      this.balloon.vy = this.jumpForce;
    } else if (!this.ctx.isHost && state.balloonState) {
      // Simple client-side reconciliation / hard snap for now
      this.balloon.y = state.balloonState.y;
      // We don't snap vy, we let local physics run to keep it smooth, 
      // but syncing y is enough to keep them close.
    }
  };

  private loop = () => {
    this.update();
    this.draw();
    this.animId = requestAnimationFrame(this.loop);
  };

  private update() {
    this.balloon.vy += this.gravity;
    this.balloon.y += this.balloon.vy;
    
    const h = this.ctx.canvas.height;
    if (this.balloon.y + this.balloon.radius > h) {
      this.balloon.y = h - this.balloon.radius;
      this.balloon.vy = -this.balloon.vy * 0.4;
    }
    if (this.balloon.y - this.balloon.radius < 0) {
      this.balloon.y = this.balloon.radius;
      this.balloon.vy = 0;
    }
  }

  private draw() {
    const c = this.canvasCtx;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;
    
    c.clearRect(0, 0, w, h);
    
    c.save();
    c.translate(this.balloon.x, this.balloon.y);
    
    // Doodle String
    c.beginPath();
    c.moveTo(0, this.balloon.radius);
    c.quadraticCurveTo(15, this.balloon.radius + 30, -5, this.balloon.radius + 70);
    c.strokeStyle = 'var(--ink-primary, #2d3436)';
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.stroke();
    
    // Doodle Balloon
    c.beginPath();
    c.arc(0, 0, this.balloon.radius, 0, Math.PI * 2);
    c.fillStyle = 'var(--accent-red, #ff7675)';
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = 'var(--ink-primary, #2d3436)';
    c.stroke();
    
    // Reflection
    c.beginPath();
    c.arc(-12, -12, 6, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fill();
    
    c.restore();
  }

  destroy(): void {
    cancelAnimationFrame(this.animId);
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.ctx.canvas.removeEventListener('pointerdown', this.onTap);
    this.ctx.sync.off('stateChange', this.onStateChange);
  }
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
  init(_ctx: GameContext): void {
    console.log('[MinesweeperGame] stub — Fase 2');
  }
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
  init(_ctx: GameContext): void {
    console.log('[CrystalBridgeGame] stub — Fase 2');
  }
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
  init(_ctx: GameContext): void {
    console.log('[StarFishingGame] stub — Fase 2');
  }
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
  init(_ctx: GameContext): void {
    console.log('[InverseGravityGame] stub — Fase 2');
  }
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
  init(_ctx: GameContext): void {
    console.log('[FingerHockeyGame] stub — Fase 2');
  }
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
