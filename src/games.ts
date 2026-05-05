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

import type { Sync } from './sync';

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
// Cell states: -1 = mine, 0..8 = adjacent mine count
// Display states: 'hidden' | 'revealed' | 'flagged'
type CellDisplay = 'hidden' | 'revealed' | 'flagged';

interface MSCell {
  value: number;    // -1 = mine, 0-8 = count
  display: CellDisplay;
}

const MS_COLS = 10;
const MS_ROWS = 12;
const MS_MINES = 18;

// Doodle number colors (hand-drawn marker style)
const MS_NUM_COLORS: Record<number, string> = {
  1: '#74b9ff', // blue
  2: '#55efc4', // green
  3: '#ff7675', // red
  4: '#a29bfe', // purple
  5: '#d63031', // dark red
  6: '#00cec9', // teal
  7: '#2d3436', // black
  8: '#636e72', // gray
};

export class MinesweeperGame implements GameModule {
  private ctx!: GameContext;
  private animId = 0;
  private canvasCtx!: CanvasRenderingContext2D;

  private board: MSCell[][] = [];
  private gameOver = false;
  private won = false;
  private flagMode = false;
  private lastActionTs = 0;
  private generated = false; // mines placed after first tap

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;
    this.gameOver = false;
    this.won = false;
    this.flagMode = false;
    this.generated = false;

    // Init empty board
    this.board = [];
    for (let r = 0; r < MS_ROWS; r++) {
      this.board[r] = [];
      for (let c = 0; c < MS_COLS; c++) {
        this.board[r][c] = { value: 0, display: 'hidden' };
      }
    }

    ctx.canvas.addEventListener('pointerdown', this.onPointerDown);
    ctx.sync.on('stateChange', this.onStateChange);

    // If Host, broadcast initial empty board
    if (ctx.isHost) {
      this.broadcastBoard();
    }

