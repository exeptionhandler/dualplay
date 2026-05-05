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
