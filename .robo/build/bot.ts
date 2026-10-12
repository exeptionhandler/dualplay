/**
 * DuoPlay — DuoBot Autonomous Partner
 * Allows 100% playable single-player practice & local testing across all 9 minigames.
 */

import type { Sync } from './sync';

export interface BotUser {
  id: string;
  username: string;
  avatar: null;
  isBot: boolean;
  accessory: string;
  badges: string[];
}

export const DUOBOT_USER: BotUser = {
  id: 'bot_duo',
  username: 'DuoBot 🤖',
  avatar: null,
  isBot: true,
  accessory: '👑',
  badges: ['og-founder', 'bot-whisperer'],
};

export class DuoBot {
  private sync: Sync;
  private active = false;
  private intervalId: number | null = null;
  private currentScreen = '';
  private tickCount = 0;

  // Finger Hockey internal state
  private hockeyPos = { x: 300, y: 500 };
  private hockeyInit = false;

  // Rhythm Duo internal state
  private processedNotes = new Set<string>();

  // Throttles
  private lastMsActionTs = 0;
  private lastLmActionTs = 0;
  private pendingTimeouts = new Set<number>();

  constructor(sync: Sync) {
    this.sync = sync;
  }

  public start(screen: string) {
    this.active = true;
    this.currentScreen = screen;
    this.tickCount = 0;
    this.hockeyInit = false;
    this.processedNotes.clear();
    this.stopLoop();
    this.pendingTimeouts.forEach(t => clearTimeout(t));
    this.pendingTimeouts.clear();

    // Prevent duplicate listeners
    this.sync.off('stateChange', this.handleStateChange);
    // Listen to game states
    this.sync.on('stateChange', this.handleStateChange);

    // Active tick loop (80ms for fluid physics & responsive rhythm notes)
    this.intervalId = window.setInterval(() => {
      this.tick();
    }, 80);
  }

  public stop() {
    this.active = false;
    this.stopLoop();
    this.sync.off('stateChange', this.handleStateChange);
    this.pendingTimeouts.forEach(t => clearTimeout(t));
    this.pendingTimeouts.clear();
    this.processedNotes.clear();
  }

  private stopLoop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private handleStateChange = (state: Record<string, any>) => {
    if (!this.active) return;

    // 1. Star Fishing Co-Tapping (captura sincronizada)
    if (state.sfTap && state.sfTap.by !== DUOBOT_USER.id) {
      const starId = state.sfTap.starId;
      // React with human-like delay (120ms - 210ms)
      const delay = 120 + Math.random() * 90;
      const t = window.setTimeout(() => {
        this.pendingTimeouts.delete(t);
        if (!this.active) return;
        this.sync.setState({
          sfTap: { starId, ts: Date.now(), by: DUOBOT_USER.id }
        });
      }, delay);
      this.pendingTimeouts.add(t);
    }

    // 2. Inverse Gravity Shield
    if (state.igState && state.igState.obs && Array.isArray(state.igState.obs)) {
      const danger = state.igState.obs.some((o: any) => o.x > 80 && o.x < 190);
      if (danger && !state.igShieldActive) {
        this.sync.setState({
          igShield: { active: true, by: DUOBOT_USER.id, ts: Date.now() }
        });
      }
    }

    // 3. Balloon Emergency Boost
    if (state.balloonState) {
      const b = state.balloonState;
      if (b.y > 0.72 && (!b.lastTapBy || b.lastTapBy !== DUOBOT_USER.id)) {
        const t = window.setTimeout(() => {
          this.pendingTimeouts.delete(t);
          if (!this.active) return;
          this.sync.setState({
            balloonTap: { ts: Date.now(), by: DUOBOT_USER.id }
          });
        }, 150);
        this.pendingTimeouts.add(t);
      }
    }
  };