    this.loop();
  }

  // ── Mine Placement (Host only, after first tap) ──
  private placeMines(safeR: number, safeC: number) {
    let placed = 0;
    while (placed < MS_MINES) {
      const r = Math.floor(Math.random() * MS_ROWS);
      const c = Math.floor(Math.random() * MS_COLS);
      // Don't place on or adjacent to the first tap
      if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
      if (this.board[r][c].value === -1) continue;
      this.board[r][c].value = -1;
      placed++;
    }
    // Calculate adjacency numbers
    for (let r = 0; r < MS_ROWS; r++) {
      for (let c = 0; c < MS_COLS; c++) {
        if (this.board[r][c].value === -1) continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < MS_ROWS && nc >= 0 && nc < MS_COLS && this.board[nr][nc].value === -1) {
              count++;
            }
          }
        }
        this.board[r][c].value = count;
      }
    }
    this.generated = true;
  }

  // ── Flood-fill reveal ──
  private reveal(r: number, c: number) {
    if (r < 0 || r >= MS_ROWS || c < 0 || c >= MS_COLS) return;
    const cell = this.board[r][c];
    if (cell.display !== 'hidden') return;

    cell.display = 'revealed';

    if (cell.value === -1) {
      // BOOM — reveal all mines
      this.gameOver = true;
      this.won = false;
      for (let rr = 0; rr < MS_ROWS; rr++) {
        for (let cc = 0; cc < MS_COLS; cc++) {
          if (this.board[rr][cc].value === -1) this.board[rr][cc].display = 'revealed';
        }
      }
      return;
    }

    if (cell.value === 0) {
      // Flood fill empty cells
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          this.reveal(r + dr, c + dc);
        }
      }
    }
  }

  // ── Win check ──
  private checkWin(): boolean {
    for (let r = 0; r < MS_ROWS; r++) {
      for (let c = 0; c < MS_COLS; c++) {
        const cell = this.board[r][c];
        if (cell.value !== -1 && cell.display !== 'revealed') return false;
      }
    }
    return true;
  }

  // ── Toggle flag ──
  private toggleFlag(r: number, c: number) {
    const cell = this.board[r][c];
    if (cell.display === 'revealed') return;
    cell.display = cell.display === 'flagged' ? 'hidden' : 'flagged';
  }

  // ── Pointer handler ──
  private onPointerDown = (e: PointerEvent) => {
    if (this.gameOver || this.won) {
      // Tap to restart
      if (this.ctx.isHost) {
        this.restart();
        this.broadcastBoard();
      }
      return;
    }

    const rect = this.ctx.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    // Check flag toggle button (bottom-left)
    const btnW = w * 0.35;
    const btnH = h * 0.07;
    const btnX = w * 0.08;
    const btnY = h - btnH - h * 0.02;
    if (px >= btnX && px <= btnX + btnW && py >= btnY && py <= btnY + btnH) {
      this.flagMode = !this.flagMode;
      return;
    }

    // Map click to grid cell
    const boardH = h * 0.85;
    const cellSize = Math.min(w / MS_COLS, boardH / MS_ROWS);
    const offsetX = (w - cellSize * MS_COLS) / 2;
    const offsetY = (boardH - cellSize * MS_ROWS) / 2;

    const col = Math.floor((px - offsetX) / cellSize);
    const row = Math.floor((py - offsetY) / cellSize);

    if (row < 0 || row >= MS_ROWS || col < 0 || col >= MS_COLS) return;

    // Send action through sync
    this.ctx.sync.setState({
      msAction: {
        r: row, c: col,
        flag: this.flagMode,
        ts: Date.now(),
        by: this.ctx.me.id
      }
    });

    // If Host, also process locally
    if (this.ctx.isHost) {
      this.processAction(row, col, this.flagMode);
      this.broadcastBoard();
    }
  };

  private processAction(r: number, c: number, flag: boolean) {
    if (this.gameOver || this.won) return;

    if (flag) {
      this.toggleFlag(r, c);
    } else {
      if (!this.generated) {
        this.placeMines(r, c);
      }
      if (this.board[r][c].display === 'hidden') {
        this.reveal(r, c);
      }
    }
    if (!this.gameOver) {
      this.won = this.checkWin();
    }
  }

  private restart() {
    this.gameOver = false;
    this.won = false;
    this.generated = false;
    this.board = [];
    for (let r = 0; r < MS_ROWS; r++) {
      this.board[r] = [];
      for (let c = 0; c < MS_COLS; c++) {
        this.board[r][c] = { value: 0, display: 'hidden' };
      }
    }
  }

  // ── Sync ──
  private broadcastBoard() {
    // Serialize board state
    const serialized = this.board.map(row => row.map(cell => ({
      v: cell.value,
      d: cell.display === 'hidden' ? 0 : cell.display === 'revealed' ? 1 : 2
    })));
    this.ctx.sync.setState({
      msBoard: {
        b: serialized,
        over: this.gameOver,
        won: this.won,
        gen: this.generated,
        ts: Date.now()
      }
    });
  }

  private onStateChange = (state: any) => {
    // Host processes actions from guest
    if (this.ctx.isHost && state.msAction && state.msAction.ts !== this.lastActionTs) {
      this.lastActionTs = state.msAction.ts;
      if (state.msAction.by !== this.ctx.me.id) {
        this.processAction(state.msAction.r, state.msAction.c, state.msAction.flag);
        this.broadcastBoard();
      }
    }

    // Guest receives authoritative board
    if (!this.ctx.isHost && state.msBoard) {
      this.gameOver = state.msBoard.over;
      this.won = state.msBoard.won;
      this.generated = state.msBoard.gen;
      const data = state.msBoard.b;
      for (let r = 0; r < MS_ROWS; r++) {
        for (let c = 0; c < MS_COLS; c++) {
          if (data[r] && data[r][c]) {
            this.board[r][c].value = data[r][c].v;
            this.board[r][c].display = data[r][c].d === 0 ? 'hidden' : data[r][c].d === 1 ? 'revealed' : 'flagged';
          }
        }
      }
    }
  };

  // ── Game Loop ──
  private loop = () => {
    this.draw();
    this.animId = requestAnimationFrame(this.loop);
  };

  private draw() {
    const c = this.canvasCtx;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    c.clearRect(0, 0, w, h);

    const boardH = h * 0.85;
    const cellSize = Math.min(w / MS_COLS, boardH / MS_ROWS);
    const offsetX = (w - cellSize * MS_COLS) / 2;
    const offsetY = (boardH - cellSize * MS_ROWS) / 2;

    c.save();
    c.translate(offsetX, offsetY);

    for (let r = 0; r < MS_ROWS; r++) {
      for (let col = 0; col < MS_COLS; col++) {
        const cell = this.board[r][col];
        const x = col * cellSize;
        const y = r * cellSize;
        const pad = 1.5;

        if (cell.display === 'hidden') {
          // Raised cell — doodle style
          c.fillStyle = '#e8e4df';
          c.strokeStyle = '#2d3436';
          c.lineWidth = 2;
          c.beginPath();
          c.rect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2);
          c.fill();
          c.stroke();

          // Pencil hatching for texture
          c.strokeStyle = 'rgba(0,0,0,0.06)';
          c.lineWidth = 1;
          for (let i = 0; i < cellSize; i += 5) {
            c.beginPath();
            c.moveTo(x + pad + i, y + pad);
            c.lineTo(x + pad, y + pad + i);
            c.stroke();
          }
        } else if (cell.display === 'revealed') {
          // Flat revealed cell
          c.fillStyle = '#fdfbf7';
          c.strokeStyle = 'rgba(0,0,0,0.12)';
          c.lineWidth = 1;
          c.beginPath();
          c.rect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2);
          c.fill();
          c.stroke();

          if (cell.value === -1) {
            // Draw mine (doodle bomb)
            const cx = x + cellSize / 2;
            const cy = y + cellSize / 2;
            const mr = cellSize * 0.28;
            // Body
            c.fillStyle = '#2d3436';
            c.beginPath();
            c.arc(cx, cy, mr, 0, Math.PI * 2);
            c.fill();
            // Spikes
            c.strokeStyle = '#2d3436';
            c.lineWidth = 3;
            c.lineCap = 'round';
            for (let a = 0; a < 8; a++) {
              const ang = (a / 8) * Math.PI * 2;
              c.beginPath();
              c.moveTo(cx + Math.cos(ang) * mr * 0.6, cy + Math.sin(ang) * mr * 0.6);
              c.lineTo(cx + Math.cos(ang) * mr * 1.5, cy + Math.sin(ang) * mr * 1.5);
              c.stroke();
            }
            // Highlight
            c.fillStyle = 'rgba(255,255,255,0.6)';
            c.beginPath();
            c.arc(cx - mr * 0.3, cy - mr * 0.3, mr * 0.22, 0, Math.PI * 2);
            c.fill();
          } else if (cell.value > 0) {
            // Draw number (hand-drawn style)
            c.fillStyle = MS_NUM_COLORS[cell.value] || '#2d3436';
            c.font = `bold ${cellSize * 0.6}px 'Patrick Hand', cursive`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            // Slight random rotation for doodle feel
            c.save();
            c.translate(x + cellSize / 2, y + cellSize / 2);
            c.rotate(((r * 7 + col * 3) % 7 - 3) * 0.02);
            c.fillText(String(cell.value), 0, 1);
            c.restore();
          }
        } else if (cell.display === 'flagged') {
          // Raised cell with flag
          c.fillStyle = '#e8e4df';
          c.strokeStyle = '#2d3436';
          c.lineWidth = 2;
          c.beginPath();
          c.rect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2);
          c.fill();
          c.stroke();

          // Draw flag (doodle style)
          const fx = x + cellSize * 0.45;
          const fy = y + cellSize * 0.2;
          const fh = cellSize * 0.6;
          // Pole
          c.strokeStyle = '#2d3436';
          c.lineWidth = 2.5;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(fx, fy);
          c.lineTo(fx, fy + fh);
          c.stroke();
          // Flag triangle
          c.fillStyle = '#ff7675';
          c.beginPath();
          c.moveTo(fx, fy);
          c.lineTo(fx + cellSize * 0.35, fy + cellSize * 0.15);
          c.lineTo(fx, fy + cellSize * 0.3);
          c.closePath();
          c.fill();
          c.strokeStyle = '#2d3436';
          c.lineWidth = 1.5;
          c.stroke();
        }
      }
    }

    // Outer border
    c.strokeStyle = '#2d3436';
    c.lineWidth = 4;
    c.strokeRect(0, 0, MS_COLS * cellSize, MS_ROWS * cellSize);

    c.restore();

    // ── Bottom UI: Flag toggle button & mine counter ──
    const btnW = w * 0.35;
    const btnH = h * 0.07;
    const btnX = w * 0.08;
    const btnY = h - btnH - h * 0.02;

    // Flag button
    c.fillStyle = this.flagMode ? '#ffeaa7' : 'white';
    c.strokeStyle = '#2d3436';
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(btnX, btnY, btnW, btnH, 8);
    c.fill();
    c.stroke();

    c.fillStyle = '#2d3436';
    c.font = `${btnH * 0.55}px 'Patrick Hand', cursive`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(this.flagMode ? '🚩 Bandera ON' : '👆 Revelar', btnX + btnW / 2, btnY + btnH / 2);

    // Mine counter
    let flagCount = 0;
    for (let r = 0; r < MS_ROWS; r++) {
      for (let col = 0; col < MS_COLS; col++) {
        if (this.board[r][col].display === 'flagged') flagCount++;
      }
    }
    c.fillStyle = '#2d3436';
    c.font = `${btnH * 0.55}px 'Patrick Hand', cursive`;
    c.textAlign = 'right';
    c.fillText(`💣 ${MS_MINES - flagCount}`, w - w * 0.08, btnY + btnH / 2);

    // ── Game Over / Win overlay ──
    if (this.gameOver || this.won) {
      c.fillStyle = 'rgba(253,251,247,0.85)';
      c.fillRect(0, 0, w, h);

      c.fillStyle = '#2d3436';
      c.font = `bold ${w * 0.12}px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(this.won ? '🎉' : '💥', w / 2, h * 0.35);

      c.font = `bold ${w * 0.08}px 'Patrick Hand', cursive`;
      c.fillText(this.won ? '¡Ganaron!' : '¡BOOM!', w / 2, h * 0.48);

      c.font = `${w * 0.045}px 'Patrick Hand', cursive`;
      c.fillStyle = '#636e72';
      c.fillText('Toca para jugar de nuevo', w / 2, h * 0.58);
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.animId);
    this.ctx.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.ctx.sync.off('stateChange', this.onStateChange);
  }
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
// ── Crystal Bridge Types ──
interface BridgeRow {
  leftSafe: boolean;  // true = left tile is safe, false = right tile is safe
}

const CB_ROWS = 8;       // 8 pairs to cross
const CB_LIVES = 3;

export class CrystalBridgeGame implements GameModule {
  private ctx!: GameContext;
  private animId = 0;
  private canvasCtx!: CanvasRenderingContext2D;

  private bridge: BridgeRow[] = [];
  private avatarRow = -1;       // -1 = start platform, 0..7 = on bridge, 8 = finish
  private avatarSide: 'left' | 'right' | null = null;
  private lives = CB_LIVES;
  private gameOver = false;
  private won = false;
  private revealed: boolean[][] = []; // which tiles have been stepped on (broken or safe)
  private shakeTimer = 0;
  private lastActionTs = 0;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;
    this.gameOver = false;
    this.won = false;
    this.lives = CB_LIVES;
    this.avatarRow = -1;
    this.avatarSide = null;
    this.shakeTimer = 0;

    // Generate bridge (Host only decides, then broadcasts)
    this.bridge = [];
    this.revealed = [];
    for (let i = 0; i < CB_ROWS; i++) {
      this.bridge.push({ leftSafe: Math.random() < 0.5 });
      this.revealed.push([false, false]);
    }

    ctx.canvas.addEventListener('pointerdown', this.onPointerDown);
    ctx.sync.on('stateChange', this.onStateChange);

    if (ctx.isHost) {
      this.broadcastState();
    }

    this.loop();
  }

  // ── Pointer: Guest picks a tile ──
  private onPointerDown = (e: PointerEvent) => {
    if (this.gameOver || this.won) {
      // Tap to restart
      if (this.ctx.isHost) {
        this.restart();
        this.broadcastState();
      }
      return;
    }

    // Only Guest moves the avatar
    if (this.ctx.isHost) return;

    const rect = this.ctx.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const w = this.ctx.canvas.width;

    // Left or right half?
    const side: 'left' | 'right' = px < w / 2 ? 'left' : 'right';

    this.ctx.sync.setState({
      cbStep: { side, ts: Date.now(), by: this.ctx.me.id }
    });
  };

  // ── Host processes steps ──
  private processStep(side: 'left' | 'right') {
    if (this.gameOver || this.won) return;

    const nextRow = this.avatarRow + 1;

    if (nextRow >= CB_ROWS) {
      // Reached the end!
      this.avatarRow = CB_ROWS;
      this.won = true;
      return;
    }

    this.avatarRow = nextRow;
    this.avatarSide = side;
    const sideIdx = side === 'left' ? 0 : 1;
    this.revealed[nextRow][sideIdx] = true;

    const safe = side === 'left' ? this.bridge[nextRow].leftSafe : !this.bridge[nextRow].leftSafe;

    if (!safe) {
      this.lives--;
      this.shakeTimer = 20; // frames of screen shake
      if (this.lives <= 0) {
        this.gameOver = true;
        // Reveal all tiles
        for (let i = 0; i < CB_ROWS; i++) {
          this.revealed[i] = [true, true];
        }
      } else {
        // Stay on same row so player can try the other side
        this.avatarRow = nextRow - 1;
      }
    }
  }

  private restart() {
    this.gameOver = false;
    this.won = false;
    this.lives = CB_LIVES;
    this.avatarRow = -1;
    this.avatarSide = null;
    this.shakeTimer = 0;
    this.bridge = [];
    this.revealed = [];
    for (let i = 0; i < CB_ROWS; i++) {
      this.bridge.push({ leftSafe: Math.random() < 0.5 });
      this.revealed.push([false, false]);
    }
  }

  // ── Sync ──
  private broadcastState() {
    this.ctx.sync.setState({
      cbState: {
        bridge: this.bridge.map(r => r.leftSafe),
        revealed: this.revealed,
        row: this.avatarRow,
        side: this.avatarSide,
        lives: this.lives,
        over: this.gameOver,
        won: this.won,
        ts: Date.now()
      }
    });
  }

  private onStateChange = (state: any) => {
    // Host receives step from guest
    if (this.ctx.isHost && state.cbStep && state.cbStep.ts !== this.lastActionTs) {
      this.lastActionTs = state.cbStep.ts;
      if (state.cbStep.by !== this.ctx.me.id) {
        this.processStep(state.cbStep.side);
        this.broadcastState();
      }
    }

    // Guest (and Host for mirror) receives authoritative state
    if (state.cbState) {
      // Guest always syncs; Host syncs bridge layout on first load
      if (!this.ctx.isHost) {
        this.avatarRow = state.cbState.row;
        this.avatarSide = state.cbState.side;
        this.lives = state.cbState.lives;
        this.gameOver = state.cbState.over;
        this.won = state.cbState.won;
        this.revealed = state.cbState.revealed;
        // Guest does NOT receive which tiles are safe — that's the asymmetry!
        // Actually, we do receive bridge data but we won't RENDER it for the guest.
        // We store it so the Host render path works:
      }
      // Both store bridge data (Host renders hints, Guest ignores them in draw)
      if (state.cbState.bridge) {
        for (let i = 0; i < CB_ROWS; i++) {
          this.bridge[i] = { leftSafe: state.cbState.bridge[i] };
        }
      }
      if (state.cbState.over || state.cbState.won) {
        if (!this.ctx.isHost && state.cbState.over) {
          this.shakeTimer = 20;
        }
      }
    }
  };

  // ── Render ──
  private loop = () => {
    this.draw();
    this.animId = requestAnimationFrame(this.loop);
  };

  private draw() {
    const c = this.canvasCtx;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    // Screen shake
    c.save();
    if (this.shakeTimer > 0) {
      this.shakeTimer--;
      const sx = (Math.random() - 0.5) * 8;
      const sy = (Math.random() - 0.5) * 8;
      c.translate(sx, sy);
    }

    c.clearRect(-10, -10, w + 20, h + 20);

    // Layout
    const topPad = h * 0.08;
    const botPad = h * 0.12;
    const bridgeH = h - topPad - botPad;
    const rowH = bridgeH / (CB_ROWS + 2); // +2 for start/finish platforms
    const tileW = w * 0.35;
    const tileH = rowH * 0.75;
    const gapX = w * 0.06;
    const leftX = w / 2 - gapX / 2 - tileW;
    const rightX = w / 2 + gapX / 2;

    // ── Role label ──
    c.font = `bold ${w * 0.045}px 'Patrick Hand', cursive`;
    c.textAlign = 'center';
    c.fillStyle = '#636e72';
    c.fillText(
      this.ctx.isHost ? '👁️ Tú ves las baldosas seguras' : '🚶 Tú mueves al personaje',
      w / 2, topPad * 0.6
    );

    // ── Lives ──
    c.font = `${w * 0.05}px 'Patrick Hand', cursive`;
    c.textAlign = 'right';
    c.fillStyle = '#2d3436';
    c.fillText('❤️'.repeat(this.lives) + '🖤'.repeat(CB_LIVES - this.lives), w - 16, topPad * 0.6);

    // ── Finish platform ──
    const finishY = topPad;
    c.fillStyle = '#55efc4';
    c.strokeStyle = '#2d3436';
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(leftX, finishY, tileW * 2 + gapX, rowH * 0.8, 8);
    c.fill();
    c.stroke();
    c.fillStyle = '#2d3436';
    c.font = `bold ${rowH * 0.35}px 'Patrick Hand', cursive`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('🏁 META', w / 2, finishY + rowH * 0.4);

    // ── Bridge tiles ──
    for (let i = 0; i < CB_ROWS; i++) {
      const tileY = topPad + (i + 1) * rowH + (rowH - tileH) / 2;
      const rowData = this.bridge[i];

      // Draw left tile
      this.drawTile(c, leftX, tileY, tileW, tileH, i, 0, rowData.leftSafe);
      // Draw right tile
      this.drawTile(c, rightX, tileY, tileW, tileH, i, 1, !rowData.leftSafe);
    }

    // ── Start platform ──
    const startY = topPad + (CB_ROWS + 1) * rowH;
    c.fillStyle = '#74b9ff';
    c.strokeStyle = '#2d3436';
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(leftX, startY, tileW * 2 + gapX, rowH * 0.8, 8);
    c.fill();
    c.stroke();
    c.fillStyle = '#2d3436';
    c.font = `bold ${rowH * 0.35}px 'Patrick Hand', cursive`;
    c.textAlign = 'center';
    c.fillText('🚶 INICIO', w / 2, startY + rowH * 0.4);

    // ── Avatar ──
    if (!this.gameOver) {
      let avatarX = w / 2;
      let avatarY: number;

      if (this.avatarRow === -1) {
        avatarY = startY + rowH * 0.4;
      } else if (this.avatarRow >= CB_ROWS) {
        avatarY = finishY + rowH * 0.4;
      } else {
        const tileY = topPad + (this.avatarRow + 1) * rowH + rowH / 2;
        avatarY = tileY;
        if (this.avatarSide === 'left') avatarX = leftX + tileW / 2;
        else if (this.avatarSide === 'right') avatarX = rightX + tileW / 2;
      }

      // Draw avatar (simple doodle person)
      c.font = `${rowH * 0.55}px serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('🧍', avatarX, avatarY);
    }

    // ── Instructions for Guest ──
    if (!this.ctx.isHost && !this.gameOver && !this.won) {
      c.font = `${w * 0.04}px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.fillStyle = '#636e72';
      c.fillText('Toca izquierda o derecha para avanzar', w / 2, h - botPad * 0.4);
    }

    // ── Game Over / Win overlay ──
    if (this.gameOver || this.won) {
      c.fillStyle = 'rgba(253,251,247,0.8)';
      c.fillRect(-10, -10, w + 20, h + 20);

      c.fillStyle = '#2d3436';
      c.font = `bold ${w * 0.14}px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(this.won ? '🎉' : '💔', w / 2, h * 0.35);

      c.font = `bold ${w * 0.07}px 'Patrick Hand', cursive`;
      c.fillText(this.won ? '¡Cruzaron el puente!' : '¡Se rompió el cristal!', w / 2, h * 0.48);

      c.font = `${w * 0.04}px 'Patrick Hand', cursive`;
      c.fillStyle = '#636e72';
      c.fillText('Toca para jugar de nuevo', w / 2, h * 0.58);
    }

    c.restore();
  }

  private drawTile(
    c: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    rowIdx: number, sideIdx: number, isSafe: boolean
  ) {
    const wasRevealed = this.revealed[rowIdx]?.[sideIdx];

    if (wasRevealed) {
      if (isSafe) {
        // Safe tile — solid glass
        c.fillStyle = 'rgba(116, 185, 255, 0.3)';
        c.strokeStyle = '#74b9ff';
        c.lineWidth = 3;
        c.beginPath();
        c.roundRect(x, y, w, h, 6);
        c.fill();
        c.stroke();
        // Checkmark
        c.font = `bold ${h * 0.5}px 'Patrick Hand', cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#00b894';
        c.fillText('✓', x + w / 2, y + h / 2);
      } else {
        // Broken tile — shattered look
        c.fillStyle = 'rgba(255, 118, 117, 0.15)';
        c.strokeStyle = '#ff7675';
        c.lineWidth = 2;
        c.setLineDash([4, 4]);
        c.beginPath();
        c.roundRect(x, y, w, h, 6);
        c.fill();
        c.stroke();
        c.setLineDash([]);
        // Crack lines
        c.strokeStyle = 'rgba(255,118,117,0.5)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x + w * 0.2, y + h * 0.1);
        c.lineTo(x + w * 0.5, y + h * 0.5);
        c.lineTo(x + w * 0.3, y + h * 0.9);
        c.stroke();
        c.beginPath();
        c.moveTo(x + w * 0.5, y + h * 0.5);
        c.lineTo(x + w * 0.8, y + h * 0.3);
        c.stroke();
        // X mark
        c.font = `bold ${h * 0.4}px 'Patrick Hand', cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#d63031';
        c.fillText('✗', x + w / 2, y + h / 2);
      }
    } else {
      // Unrevealed tile — both look identical to Guest
      // Host sees a subtle hint
      const isHostHint = this.ctx.isHost && isSafe;

      c.fillStyle = isHostHint ? 'rgba(85, 239, 196, 0.18)' : 'rgba(200, 200, 200, 0.25)';
      c.strokeStyle = '#2d3436';
      c.lineWidth = 2.5;
      c.beginPath();
      c.roundRect(x, y, w, h, 6);
      c.fill();
      c.stroke();

      // Glass sheen effect
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x + w * 0.15, y + h * 0.2);
      c.lineTo(x + w * 0.35, y + h * 0.2);
      c.stroke();
      c.beginPath();
      c.moveTo(x + w * 0.15, y + h * 0.35);
      c.lineTo(x + w * 0.25, y + h * 0.35);
      c.stroke();

      // Host sees a tiny green dot
      if (isHostHint) {
        c.fillStyle = 'rgba(0, 184, 148, 0.6)';
        c.beginPath();
        c.arc(x + w - 10, y + 10, 4, 0, Math.PI * 2);
        c.fill();
      }

      // Label
      c.font = `${h * 0.3}px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#b2bec3';
      c.fillText(sideIdx === 0 ? '◀' : '▶', x + w / 2, y + h / 2);
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.animId);
    this.ctx.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.ctx.sync.off('stateChange', this.onStateChange);
  }
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
interface Star {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hue: number;
}

interface StarTap {
  id: string;
  ts: number;
  by: string;
}

const SF_STAR_COUNT = 5;
const SF_COORDINATION_WINDOW = 250; // ms

export class StarFishingGame implements GameModule {
  private ctx!: GameContext;
  private animId = 0;
  private canvasCtx!: CanvasRenderingContext2D;

  private stars: Star[] = [];
  private score = 0;
  private lastTaps: Record<string, StarTap> = {}; // starId -> last tap data
  private feedback: { x: number, y: number, text: string, timer: number }[] = [];
  private lastSyncTs = 0;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;
    this.score = 0;
    this.stars = [];
    this.feedback = [];

    ctx.canvas.addEventListener('pointerdown', this.onPointerDown);
    ctx.sync.on('stateChange', this.onStateChange);

    if (ctx.isHost) {
      for (let i = 0; i < SF_STAR_COUNT; i++) {
        this.stars.push(this.createStar());
      }
      this.broadcastState();
    }

    this.loop();
  }

  private createStar(): Star {
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;
    return {
      id: Math.random().toString(36).substring(2, 9),
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      size: 25 + Math.random() * 15,
      hue: Math.random() * 360
    };
  }

  private onPointerDown = (e: PointerEvent) => {
    const rect = this.ctx.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // Check collisions with stars
    for (const star of this.stars) {
      const dx = px - star.x;
      const dy = py - star.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < star.size * 1.5) {
        // Tap hit!
        this.ctx.sync.setState({
          sfTap: { id: star.id, ts: Date.now(), by: this.ctx.me.id }
        });
        // Visual feedback for local player
        this.addFeedback(star.x, star.y, '✨');
        break;
      }
    }
  };

  private addFeedback(x: number, y: number, text: string) {
    this.feedback.push({ x, y, text, timer: 30 });
  }

  private onStateChange = (state: any) => {
    if (this.ctx.isHost && state.sfTap && state.sfTap.ts !== this.lastSyncTs) {
      this.lastSyncTs = state.sfTap.ts;
      this.processTap(state.sfTap);
    }

    if (!this.ctx.isHost && state.sfState) {
      this.stars = state.sfState.stars;
      this.score = state.sfState.score;
      if (state.sfState.hit) {
        this.addFeedback(state.sfState.hit.x, state.sfState.hit.y, '¡PESCADA! ⭐');
      }
    }
  };

  private processTap(tap: StarTap) {
    const existing = this.lastTaps[tap.id];
    
    if (existing && existing.by !== tap.by) {
      const diff = Math.abs(tap.ts - existing.ts);
      if (diff < SF_COORDINATION_WINDOW) {
        // SUCCESS! Coordination achieved
        this.score++;
        // Remove star and replace
        const idx = this.stars.findIndex(s => s.id === tap.id);
        if (idx !== -1) {
          const hitX = this.stars[idx].x;
          const hitY = this.stars[idx].y;
          this.stars.splice(idx, 1);
          this.stars.push(this.createStar());
          delete this.lastTaps[tap.id];
          
          this.broadcastState({ x: hitX, y: hitY });
          return;
        }
      }
    }
    
    // Store tap for future coordination
    this.lastTaps[tap.id] = tap;
  }

  private broadcastState(hit?: { x: number, y: number }) {
    this.ctx.sync.setState({
      sfState: {
        stars: this.stars,
        score: this.score,
        hit,
        ts: Date.now()
      }
    });
  }

  private loop = () => {
    this.update();
    this.draw();
    this.animId = requestAnimationFrame(this.loop);
  };

  private update() {
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    if (this.ctx.isHost) {
      for (const star of this.stars) {
        star.x += star.vx;
        star.y += star.vy;

        // Bounce
        if (star.x < 0 || star.x > w) star.vx *= -1;
        if (star.y < 0 || star.y > h) star.vy *= -1;
      }
      
      // Periodic sync of positions
      if (Math.random() < 0.05) this.broadcastState();
    }

    // Update feedback
    for (let i = this.feedback.length - 1; i >= 0; i--) {
      this.feedback[i].timer--;
      this.feedback[i].y -= 1;
      if (this.feedback[i].timer <= 0) this.feedback.splice(i, 1);
    }
  }

  private draw() {
    const c = this.canvasCtx;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    c.clearRect(0, 0, w, h);

    // Score
    c.font = `bold ${w * 0.06}px 'Patrick Hand', cursive`;
    c.fillStyle = '#2d3436';
    c.textAlign = 'center';
    c.fillText(`Estrellas Pescadas: ${this.score}`, w / 2, 50);

    // Stars
    for (const star of this.stars) {
      this.drawStar(c, star.x, star.y, star.size, star.hue);
    }

    // Feedback
    c.font = `bold ${w * 0.05}px 'Patrick Hand', cursive`;
    for (const f of this.feedback) {
      c.globalAlpha = f.timer / 30;
      c.fillText(f.text, f.x, f.y);
    }
    c.globalAlpha = 1;

    // Instructions
    c.font = `${w * 0.035}px 'Patrick Hand', cursive`;
    c.fillStyle = '#636e72';
    c.fillText('¡Toquen la misma estrella al mismo tiempo!', w / 2, h - 30);
  }

  private drawStar(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, hue: number) {
    c.save();
    c.translate(cx, cy);
    c.rotate(Date.now() * 0.002);
    
    c.beginPath();
    const spikes = 5;
    const outerRadius = size;
    const innerRadius = size * 0.4;
    let rot = Math.PI / 2 * 3;
    let x = 0;
    let y = 0;
    const step = Math.PI / spikes;

    c.moveTo(0, -outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = Math.cos(rot) * outerRadius;
      y = Math.sin(rot) * outerRadius;
      c.lineTo(x, y);
      rot += step;

      x = Math.cos(rot) * innerRadius;
      y = Math.sin(rot) * innerRadius;
      c.lineTo(x, y);
      rot += step;
    }
    c.lineTo(0, -outerRadius);
    c.closePath();

    c.fillStyle = `hsla(${hue}, 80%, 70%, 0.6)`;
    c.fill();
    c.strokeStyle = '#2d3436';
    c.lineWidth = 2.5;
    c.stroke();
    
    // Doodle lines inside
    c.beginPath();
    c.moveTo(0,0);
    c.lineTo(0, -outerRadius * 0.5);
    c.stroke();

    c.restore();
  }

  destroy(): void {
    cancelAnimationFrame(this.animId);
    this.ctx.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.ctx.sync.off('stateChange', this.onStateChange);
  }
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
interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

const IG_SCROLL_SPEED = 4;
const IG_GRAVITY = 0.6;
const IG_LIVES = 3;

export class InverseGravityGame implements GameModule {
  private ctx!: GameContext;
  private animId = 0;
  private canvasCtx!: CanvasRenderingContext2D;

  private obstacles: Obstacle[] = [];
  private playerY = 0;
  private playerVY = 0;
  private gravityDir = 1; // 1 = down, -1 = up
  private lives = IG_LIVES;
  private shieldActive = false;
  private shieldTimer = 0;
  private gameOver = false;
  private distance = 0;
  private lastActionTs = 0;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;
    this.reset();

    ctx.canvas.addEventListener('pointerdown', this.onPointerDown);
    ctx.sync.on('stateChange', this.onStateChange);

    if (ctx.isHost) {
      this.broadcastState();
    }

    this.loop();
  }

  private reset() {
    this.obstacles = [];
    this.playerY = this.ctx.canvas.height / 2;
    this.playerVY = 0;
    this.gravityDir = 1;
    this.lives = IG_LIVES;
    this.shieldActive = false;
    this.shieldTimer = 0;
    this.gameOver = false;
    this.distance = 0;
  }

  private onPointerDown = () => {
    if (this.gameOver) {
      if (this.ctx.isHost) {
        this.reset();
        this.broadcastState();
      }
      return;
    }

    // Host flips gravity, Guest shields
    if (this.ctx.isHost) {
      this.gravityDir *= -1;
      this.ctx.sync.setState({ igFlip: { dir: this.gravityDir, ts: Date.now() } });
    } else {
      if (this.shieldTimer <= 0) {
        this.shieldActive = true;
        this.shieldTimer = 100; // frames
        this.ctx.sync.setState({ igShield: { active: true, ts: Date.now() } });
      }
    }
  };

  private onStateChange = (state: any) => {
    if (this.ctx.isHost && state.igShield && state.igShield.ts !== this.lastActionTs) {
      this.lastActionTs = state.igShield.ts;
      this.shieldActive = true;
      this.shieldTimer = 100;
      this.broadcastState();
    }
    
    if (!this.ctx.isHost) {
      if (state.igFlip) this.gravityDir = state.igFlip.dir;
      if (state.igState) {
        this.obstacles = state.igState.obs;
        this.lives = state.igState.lives;
        this.distance = state.igState.dist;
        this.playerY = state.igState.y;
        this.gameOver = state.igState.over;
        this.shieldActive = state.igState.shield;
      }
    }
  };

  private broadcastState() {
    this.ctx.sync.setState({
      igState: {
        obs: this.obstacles,
        lives: this.lives,
        dist: Math.floor(this.distance),
        y: this.playerY,
        over: this.gameOver,
        shield: this.shieldActive,
        ts: Date.now()
      }
    });
  }

  private loop = () => {
    this.update();
    this.draw();
    this.animId = requestAnimationFrame(this.loop);
  };

  private update() {
    if (this.gameOver) return;

    const h = this.ctx.canvas.height;
    const w = this.ctx.canvas.width;

    if (this.ctx.isHost) {
      // Physics
      this.playerVY += IG_GRAVITY * this.gravityDir;
      this.playerY += this.playerVY;

      // Floor/Ceiling constraints
      const margin = 40;
      if (this.playerY > h - margin) {
        this.playerY = h - margin;
        this.playerVY = 0;
      }
      if (this.playerY < margin) {
        this.playerY = margin;
        this.playerVY = 0;
      }

      // Scrolling
      this.distance += 0.1;
      
      // Spawn obstacles
      if (Math.random() < 0.02) {
        const side = Math.random() < 0.5 ? 'top' : 'bottom';
        this.obstacles.push({
          x: w,
          y: side === 'top' ? 0 : h - 60,
          w: 40 + Math.random() * 40,
          h: 60
        });
      }

      // Update obstacles & Collisions
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const obs = this.obstacles[i];
        obs.x -= IG_SCROLL_SPEED;

        // Collision
        if (!this.shieldActive && 
            w * 0.2 < obs.x + obs.w && 
            w * 0.2 + 30 > obs.x && 
            this.playerY < obs.y + obs.h && 
            this.playerY + 30 > obs.y) {
          
          this.lives--;
          this.obstacles.splice(i, 1);
          if (this.lives <= 0) this.gameOver = true;
          continue;
        }

        if (obs.x + obs.w < 0) this.obstacles.splice(i, 1);
      }

      if (this.shieldTimer > 0) {
        this.shieldTimer--;
        if (this.shieldTimer <= 0) this.shieldActive = false;
      }

      if (Math.random() < 0.1) this.broadcastState();
    }
  }

  private draw() {
    const c = this.canvasCtx;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    c.clearRect(0, 0, w, h);

    // Grid lines (doodle style)
    c.strokeStyle = 'rgba(0,0,0,0.05)';
    c.lineWidth = 1;
    for (let x = 0; x < w; x += 50) {
      c.beginPath(); c.moveTo(x - (this.distance * 10) % 50, 0); c.lineTo(x - (this.distance * 10) % 50, h); c.stroke();
    }

    // HUD
    c.font = `bold ${w * 0.05}px 'Patrick Hand', cursive`;
    c.fillStyle = '#2d3436';
    c.textAlign = 'left';
    c.fillText(`❤️`.repeat(this.lives), 20, 40);
    c.textAlign = 'right';
    c.fillText(`${Math.floor(this.distance)}m`, w - 20, 40);

    // Player (Doodle stick figure)
    const px = w * 0.2;
    const py = this.playerY;
    
    c.save();
    c.translate(px, py);
    if (this.gravityDir === -1) c.scale(1, -1);
    
    // Head
    c.beginPath(); c.arc(0, -15, 6, 0, Math.PI * 2); c.stroke();
    // Body
    c.beginPath(); c.moveTo(0, -9); c.lineTo(0, 5); c.stroke();
    // Arms
    c.beginPath(); c.moveTo(-10, -5); c.lineTo(10, -5); c.stroke();
    // Legs
    c.beginPath(); c.moveTo(0, 5); c.lineTo(-7, 15); c.stroke();
    c.beginPath(); c.moveTo(0, 5); c.lineTo(7, 15); c.stroke();
    
    c.restore();

    // Shield effect
    if (this.shieldActive) {
      c.beginPath();
      c.arc(px, py, 35, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(116, 185, 255, 0.6)';
      c.lineWidth = 5;
      c.stroke();
    }

    // Obstacles
    c.fillStyle = '#2d3436';
    for (const obs of this.obstacles) {
      this.drawObstacle(c, obs.x, obs.y, obs.w, obs.h);
    }

    // Game Over
    if (this.gameOver) {
      c.fillStyle = 'rgba(253,251,247,0.85)';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#2d3436';
      c.font = `bold ${w * 0.1}px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.fillText('¡CAÍDA LIBRE!', w / 2, h / 2);
      c.font = `${w * 0.05}px 'Patrick Hand', cursive`;
      c.fillText('Toca para reintentar', w / 2, h / 2 + 50);
    }

    // Role labels
    c.font = `${w * 0.035}px 'Patrick Hand', cursive`;
    c.fillStyle = '#636e72';
    c.textAlign = 'center';
    c.fillText(this.ctx.isHost ? 'Host: Toca para invertir gravedad' : 'Guest: Toca para activar escudo', w / 2, h - 20);
  }

  private drawObstacle(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    c.strokeStyle = '#2d3436';
    c.lineWidth = 2.5;
    c.strokeRect(x, y, w, h);
    
    // Scribble fill
    for (let i = 0; i < w; i += 8) {
      c.beginPath();
      c.moveTo(x + i, y);
      c.lineTo(x + i + 5, y + h);
      c.stroke();
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.animId);
    this.ctx.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.ctx.sync.off('stateChange', this.onStateChange);
  }
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
// ── Hockey Constants ──
const FH_MALLET_R = 28;
const FH_PUCK_R = 16;
const FH_MAX_SPEED = 14;
const FH_FRICTION = 0.985;
const FH_AI_SPEED = 3.5;
const FH_GOAL_W_RATIO = 0.4; // goal width as fraction of canvas width

