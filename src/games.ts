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
import { sound, haptic, ParticleSystem } from './audio';
import { profileManager } from './badges';
import { showRematchModal, showToast } from './ui';
import { RhythmDuoGame } from './rhythm-duo';
import { LaserMirrorGame } from './laser-mirror';

export { RhythmDuoGame } from './rhythm-duo';
export { LaserMirrorGame } from './laser-mirror';


export interface GameContext {
  canvas: HTMLCanvasElement;
  sync: Sync;
  me: any;
  isHost: boolean;
  onLobby?: () => void;
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
  '#00cec9',   // 1: I (cyan)
  '#0984e3',   // 2: J (blue)
  '#e17055',   // 3: L (orange)
  '#f1c40f',   // 4: O (yellow)
  '#2ecc71',   // 5: S (green)
  '#9b59b6',   // 6: T (purple)
  '#e74c3c'    // 7: Z (red)
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
  private particles = new ParticleSystem();
  
  private COLS = 20;
  private ROWS = 20;
  
  // Host state
  private board: number[][] = [];
  private p1: PieceState = { x: 5, y: 0, id: 1, rot: 0, active: false };
  private p2: PieceState = { x: 13, y: 0, id: 2, rot: 0, active: false };
  
  private tickTimer = 0;
  private tickRate = 600; // ms per drop
  private lastTime = 0;
  private totalLines = 0;
  private gameOver = false;
  private lastGameOverTs = 0;
  
  // UI Buttons
  private buttons = [
    { id: 'left',  x: 0.05, y: 0.85, w: 0.16, h: 0.1, text: '◀' },
    { id: 'right', x: 0.23, y: 0.85, w: 0.16, h: 0.1, text: '▶' },
    { id: 'drop',  x: 0.41, y: 0.85, w: 0.16, h: 0.1, text: '▼' },
    { id: 'rot',   x: 0.59, y: 0.85, w: 0.16, h: 0.1, text: '↻' },
    { id: 'hard_drop', x: 0.77, y: 0.85, w: 0.18, h: 0.1, text: '⚡' }
  ];
  