  private tick() {
    if (!this.active) return;
    this.tickCount++;

    const state = this.sync.getState();

    // 4. Tetris Dual P2 autonomous movements (every ~400ms = 5 ticks)
    if (this.currentScreen === 'tetris-dual' && this.tickCount % 5 === 0) {
      const moves = ['left', 'right', 'rot', 'drop'];
      const action = moves[Math.floor(Math.random() * moves.length)];
      if (Math.random() < 0.65) {
        this.sync.setState({
          tInput: { by: DUOBOT_USER.id, action, ts: Date.now() }
        });
      }
    }

    // 5. Crystal Bridge: Step forward periodically (every ~640ms = 8 ticks)
    if (this.currentScreen === 'crystal-bridge' && this.tickCount % 8 === 0) {
      if (state.cbState && state.cbState.step !== undefined) {
        if (Math.random() < 0.4 && !state.cbState.gameOver && !state.cbState.won) {
          const side = Math.random() > 0.5 ? 0 : 1;
          this.sync.setState({
            cbStep: { side, by: DUOBOT_USER.id, ts: Date.now() }
          });
        }
      }
    }

    // 6. Finger Hockey: Fluid autonomous guest mallet defense and striking (every tick: 80ms)
    if (this.currentScreen === 'finger-hockey' && state.fhState) {
      const fh = state.fhState;
      const puck = fh.puck;
      if (puck) {
        // Estimar dimensiones de pantalla
        const w = (fh.ai2?.x && fh.ai1?.x) ? (fh.ai2.x - fh.ai1.x) / 0.3 : 600;
        const h = fh.ai1?.y ? fh.ai1.y / 0.18 : 800;

        if (!this.hockeyInit) {
          this.hockeyPos = { x: w * 0.7, y: h * 0.8 };
          this.hockeyInit = true;
        }

        let targetX = w * 0.7;
        let targetY = h * 0.8;

        // Si el puck está en la mitad inferior (campo de los jugadores)
        if (puck.y > h * 0.42) {
          // Si el puck está en el cuadrante derecho (sector del bot)
          if (puck.x > w * 0.35) {
            targetX = Math.max(w * 0.45, Math.min(w - 35, puck.x));
            // Golpear el puck desde abajo hacia arriba
            targetY = Math.max(h * 0.46, Math.min(h - 35, puck.y + 24));
          } else {
            // Dar cobertura defensiva en su sector
            targetX = w * 0.65;
            targetY = Math.max(h * 0.7, puck.y * 0.9);
          }
        } else {
          // Posición de espera atenta
          targetX = w * 0.68 + Math.sin(this.tickCount * 0.2) * 20;
          targetY = h * 0.78;
        }

        // Movimiento suave y elástico
        this.hockeyPos.x += (targetX - this.hockeyPos.x) * 0.38;
        this.hockeyPos.y += (targetY - this.hockeyPos.y) * 0.38;

        this.sync.setState({
          fhMallet: {
            x: this.hockeyPos.x,
            y: this.hockeyPos.y,
            ts: Date.now(),
            by: DUOBOT_USER.id
          }
        });
      }
    }

    // 7. Rhythm Duo: Timed strikes on Lane 1 (every tick: 80ms)
    if (this.currentScreen === 'rhythm-duo' && state.rdState) {
      const rd = state.rdState;
      if (!rd.over && rd.notes && Array.isArray(rd.notes)) {
        const now = Date.now();
        const songElapsed = now - rd.startTime;

        for (const note of rd.notes) {
          if (note.lane === 1 && !note.hit && !note.missed && !this.processedNotes.has(note.id)) {
            const diff = note.targetTime - songElapsed;
            // Ventana de impacto óptima (entre -30ms y +60ms)
            if (diff >= -30 && diff <= 70) {
              this.processedNotes.add(note.id);
              const rating = Math.random() < 0.88 ? 'perfect' : 'great';
              this.sync.setState({
                rdHit: {
                  lane: 1,
                  rating,
                  noteId: note.id,
                  ts: now,
                  by: DUOBOT_USER.id
                }
              });
              break;
            }
          }
        }
      }
    }

    // 8. Laser Mirror: Periodically rotate mirrors toward crystals (every ~1.4s = 18 ticks)
    if (this.currentScreen === 'laser-mirror' && state.lmState && this.tickCount % 18 === 0) {
      const lm = state.lmState;
      const now = Date.now();
      if (!lm.won && !lm.over && lm.mirrors && lm.mirrors.length > 0 && now - this.lastLmActionTs > 1200) {
        // Verificar si faltan cristales por cargar
        const hasUncharged = lm.crystals?.some((c: any) => !c.powered);
        if (hasUncharged) {
          const mirror = lm.mirrors[Math.floor(Math.random() * lm.mirrors.length)];
          const newAngle = (mirror.targetAngle + 45) % 360;
          this.lastLmActionTs = now;
          this.sync.setState({
            lmRotate: {
              id: mirror.id,
              targetAngle: newAngle,
              ts: now,
              by: DUOBOT_USER.id
            }
          });
        }
      }
    }

    // 9. Minesweeper: Autonomous tile deduction and flagging (every ~880ms = 11 ticks)
    if (this.currentScreen === 'minesweeper' && state.msBoard && this.tickCount % 11 === 0) {
      const ms = state.msBoard;
      const now = Date.now();
      if (!ms.over && !ms.won && ms.b && Array.isArray(ms.b) && now - this.lastMsActionTs > 800) {
        const board = ms.b;
        const rows = board.length;
        const cols = board[0]?.length || 0;

        let bestAction: { r: number; c: number; flag: boolean } | null = null;

        // Buscar deducciones lógicas alrededor de celdas reveladas
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cell = board[r][c];
            if (cell.d === 1 && cell.v > 0) { // Revelada con número
              let hiddenNeighbors: { r: number; c: number }[] = [];
              let flaggedCount = 0;

              for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                  const nr = r + dr;
                  const nc = c + dc;
                  if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !(dr === 0 && dc === 0)) {
                    if (board[nr][nc].d === 0) hiddenNeighbors.push({ r: nr, c: nc });
                    else if (board[nr][nc].d === 2) flaggedCount++;
                  }
                }
              }

              // Deducción 1: Todas las ocultas restantes son minas -> poner bandera
              if (hiddenNeighbors.length > 0 && hiddenNeighbors.length + flaggedCount === cell.v) {
                bestAction = { r: hiddenNeighbors[0].r, c: hiddenNeighbors[0].c, flag: true };
                break;
              }

              // Deducción 2: Todas las minas ya marcadas -> despejar ocultas restantes
              if (hiddenNeighbors.length > 0 && flaggedCount === cell.v) {
                bestAction = { r: hiddenNeighbors[0].r, c: hiddenNeighbors[0].c, flag: false };
                break;
              }
            }
          }
          if (bestAction) break;
        }

        // Si no hay deducción obvia, revelar una casilla oculta al azar
        if (!bestAction) {
          const hiddenCells: { r: number; c: number }[] = [];
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              if (board[r][c].d === 0) hiddenCells.push({ r, c });
            }
          }
          if (hiddenCells.length > 0) {
            const pick = hiddenCells[Math.floor(Math.random() * hiddenCells.length)];
            bestAction = { r: pick.r, c: pick.c, flag: false };
          }
        }

        if (bestAction) {
          this.lastMsActionTs = now;
          // Actualizar cursor cooperativo del bot
          this.sync.setState({
            msCursor: { r: bestAction.r, c: bestAction.c, by: DUOBOT_USER.id }
          });
          // Ejecutar acción
          this.sync.setState({
            msAction: {
              r: bestAction.r,
              c: bestAction.c,
              flag: bestAction.flag,
              ts: now,
              by: DUOBOT_USER.id
            }
          });
        }
      }
    }
  }
}