interface Vec2 { x: number; y: number; }
interface Disc extends Vec2 { vx: number; vy: number; r: number; }

export class FingerHockeyGame implements GameModule {
  private ctx!: GameContext;
  private animId = 0;
  private canvasCtx!: CanvasRenderingContext2D;

  // Discs
  private puck: Disc = { x: 0, y: 0, vx: 0, vy: 0, r: FH_PUCK_R };
  private p1Mallet: Vec2 = { x: 0, y: 0 }; // Host's mallet (bottom-left)
  private p2Mallet: Vec2 = { x: 0, y: 0 }; // Guest's mallet (bottom-right)
  private ai1: Vec2 = { x: 0, y: 0 };       // AI mallet 1 (top-left)
  private ai2: Vec2 = { x: 0, y: 0 };       // AI mallet 2 (top-right)

  // Previous mallet positions for velocity calc
  private p1Prev: Vec2 = { x: 0, y: 0 };
  private p2Prev: Vec2 = { x: 0, y: 0 };

  // Score
  private scoreHumans = 0;
  private scoreAI = 0;
  private maxScore = 5;
  private goalFlashTimer = 0;
  private goalMessage = '';

  // Pointer tracking
  private activePointer: number | null = null;
  private lastMalletTs = 0;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;
    this.scoreHumans = 0;
    this.scoreAI = 0;
    this.goalFlashTimer = 0;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Initial positions
    this.resetPuck(w, h);
    this.p1Mallet = { x: w * 0.3, y: h * 0.8 };
    this.p2Mallet = { x: w * 0.7, y: h * 0.8 };
    this.ai1 = { x: w * 0.35, y: h * 0.18 };
    this.ai2 = { x: w * 0.65, y: h * 0.18 };
    this.p1Prev = { ...this.p1Mallet };
    this.p2Prev = { ...this.p2Mallet };