  private lastInputTs = 0;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;
    this.totalLines = 0;
    this.gameOver = false;
    
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
      if (!this.gameOver) {
        this.triggerGameOver();
      }
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
    sound.thud(100);
  }

  private clearLines() {
    let linesCleared = 0;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;
    const boardH = h * 0.8;
    const cellSize = Math.min(w / this.COLS, boardH / this.ROWS);
    const offsetX = (w - (cellSize * this.COLS)) / 2;
    const offsetY = (boardH - (cellSize * this.ROWS)) / 2;

    for (let r = this.ROWS - 1; r >= 0; r--) {
      if (this.board[r].every(val => val !== 0)) {
        this.board.splice(r, 1);
        this.board.unshift(new Array(this.COLS).fill(0));
        r++; // check same row again
        linesCleared++;
        this.particles.spawnConfetti(offsetX + (this.COLS * cellSize) / 2, offsetY + (r * cellSize), 28);
      }
    }
    if (linesCleared > 0) {
      this.totalLines += linesCleared;
      sound.lineClear();
      haptic([30, 40, 60]);
      profileManager.unlockBadge('tetris-master');
      if (this.totalLines >= 8 && !this.gameOver) {
        this.triggerWin();
      }
    }
  }

  private triggerWin() {
    if (this.gameOver) return;
    this.gameOver = true;
    sound.victory();
    profileManager.unlockBadge('tetris-master');
    const badge = profileManager.addWin('tetris-dual');

    if (this.ctx.isHost) {
      this.ctx.sync.setState({
        tGameOver: { won: true, lines: this.totalLines, ts: Date.now() }
      });
    }

    showRematchModal({
      won: true,
      title: '¡Maestros del Tetris Dual! 🧩',
      statsText: `Líneas cooperativas: ${this.totalLines} / 8 completadas`,
      stars: 3,
      newBadge: badge || undefined,
      onRematch: () => this.restartGame(),
      onLobby: () => this.ctx.sync.setState({ host_location: null }),
    });
  }

  private triggerGameOver() {
    if (this.gameOver) return;
    this.gameOver = true;
    sound.defeat();
    profileManager.resetStreak('tetris-dual');

    if (this.ctx.isHost) {
      this.ctx.sync.setState({
        tGameOver: { won: false, lines: this.totalLines, ts: Date.now() }
      });
    }

    showRematchModal({
      won: false,
      title: '¡El tablero llegó al tope! 💥',
      statsText: `Líneas cooperativas logradas: ${this.totalLines} / 8 meta`,
      stars: this.totalLines >= 4 ? 2 : 1,
      onRematch: () => this.restartGame(),
      onLobby: () => this.ctx.sync.setState({ host_location: null }),
    });
  }

  private restartGame() {
    for (let r = 0; r < this.ROWS; r++) {
      this.board[r] = new Array(this.COLS).fill(0);
    }
    this.totalLines = 0;
    this.gameOver = false;
    if (this.ctx.isHost) {
      this.spawn(this.p1, 4);
      this.spawn(this.p2, 14);
      this.broadcastState();
      this.ctx.sync.setState({ tGameOver: null });
    }
  }

  private processInput(playerId: string, action: string) {
    const isP1 = (playerId === (this.ctx.isHost ? this.ctx.me.id : this.getOpponentId()));
    const targetP = isP1 ? this.p1 : this.p2;
    const otherP = isP1 ? this.p2 : this.p1;

    if (!targetP.active) return;

    if (action === 'rot') {
      const kicks = [0, -1, 1, -2, 2];
      for (const k of kicks) {
        if (!this.collides(targetP, k, 0, 1) && !this.collidesWithOther(targetP, otherP, k, 0, 1)) {
          targetP.x += k;
          targetP.rot += 1;
          break;
        }
      }
    } else {
      let dx = 0, dy = 0;
      if (action === 'left') dx = -1;
      if (action === 'right') dx = 1;
      if (action === 'drop') dy = 1;

      if (!this.collides(targetP, dx, dy, 0) && !this.collidesWithOther(targetP, otherP, dx, dy, 0)) {
        targetP.x += dx;
        targetP.y += dy;
      }
    }
    
    if (this.ctx.isHost) this.broadcastState();
  }

  private getOpponentId() {
    return 'guest_id';
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
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.sendInput('left');
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.sendInput('right');
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.sendInput('rot');
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.sendInput('drop');
    if (e.key === ' ' || e.key === 'Spacebar') this.sendInput('hard_drop');
  };

  private getGhostY(p: PieceState, otherP: PieceState): number {
    if (!p.active) return p.y;
    let gy = p.y;
    while (!this.collides(p, 0, gy - p.y + 1, 0) && !this.collidesWithOther(p, otherP, 0, gy - p.y + 1, 0)) {
      gy++;
    }
    return gy;
  }

  private sendInput(action: string) {
    const myPiece = this.ctx.isHost ? this.p1 : this.p2;
    const otherPiece = this.ctx.isHost ? this.p2 : this.p1;
    
    if (action === 'hard_drop') {
      const dropY = this.getGhostY(myPiece, otherPiece);
      myPiece.y = dropY;
      sound.thud(120);
      haptic(30);
    } else if (action === 'rot') {
      const kicks = [0, -1, 1, -2, 2];
      for (const k of kicks) {
        if (!this.collides(myPiece, k, 0, 1) && !this.collidesWithOther(myPiece, otherPiece, k, 0, 1)) {
          myPiece.x += k;
          myPiece.rot += 1;
          sound.click();
          haptic(10);
          break;
        }
      }
    } else {
      let dx = 0, dy = 0;
      if (action === 'left') dx = -1;
      if (action === 'right') dx = 1;
      if (action === 'drop') dy = 1;

      if (!this.collides(myPiece, dx, dy, 0) && !this.collidesWithOther(myPiece, otherPiece, dx, dy, 0)) {
        myPiece.x += dx;
        myPiece.y += dy;
        sound.click();
        haptic(10);
      }
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
      // If host got input from guest / bot:
      if (!isMe) {
        const targetP = this.p2;
        let dx = 0, dy = 0, dr = 0;
        const act = state.tInput.act || state.tInput.action;
        if (act === 'left') dx = -1;
        if (act === 'right') dx = 1;
        if (act === 'rot') dr = 1;
        if (act === 'drop') dy = 1;
        if (act === 'hard_drop') {
          targetP.y = this.getGhostY(targetP, this.p1);
          this.lock(targetP);
          this.clearLines();
          this.spawn(targetP, 14);
          this.broadcastState();
          return;
        }

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

    if (state.tGameOver && !this.gameOver && state.tGameOver.ts !== this.lastGameOverTs) {
      this.lastGameOverTs = state.tGameOver.ts;
      this.gameOver = true;
      this.totalLines = state.tGameOver.lines;
      if (state.tGameOver.won) {
        sound.victory();
        profileManager.unlockBadge('tetris-master');
        const badge = profileManager.addWin('tetris-dual');
        showRematchModal({
          won: true,
          title: '¡Maestros del Tetris Dual! 🧩',
          statsText: `Líneas cooperativas: ${this.totalLines} / 8 completadas`,
          stars: 3,
          newBadge: badge || undefined,
          onRematch: () => this.restartGame(),
          onLobby: () => {
            this.ctx.sync.setState({ host_location: null });
            this.ctx.onLobby?.();
          },
        });
      } else {
        sound.defeat();
        profileManager.resetStreak('tetris-dual');
        showRematchModal({
          won: false,
          title: '¡El tablero llegó al tope! 💥',
          statsText: `Líneas cooperativas logradas: ${this.totalLines} / 8 meta`,
          stars: this.totalLines >= 4 ? 2 : 1,
          onRematch: () => this.restartGame(),
          onLobby: () => {
            this.ctx.sync.setState({ host_location: null });
            this.ctx.onLobby?.();
          },
        });
      }
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

    // Header Scoreboard Banner
    c.fillStyle = '#2d3436';
    c.font = 'bold 20px "Patrick Hand", cursive, sans-serif';
    c.textAlign = 'center';
    c.fillText(`🧩 Líneas Cooperativas: ${this.totalLines} / 8 meta`, w / 2, Math.max(22, offsetY - 10));

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

    // Draw Ghost Pieces with dotted projection line
    if (this.p1.active) {
      const gy1 = this.getGhostY(this.p1, this.p2);
      this.drawGhostPiece(c, this.p1, gy1, cellSize, '#0984e3');
    }
    if (this.p2.active) {
      const gy2 = this.getGhostY(this.p2, this.p1);
      this.drawGhostPiece(c, this.p2, gy2, cellSize, '#ff7675');
    }

    // Draw Active Pieces
    if (this.p1.active) this.drawPiece(c, this.p1, cellSize, '#0984e3', 'P1 🔵');
    if (this.p2.active) this.drawPiece(c, this.p2, cellSize, '#ff7675', 'P2 🔴');

    // Partículas de limpieza de líneas
    this.particles.updateAndDraw(c);

    // Border
    c.strokeStyle = '#2d3436';
    c.lineWidth = 4;
    c.strokeRect(0, 0, this.COLS * cellSize, this.ROWS * cellSize);
    c.restore();

    // Draw Buttons (Bottom 20%)
    c.font = 'bold 24px "Patrick Hand", cursive, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    
    for (const b of this.buttons) {
      const bx = b.x * w;
      const by = b.y * h;
      const bw = b.w * w;
      const bh = b.h * h;

      c.fillStyle = b.id === 'hard_drop' ? '#ffeaa7' : '#ffffff';
      c.strokeStyle = '#2d3436';
      c.lineWidth = 2.5;
      c.beginPath();
      c.roundRect(bx, by, bw, bh, 10);
      c.fill();
      c.stroke();
      
      c.fillStyle = '#2d3436';
      c.fillText(b.text, bx + bw/2, by + bh/2);
    }
  }

  private drawGhostPiece(c: CanvasRenderingContext2D, p: PieceState, gy: number, size: number, color: string) {
    const shape = this.getShape(p.id, p.rot);

    // 1. Líneas punteadas de proyección desde la pieza activa hasta la posición fantasma
    c.save();
    c.setLineDash([4, 4]);
    c.strokeStyle = color;
    c.lineWidth = 1.5;
    c.globalAlpha = 0.4;
    for (let col = 0; col < shape[0].length; col++) {
      let lowestActiveR = -1;
      for (let r = 0; r < shape.length; r++) {
        if (shape[r][col] !== 0) lowestActiveR = r;
      }
      if (lowestActiveR >= 0) {
        const lx = (p.x + col + 0.5) * size;
        const startY = (p.y + lowestActiveR + 1) * size;
        const endY = (gy + lowestActiveR) * size;
        if (endY > startY) {
          c.beginPath();
          c.moveTo(lx, startY);
          c.lineTo(lx, endY);
          c.stroke();
        }
      }
    }
    c.restore();

    // 2. Silueta punteada translúcida
    c.save();
    c.globalAlpha = 0.3;
    c.setLineDash([3, 3]);
    for (let r = 0; r < shape.length; r++) {
      for (let col = 0; col < shape[r].length; col++) {
        if (shape[r][col] !== 0) {
          const gx = (p.x + col) * size;
          const gyPos = (gy + r) * size;
          c.fillStyle = color;
          c.fillRect(gx + 2, gyPos + 2, size - 4, size - 4);
          c.strokeStyle = color;
          c.lineWidth = 1.5;
          c.strokeRect(gx + 2, gyPos + 2, size - 4, size - 4);
        }
      }
    }
    c.restore();
  }

  private drawPiece(c: CanvasRenderingContext2D, p: PieceState, size: number, glowColor = '', label = '') {
    const shape = this.getShape(p.id, p.rot);
    for (let r = 0; r < shape.length; r++) {
      for (let col = 0; col < shape[r].length; col++) {
        if (shape[r][col] !== 0) {
          this.drawBlock(c, p.x + col, p.y + r, size, p.id);
        }
      }
    }

    // Label tag above piece
    if (label) {
      c.save();
      c.fillStyle = glowColor;
      c.font = 'bold 13px "Patrick Hand", cursive';
      c.textAlign = 'center';
      const centerX = (p.x + shape[0].length / 2) * size;
      const topY = p.y * size - 6;
      c.fillText(label, centerX, topY);
      c.restore();
    }
  }

  private drawBlock(c: CanvasRenderingContext2D, x: number, y: number, size: number, id: number) {
    const pad = 2;
    c.fillStyle = COLORS[id];
    c.strokeStyle = '#2d3436';
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
  private particles = new ParticleSystem();

  // Physics & Animation state
  private balloon = { x: 0, y: 0, vx: 0, vy: 0, radius: 42 };
  private gravity = 0.32;
  private jumpForce = -9.5;
  private syncInterval: any = null;
  private lastPulseTs = 0;
  private squash = 1;
  private squashVel = 0;
  private score = 0;
  private startTime = 0;
  private gameOver = false;

  // Juice: Wind gusts & Floating counters
  private wind = 0;
  private windTimer = 0;
  private nextWindCountdown = 280;
  private windParticles: { x: number, y: number, vx: number, len: number }[] = [];
  private floatCounters: { x: number, y: number, text: string, color: string, timer: number, scale: number }[] = [];

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;
    this.restart();

    ctx.canvas.addEventListener('pointerdown', this.onTap);
    this.startSyncLoop();
    ctx.sync.on('stateChange', this.onStateChange);
    this.loop();
  }

  private startSyncLoop() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (!this.ctx?.isHost) return;
    this.syncInterval = setInterval(() => {
      if (this.gameOver) return;
      this.ctx.sync.setState({
        balloonState: {
          x: this.balloon.x,
          y: this.balloon.y,
          vy: this.balloon.vy,
          score: this.score,
          over: this.gameOver,
          ts: Date.now()
        }
      });
    }, 80);
  }

  private lastTapBy: string | null = null;
  private comboMultiplier = 1;
  private powerup: { x: number, y: number, type: 'star' | 'feather', radius: number, active: boolean } | null = null;
  private powerupTimeout: any = null;

  private restart() {
    if (this.powerupTimeout) {
      clearTimeout(this.powerupTimeout);
      this.powerupTimeout = null;
    }
    this.balloon.x = this.ctx.canvas.width / 2;
    this.balloon.y = this.ctx.canvas.height * 0.4;
    this.balloon.vx = 0;
    this.balloon.vy = 0;
    this.score = 0;
    this.squash = 1;
    this.squashVel = 0;
    this.wind = 0;
    this.windTimer = 0;
    this.nextWindCountdown = 240;
    this.windParticles = [];
    this.floatCounters = [];
    this.gameOver = false;
    this.startTime = Date.now();
    this.lastTapBy = null;
    this.comboMultiplier = 1;
    this.spawnPowerup();
  }

  private spawnPowerup() {
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;
    this.powerup = {
      x: 60 + Math.random() * (w - 120),
      y: h * 0.2 + Math.random() * (h * 0.4),
      type: Math.random() < 0.5 ? 'star' : 'feather',
      radius: 22,
      active: true,
    };
  }

  private handleTapLogic(userId: string) {
    this.balloon.vy = this.jumpForce;
    this.balloon.vx += (Math.random() - 0.5) * 3;
    this.squash = 0.52;
    this.squashVel = -0.15;

    if (this.lastTapBy && this.lastTapBy !== userId) {
      this.comboMultiplier = Math.min(8, this.comboMultiplier + 1);
      this.particles.spawnConfetti(this.balloon.x, this.balloon.y, 10);
      sound.star();
    } else {
      this.comboMultiplier = 1;
      sound.boing(340);
    }
    this.lastTapBy = userId;
    this.score += this.comboMultiplier;
    haptic(20);

    // Floating counter popup
    this.floatCounters.push({
      x: this.balloon.x + (Math.random() - 0.5) * 20,
      y: this.balloon.y - 45,
      text: this.comboMultiplier > 1 ? `x${this.comboMultiplier} COMBO! 🔥` : `+1 🎈`,
      color: this.comboMultiplier > 1 ? '#d63031' : '#0984e3',
      timer: 35,
      scale: 1.6,
    });
  }

  private onTap = () => {
    if (this.gameOver) return;
    this.handleTapLogic(this.ctx.me.id);

    if (!this.ctx.isHost) {
      this.ctx.sync.setState({ pulse: { ts: Date.now(), by: this.ctx.me.id } });
    }
  };

  private onStateChange = (state: any) => {
    if (this.ctx.isHost && state.pulse && state.pulse.ts !== this.lastPulseTs) {
      this.lastPulseTs = state.pulse.ts;
      this.handleTapLogic(state.pulse.by || 'guest');
    } else if (!this.ctx.isHost && state.balloonState) {
      this.balloon.x = state.balloonState.x;
      this.balloon.y = state.balloonState.y;
      this.score = state.balloonState.score;
      this.comboMultiplier = state.balloonState.combo || 1;
      if (state.balloonState.over && !this.gameOver) {
        this.triggerGameOver();
      }
    }
  };

  private triggerGameOver() {
    if (this.gameOver) return;
    this.gameOver = true;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    sound.explosion();
    haptic([80, 80, 140]);
    this.particles.spawnConfetti(this.balloon.x, this.balloon.y, 45);

    const seconds = Math.floor((Date.now() - this.startTime) / 1000);
    const won = seconds >= 30;

    let newBadge: string | undefined = undefined;
    if (won) {
      profileManager.unlockBadge('balloon-ace');
      const b = profileManager.addWin('balloon');
      if (b) newBadge = b;
      sound.victory();
    } else {
      profileManager.resetStreak('balloon');
    }

    showRematchModal({
      won,
      title: won ? '¡Acróbatas del Globo!' : '¡El globo cayó al suelo! 💥',
      statsText: `Toques en equipo: ${this.score} · Tiempo: ${seconds}s`,
      stars: won ? (seconds >= 45 ? 3 : 2) : 1,
      newBadge,
      onRematch: () => {
        this.restart();
        if (this.ctx.isHost) {
          this.startSyncLoop();
          this.ctx.sync.setState({ balloonState: { over: false, score: 0, ts: Date.now() } });
        }
      },
      onLobby: () => {
        this.ctx.sync.setState({ balloonState: null, host_location: null });
        this.ctx.onLobby?.();
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

    this.balloon.vy += this.gravity;
    this.balloon.y += this.balloon.vy;
    this.balloon.x += this.balloon.vx;
    this.balloon.vx *= 0.98; // Lateral friction

    // Oscilación elástica de squash & stretch
    this.squashVel += (1 - this.squash) * 0.28;
    this.squashVel *= 0.76;
    this.squash += this.squashVel;

    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    // Ráfagas dinámicas de viento
    if (this.ctx.isHost) {
      this.nextWindCountdown--;
      if (this.nextWindCountdown <= 0) {
        this.nextWindCountdown = 260 + Math.floor(Math.random() * 120);
        this.windTimer = 110;
        this.wind = (Math.random() > 0.5 ? 1 : -1) * (1.6 + Math.random() * 1.5);
        sound.windGust();
        for (let i = 0; i < 6; i++) {
          this.windParticles.push({
            x: this.wind > 0 ? -20 : w + 20,
            y: 70 + Math.random() * (h * 0.65),
            vx: this.wind * (4 + Math.random() * 3),
            len: 25 + Math.random() * 35,
          });
        }
      }
    }
    if (this.windTimer > 0) {
      this.windTimer--;
      this.balloon.vx += this.wind * 0.045;
    }
    for (let i = this.windParticles.length - 1; i >= 0; i--) {
      const wp = this.windParticles[i];
      wp.x += wp.vx;
      if (wp.x < -100 || wp.x > w + 100) this.windParticles.splice(i, 1);
    }

    // Actualizar contadores flotantes
    for (let i = this.floatCounters.length - 1; i >= 0; i--) {
      const fc = this.floatCounters[i];
      fc.timer--;
      fc.y -= 1.4;
      fc.scale += (1 - fc.scale) * 0.12;
      if (fc.timer <= 0) this.floatCounters.splice(i, 1);
    }

    // Walls bounce
    if (this.balloon.x - this.balloon.radius < 10) {
      this.balloon.x = this.balloon.radius + 10;
      this.balloon.vx = -this.balloon.vx * 0.7;
    }
    if (this.balloon.x + this.balloon.radius > w - 10) {
      this.balloon.x = w - this.balloon.radius - 10;
      this.balloon.vx = -this.balloon.vx * 0.7;
    }

    // Ceiling constraint
    if (this.balloon.y - this.balloon.radius < 20) {
      this.balloon.y = this.balloon.radius + 20;
      this.balloon.vy = 2;
    }

    // Powerup collision
    if (this.powerup && this.powerup.active) {
      const dx = this.balloon.x - this.powerup.x;
      const dy = this.balloon.y - this.powerup.y;
      if (Math.sqrt(dx * dx + dy * dy) < this.balloon.radius + this.powerup.radius) {
        this.powerup.active = false;
        sound.star();
        haptic(30);
        this.particles.spawnConfetti(this.powerup.x, this.powerup.y, 25);
        if (this.powerup.type === 'star') {
          this.score += 5;
        } else {
          this.balloon.vy = -7;
        }
        if (this.powerupTimeout) clearTimeout(this.powerupTimeout);
        this.powerupTimeout = setTimeout(() => {
          this.powerupTimeout = null;
          this.spawnPowerup();
        }, 7000);
      }
    }

    // Floor = Game Over!
    if (this.balloon.y + this.balloon.radius >= h - 25) {
      this.triggerGameOver();
      if (this.ctx.isHost) {
        this.ctx.sync.setState({
          balloonState: { over: true, y: this.balloon.y, score: this.score, ts: Date.now() }
        });
      }
    }
  }

  private draw() {
    const c = this.canvasCtx;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    c.clearRect(0, 0, w, h);

    // Ráfagas de viento visibles
    c.save();
    c.strokeStyle = 'rgba(116, 185, 255, 0.6)';
    c.lineWidth = 2.5;
    c.lineCap = 'round';
    for (const wp of this.windParticles) {
      c.beginPath();
      c.moveTo(wp.x, wp.y);
      c.lineTo(wp.x + (wp.vx > 0 ? wp.len : -wp.len), wp.y);
      c.stroke();
    }
    c.restore();

    // Floor hazard spikes / grass
    c.strokeStyle = '#2d3436';
    c.fillStyle = '#ff7675';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x < w; x += 25) {
      c.lineTo(x + 12, h - 20);
      c.lineTo(x + 25, h);
    }
    c.fill();
    c.stroke();

    // Stats & Combo HUD
    const elapsed = this.gameOver ? 0 : Math.floor((Date.now() - this.startTime) / 1000);
    c.fillStyle = '#2d3436';
    c.font = 'bold 22px "Patrick Hand", cursive';
    c.textAlign = 'left';
    c.fillText(`🎈 Toques: ${this.score}`, 20, 36);

    c.textAlign = 'center';
    c.fillStyle = this.comboMultiplier > 1 ? '#d63031' : '#2d3436';
    c.fillText(`🔥 Combo x${this.comboMultiplier}`, w / 2, 36);

    if (this.windTimer > 0) {
      c.fillStyle = '#0984e3';
      c.font = 'bold 17px "Patrick Hand", cursive';
      c.fillText(this.wind > 0 ? '🌬️ ¡Viento hacia la Derecha! ▶' : '◀ 🌬️ ¡Viento hacia la Izquierda!', w / 2, 64);
    }

    c.fillStyle = '#2d3436';
    c.textAlign = 'right';
    c.font = 'bold 22px "Patrick Hand", cursive';
    c.fillText(`⏱️ ${elapsed}s / 30s meta`, w - 20, 36);

    // Powerup floating bubble
    if (this.powerup && this.powerup.active) {
      c.save();
      c.translate(this.powerup.x, this.powerup.y);
      c.beginPath();
      c.arc(0, 0, this.powerup.radius, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255, 234, 167, 0.45)';
      c.fill();
      c.strokeStyle = '#fdcb6e';
      c.lineWidth = 2.5;
      c.stroke();
      c.font = '22px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(this.powerup.type === 'star' ? '⭐' : '🪶', 0, 1);
      c.restore();
    }

    // Globo con squash & stretch auténtico
    if (!this.gameOver) {
      c.save();
      c.translate(this.balloon.x, this.balloon.y);
      const safeSquash = Math.max(0.35, Math.min(1.8, this.squash));
      c.scale(1 / Math.sqrt(safeSquash), safeSquash);

      // Doodle String
      c.beginPath();
      c.moveTo(0, this.balloon.radius);
      c.quadraticCurveTo(12, this.balloon.radius + 25, -6, this.balloon.radius + 55);
      c.strokeStyle = '#2d3436';
      c.lineWidth = 3.5;
      c.lineCap = 'round';
      c.stroke();

      // Doodle Balloon
      c.beginPath();
      c.arc(0, 0, this.balloon.radius, 0, Math.PI * 2);
      c.fillStyle = '#ff7675';
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = '#2d3436';
      c.stroke();

      // Reflection
      c.beginPath();
      c.arc(-12, -12, 7, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.fill();

      // Animated Face
      const isDanger = this.balloon.y > h * 0.72 || this.balloon.vy > 6;
      if (isDanger) {
        c.fillStyle = '#2d3436';
        c.font = 'bold 15px sans-serif';
        c.textAlign = 'center';
        c.fillText('●   ●', 0, -4);
        c.fillText('O', 0, 14);
        c.fillStyle = '#74b9ff';
        c.fillText('💧', 18, -12);
      } else {
        c.fillStyle = '#2d3436';
        c.font = 'bold 14px sans-serif';
        c.textAlign = 'center';
        c.fillText('^   ^', 0, -4);
        c.beginPath();
        c.arc(0, 4, 7, 0.2, Math.PI - 0.2);
        c.lineWidth = 2.5;
        c.strokeStyle = '#2d3436';
        c.stroke();
      }

      c.restore();
    }

    // Contadores de toques/combos flotantes
    for (const fc of this.floatCounters) {
      c.save();
      c.font = `bold ${Math.floor(22 * fc.scale)}px "Patrick Hand", cursive`;
      c.fillStyle = fc.color;
      c.strokeStyle = 'white';
      c.lineWidth = 4;
      c.textAlign = 'center';
      c.strokeText(fc.text, fc.x, fc.y);
      c.fillText(fc.text, fc.x, fc.y);
      c.restore();
    }

    this.particles.updateAndDraw(c);
  }

  destroy(): void {
    this.gameOver = true;
    cancelAnimationFrame(this.animId);
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.powerupTimeout) {
      clearTimeout(this.powerupTimeout);
      this.powerupTimeout = null;
    }
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

  // Juice: Real-time Player Cursors & Animated Flags
  private p1Cursor = { r: -1, c: -1, active: false };
  private p2Cursor = { r: -1, c: -1, active: false };
  private flagAnims: Record<string, number> = {};

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;
    this.gameOver = false;
    this.won = false;
    this.flagMode = false;
    this.generated = false;
    this.flagAnims = {};
    this.p1Cursor = { r: -1, c: -1, active: false };
    this.p2Cursor = { r: -1, c: -1, active: false };

    // Init empty board
    this.board = [];
    for (let r = 0; r < MS_ROWS; r++) {
      this.board[r] = [];
      for (let c = 0; c < MS_COLS; c++) {
        this.board[r][c] = { value: 0, display: 'hidden' };
      }
    }

    ctx.canvas.addEventListener('pointerdown', this.onPointerDown);
    ctx.canvas.addEventListener('pointermove', this.onPointerMove);
    ctx.canvas.addEventListener('pointerleave', this.onPointerLeave);
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
  private shieldMines = 1;

  // ── Flood-fill reveal ──
  private reveal(r: number, c: number) {
    if (r < 0 || r >= MS_ROWS || c < 0 || c >= MS_COLS) return;
    const cell = this.board[r][c];
    if (cell.display !== 'hidden') return;

    if (cell.value === -1) {
      if (this.shieldMines > 0) {
        this.shieldMines--;
        cell.display = 'revealed';
        sound.thud(160);
        haptic([60, 60, 100]);
        showToast('🛡️ ¡Escudo Cooperativo! Mina neutralizada.');
        return;
      }

      // BOOM — reveal all mines
      this.gameOver = true;
      this.won = false;
      sound.explosion();
      haptic([100, 100, 150]);
      profileManager.resetStreak('minesweeper');

      for (let rr = 0; rr < MS_ROWS; rr++) {
        for (let cc = 0; cc < MS_COLS; cc++) {
          if (this.board[rr][cc].value === -1) this.board[rr][cc].display = 'revealed';
        }
      }

      showRematchModal({
        won: false,
        title: '¡BOOM! Mina activada 💥',
        statsText: '¡Trabajen en equipo para la próxima!',
        stars: 1,
        onRematch: () => this.handleRestart(),
        onLobby: () => {
          this.ctx.sync.setState({ host_location: null });
          this.ctx.onLobby?.();
        }
      });
      return;
    }

    cell.display = 'revealed';

    if (cell.value === 0) {
      sound.pleasantChord();
      // Flood fill empty cells
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          this.reveal(r + dr, c + dc);
        }
      }
    } else {
      sound.playScaleNote(cell.value);
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
    const willFlag = cell.display !== 'flagged';
    cell.display = willFlag ? 'flagged' : 'hidden';
    if (willFlag) {
      this.flagAnims[`${r}_${c}`] = 1.0;
      sound.click();
    }
  }

  private handleRestart() {
    this.restart();
    if (this.ctx.isHost) {
      this.broadcastBoard();
    } else {
      this.ctx.sync.setState({ msRestart: { ts: Date.now() } });
    }
  }

  // ── Pointer handlers ──
  private onPointerMove = (e: PointerEvent) => {
    const rect = this.ctx.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;
    const boardH = h * 0.85;
    const cellSize = Math.min(w / MS_COLS, boardH / MS_ROWS);
    const offsetX = (w - cellSize * MS_COLS) / 2;
    const offsetY = (boardH - cellSize * MS_ROWS) / 2;

    const col = Math.floor((px - offsetX) / cellSize);
    const row = Math.floor((py - offsetY) / cellSize);

    if (row >= 0 && row < MS_ROWS && col >= 0 && col < MS_COLS) {
      const myCur = this.ctx.isHost ? this.p1Cursor : this.p2Cursor;
      if (myCur.r !== row || myCur.c !== col || !myCur.active) {
        myCur.r = row;
        myCur.c = col;
        myCur.active = true;
        this.ctx.sync.setState({
          msCursor: { r: row, c: col, by: this.ctx.me.id, ts: Date.now() }
        });
      }
    }
  };

  private onPointerLeave = () => {
    const myCur = this.ctx.isHost ? this.p1Cursor : this.p2Cursor;
    myCur.active = false;
    this.ctx.sync.setState({
      msCursor: { r: -1, c: -1, by: this.ctx.me.id, ts: Date.now() }
    });
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.gameOver || this.won) {
      this.handleRestart();
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
      } else if (this.board[r][c].display === 'revealed' && this.board[r][c].value > 0) {
        // Chording
        let flags = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < MS_ROWS && nc >= 0 && nc < MS_COLS) {
              if (this.board[nr][nc].display === 'flagged') flags++;
            }
          }
        }
        if (flags === this.board[r][c].value) {
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < MS_ROWS && nc >= 0 && nc < MS_COLS) {
                if (this.board[nr][nc].display === 'hidden') this.reveal(nr, nc);
              }
            }
          }
        }
      }
    }
    if (!this.gameOver) {
      this.won = this.checkWin();
      if (this.won) {
        sound.victory();
        haptic([40, 50, 100]);
        profileManager.unlockBadge('minesweeper-pro');
        const badge = profileManager.addWin('minesweeper');
        showRematchModal({
          won: true,
          title: '¡Tablero Despejado! 🎉',
          statsText: '¡Desactivaron todas las minas en pareja!',
          stars: 3,
          newBadge: badge || undefined,
          onRematch: () => this.handleRestart(),
          onLobby: () => {
            this.ctx.sync.setState({ host_location: null });
            this.ctx.onLobby?.();
          }
        });
      }
    }
  }

  private restart() {
    this.gameOver = false;
    this.won = false;
    this.generated = false;
    this.shieldMines = 1;
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
    if (state.msRestart && state.msRestart.ts !== this.lastActionTs) {
      this.lastActionTs = state.msRestart.ts;
      this.restart();
      if (this.ctx.isHost) this.broadcastBoard();
    }

    if (state.msCursor && state.msCursor.by !== this.ctx.me.id) {
      const peerCur = this.ctx.isHost ? this.p2Cursor : this.p1Cursor;
      if (state.msCursor.r >= 0) {
        peerCur.r = state.msCursor.r;
        peerCur.c = state.msCursor.c;
        peerCur.active = true;
      } else {
        peerCur.active = false;
      }
    }

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
          // Raised cell with animated waving flag
          c.fillStyle = '#e8e4df';
          c.strokeStyle = '#2d3436';
          c.lineWidth = 2;
          c.beginPath();
          c.rect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2);
          c.fill();
          c.stroke();

          // Draw animated waving flag
          const fx = x + cellSize * 0.42;
          const fy = y + cellSize * 0.18;
          const fh = cellSize * 0.62;
          const wave = Math.sin(Date.now() * 0.007 + r * 2 + col) * 4;

          // Pole
          c.strokeStyle = '#2d3436';
          c.lineWidth = 2.5;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(fx, fy);
          c.lineTo(fx, fy + fh);
          c.stroke();

          // Animated Waving Flag fabric
          c.fillStyle = '#ff7675';
          c.beginPath();
          c.moveTo(fx, fy);
          c.quadraticCurveTo(fx + cellSize * 0.2 + wave, fy + cellSize * 0.08, fx + cellSize * 0.38 + wave, fy + cellSize * 0.16);
          c.lineTo(fx, fy + cellSize * 0.32);
          c.closePath();
          c.fill();
          c.strokeStyle = '#2d3436';
          c.lineWidth = 1.5;
          c.stroke();
        }
      }
    }

    // Indicadores de Cursor de Jugadores en tiempo real
    if (this.p1Cursor.active && this.p1Cursor.r >= 0 && this.p1Cursor.r < MS_ROWS && this.p1Cursor.c >= 0 && this.p1Cursor.c < MS_COLS) {
      this.drawPlayerCursor(c, this.p1Cursor.c * cellSize, this.p1Cursor.r * cellSize, cellSize, '#0984e3', 'P1 🔵');
    }
    if (this.p2Cursor.active && this.p2Cursor.r >= 0 && this.p2Cursor.r < MS_ROWS && this.p2Cursor.c >= 0 && this.p2Cursor.c < MS_COLS) {
      this.drawPlayerCursor(c, this.p2Cursor.c * cellSize, this.p2Cursor.r * cellSize, cellSize, '#e17055', 'P2 🔴');
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

    // Cooperative Shield indicator
    c.fillStyle = this.shieldMines > 0 ? '#00b894' : '#b2bec3';
    c.font = `bold ${btnH * 0.45}px 'Patrick Hand', cursive`;
    c.textAlign = 'center';
    c.fillText(this.shieldMines > 0 ? '🛡️ Escudo x1' : '🛡️ Usado', w * 0.58, btnY + btnH / 2);

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

  private drawPlayerCursor(c: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, label: string) {
    c.save();
    const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.08;
    c.strokeStyle = color;
    c.lineWidth = 3;
    c.setLineDash([4, 4]);
    c.strokeRect(x - 2, y - 2, size + 4, size + 4);

    c.setLineDash([]);
    c.fillStyle = color;
    c.font = 'bold 12px "Patrick Hand", cursive';
    c.textAlign = 'left';
    c.fillText(label, x + 2, y - 5);
    c.restore();
  }

  destroy(): void {
    cancelAnimationFrame(this.animId);
    this.ctx.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.ctx.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.ctx.canvas.removeEventListener('pointerleave', this.onPointerLeave);
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
  private particles = new ParticleSystem();

  private bridge: BridgeRow[] = [];
  private avatarRow = -1;       // -1 = start platform, 0..7 = on bridge, 8 = finish
  private avatarSide: 'left' | 'right' | null = null;
  private lives = CB_LIVES;
  private gameOver = false;
  private won = false;
  private revealed: boolean[][] = []; // which tiles have been stepped on
  private shakeTimer = 0;
  private lastActionTs = 0;

  // Jump animation state
  private avatarX = 0;
  private avatarY = 0;
  private targetAvatarX = 0;
  private targetAvatarY = 0;
  private jumpProgress = 1; // 1 = landed
  private isJumping = false;

  // Host guide ping beacon
  private pingBeacon: { row: number, side: 'left' | 'right', timer: number } | null = null;

  // Juice: Checkpoint & Comic Fall
  private checkpointRow = 3; // Punto de control en la fila 4 (índice 3)
  private comicFallTimer = 0;
  private smokeClouds: { x: number, y: number, r: number, alpha: number, vx: number, vy: number }[] = [];

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;
    this.gameOver = false;
    this.won = false;
    this.lives = CB_LIVES;
    this.avatarRow = -1;
    this.avatarSide = null;
    this.shakeTimer = 0;
    this.comicFallTimer = 0;
    this.smokeClouds = [];
    this.jumpProgress = 1;
    this.isJumping = false;
    this.pingBeacon = null;

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

  private spawnSmokePuff(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.5;
      this.smokeClouds.push({
        x: x + Math.cos(angle) * 6,
        y: y + Math.sin(angle) * 6,
        r: 10 + Math.random() * 10,
        alpha: 0.85,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.4,
      });
    }
  }

  private handleRestart(swapRoles = false) {
    if (swapRoles) {
      this.ctx.isHost = !this.ctx.isHost;
      showToast(this.ctx.isHost ? '👁️ Ahora eres el Guía' : '🚶 Ahora eres el Caminante');
    }
    this.restart();
    if (this.ctx.isHost) {
      this.broadcastState();
    } else {
      this.ctx.sync.setState({ cbRestart: { ts: Date.now(), swapRoles } });
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.gameOver || this.won) {
      this.handleRestart();
      return;
    }

    const rect = this.ctx.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    // HOST GUIDE TOOL: Host taps safe or unrevealed tile to ping a beacon for Guest
    if (this.ctx.isHost) {
      const topPad = h * 0.08;
      const botPad = h * 0.12;
      const bridgeH = h - topPad - botPad;
      const rowH = bridgeH / (CB_ROWS + 2);
      const clickedRow = Math.floor((py - topPad) / rowH) - 1;

      if (clickedRow >= 0 && clickedRow < CB_ROWS) {
        const side: 'left' | 'right' = px < w / 2 ? 'left' : 'right';
        this.pingBeacon = { row: clickedRow, side, timer: 80 };
        sound.click();
        haptic(15);
        this.ctx.sync.setState({
          cbPing: { row: clickedRow, side, ts: Date.now(), by: this.ctx.me.id }
        });
      }
      return;
    }

    // GUEST MOVER: Guest steps forward onto chosen side
    if (this.isJumping) return; // Prevent double jumping while airborne

    const side: 'left' | 'right' = px < w / 2 ? 'left' : 'right';
    this.ctx.sync.setState({
      cbStep: { side, ts: Date.now(), by: this.ctx.me.id }
    });
  };

  private processStep(side: 'left' | 'right') {
    if (this.gameOver || this.won) return;

    const nextRow = this.avatarRow + 1;

    if (nextRow >= CB_ROWS) {
      this.avatarRow = CB_ROWS;
      this.won = true;
      sound.victory();
      haptic([50, 50, 100]);
      profileManager.unlockBadge('glass-walker');
      const badge = profileManager.addWin('crystal-bridge');

      this.particles.spawnConfetti(this.ctx.canvas.width / 2, this.ctx.canvas.height * 0.15, 40);

      showRematchModal({
        won: true,
        title: '¡Cruzaron el Puente! 🎉',
        statsText: `¡Memoria y sincronía impecables! Vidas restantes: ${this.lives}`,
        stars: this.lives >= 3 ? 3 : 2,
        newBadge: badge || undefined,
        canSwapRoles: true,
        onRematch: (swap) => this.handleRestart(swap),
        onLobby: () => {
          this.ctx.sync.setState({ host_location: null });
          this.ctx.onLobby?.();
        }
      });
      return;
    }

    this.avatarRow = nextRow;
    this.avatarSide = side;
    const sideIdx = side === 'left' ? 0 : 1;
    this.revealed[nextRow][sideIdx] = true;

    const safe = side === 'left' ? this.bridge[nextRow].leftSafe : !this.bridge[nextRow].leftSafe;

    if (!safe) {
      this.lives--;
      this.shakeTimer = 24;
      this.comicFallTimer = 36;
      sound.comicWhistle();
      sound.explosion();
      haptic([100, 100, 150]);
      this.spawnSmokePuff(this.avatarX, this.avatarY);

      if (this.lives <= 0) {
        this.gameOver = true;
        profileManager.resetStreak('crystal-bridge');
        sound.defeat();

        for (let i = 0; i < CB_ROWS; i++) {
          this.revealed[i] = [true, true];
        }

        showRematchModal({
          won: false,
          title: '¡Se rompió el cristal! 💔',
          statsText: `Llegaron a la baldosa ${this.avatarRow + 1} de ${CB_ROWS}`,
          stars: 1,
          canSwapRoles: true,
          onRematch: (swap) => this.handleRestart(swap),
          onLobby: () => {
            this.ctx.sync.setState({ host_location: null });
            this.ctx.onLobby?.();
          }
        });
      } else {
        // Si ya superaron el checkpoint, reaparecen en el checkpoint
        if (nextRow > this.checkpointRow) {
          this.avatarRow = this.checkpointRow;
          showToast('🚩 ¡Punto de Control! Reaparecen en la fila 4.');
        } else {
          this.avatarRow = nextRow - 1;
        }
      }
    } else {
      sound.boing(320);
      haptic(20);
    }
  }

  private restart() {
    this.gameOver = false;
    this.won = false;
    this.lives = CB_LIVES;
    this.avatarRow = -1;
    this.avatarSide = null;
    this.shakeTimer = 0;
    this.jumpProgress = 1;
    this.isJumping = false;
    this.pingBeacon = null;
    this.bridge = [];
    this.revealed = [];
    for (let i = 0; i < CB_ROWS; i++) {
      this.bridge.push({ leftSafe: Math.random() < 0.5 });
      this.revealed.push([false, false]);
    }
  }

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
    if (state.cbRestart && state.cbRestart.ts !== this.lastActionTs) {
      this.lastActionTs = state.cbRestart.ts;
      this.handleRestart(state.cbRestart.swapRoles);
    }

    // Ping beacon received
    if (state.cbPing && state.cbPing.ts !== this.lastActionTs) {
      this.lastActionTs = state.cbPing.ts;
      this.pingBeacon = { row: state.cbPing.row, side: state.cbPing.side, timer: 80 };
      if (!this.ctx.isHost) {
        sound.lineClear();
        haptic([15, 30, 20]);
      }
    }

    // Host receives step from guest
    if (this.ctx.isHost && state.cbStep && state.cbStep.ts !== this.lastActionTs) {
      this.lastActionTs = state.cbStep.ts;
      if (state.cbStep.by !== this.ctx.me.id) {
        const sideStr: 'left' | 'right' = (state.cbStep.side === 0 || state.cbStep.side === 'left') ? 'left' : 'right';
        this.processStep(sideStr);
        this.broadcastState();
      }
    }

    // Guest receives authoritative state
    if (state.cbState) {
      const prevRow = this.avatarRow;
      if (!this.ctx.isHost) {
        this.avatarRow = state.cbState.row;
        this.avatarSide = state.cbState.side;
        this.lives = state.cbState.lives;
        this.gameOver = state.cbState.over;
        this.won = state.cbState.won;
        this.revealed = state.cbState.revealed;
      }
      if (state.cbState.bridge) {
        for (let i = 0; i < CB_ROWS; i++) {
          this.bridge[i] = { leftSafe: state.cbState.bridge[i] };
        }
      }
      if (state.cbState.over || state.cbState.won) {
        if (!this.ctx.isHost && state.cbState.over) {
          this.shakeTimer = 22;
        }
      }
      // Trigger jump if row changed
      if (this.avatarRow !== prevRow) {
        this.jumpProgress = 0;
        this.isJumping = true;
      }
    }
  };

  private loop = () => {
    this.update();
    this.draw();
    this.animId = requestAnimationFrame(this.loop);
  };

  private update() {
    if (this.pingBeacon && this.pingBeacon.timer > 0) {
      this.pingBeacon.timer--;
      if (this.pingBeacon.timer <= 0) this.pingBeacon = null;
    }

    if (this.comicFallTimer > 0) {
      this.comicFallTimer--;
    }

    for (let i = this.smokeClouds.length - 1; i >= 0; i--) {
      const sc = this.smokeClouds[i];
      sc.x += sc.vx;
      sc.y += sc.vy;
      sc.r += 0.35;
      sc.alpha -= 0.024;
      if (sc.alpha <= 0) this.smokeClouds.splice(i, 1);
    }

    if (this.isJumping) {
      this.jumpProgress += 0.08;
      if (this.jumpProgress >= 1) {
        this.jumpProgress = 1;
        this.isJumping = false;
        // Spawn dust on landing
        this.particles.spawnConfetti(this.avatarX, this.avatarY, 6);
      }
    }
  }

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

    // Layout dimensions
    const topPad = h * 0.08;
    const botPad = h * 0.12;
    const bridgeH = h - topPad - botPad;
    const rowH = bridgeH / (CB_ROWS + 2);
    const tileW = w * 0.35;
    const tileH = rowH * 0.75;
    const gapX = w * 0.06;
    const leftX = w / 2 - gapX / 2 - tileW;
    const rightX = w / 2 + gapX / 2;

    // ── Role label & Guide hint ──
    c.font = `bold ${w * 0.042}px 'Patrick Hand', cursive`;
    c.textAlign = 'center';
    c.fillStyle = '#2d3436';
    c.fillText(
      this.ctx.isHost ? '👁️ Guía: Toca una baldosa para marcarla 📍' : '🚶 Caminante: Salta siguiendo las pistas',
      w / 2, topPad * 0.55
    );

    // ── Lives & Progress ──
    c.font = `${w * 0.048}px 'Patrick Hand', cursive`;
    c.textAlign = 'right';
    c.fillStyle = '#2d3436';
    c.fillText('❤️'.repeat(this.lives) + '🖤'.repeat(CB_LIVES - this.lives), w - 16, topPad * 0.55);

    c.textAlign = 'left';
    c.fillStyle = '#636e72';
    c.fillText(`Paso ${Math.max(0, this.avatarRow + 1)}/${CB_ROWS}`, 16, topPad * 0.55);

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

      this.drawTile(c, leftX, tileY, tileW, tileH, i, 0, rowData.leftSafe);
      this.drawTile(c, rightX, tileY, tileW, tileH, i, 1, !rowData.leftSafe);
    }

    // ── Ping Beacon (Host Hint) ──
    if (this.pingBeacon && this.pingBeacon.timer > 0) {
      const pb = this.pingBeacon;
      const tileY = topPad + (pb.row + 1) * rowH + (rowH - tileH) / 2;
      const bx = pb.side === 'left' ? leftX : rightX;
      const centerX = bx + tileW / 2;
      const centerY = tileY + tileH / 2;
      const pulse = Math.sin(Date.now() * 0.012) * 5;

      c.save();
      c.strokeStyle = '#fdcb6e';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(centerX, centerY, tileW * 0.35 + pulse, 0, Math.PI * 2);
      c.stroke();

      c.fillStyle = '#e17055';
      c.font = `bold ${tileH * 0.45}px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      c.fillText('📍 ¡AQUÍ!', centerX, tileY - 4);
      c.restore();
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

    // ── Target Avatar Coords Calculation ──
    let targetX = w / 2;
    let targetY = startY + rowH * 0.4;

    if (this.avatarRow === -1) {
      targetY = startY + rowH * 0.4;
    } else if (this.avatarRow >= CB_ROWS) {
      targetY = finishY + rowH * 0.4;
    } else {
      const tileY = topPad + (this.avatarRow + 1) * rowH + rowH / 2;
      targetY = tileY;
      if (this.avatarSide === 'left') targetX = leftX + tileW / 2;
      else if (this.avatarSide === 'right') targetX = rightX + tileW / 2;
    }

    if (this.avatarX === 0 && this.avatarY === 0) {
      this.avatarX = targetX;
      this.avatarY = targetY;
    }

    this.targetAvatarX = targetX;
    this.targetAvatarY = targetY;

    this.avatarX += (this.targetAvatarX - this.avatarX) * 0.25;
    this.avatarY += (this.targetAvatarY - this.avatarY) * 0.25;

    // Parabolic leap height
    const parabolicArc = Math.sin(this.jumpProgress * Math.PI) * 28;
    const renderY = this.avatarY - parabolicArc;

    // Nubes de humo cómico al caer
    for (const sc of this.smokeClouds) {
      c.save();
      c.fillStyle = `rgba(240, 240, 240, ${sc.alpha})`;
      c.strokeStyle = `rgba(180, 180, 180, ${sc.alpha})`;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(sc.x, sc.y, sc.r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.restore();
    }

    // Draw avatar (o animación de caída cómica)
    if (!this.gameOver) {
      c.save();
      c.translate(this.avatarX, renderY);

      if (this.comicFallTimer > 0) {
        // Caída cómica estilo garabato
        const wobble = Math.sin(Date.now() * 0.05) * 0.35;
        c.rotate(wobble);
        c.font = `${rowH * 0.65}px serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('😵‍💫', 0, 0);

        c.font = 'bold 16px "Patrick Hand", cursive';
        c.fillStyle = '#ff7675';
        c.fillText('¡AYYY! 💦', 0, -28);
      } else {
        // Shadow
        c.fillStyle = 'rgba(0,0,0,0.15)';
        c.beginPath();
        c.ellipse(0, 12, 14, 6, 0, 0, Math.PI * 2);
        c.fill();
        // Avatar emoji normal
        c.font = `${rowH * 0.58}px serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('🧍', 0, 0);
      }
      c.restore();
    }

    // Render particle system
    this.particles.updateAndDraw(c);

    // ── Instructions for Guest ──
    if (!this.ctx.isHost && !this.gameOver && !this.won) {
      c.font = `${w * 0.04}px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.fillStyle = '#636e72';
      c.fillText('Toca izquierda o derecha para saltar 👆', w / 2, h - botPad * 0.35);
    }

    // ── Game Over / Win overlay ──
    if (this.gameOver || this.won) {
      c.fillStyle = 'rgba(253,251,247,0.85)';
      c.fillRect(-10, -10, w + 20, h + 20);

      c.fillStyle = '#2d3436';
      c.font = `bold ${w * 0.14}px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(this.won ? '🎉' : '💔', w / 2, h * 0.35);

      c.font = `bold ${w * 0.075}px 'Patrick Hand', cursive`;
      c.fillText(this.won ? '¡Cruzaron el puente!' : '¡Se rompió el cristal!', w / 2, h * 0.48);

      c.font = `${w * 0.045}px 'Patrick Hand', cursive`;
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
    const isCheckpoint = rowIdx === this.checkpointRow;

    if (wasRevealed) {
      if (isSafe) {
        c.fillStyle = 'rgba(116, 185, 255, 0.3)';
        c.strokeStyle = isCheckpoint ? '#f1c40f' : '#74b9ff';
        c.lineWidth = isCheckpoint ? 4 : 3;
        c.beginPath();
        c.roundRect(x, y, w, h, 6);
        c.fill();
        c.stroke();
        c.font = `bold ${h * 0.5}px 'Patrick Hand', cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#00b894';
        c.fillText('✓', x + w / 2, y + h / 2);
      } else {
        c.fillStyle = 'rgba(255, 118, 117, 0.15)';
        c.strokeStyle = '#ff7675';
        c.lineWidth = 2;
        c.setLineDash([4, 4]);
        c.beginPath();
        c.roundRect(x, y, w, h, 6);
        c.fill();
        c.stroke();
        c.setLineDash([]);
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
        c.font = `bold ${h * 0.4}px 'Patrick Hand', cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#d63031';
        c.fillText('✗', x + w / 2, y + h / 2);
      }
    } else {
      const isHostHint = this.ctx.isHost && isSafe;

      c.fillStyle = isHostHint ? 'rgba(85, 239, 196, 0.22)' : 'rgba(200, 200, 200, 0.25)';
      c.strokeStyle = isCheckpoint ? '#f39c12' : '#2d3436';
      c.lineWidth = isCheckpoint ? 3.5 : 2.5;
      c.beginPath();
      c.roundRect(x, y, w, h, 6);
      c.fill();
      c.stroke();

      // Brillo sutil cristalino animado (diagonal shimmer)
      const gleamProgress = ((Date.now() / 2400) + rowIdx * 0.18 + sideIdx * 0.09) % 1;
      const gx = x + gleamProgress * (w + 40) - 20;
      c.save();
      c.beginPath();
      c.roundRect(x, y, w, h, 6);
      c.clip();
      c.fillStyle = 'rgba(255, 255, 255, 0.32)';
      c.beginPath();
      c.moveTo(gx, y);
      c.lineTo(gx + 12, y);
      c.lineTo(gx - 6, y + h);
      c.lineTo(gx - 18, y + h);
      c.fill();
      c.restore();

      // Indicador sutil de checkpoint en la fila 4
      if (isCheckpoint) {
        c.fillStyle = '#f39c12';
        c.font = 'bold 11px "Patrick Hand", cursive';
        c.textAlign = 'right';
        c.fillText('🚩 CP', x + w - 4, y + 13);
      }

      // Host sees a radiant green beacon marker
      if (isHostHint) {
        c.fillStyle = 'rgba(0, 184, 148, 0.85)';
        c.beginPath();
        c.arc(x + w - 12, y + 12, 5, 0, Math.PI * 2);
        c.fill();
      }

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
  type: 'normal' | 'golden' | 'chrono' | 'legendary' | 'fish';
  tappedBy?: string;
  tappedTs?: number;
}

interface StarTap {
  id: string;
  ts: number;
  by: string;
}

const SF_STAR_COUNT = 6;
const SF_COORDINATION_WINDOW = 350; // ms window for synchronization
const SF_ROUND_SECONDS = 45;

export class StarFishingGame implements GameModule {
  private ctx!: GameContext;
  private animId = 0;
  private canvasCtx!: CanvasRenderingContext2D;
  private particles = new ParticleSystem();

  private stars: Star[] = [];
  private score = 0;
  private timeLeft = SF_ROUND_SECONDS;
  private gameOver = false;
  private won = false;
  private lastTaps: Record<string, StarTap> = {};
  private feedback: { x: number, y: number, text: string, color: string, timer: number }[] = [];
  private lastSyncTs = 0;
  private secondTimer: any = null;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;
    this.restart();

    ctx.canvas.addEventListener('pointerdown', this.onPointerDown);
    ctx.sync.on('stateChange', this.onStateChange);

    if (ctx.isHost) {
      for (let i = 0; i < SF_STAR_COUNT; i++) {
        this.stars.push(this.createStar());
      }
      this.secondTimer = setInterval(() => {
        if (!this.gameOver && this.timeLeft > 0) {
          this.timeLeft--;
          if (this.timeLeft <= 0) {
            this.handleTimeUp();
          }
          this.broadcastState();
        }
      }, 1000);
      this.broadcastState();
    }

    this.loop();
  }

  private createStar(): Star {
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;
    const roll = Math.random();
    let type: 'normal' | 'golden' | 'chrono' | 'legendary' | 'fish' = 'normal';
    if (roll < 0.12) type = 'legendary';
    else if (roll < 0.3) type = 'fish';
    else if (roll < 0.48) type = 'golden';
    else if (roll < 0.62) type = 'chrono';

    const speed = type === 'legendary' ? 3.0 : type === 'fish' ? 2.6 : type === 'golden' ? 2.4 : 1.9;

    return {
      id: Math.random().toString(36).substring(2, 9),
      x: 30 + Math.random() * (w - 60),
      y: 70 + Math.random() * (h - 140),
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - 0.5) * speed,
      size: type === 'legendary' ? 36 : type === 'fish' ? 32 : type === 'golden' ? 30 : type === 'chrono' ? 28 : 25 + Math.random() * 8,
      hue: type === 'legendary' ? 48 : type === 'fish' ? 210 : type === 'golden' ? 45 : type === 'chrono' ? 180 : Math.random() * 360,
      type
    };
  }

  private handleTimeUp() {
    this.gameOver = true;
    this.won = this.score >= 15;

    let newBadge: string | undefined = undefined;
    if (this.won) {
      sound.victory();
      haptic([50, 50, 100]);
      profileManager.unlockBadge('star-catcher');
      const b = profileManager.addWin('star-fishing');
      if (b) newBadge = b;
    } else {
      sound.defeat();
      profileManager.resetStreak('star-fishing');
    }

    showRematchModal({
      won: this.won,
      title: this.won ? '¡Pescadores de Élite! ⭐' : '¡Tiempo Agotado! ⏱️',
      statsText: `Estrellas pescadas: ${this.score} ${this.won ? '(¡Meta de 15 superada!)' : '(Meta: 15)'}`,
      stars: this.score >= 25 ? 3 : (this.won ? 2 : 1),
      newBadge,
      onRematch: () => this.handleRestart(),
      onLobby: () => {
        this.ctx.sync.setState({ host_location: null });
        this.ctx.onLobby?.();
      }
    });
  }

  private handleRestart() {
    this.restart();
    if (this.ctx.isHost) {
      this.broadcastState();
    } else {
      this.ctx.sync.setState({ sfRestart: { ts: Date.now() } });
    }
  }

  private restart() {
    this.score = 0;
    this.timeLeft = SF_ROUND_SECONDS;
    this.gameOver = false;
    this.won = false;
    this.stars = [];
    this.feedback = [];
    this.lastTaps = {};
    if (this.ctx && this.ctx.isHost) {
      for (let i = 0; i < SF_STAR_COUNT; i++) {
        this.stars.push(this.createStar());
      }
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.gameOver) {
      this.handleRestart();
      return;
    }

    const rect = this.ctx.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // Check hit on stars
    for (const star of this.stars) {
      const dx = px - star.x;
      const dy = py - star.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < star.size * 1.6) {
        star.tappedBy = this.ctx.me.id;
        star.tappedTs = Date.now();

        this.ctx.sync.setState({
          sfTap: { id: star.id, ts: Date.now(), by: this.ctx.me.id }
        });
        sound.click();
        haptic(15);
        this.addFeedback(star.x, star.y, '¡Tocado! ⚡', '#0984e3');
        break;
      }
    }
  };

  private addFeedback(x: number, y: number, text: string, color = '#2d3436') {
    this.feedback.push({ x, y, text, color, timer: 35 });
  }

  private onStateChange = (state: any) => {
    if (state.sfRestart && state.sfRestart.ts !== this.lastSyncTs) {
      this.lastSyncTs = state.sfRestart.ts;
      this.restart();
      if (this.ctx.isHost) this.broadcastState();
    }

    if (this.ctx.isHost && state.sfTap && state.sfTap.ts !== this.lastSyncTs) {
      this.lastSyncTs = state.sfTap.ts;
      this.processTap(state.sfTap);
    }

    if (!this.ctx.isHost && state.sfState) {
      this.stars = state.sfState.stars;
      this.score = state.sfState.score;
      this.timeLeft = state.sfState.timeLeft;
      this.gameOver = state.sfState.over;
      this.won = state.sfState.won;
      if (state.sfState.hit) {
        const h = state.sfState.hit;
        this.particles.spawnConfetti(h.x, h.y, h.type === 'golden' ? 35 : 18);
        this.addFeedback(h.x, h.y, h.text, h.color);
      }
    }
  };

  private processTap(tap: StarTap) {
    if (this.gameOver) return;

    const existing = this.lastTaps[tap.id];
    const targetStar = this.stars.find(s => s.id === tap.id);

    if (targetStar) {
      targetStar.tappedBy = tap.by;
      targetStar.tappedTs = tap.ts;
    }

    if (existing && existing.by !== tap.by) {
      const diff = Math.abs(tap.ts - existing.ts);
      if (diff < SF_COORDINATION_WINDOW) {
        const starIdx = this.stars.findIndex(s => s.id === tap.id);
        if (starIdx !== -1) {
          const s = this.stars[starIdx];
          const hitX = s.x;
          const hitY = s.y;
          const isInstantSync = diff < 220; // Captura simultánea exacta
          let pts = 1;
          let feedbackText = '+1 ⭐';
          let feedbackColor = '#00b894';

          if (s.type === 'legendary') {
            pts = 6;
            feedbackText = '¡ESTRELLA LEGENDARIA! 👑 +6';
            feedbackColor = '#f1c40f';
            sound.victory();
            haptic([50, 70, 120]);
          } else if (s.type === 'fish') {
            pts = 3;
            feedbackText = '¡PEZ DORADO! 🐟 +3';
            feedbackColor = '#0984e3';
            sound.star();
            haptic([30, 40]);
          } else if (s.type === 'golden') {
            pts = 3;
            feedbackText = '¡SUPER COMBO! +3 ✨';
            feedbackColor = '#f39c12';
            sound.star();
            haptic([40, 50, 80]);
          } else if (s.type === 'chrono') {
            this.timeLeft = Math.min(SF_ROUND_SECONDS, this.timeLeft + 8);
            feedbackText = '+8s TIEMPO ⏱️';
            feedbackColor = '#00cec9';
            sound.lineClear();
            haptic(30);
          } else {
            sound.star();
            haptic(25);
          }

          // Bonus de Captura Sincronizada
          if (isInstantSync) {
            pts += 2;
            feedbackText = `¡CAPTURA SINCRONIZADA! 🔥 +${pts}`;
            feedbackColor = '#e17055';
            sound.victory();
          }

          this.score += pts;
          this.particles.spawnConfetti(hitX, hitY, isInstantSync ? 45 : s.type === 'legendary' ? 40 : 22);
          this.addFeedback(hitX, hitY, feedbackText, feedbackColor);

          // Replace star
          this.stars.splice(starIdx, 1);
          this.stars.push(this.createStar());
          delete this.lastTaps[tap.id];

          this.broadcastState({ x: hitX, y: hitY, type: s.type, text: feedbackText, color: feedbackColor });
          return;
        }
      }
    }

    this.lastTaps[tap.id] = tap;
  }

  private broadcastState(hit?: { x: number, y: number, type: string, text: string, color: string }) {
    this.ctx.sync.setState({
      sfState: {
        stars: this.stars,
        score: this.score,
        timeLeft: this.timeLeft,
        over: this.gameOver,
        won: this.won,
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

    if (this.ctx.isHost && !this.gameOver) {
      for (const star of this.stars) {
        star.x += star.vx;
        star.y += star.vy;

        if (star.x < 25) { star.x = 25; star.vx = Math.abs(star.vx); }
        if (star.x > w - 25) { star.x = w - 25; star.vx = -Math.abs(star.vx); }
        if (star.y < 65) { star.y = 65; star.vy = Math.abs(star.vy); }
        if (star.y > h - 45) { star.y = h - 45; star.vy = -Math.abs(star.vy); }
      }

      if (Math.random() < 0.05) this.broadcastState();
    }

    for (let i = this.feedback.length - 1; i >= 0; i--) {
      this.feedback[i].timer--;
      this.feedback[i].y -= 1.2;
      if (this.feedback[i].timer <= 0) this.feedback.splice(i, 1);
    }
  }

  private draw() {
    const c = this.canvasCtx;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    c.clearRect(0, 0, w, h);

    // ── Top HUD ──
    c.font = `bold ${w * 0.05}px 'Patrick Hand', cursive`;
    c.fillStyle = '#2d3436';
    c.textAlign = 'left';
    c.fillText(`⭐ Puntos: ${this.score}`, 20, 42);

    c.textAlign = 'right';
    c.fillStyle = this.timeLeft <= 10 ? '#d63031' : '#2d3436';
    c.fillText(`⏱️ ${this.timeLeft}s`, w - 20, 42);

    c.textAlign = 'center';
    c.fillStyle = '#636e72';
    c.font = `${w * 0.038}px 'Patrick Hand', cursive`;
    c.fillText(`Meta: 15 ⭐`, w / 2, 42);

    // Stars
    for (const star of this.stars) {
      this.drawStar(c, star);
    }

    // Particles
    this.particles.updateAndDraw(c);

    // Floating text feedback
    c.font = `bold ${w * 0.048}px 'Patrick Hand', cursive`;
    c.textAlign = 'center';
    for (const f of this.feedback) {
      c.save();
      c.globalAlpha = Math.max(0, f.timer / 35);
      c.fillStyle = f.color;
      c.fillText(f.text, f.x, f.y);
      c.restore();
    }

    // Bottom banner
    c.font = `${w * 0.036}px 'Patrick Hand', cursive`;
    c.fillStyle = '#636e72';
    c.textAlign = 'center';
    c.fillText('¡Toquen juntos casi al unísono para Captura Sincronizada! 🔥', w / 2, h - 20);

    // Game Over Overlay
    if (this.gameOver) {
      c.fillStyle = 'rgba(253,251,247,0.88)';
      c.fillRect(0, 0, w, h);

      c.fillStyle = '#2d3436';
      c.font = `bold ${w * 0.13}px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(this.won ? '🎉' : '⏱️', w / 2, h * 0.35);

      c.font = `bold ${w * 0.075}px 'Patrick Hand', cursive`;
      c.fillText(this.won ? '¡Pesca Exitosa!' : '¡Tiempo agotado!', w / 2, h * 0.48);

      c.font = `${w * 0.045}px 'Patrick Hand', cursive`;
      c.fillStyle = '#636e72';
      c.fillText(`Capturaron ${this.score} estrellas`, w / 2, h * 0.56);
      c.fillText('Toca para jugar de nuevo', w / 2, h * 0.64);
    }
  }

  private drawStar(c: CanvasRenderingContext2D, star: Star) {
    const cx = star.x;
    const cy = star.y;
    const size = star.size;
    const now = Date.now();

    c.save();
    c.translate(cx, cy);

    // Synchronization timing ring (when primed by either player)
    if (star.tappedTs && now - star.tappedTs < SF_COORDINATION_WINDOW) {
      const elapsed = now - star.tappedTs;
      const progress = elapsed / SF_COORDINATION_WINDOW;
      const ringRadius = size * (2.2 - progress * 1.2);

      c.save();
      c.strokeStyle = '#0984e3';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, ringRadius, 0, Math.PI * 2);
      c.stroke();

      c.font = 'bold 12px "Patrick Hand", cursive';
      c.fillStyle = '#0984e3';
      c.textAlign = 'center';
      c.fillText('¡TOCA YA! ⏱️', 0, -ringRadius - 4);
      c.restore();
    }

    // Dibujo de Pez Nadador animado
    if (star.type === 'fish') {
      const swimAngle = Math.atan2(star.vy, star.vx);
      c.rotate(swimAngle);
      const wag = Math.sin(now * 0.015) * 6;

      // Aleta trasera ondulante
      c.fillStyle = '#fdcb6e';
      c.strokeStyle = '#2d3436';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(-size * 0.5, 0);
      c.lineTo(-size * 0.9, -size * 0.35 + wag);
      c.lineTo(-size * 0.7, 0 + wag * 0.5);
      c.lineTo(-size * 0.9, size * 0.35 + wag);
      c.closePath();
      c.fill();
      c.stroke();

      // Cuerpo ovalado de pez doodle
      c.fillStyle = '#ff7675';
      c.beginPath();
      c.ellipse(0, 0, size * 0.6, size * 0.35, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();

      // Ojo
      c.fillStyle = '#2d3436';
      c.beginPath();
      c.arc(size * 0.32, -size * 0.1, 3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'white';
      c.beginPath();
      c.arc(size * 0.34, -size * 0.12, 1.2, 0, Math.PI * 2);
      c.fill();

      c.restore();
      return;
    }

    c.rotate(now * (star.type === 'legendary' ? 0.005 : star.type === 'golden' ? 0.004 : 0.002));

    c.beginPath();
    const spikes = star.type === 'legendary' ? 7 : 5;
    const outerRadius = size;
    const innerRadius = size * (star.type === 'legendary' ? 0.48 : 0.42);
    let rot = (Math.PI / 2) * 3;
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

    if (star.type === 'legendary') {
      c.fillStyle = '#ffeaa7';
      c.shadowColor = '#fdcb6e';
      c.shadowBlur = 16;
    } else if (star.type === 'golden') {
      c.fillStyle = '#f1c40f';
      c.shadowColor = '#f39c12';
      c.shadowBlur = 10;
    } else if (star.type === 'chrono') {
      c.fillStyle = '#00cec9';
      c.shadowColor = '#00cec9';
      c.shadowBlur = 8;
    } else {
      c.fillStyle = `hsla(${star.hue}, 80%, 70%, 0.75)`;
    }
    c.fill();
    c.shadowBlur = 0;

    c.strokeStyle = '#2d3436';
    c.lineWidth = 2.5;
    c.stroke();

    // Doodle inner icon / lines
    if (star.type === 'legendary') {
      c.font = 'bold 15px "Patrick Hand", cursive';
      c.fillStyle = '#2d3436';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('👑', 0, 0);
    } else if (star.type === 'golden') {
      c.font = 'bold 14px "Patrick Hand", cursive';
      c.fillStyle = '#2d3436';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('✨', 0, 0);
    } else if (star.type === 'chrono') {
      c.font = 'bold 13px "Patrick Hand", cursive';
      c.fillStyle = '#2d3436';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('⏱️', 0, 0);
    } else {
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, -outerRadius * 0.5);
      c.stroke();
    }

    c.restore();
  }

  destroy(): void {
    cancelAnimationFrame(this.animId);
    if (this.secondTimer) clearInterval(this.secondTimer);
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
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EnergyOrb {
  id: string;
  x: number;
  y: number;
  type: 'energy' | 'shield' | 'boost';
  collected: boolean;
}

const IG_SCROLL_SPEED = 4.2;
const IG_GRAVITY = 0.58;
const IG_LIVES = 3;

export class InverseGravityGame implements GameModule {
  private ctx!: GameContext;
  private animId = 0;
  private canvasCtx!: CanvasRenderingContext2D;
  private particles = new ParticleSystem();

  private obstacles: Obstacle[] = [];
  private orbs: EnergyOrb[] = [];
  private playerY = 0;
  private playerVY = 0;
  private playerAngle = 0;
  private gravityDir = 1; // 1 = down, -1 = up
  private lives = IG_LIVES;
  private shieldActive = false;
  private shieldTimer = 0;
  private gameOver = false;
  private distance = 0;
  private lastActionTs = 0;
  private shakeTimer = 0;

  // Visual effects
  private laserBeam: { x1: number, y1: number, x2: number, y2: number, timer: number } | null = null;
  private floatTexts: { x: number, y: number, text: string, timer: number }[] = [];
  private trail: { x: number, y: number, angle: number }[] = [];

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
    this.orbs = [];
    this.playerY = this.ctx.canvas.height / 2;
    this.playerVY = 0;
    this.playerAngle = 0;
    this.gravityDir = 1;
    this.lives = IG_LIVES;
    this.shieldActive = false;
    this.shieldTimer = 0;
    this.gameOver = false;
    this.distance = 0;
    this.shakeTimer = 0;
    this.laserBeam = null;
    this.floatTexts = [];
    this.trail = [];
  }

  private handleRestart(swapRoles = false) {
    if (swapRoles) {
      this.ctx.isHost = !this.ctx.isHost;
      showToast(this.ctx.isHost ? '🚀 Ahora controlas la Gravedad' : '⚡ Ahora disparas Láser y Escudo');
    }
    this.reset();
    if (this.ctx.isHost) {
      this.broadcastState();
    } else {
      this.ctx.sync.setState({ igRestart: { ts: Date.now(), swapRoles } });
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.gameOver) {
      this.handleRestart();
      return;
    }

    const rect = this.ctx.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (this.ctx.isHost) {
      // Host flips gravity
      this.gravityDir *= -1;
      sound.boing(280);
      haptic(20);
      this.ctx.sync.setState({ igFlip: { dir: this.gravityDir, ts: Date.now() } });
    } else {
      // Guest: Check if tapping directly on an obstacle to ZAP it with laser!
      let zapped = false;
      for (const obs of this.obstacles) {
        if (px >= obs.x - 20 && px <= obs.x + obs.w + 20 && py >= obs.y - 20 && py <= obs.y + obs.h + 20) {
          zapped = true;
          this.triggerZap(obs.id, obs.x + obs.w / 2, obs.y + obs.h / 2);
          this.ctx.sync.setState({
            igZap: { id: obs.id, x: obs.x + obs.w / 2, y: obs.y + obs.h / 2, ts: Date.now() }
          });
          break;
        }
      }

      // If not tapping an obstacle, trigger energy shield
      if (!zapped && this.shieldTimer <= 0) {
        this.shieldActive = true;
        this.shieldTimer = 110;
        sound.thud(160);
        haptic(25);
        this.ctx.sync.setState({ igShield: { active: true, ts: Date.now() } });
      }
    }
  };

  private triggerZap(obsId: string, targetX: number, targetY: number) {
    const px = this.ctx.canvas.width * 0.2;
    const py = this.playerY;
    this.laserBeam = { x1: px, y1: py, x2: targetX, y2: targetY, timer: 12 };
    this.particles.spawnConfetti(targetX, targetY, 18);
    this.floatTexts.push({ x: targetX, y: targetY - 10, text: '⚡ ¡ZAP!', timer: 30 });
    sound.lineClear();
    haptic([20, 30, 40]);

    const idx = this.obstacles.findIndex(o => o.id === obsId);
    if (idx !== -1) {
      this.obstacles.splice(idx, 1);
    }
  }

  private onStateChange = (state: any) => {
    if (state.igRestart && state.igRestart.ts !== this.lastActionTs) {
      this.lastActionTs = state.igRestart.ts;
      this.handleRestart(state.igRestart.swapRoles);
    }

    if (state.igZap && state.igZap.ts !== this.lastActionTs) {
      this.lastActionTs = state.igZap.ts;
      this.triggerZap(state.igZap.id, state.igZap.x, state.igZap.y);
      if (this.ctx.isHost) this.broadcastState();
    }

    if (this.ctx.isHost && state.igShield && state.igShield.ts !== this.lastActionTs) {
      this.lastActionTs = state.igShield.ts;
      this.shieldActive = true;
      this.shieldTimer = 110;
      this.broadcastState();
    }

    if (!this.ctx.isHost) {
      if (state.igFlip) this.gravityDir = state.igFlip.dir;
      if (state.igState) {
        this.obstacles = state.igState.obs;
        this.orbs = state.igState.orbs || [];
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
        orbs: this.orbs,
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

    // Física fluida: Inclinación dinámica según velocidad vertical
    const targetBase = this.gravityDir === -1 ? Math.PI : 0;
    const dynamicTilt = targetBase + (this.playerVY * 0.04 * this.gravityDir);
    this.playerAngle += (dynamicTilt - this.playerAngle) * 0.22;

    // Laser & visual timers
    if (this.laserBeam && this.laserBeam.timer > 0) {
      this.laserBeam.timer--;
      if (this.laserBeam.timer <= 0) this.laserBeam = null;
    }

    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      this.floatTexts[i].timer--;
      this.floatTexts[i].y -= 1;
      if (this.floatTexts[i].timer <= 0) this.floatTexts.splice(i, 1);
    }

    // Motion trail
    if (Math.random() < 0.4) {
      this.trail.push({ x: w * 0.2, y: this.playerY, angle: this.playerAngle });
      if (this.trail.length > 5) this.trail.shift();
    }

    if (this.ctx.isHost) {
      // Física fluida con amortiguación
      this.playerVY += IG_GRAVITY * this.gravityDir;
      this.playerVY = Math.max(-8.5, Math.min(8.5, this.playerVY));
      this.playerY += this.playerVY;

      const margin = 42;
      if (this.playerY > h - margin) {
        this.playerY = h - margin;
        this.playerVY = 0;
      }
      if (this.playerY < margin) {
        this.playerY = margin;
        this.playerVY = 0;
      }

      this.distance += 0.12;

      // Spawn obstacles
      if (Math.random() < 0.024) {
        const side = Math.random() < 0.5 ? 'top' : 'bottom';
        this.obstacles.push({
          id: Math.random().toString(36).substring(2, 9),
          x: w,
          y: side === 'top' ? 0 : h - 65,
          w: 42 + Math.random() * 38,
          h: 65
        });
      }

      // Spawn energy orbs (orbes flotantes variados)
      if (Math.random() < 0.022) {
        const roll = Math.random();
        const type: 'energy' | 'shield' | 'boost' = roll < 0.25 ? 'shield' : roll < 0.55 ? 'boost' : 'energy';
        this.orbs.push({
          id: Math.random().toString(36).substring(2, 9),
          x: w,
          y: margin + Math.random() * (h - margin * 2),
          type,
          collected: false
        });
      }

      // Update orbs
      for (let i = this.orbs.length - 1; i >= 0; i--) {
        const orb = this.orbs[i];
        orb.x -= IG_SCROLL_SPEED;
        const dx = orb.x - (w * 0.2);
        const dy = orb.y - this.playerY;
        if (!orb.collected && Math.sqrt(dx * dx + dy * dy) < 32) {
          orb.collected = true;
          if (orb.type === 'shield') {
            this.shieldActive = true;
            this.shieldTimer = 130;
            this.floatTexts.push({ x: orb.x, y: orb.y - 10, text: '🛡️ ¡ESCUDO!', timer: 28 });
          } else if (orb.type === 'boost') {
            this.distance += 12;
            this.floatTexts.push({ x: orb.x, y: orb.y - 10, text: '⚡ +12m TURBO!', timer: 28 });
          } else {
            this.distance += 6;
            this.floatTexts.push({ x: orb.x, y: orb.y - 10, text: '+6m ⭐', timer: 25 });
          }
          sound.star();
          haptic(22);
          this.particles.spawnConfetti(orb.x, orb.y, 16);
        }
        if (orb.x < -20 || orb.collected) this.orbs.splice(i, 1);
      }

      // Update obstacles & Collisions
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const obs = this.obstacles[i];
        obs.x -= IG_SCROLL_SPEED;

        // Collision box
        if (!this.shieldActive &&
            w * 0.2 + 15 > obs.x &&
            w * 0.2 - 15 < obs.x + obs.w &&
            this.playerY + 20 > obs.y &&
            this.playerY - 20 < obs.y + obs.h) {

          this.lives--;
          this.obstacles.splice(i, 1);
          this.shakeTimer = 20;
          sound.explosion();
          haptic([80, 80, 100]);

          if (this.lives <= 0) {
            this.gameOver = true;
            const distInt = Math.floor(this.distance);
            const won = distInt >= 300;
            let newBadge: string | undefined = undefined;
            if (won) {
              sound.victory();
              profileManager.unlockBadge('gravity-pilot');
              const b = profileManager.addWin('inverse-gravity');
              if (b) newBadge = b;
            } else {
              sound.defeat();
              profileManager.resetStreak('inverse-gravity');
            }
            showRematchModal({
              won,
              title: won ? '¡Ases de la Gravedad! 🚀' : '¡Choque Gravitacional! 💥',
              statsText: `Distancia recorrida: ${distInt}m ${won ? '(¡Meta de 300m lograda!)' : ''}`,
              stars: distInt >= 500 ? 3 : (won ? 2 : 1),
              newBadge,
              canSwapRoles: true,
              onRematch: (swap) => this.handleRestart(swap),
              onLobby: () => {
                this.ctx.sync.setState({ host_location: null });
                this.ctx.onLobby?.();
              }
            });
          }
          continue;
        }

        if (obs.x + obs.w < -20) this.obstacles.splice(i, 1);
      }

      if (this.shieldTimer > 0) {
        this.shieldTimer--;
        if (this.shieldTimer <= 0) this.shieldActive = false;
      }

      if (Math.random() < 0.08) this.broadcastState();
    }
  }

  private draw() {
    const c = this.canvasCtx;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    c.save();
    if (this.shakeTimer > 0) {
      this.shakeTimer--;
      c.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }

    c.clearRect(-10, -10, w + 20, h + 20);

    // Grid lines (doodle background)
    c.strokeStyle = 'rgba(0,0,0,0.06)';
    c.lineWidth = 1;
    for (let x = 0; x < w; x += 45) {
      c.beginPath();
      c.moveTo(x - (this.distance * 12) % 45, 0);
      c.lineTo(x - (this.distance * 12) % 45, h);
      c.stroke();
    }

    // Top & Bottom boundary doodle lines
    c.strokeStyle = '#2d3436';
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, 30); c.lineTo(w, 30); c.stroke();
    c.beginPath(); c.moveTo(0, h - 30); c.lineTo(w, h - 30); c.stroke();

    // ── HUD ──
    c.font = `bold ${w * 0.048}px 'Patrick Hand', cursive`;
    c.fillStyle = '#2d3436';
    c.textAlign = 'left';
    c.fillText('❤️'.repeat(this.lives) + '🖤'.repeat(IG_LIVES - this.lives), 20, 24);

    c.textAlign = 'right';
    c.fillText(`🚀 ${Math.floor(this.distance)}m / 300m`, w - 20, 24);

    // Laser beam
    if (this.laserBeam) {
      c.save();
      c.strokeStyle = '#fdcb6e';
      c.lineWidth = 4;
      c.setLineDash([6, 4]);
      c.beginPath();
      c.moveTo(this.laserBeam.x1, this.laserBeam.y1);
      c.lineTo(this.laserBeam.x2, this.laserBeam.y2);
      c.stroke();
      c.restore();
    }

    // Orbes de gravedad flotantes con animación bobbing y aura
    for (const orb of this.orbs) {
      const bobY = orb.y + Math.sin(Date.now() * 0.007 + orb.x * 0.04) * 6;
      c.save();
      c.beginPath();
      c.arc(orb.x, bobY, 15, 0, Math.PI * 2);
      c.fillStyle = orb.type === 'shield' ? 'rgba(9, 132, 227, 0.3)' : orb.type === 'boost' ? 'rgba(0, 206, 201, 0.3)' : 'rgba(253, 203, 110, 0.3)';
      c.fill();
      c.strokeStyle = orb.type === 'shield' ? '#0984e3' : orb.type === 'boost' ? '#00cec9' : '#fdcb6e';
      c.lineWidth = 2.5;
      c.stroke();

      c.font = '16px serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(orb.type === 'shield' ? '🛡️' : orb.type === 'boost' ? '⚡' : '⭐', orb.x, bobY);
      c.restore();
    }

    // Obstacles
    c.fillStyle = '#2d3436';
    for (const obs of this.obstacles) {
      this.drawObstacle(c, obs.x, obs.y, obs.w, obs.h);
    }

    // Runner Ghost Trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      c.save();
      c.globalAlpha = (i + 1) * 0.08;
      c.translate(t.x, t.y);
      c.rotate(t.angle);
      this.drawStickFigure(c);
      c.restore();
    }

    // Estela de partículas de propulsión detrás del personaje
    const px = w * 0.2;
    const py = this.playerY;
    if (!this.gameOver) {
      this.particles.particles.push({
        x: px - 18,
        y: py + (Math.random() - 0.5) * 6,
        vx: -3.5 - Math.random() * 2.5,
        vy: (Math.random() - 0.5) * 2,
        rot: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.2,
        size: 7 + Math.random() * 6,
        color: Math.random() < 0.5 ? '#fdcb6e' : Math.random() < 0.8 ? '#e17055' : '#00cec9',
        char: Math.random() < 0.5 ? '✦' : '●',
        life: 0,
        maxLife: 20 + Math.random() * 8,
      });
    }

    // Player with Backflip Rotation
    c.save();
    c.translate(px, py);
    c.rotate(this.playerAngle);
    this.drawStickFigure(c);
    c.restore();

    // Shield bubble
    if (this.shieldActive) {
      c.save();
      c.beginPath();
      c.arc(px, py, 32, 0, Math.PI * 2);
      c.strokeStyle = '#0984e3';
      c.lineWidth = 3.5;
      c.fillStyle = 'rgba(116, 185, 255, 0.22)';
      c.fill();
      c.stroke();
      c.restore();
    }

    // Particles
    this.particles.updateAndDraw(c);

    // Floating text
    c.font = `bold ${w * 0.045}px 'Patrick Hand', cursive`;
    c.textAlign = 'center';
    for (const ft of this.floatTexts) {
      c.save();
      c.globalAlpha = ft.timer / 30;
      c.fillStyle = '#d63031';
      c.fillText(ft.text, ft.x, ft.y);
      c.restore();
    }

    // Role instructions
    c.font = `${w * 0.035}px 'Patrick Hand', cursive`;
    c.fillStyle = '#636e72';
    c.textAlign = 'center';
    c.fillText(
      this.ctx.isHost
        ? 'Host: Toca para cambiar la gravedad 🔄'
        : 'Guest: ¡Toca obstáculos para destruirlos ⚡ o espacio para escudo 🛡️!',
      w / 2, h - 10
    );

    // Game Over Overlay
    if (this.gameOver) {
      c.fillStyle = 'rgba(253,251,247,0.85)';
      c.fillRect(-10, -10, w + 20, h + 20);

      const won = Math.floor(this.distance) >= 300;
      c.fillStyle = '#2d3436';
      c.font = `bold ${w * 0.12}px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.fillText(won ? '🎉' : '💥', w / 2, h * 0.35);

      c.font = `bold ${w * 0.075}px 'Patrick Hand', cursive`;
      c.fillText(won ? '¡Meta Cumplida!' : '¡Caída Libre!', w / 2, h * 0.48);

      c.font = `${w * 0.045}px 'Patrick Hand', cursive`;
      c.fillStyle = '#636e72';
      c.fillText(`Recorrieron ${Math.floor(this.distance)} metros`, w / 2, h * 0.58);
      c.fillText('Toca para reintentar', w / 2, h * 0.66);
    }

    c.restore();
  }

  private drawStickFigure(c: CanvasRenderingContext2D) {
    c.strokeStyle = '#2d3436';
    c.lineWidth = 2.5;

    // Head
    c.beginPath(); c.arc(0, -14, 6, 0, Math.PI * 2); c.stroke();
    // Body
    c.beginPath(); c.moveTo(0, -8); c.lineTo(0, 6); c.stroke();
    // Arms
    c.beginPath(); c.moveTo(-10, -3); c.lineTo(10, -3); c.stroke();
    // Legs
    c.beginPath(); c.moveTo(0, 6); c.lineTo(-8, 16); c.stroke();
    c.beginPath(); c.moveTo(0, 6); c.lineTo(8, 16); c.stroke();
  }

  private drawObstacle(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    c.fillStyle = 'rgba(45, 52, 54, 0.15)';
    c.fillRect(x, y, w, h);

    c.strokeStyle = '#2d3436';
    c.lineWidth = 2.5;
    c.strokeRect(x, y, w, h);

    // Hazard warning stripes
    c.strokeStyle = '#ff7675';
    c.lineWidth = 2;
    for (let i = 0; i < w; i += 10) {
      c.beginPath();
      c.moveTo(x + i, y);
      c.lineTo(x + i + 6, y + h);
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
const FH_MAX_SPEED = 16;
const FH_FRICTION = 0.986;
const FH_AI_SPEED = 3.6;
const FH_GOAL_W_RATIO = 0.42;

interface Vec2 { x: number; y: number; }
interface Disc extends Vec2 { vx: number; vy: number; r: number; }
interface HockeyPowerUp {
  id: string;
  x: number;
  y: number;
  type: 'fire' | 'ice';
  pulse: number;
}

export class FingerHockeyGame implements GameModule {
  private ctx!: GameContext;
  private animId = 0;
  private canvasCtx!: CanvasRenderingContext2D;
  private particles = new ParticleSystem();

  // Discs
  private puck: Disc = { x: 0, y: 0, vx: 0, vy: 0, r: FH_PUCK_R };
  private p1Mallet: Vec2 = { x: 0, y: 0 }; // Host's mallet (bottom-left)
  private p2Mallet: Vec2 = { x: 0, y: 0 }; // Guest's mallet (bottom-right)
  private ai1: Vec2 = { x: 0, y: 0 };       // AI mallet 1 (top-left)
  private ai2: Vec2 = { x: 0, y: 0 };       // AI mallet 2 (top-right)

  // Previous mallet positions for velocity calc
  private p1Prev: Vec2 = { x: 0, y: 0 };
  private p2Prev: Vec2 = { x: 0, y: 0 };

  // Super hit / Fireball & Ice puck mechanic
  private isSuperHit = false;
  private puckTrail: { x: number, y: number, isSuper: boolean, effect: string }[] = [];
  private shakeTimer = 0;
  private netWobble = 0;

  // Power-up pickups
  private powerUps: HockeyPowerUp[] = [];
  private puckEffect: 'none' | 'fire' | 'ice' = 'none';
  private puckEffectTimer = 0;

  // Score
  private scoreHumans = 0;
  private scoreAI = 0;
  private maxScore = 5;
  private goalFlashTimer = 0;
  private goalMessage = '';
  private matchEnded = false;

  // AI mood
  private aiMood = '🤖';

  private lastMalletTs = 0;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;
    this.scoreHumans = 0;
    this.scoreAI = 0;
    this.goalFlashTimer = 0;
    this.matchEnded = false;
    this.shakeTimer = 0;
    this.netWobble = 0;
    this.puckTrail = [];
    this.powerUps = [];
    this.puckEffect = 'none';
    this.puckEffectTimer = 0;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

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

    if (ctx.isHost) {
      this.syncInterval = setInterval(() => {
        this.broadcastState();
      }, 50);
    }

    this.loop();
  }

  private resetPuck(w: number, h: number) {
    this.puck.x = w / 2;
    this.puck.y = h / 2;
    this.puck.vx = (Math.random() - 0.5) * 4;
    this.puck.vy = (Math.random() < 0.5 ? -1 : 1) * 3;
    this.isSuperHit = false;
    this.puckTrail = [];
    this.puckEffect = 'none';
    this.puckEffectTimer = 0;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.matchEnded) {
      this.handleRestart();
      return;
    }
    this.handlePointer(e);
  };

  private onPointerMove = (e: PointerEvent) => {
    this.handlePointer(e);
  };

  private onPointerUp = (_e: PointerEvent) => {};

  private handlePointer(e: PointerEvent) {
    const rect = this.ctx.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const h = this.ctx.canvas.height;
    const w = this.ctx.canvas.width;

    if (py < h * 0.45) return;

    const cx = Math.max(FH_MALLET_R, Math.min(w - FH_MALLET_R, px));
    const cy = Math.max(h * 0.45, Math.min(h - FH_MALLET_R, py));

    if (this.ctx.isHost) {
      this.p1Prev = { ...this.p1Mallet };
      this.p1Mallet = { x: cx, y: cy };
    } else {
      this.ctx.sync.setState({
        fhMallet: { x: cx, y: cy, ts: Date.now(), by: this.ctx.me.id }
      });
      this.p2Prev = { ...this.p2Mallet };
      this.p2Mallet = { x: cx, y: cy };
    }
  }

  private updateAI(w: number, h: number) {
    const topLimit = FH_MALLET_R + 8;
    const botLimit = h * 0.45;

    // AI reacts to incoming puck
    if (this.puck.vy < -5 && this.isSuperHit) {
      this.aiMood = '🤖⚡';
    } else if (this.goalFlashTimer > 0) {
      this.aiMood = this.scoreHumans > this.scoreAI ? '🤖💦' : '😎';
    } else {
      this.aiMood = '🤖';
    }

    const targetX1 = Math.max(FH_MALLET_R, Math.min(w * 0.48, this.puck.x - 25));
    const targetY1 = Math.max(topLimit, Math.min(botLimit, this.puck.y < botLimit ? this.puck.y : h * 0.16));
    this.ai1.x += (targetX1 - this.ai1.x) * 0.065 * FH_AI_SPEED * 0.3;
    this.ai1.y += (targetY1 - this.ai1.y) * 0.055 * FH_AI_SPEED * 0.3;

    const targetX2 = Math.max(w * 0.52, Math.min(w - FH_MALLET_R, this.puck.x + 25));
    const targetY2 = Math.max(topLimit, Math.min(botLimit, this.puck.y < botLimit ? this.puck.y : h * 0.22));
    this.ai2.x += (targetX2 - this.ai2.x) * 0.075 * FH_AI_SPEED * 0.3;
    this.ai2.y += (targetY2 - this.ai2.y) * 0.065 * FH_AI_SPEED * 0.3;
  }

  private resolveMalletCollision(mallet: Vec2, prevMallet: Vec2) {
    const dx = this.puck.x - mallet.x;
    const dy = this.puck.y - mallet.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = FH_MALLET_R + FH_PUCK_R;

    if (dist < minDist && dist > 0) {
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      this.puck.x += nx * overlap;
      this.puck.y += ny * overlap;

      const mvx = mallet.x - prevMallet.x;
      const mvy = mallet.y - prevMallet.y;
      const malletSpeed = Math.sqrt(mvx * mvx + mvy * mvy);

      // Elastic bumper physics with power-up momentum
      const impulseMult = this.puckEffect === 'fire' ? 1.55 : 1.15;
      const restitution = 0.92;

      // Check Smash Shot!
      if (malletSpeed > 8.5 || this.puckEffect === 'fire') {
        this.isSuperHit = true;
        this.shakeTimer = 14;
        this.puck.vx = (nx * 12.5 + mvx * 0.9) * impulseMult;
        this.puck.vy = (ny * 12.5 + mvy * 0.9) * impulseMult;
        sound.explosion();
        haptic([40, 60, 80]);
        this.particles.spawnConfetti(this.puck.x, this.puck.y, 16);
      } else {
        this.puck.vx = (nx * 7.5 + mvx * 0.65) * impulseMult * restitution;
        this.puck.vy = (ny * 7.5 + mvy * 0.65) * impulseMult * restitution;
        sound.thud(220);
        haptic(16);
        this.particles.spawnConfetti(this.puck.x, this.puck.y, 6);
      }
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
      const impulseMult = this.puckEffect === 'fire' ? 1.4 : 1.0;
      this.puck.vx = nx * 6.8 * impulseMult;
      this.puck.vy = ny * 6.8 * impulseMult;
      this.isSuperHit = false;
      sound.thud(180);
      haptic(15);
      this.particles.spawnConfetti(this.puck.x, this.puck.y, 6);
    }
  }

  private update() {
    if (!this.ctx.isHost) return;

    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    if (this.netWobble > 0) this.netWobble--;

    if (this.goalFlashTimer > 0) {
      this.goalFlashTimer--;
      if (this.goalFlashTimer === 0) {
        this.resetPuck(w, h);
      }
      return;
    }

    this.updateAI(w, h);

    // Spawn rink power-ups
    if (this.powerUps.length < 2 && Math.random() < 0.007) {
      this.powerUps.push({
        id: Math.random().toString(36).substring(2, 7),
        x: w * 0.2 + Math.random() * (w * 0.6),
        y: h * 0.32 + Math.random() * (h * 0.36),
        type: Math.random() < 0.5 ? 'fire' : 'ice',
        pulse: 0
      });
    }

    // Power-up pickups
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const pu = this.powerUps[i];
      pu.pulse += 0.05;
      const dx = this.puck.x - pu.x;
      const dy = this.puck.y - pu.y;
      if (dx * dx + dy * dy < (FH_PUCK_R + 18) ** 2) {
        this.puckEffect = pu.type;
        this.puckEffectTimer = 340;
        if (pu.type === 'fire') {
          sound.powerupFire();
          this.shakeTimer = 8;
          this.particles.spawnConfetti(pu.x, pu.y, 22);
          this.puck.vx *= 1.35;
          this.puck.vy *= 1.35;
        } else {
          sound.powerupIce();
          this.particles.spawnConfetti(pu.x, pu.y, 22);
        }
        this.powerUps.splice(i, 1);
      }
    }

    if (this.puckEffectTimer > 0) {
      this.puckEffectTimer--;
      if (this.puckEffectTimer <= 0) {
        this.puckEffect = 'none';
      }
    }

    // Dynamic friction & max speed
    const currentFriction = this.puckEffect === 'ice' ? 0.9988 : FH_FRICTION;
    const currentMaxSpeed = this.puckEffect === 'fire' ? 24 : FH_MAX_SPEED;

    // Puck movement
    this.puck.x += this.puck.vx;
    this.puck.y += this.puck.vy;
    this.puck.vx *= currentFriction;
    this.puck.vy *= currentFriction;

    // Motion trail record
    this.puckTrail.push({ x: this.puck.x, y: this.puck.y, isSuper: this.isSuperHit, effect: this.puckEffect });
    if (this.puckTrail.length > 9) this.puckTrail.shift();

    // Flight particles for power-ups
    if (this.puckEffect === 'fire') {
      this.particles.particles.push({
        x: this.puck.x + (Math.random() - 0.5) * 8,
        y: this.puck.y + (Math.random() - 0.5) * 8,
        vx: -this.puck.vx * 0.2 + (Math.random() - 0.5) * 1.5,
        vy: -this.puck.vy * 0.2 + (Math.random() - 0.5) * 1.5,
        rot: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.1,
        size: 7 + Math.random() * 5,
        color: Math.random() < 0.5 ? '#e17055' : '#f1c40f',
        char: Math.random() < 0.6 ? '🔥' : '✦',
        life: 0,
        maxLife: 14 + Math.random() * 6
      });
    } else if (this.puckEffect === 'ice') {
      this.particles.particles.push({
        x: this.puck.x + (Math.random() - 0.5) * 8,
        y: this.puck.y + (Math.random() - 0.5) * 8,
        vx: -this.puck.vx * 0.15 + (Math.random() - 0.5) * 1.2,
        vy: -this.puck.vy * 0.15 + (Math.random() - 0.5) * 1.2,
        rot: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.1,
        size: 7 + Math.random() * 5,
        color: '#00cec9',
        char: Math.random() < 0.6 ? '❄️' : '✧',
        life: 0,
        maxLife: 14 + Math.random() * 6
      });
    }

    const speed = Math.sqrt(this.puck.vx ** 2 + this.puck.vy ** 2);
    if (speed < 5 && this.puckEffect !== 'fire') this.isSuperHit = false;

    if (speed > currentMaxSpeed) {
      this.puck.vx = (this.puck.vx / speed) * currentMaxSpeed;
      this.puck.vy = (this.puck.vy / speed) * currentMaxSpeed;
    }

    // Elastic Wall bounces
    if (this.puck.x - FH_PUCK_R < 0) {
      this.puck.x = FH_PUCK_R;
      this.puck.vx = Math.abs(this.puck.vx) * 0.92;
      sound.thud(170);
      this.particles.spawnConfetti(this.puck.x, this.puck.y, 5);
      if (this.isSuperHit || this.puckEffect === 'fire') this.particles.spawnConfetti(this.puck.x, this.puck.y, 10);
    }
    if (this.puck.x + FH_PUCK_R > w) {
      this.puck.x = w - FH_PUCK_R;
      this.puck.vx = -Math.abs(this.puck.vx) * 0.92;
      sound.thud(170);
      this.particles.spawnConfetti(this.puck.x, this.puck.y, 5);
      if (this.isSuperHit || this.puckEffect === 'fire') this.particles.spawnConfetti(this.puck.x, this.puck.y, 10);
    }

    const goalW = w * FH_GOAL_W_RATIO;
    const goalLeft = (w - goalW) / 2;
    const goalRight = goalLeft + goalW;

    // Top goal (AI goal scored by Humans)
    if (this.puck.y - FH_PUCK_R < 0) {
      if (this.puck.x > goalLeft && this.puck.x < goalRight) {
        this.scoreHumans++;
        this.goalFlashTimer = 65;
        this.goalMessage = '⚽ ¡GOL DE LOS HUMANOS!';
        this.netWobble = 25;
        this.particles.spawnConfetti(w / 2, 20, 45);
        sound.victory();
        haptic([50, 60, 100]);
        this.puck.vx = 0; this.puck.vy = 0;
        return;
      } else {
        this.puck.y = FH_PUCK_R;
        this.puck.vy = Math.abs(this.puck.vy) * 0.92;
        sound.thud(170);
      }
    }

    // Bottom goal (Human goal scored by AI)
    if (this.puck.y + FH_PUCK_R > h) {
      if (this.puck.x > goalLeft && this.puck.x < goalRight) {
        this.scoreAI++;
        this.goalFlashTimer = 65;
        this.goalMessage = '🤖 ¡GOL DE LA IA!';
        this.netWobble = 25;
        this.particles.spawnConfetti(w / 2, h - 20, 25);
        sound.defeat();
        haptic([100, 50, 80]);
        this.puck.vx = 0; this.puck.vy = 0;
        return;
      } else {
        this.puck.y = h - FH_PUCK_R;
        this.puck.vy = -Math.abs(this.puck.vy) * 0.92;
        sound.thud(170);
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
        isSuper: this.isSuperHit,
        aiMood: this.aiMood,
        pups: this.powerUps,
        pEff: this.puckEffect,
        ts: Date.now()
      }
    });
  }

  private onStateChange = (state: any) => {
    if (state.fhRestart && state.fhRestart.ts !== this.lastMalletTs) {
      this.lastMalletTs = state.fhRestart.ts;
      this.handleRestart();
    }

    if (this.ctx.isHost && state.fhMallet && state.fhMallet.ts !== this.lastMalletTs) {
      this.lastMalletTs = state.fhMallet.ts;
      if (state.fhMallet.by !== this.ctx.me.id) {
        this.p2Prev = { ...this.p2Mallet };
        this.p2Mallet = { x: state.fhMallet.x, y: state.fhMallet.y };
      }
    }

    if (!this.ctx.isHost && state.fhState) {
      const s = state.fhState;
      this.puck = { ...s.puck };
      this.ai1 = { ...s.ai1 };
      this.ai2 = { ...s.ai2 };
      this.p1Mallet = { ...s.p1 };
      this.scoreHumans = s.sH;
      this.scoreAI = s.sA;
      this.goalFlashTimer = s.gf;
      this.goalMessage = s.gm;
      this.isSuperHit = s.isSuper;
      this.aiMood = s.aiMood || '🤖';
      this.powerUps = s.pups || [];
      this.puckEffect = s.pEff || 'none';

      this.puckTrail.push({ x: this.puck.x, y: this.puck.y, isSuper: this.isSuperHit, effect: this.puckEffect });
      if (this.puckTrail.length > 9) this.puckTrail.shift();
    }
  };

  private loop = () => {
    this.update();
    this.draw();
    this.animId = requestAnimationFrame(this.loop);
  };

  private draw() {
    const c = this.canvasCtx;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    c.save();
    if (this.shakeTimer > 0) {
      this.shakeTimer--;
      c.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }

    c.clearRect(-10, -10, w + 20, h + 20);

    // Center divider
    c.setLineDash([8, 8]);
    c.strokeStyle = 'rgba(0,0,0,0.14)';
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
    c.arc(w / 2, h / 2, Math.min(w, h) * 0.16, 0, Math.PI * 2);
    c.stroke();

    // Goals with net wobble
    const goalW = w * FH_GOAL_W_RATIO;
    const goalLeft = (w - goalW) / 2;
    const wobbleOffset = this.netWobble > 0 ? Math.sin(Date.now() * 0.05) * 4 : 0;

    // Top goal (AI goal)
    c.fillStyle = 'rgba(85, 239, 196, 0.22)';
    c.strokeStyle = '#55efc4';
    c.lineWidth = 4;
    c.fillRect(goalLeft, 0, goalW, 12 + wobbleOffset);
    c.strokeRect(goalLeft, 0, goalW, 12 + wobbleOffset);

    // Bottom goal (Human goal)
    c.fillStyle = 'rgba(255, 118, 117, 0.22)';
    c.strokeStyle = '#ff7675';
    c.lineWidth = 4;
    c.fillRect(goalLeft, h - 12 - wobbleOffset, goalW, 12 + wobbleOffset);
    c.strokeRect(goalLeft, h - 12 - wobbleOffset, goalW, 12 + wobbleOffset);

    // Outer border
    c.strokeStyle = '#2d3436';
    c.lineWidth = 4;
    c.strokeRect(2, 2, w - 4, h - 4);

    // AI Mallets
    this.drawMallet(c, this.ai1.x, this.ai1.y, '#ff7675', this.aiMood);
    this.drawMallet(c, this.ai2.x, this.ai2.y, '#ff7675', this.aiMood);

    // Human Mallets
    this.drawMallet(c, this.p1Mallet.x, this.p1Mallet.y, '#74b9ff', 'P1 🔵');
    this.drawMallet(c, this.p2Mallet.x, this.p2Mallet.y, '#a29bfe', 'P2 🟣');

    // Rink Power-ups
    for (const pu of this.powerUps) {
      c.save();
      const pulseScale = 1 + Math.sin(Date.now() * 0.008 + pu.x) * 0.14;
      c.translate(pu.x, pu.y);
      c.scale(pulseScale, pulseScale);

      c.beginPath();
      c.arc(0, 0, 18, 0, Math.PI * 2);
      c.fillStyle = pu.type === 'fire' ? 'rgba(235, 94, 40, 0.28)' : 'rgba(0, 206, 201, 0.28)';
      c.fill();
      c.strokeStyle = pu.type === 'fire' ? '#e17055' : '#00cec9';
      c.lineWidth = 2.5;
      c.stroke();

      c.font = '16px serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(pu.type === 'fire' ? '🔥' : '❄️', 0, 1);
      c.restore();
    }

    // Puck Motion Trail
    for (let i = 0; i < this.puckTrail.length; i++) {
      const pt = this.puckTrail[i];
      const alpha = ((i + 1) / this.puckTrail.length) * 0.48;
      c.save();
      c.globalAlpha = alpha;
      c.beginPath();
      c.arc(pt.x, pt.y, FH_PUCK_R * (0.5 + 0.5 * (i / this.puckTrail.length)), 0, Math.PI * 2);
      c.fillStyle = pt.effect === 'fire' ? '#e17055' : pt.effect === 'ice' ? '#74b9ff' : pt.isSuper ? '#fab1a0' : 'rgba(45, 52, 54, 0.3)';
      c.fill();
      c.restore();
    }

    // Puck Body
    c.save();
    c.beginPath();
    c.arc(this.puck.x, this.puck.y, FH_PUCK_R, 0, Math.PI * 2);
    if (this.puckEffect === 'fire') {
      c.fillStyle = '#d63031';
      c.strokeStyle = '#f1c40f';
      c.lineWidth = 4;
    } else if (this.puckEffect === 'ice') {
      c.fillStyle = '#00cec9';
      c.strokeStyle = '#81ecec';
      c.lineWidth = 3.5;
    } else {
      c.fillStyle = this.isSuperHit ? '#d63031' : '#2d3436';
      c.strokeStyle = this.isSuperHit ? '#f1c40f' : '#636e72';
      c.lineWidth = this.isSuperHit ? 3.5 : 2;
    }
    c.fill();
    c.stroke();

    // Puck highlight
    c.beginPath();
    c.arc(this.puck.x - 4, this.puck.y - 4, 4, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fill();

    if (this.puckEffect === 'fire' || this.isSuperHit) {
      c.font = '15px serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('🔥', this.puck.x, this.puck.y);
    } else if (this.puckEffect === 'ice') {
      c.font = '15px serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('❄️', this.puck.x, this.puck.y);
    }
    c.restore();

    // Particle explosions
    this.particles.updateAndDraw(c);

    // Scoreboard & Power-up status
    c.font = `bold 22px 'Patrick Hand', cursive`;
    c.textAlign = 'left';
    c.fillStyle = '#2d3436';
    c.fillText(`👫 Humanos: ${this.scoreHumans}`, 14, h / 2 - 10);
    c.textAlign = 'right';
    c.fillText(`🤖 IA: ${this.scoreAI}`, w - 14, h / 2 + 24);

    if (this.puckEffect !== 'none') {
      c.save();
      c.font = `bold 16px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.fillStyle = this.puckEffect === 'fire' ? '#d63031' : '#0984e3';
      const label = this.puckEffect === 'fire' ? '🔥 ¡PUCK DE FUEGO VELOZ!' : '❄️ ¡PUCK DE HIELO SUPER DESLIZANTE!';
      c.fillText(label, w / 2, h / 2 - 28);
      c.restore();
    }

    // Goal Flash Announcement
    if (this.goalFlashTimer > 0) {
      const alpha = Math.min(1, this.goalFlashTimer / 30);
      c.fillStyle = `rgba(253,251,247,${alpha * 0.75})`;
      c.fillRect(0, 0, w, h);

      c.font = `bold ${w * 0.075}px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#2d3436';
      c.fillText(this.goalMessage, w / 2, h / 2);
    }

    // Match End Screen
    if (this.scoreHumans >= this.maxScore || this.scoreAI >= this.maxScore) {
      c.fillStyle = 'rgba(253,251,247,0.88)';
      c.fillRect(0, 0, w, h);

      const humansWon = this.scoreHumans >= this.maxScore;
      c.fillStyle = '#2d3436';
      c.font = `bold ${w * 0.13}px 'Patrick Hand', cursive`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(humansWon ? '🎉' : '🤖', w / 2, h * 0.35);

      c.font = `bold ${w * 0.07}px 'Patrick Hand', cursive`;
      c.fillText(humansWon ? '¡Los humanos ganan!' : '¡La IA se llevó el partido!', w / 2, h * 0.48);

      c.font = `${w * 0.045}px 'Patrick Hand', cursive`;
      c.fillStyle = '#636e72';
      c.fillText(`Marcador Final: ${this.scoreHumans} - ${this.scoreAI}`, w / 2, h * 0.58);
      c.fillText('Toca para revancha', w / 2, h * 0.66);

      if (!this.matchEnded) {
        this.matchEnded = true;
        let newBadge: string | undefined = undefined;
        if (humansWon) {
          sound.victory();
          haptic([40, 50, 100]);
          profileManager.unlockBadge('hockey-legend');
          const b = profileManager.addWin('finger-hockey');
          if (b) newBadge = b;
        } else {
          sound.defeat();
          profileManager.resetStreak('finger-hockey');
        }

        showRematchModal({
          won: humansWon,
          title: humansWon ? '¡Victoria de los Humanos! 🏒' : '¡La IA se llevó el partido! 🤖',
          statsText: `Marcador Final: Humanos ${this.scoreHumans} - ${this.scoreAI} IA`,
          stars: humansWon ? (this.scoreAI === 0 ? 3 : 2) : 1,
          newBadge,
          onRematch: () => this.handleRestart(),
          onLobby: () => {
            this.ctx.sync.setState({ host_location: null });
            this.ctx.onLobby?.();
          }
        });
      }
    }

    c.restore();
  }

  private handleRestart() {
    this.scoreHumans = 0;
    this.scoreAI = 0;
    this.matchEnded = false;
    this.goalFlashTimer = 0;
    this.isSuperHit = false;
    this.puckTrail = [];
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;
    this.resetPuck(w, h);
    if (this.ctx.isHost) {
      this.broadcastState();
    } else {
      this.ctx.sync.setState({ fhRestart: { ts: Date.now() } });
    }
  }

  private drawMallet(c: CanvasRenderingContext2D, x: number, y: number, color: string, label: string) {
    c.beginPath();
    c.arc(x, y, FH_MALLET_R, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    c.strokeStyle = '#2d3436';
    c.lineWidth = 3;
    c.stroke();

    c.beginPath();
    c.arc(x, y, FH_MALLET_R * 0.55, 0, Math.PI * 2);
    c.fillStyle = 'white';
    c.fill();
    c.strokeStyle = '#2d3436';
    c.lineWidth = 2;
    c.stroke();

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
  'rhythm-duo':        () => new RhythmDuoGame(),
  'laser-mirror':      () => new LaserMirrorGame(),
};