    ctx.canvas.addEventListener('pointerdown', this.onPointerDown);
    ctx.canvas.addEventListener('pointermove', this.onPointerMove);
    ctx.canvas.addEventListener('pointerup', this.onPointerUp);
    ctx.canvas.addEventListener('pointercancel', this.onPointerUp);

    ctx.sync.on('stateChange', this.onStateChange);

    // Host broadcasts physics state periodically
    if (ctx.isHost) {
      this.syncInterval = setInterval(() => {
        this.broadcastState();
      }, 50); // 20 times/sec
    }

    this.loop();
  }

  private resetPuck(w: number, h: number) {
    this.puck.x = w / 2;
    this.puck.y = h / 2;
    this.puck.vx = (Math.random() - 0.5) * 4;
    this.puck.vy = (Math.random() < 0.5 ? -1 : 1) * 3;
  }

  // ── Pointer handlers: each player drags their own mallet ──
  private onPointerDown = (e: PointerEvent) => {
    this.handlePointer(e);
  };

  private onPointerMove = (e: PointerEvent) => {
    this.handlePointer(e);
  };

  private onPointerUp = (_e: PointerEvent) => {
    // Nothing special needed
  };

  private handlePointer(e: PointerEvent) {
    const rect = this.ctx.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const h = this.ctx.canvas.height;
    const w = this.ctx.canvas.width;

    // Only allow controlling mallets in the bottom half
    if (py < h * 0.45) return;

    // Clamp to playable area
    const cx = Math.max(FH_MALLET_R, Math.min(w - FH_MALLET_R, px));
    const cy = Math.max(h * 0.45, Math.min(h - FH_MALLET_R, py));

    // Host controls p1 (bottom-left area), Guest controls p2 (bottom-right area)
    if (this.ctx.isHost) {
      this.p1Prev = { ...this.p1Mallet };
      this.p1Mallet = { x: cx, y: cy };
    } else {
      // Send mallet pos to host
      this.ctx.sync.setState({
        fhMallet: { x: cx, y: cy, ts: Date.now(), by: this.ctx.me.id }
      });
      // Local prediction
      this.p2Prev = { ...this.p2Mallet };
      this.p2Mallet = { x: cx, y: cy };
    }
  }

  // ── AI Logic ──
  private updateAI(w: number, h: number) {
    const topLimit = FH_MALLET_R + 8;
    const botLimit = h * 0.45;

    // AI1: tracks puck with some lag, stays on left side
    const targetX1 = Math.max(FH_MALLET_R, Math.min(w * 0.48, this.puck.x - 30));
    const targetY1 = Math.max(topLimit, Math.min(botLimit, this.puck.y < botLimit ? this.puck.y : h * 0.15));
    this.ai1.x += (targetX1 - this.ai1.x) * 0.06 * FH_AI_SPEED * 0.3;
    this.ai1.y += (targetY1 - this.ai1.y) * 0.05 * FH_AI_SPEED * 0.3;

    // AI2: tracks puck more aggressively, stays on right side
    const targetX2 = Math.max(w * 0.52, Math.min(w - FH_MALLET_R, this.puck.x + 30));
    const targetY2 = Math.max(topLimit, Math.min(botLimit, this.puck.y < botLimit ? this.puck.y : h * 0.22));
    this.ai2.x += (targetX2 - this.ai2.x) * 0.07 * FH_AI_SPEED * 0.3;
    this.ai2.y += (targetY2 - this.ai2.y) * 0.06 * FH_AI_SPEED * 0.3;
  }

  // ── Physics ──
  private resolveMalletCollision(mallet: Vec2, prevMallet: Vec2) {
    const dx = this.puck.x - mallet.x;
    const dy = this.puck.y - mallet.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = FH_MALLET_R + FH_PUCK_R;

    if (dist < minDist && dist > 0) {
      // Push puck out
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      this.puck.x += nx * overlap;
      this.puck.y += ny * overlap;

      // Transfer mallet velocity to puck
      const mvx = mallet.x - prevMallet.x;
      const mvy = mallet.y - prevMallet.y;
      this.puck.vx = nx * 8 + mvx * 0.6;
      this.puck.vy = ny * 8 + mvy * 0.6;
    }
  }

  private resolveAICollision(ai: Vec2) {
    const dx = this.puck.x - ai.x;
    const dy = this.puck.y - ai.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = FH_MALLET_R + FH_PUCK_R;

    if (dist < minDist && dist > 0) {
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      this.puck.x += nx * overlap;
      this.puck.y += ny * overlap;
      this.puck.vx = nx * 6;
      this.puck.vy = ny * 6;
    }
  }

  private update() {
    if (!this.ctx.isHost) return; // Only host runs physics

    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    if (this.goalFlashTimer > 0) {
      this.goalFlashTimer--;
      if (this.goalFlashTimer === 0) {
        this.resetPuck(w, h);
      }
      return; // Pause physics during goal flash
    }

    // AI
    this.updateAI(w, h);

    // Puck movement
    this.puck.x += this.puck.vx;
    this.puck.y += this.puck.vy;
    this.puck.vx *= FH_FRICTION;
    this.puck.vy *= FH_FRICTION;

    // Clamp speed
    const speed = Math.sqrt(this.puck.vx ** 2 + this.puck.vy ** 2);
    if (speed > FH_MAX_SPEED) {
      this.puck.vx = (this.puck.vx / speed) * FH_MAX_SPEED;
      this.puck.vy = (this.puck.vy / speed) * FH_MAX_SPEED;
    }

    // Wall bounces (left/right)
    if (this.puck.x - FH_PUCK_R < 0) {
      this.puck.x = FH_PUCK_R;
      this.puck.vx = Math.abs(this.puck.vx) * 0.8;
    }
    if (this.puck.x + FH_PUCK_R > w) {
      this.puck.x = w - FH_PUCK_R;
      this.puck.vx = -Math.abs(this.puck.vx) * 0.8;
    }

    // Goal detection
    const goalW = w * FH_GOAL_W_RATIO;
    const goalLeft = (w - goalW) / 2;
    const goalRight = goalLeft + goalW;

    // Top goal (AI's goal — humans score here)
    if (this.puck.y - FH_PUCK_R < 0) {
      if (this.puck.x > goalLeft && this.puck.x < goalRight) {
        this.scoreHumans++;
        this.goalFlashTimer = 60;
        this.goalMessage = '⚽ ¡GOL de los humanos!';
        this.puck.vx = 0; this.puck.vy = 0;
        return;
      } else {
        this.puck.y = FH_PUCK_R;
        this.puck.vy = Math.abs(this.puck.vy) * 0.8;
      }
    }

    // Bottom goal (Humans' goal — AI scores here)
    if (this.puck.y + FH_PUCK_R > h) {
      if (this.puck.x > goalLeft && this.puck.x < goalRight) {
        this.scoreAI++;
        this.goalFlashTimer = 60;
        this.goalMessage = '🤖 ¡GOL de la IA!';
        this.puck.vx = 0; this.puck.vy = 0;
        return;
      } else {
        this.puck.y = h - FH_PUCK_R;
        this.puck.vy = -Math.abs(this.puck.vy) * 0.8;
      }
    }

    // Mallet collisions
    this.resolveMalletCollision(this.p1Mallet, this.p1Prev);
    this.resolveMalletCollision(this.p2Mallet, this.p2Prev);
    this.resolveAICollision(this.ai1);
    this.resolveAICollision(this.ai2);

    this.p1Prev = { ...this.p1Mallet };
    this.p2Prev = { ...this.p2Mallet };
  }

  // ── Sync ──
  private broadcastState() {
    this.ctx.sync.setState({
      fhState: {
        puck: this.puck,
        ai1: this.ai1,
        ai2: this.ai2,
        p1: this.p1Mallet,
        p2: this.p2Mallet,
        sH: this.scoreHumans,
        sA: this.scoreAI,
        gf: this.goalFlashTimer,
        gm: this.goalMessage,
        ts: Date.now()
      }
    });
  }

  private onStateChange = (state: any) => {
    // Host receives guest mallet position
    if (this.ctx.isHost && state.fhMallet && state.fhMallet.ts !== this.lastMalletTs) {
      this.lastMalletTs = state.fhMallet.ts;
      if (state.fhMallet.by !== this.ctx.me.id) {
        this.p2Prev = { ...this.p2Mallet };
        this.p2Mallet = { x: state.fhMallet.x, y: state.fhMallet.y };
      }
    }

    // Guest receives authoritative state
    if (!this.ctx.isHost && state.fhState) {
      const s = state.fhState;
      this.puck = { ...s.puck };
      this.ai1 = { ...s.ai1 };
      this.ai2 = { ...s.ai2 };
      this.p1Mallet = { ...s.p1 };
      // Don't overwrite p2 if we're the guest (local prediction)
      this.scoreHumans = s.sH;
      this.scoreAI = s.sA;
      this.goalFlashTimer = s.gf;
      this.goalMessage = s.gm;
    }
  };

  // ── Render ──
  private loop = () => {
    this.update();
    this.draw();
    this.animId = requestAnimationFrame(this.loop);
  };

  private draw() {
    const c = this.canvasCtx;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    c.clearRect(0, 0, w, h);

    // ── Rink background ──
    // Center line
    c.setLineDash([8, 8]);
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, h / 2);
    c.lineTo(w, h / 2);
    c.stroke();
    c.setLineDash([]);

    // Center circle
    c.strokeStyle = 'rgba(0,0,0,0.08)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(w / 2, h / 2, Math.min(w, h) * 0.15, 0, Math.PI * 2);
    c.stroke();

    // Goals
    const goalW = w * FH_GOAL_W_RATIO;
    const goalLeft = (w - goalW) / 2;

    // Top goal (AI's — humans try to score here)
    c.fillStyle = 'rgba(85, 239, 196, 0.2)';
    c.strokeStyle = '#55efc4';
    c.lineWidth = 4;
    c.fillRect(goalLeft, 0, goalW, 10);
    c.beginPath();
    c.moveTo(goalLeft, 10);
    c.lineTo(goalLeft, 0);
    c.lineTo(goalLeft + goalW, 0);
    c.lineTo(goalLeft + goalW, 10);
    c.stroke();

    // Bottom goal (Humans' — AI tries to score here)
    c.fillStyle = 'rgba(255, 118, 117, 0.2)';
    c.strokeStyle = '#ff7675';
    c.lineWidth = 4;
    c.fillRect(goalLeft, h - 10, goalW, 10);
    c.beginPath();
    c.moveTo(goalLeft, h - 10);
    c.lineTo(goalLeft, h);
    c.lineTo(goalLeft + goalW, h);
    c.lineTo(goalLeft + goalW, h - 10);
    c.stroke();

    // Rink border
    c.strokeStyle = '#2d3436';
    c.lineWidth = 4;
    c.strokeRect(2, 2, w - 4, h - 4);

    // ── AI Mallets (top) ──
    this.drawMallet(c, this.ai1.x, this.ai1.y, '#ff7675', '🤖');
    this.drawMallet(c, this.ai2.x, this.ai2.y, '#ff7675', '🤖');

    // ── Human Mallets (bottom) ──
    this.drawMallet(c, this.p1Mallet.x, this.p1Mallet.y, '#74b9ff', 'P1');
    this.drawMallet(c, this.p2Mallet.x, this.p2Mallet.y, '#a29bfe', 'P2');

    // ── Puck ──
    c.beginPath();
    c.arc(this.puck.x, this.puck.y, FH_PUCK_R, 0, Math.PI * 2);
    c.fillStyle = '#2d3436';
    c.fill();
    c.strokeStyle = '#636e72';
    c.lineWidth = 2;
    c.stroke();
    // Puck highlight
    c.beginPath();
    c.arc(this.puck.x - 4, this.puck.y - 4, 4, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fill();

    // ── Scoreboard ──
    c.font = `bold 22px 'Patrick Hand', cursive`;
    c.textAlign = 'left';
    c.fillStyle = '#2d3436';
    c.fillText(`👫 ${this.scoreHumans}`, 14, h / 2 - 8);
    c.textAlign = 'right';
    c.fillText(`🤖 ${this.scoreAI}`, w - 14, h / 2 + 22);

    // ── Goal flash ──
    if (this.goalFlashTimer > 0) {
      const alpha = Math.min(1, this.goalFlashTimer / 30);
      c.fillStyle = `rgba(253,251,247,${alpha * 0.7})`;
      c.fillRect(0, 0, w, h);

      c.font = `bold ${w * 0.07}px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#2d3436';
      c.fillText(this.goalMessage, w / 2, h / 2);
    }

    // ── Game Over ──
    if (this.scoreHumans >= this.maxScore || this.scoreAI >= this.maxScore) {
      c.fillStyle = 'rgba(253,251,247,0.85)';
      c.fillRect(0, 0, w, h);

      const humansWon = this.scoreHumans >= this.maxScore;
      c.fillStyle = '#2d3436';
      c.font = `bold ${w * 0.12}px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(humansWon ? '🎉' : '🤖', w / 2, h * 0.35);

      c.font = `bold ${w * 0.06}px 'Patrick Hand', cursive`;
      c.fillText(
        humansWon ? '¡Los humanos ganan!' : '¡La IA gana!',
        w / 2, h * 0.48
      );

      c.font = `${w * 0.035}px 'Patrick Hand', cursive`;
      c.fillStyle = '#636e72';
      c.fillText(`${this.scoreHumans} - ${this.scoreAI}`, w / 2, h * 0.56);
    }
  }

  private drawMallet(c: CanvasRenderingContext2D, x: number, y: number, color: string, label: string) {
    // Outer ring
    c.beginPath();
    c.arc(x, y, FH_MALLET_R, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    c.strokeStyle = '#2d3436';
    c.lineWidth = 3;
    c.stroke();

    // Inner ring
    c.beginPath();
    c.arc(x, y, FH_MALLET_R * 0.55, 0, Math.PI * 2);
    c.fillStyle = 'white';
    c.fill();
    c.strokeStyle = '#2d3436';
    c.lineWidth = 2;
    c.stroke();

    // Label
    c.font = `bold 13px 'Patrick Hand', cursive`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#2d3436';
    c.fillText(label, x, y + 1);
  }

  destroy(): void {
    cancelAnimationFrame(this.animId);
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.ctx.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.ctx.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.ctx.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.ctx.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.ctx.sync.off('stateChange', this.onStateChange);
  }
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
