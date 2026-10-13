/**
 * DuoPlay — Laser Mirror (Laberinto Láser de Espejos)
 * Puzle óptico cooperativo en tiempo real.
 * P1 (Láser): Orienta y pulsa el emisor láser.
 * P2 (Espejos): Rota espejos reflectores para desviar el haz hacia los cristales.
 */

import type { GameContext, GameModule } from './games';
import { sound, haptic, ParticleSystem } from './audio';
import { profileManager } from './badges';
import { showRematchModal, showToast } from './ui';

export interface Mirror {
  id: string;
  x: number;
  y: number;
  angle: number; // en grados: 0, 45, 90, 135, etc.
  targetAngle: number;
  size: number;
}

export interface Crystal {
  id: string;
  x: number;
  y: number;
  radius: number;
  powered: boolean;
  charge: number; // 0..1
}

export interface Barrier {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LevelConfig {
  name: string;
  emitter: { x: number; y: number; angle: number };
  mirrors: Mirror[];
  crystals: Crystal[];
  barriers: Barrier[];
}

export class LaserMirrorGame implements GameModule {
  private ctx!: GameContext;
  private animId = 0;
  private canvasCtx!: CanvasRenderingContext2D;
  private particles = new ParticleSystem();

  // Levels
  private currentLevelIndex = 0;
  private levels: LevelConfig[] = [];
  
  // Emitter state (P1 controls)
  private emitterX = 50;
  private emitterY = 200;
  private emitterAngle = 0; // en radianes
  private targetEmitterAngle = 0;

  // Active level state
  private mirrors: Mirror[] = [];
  private crystals: Crystal[] = [];
  private barriers: Barrier[] = [];

  // Ray segments for drawing
  private raySegments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  private hitEffects: { x: number; y: number; color: string }[] = [];

  // Game flow
  private gameOver = false;
  private won = false;
  private levelWonTimer = 0;
  private lastActionTs = 0;
  private syncTimer: any = null;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;

    this.initLevels();
    this.loadLevel(0);

    ctx.canvas.addEventListener('pointerdown', this.onPointerDown);
    ctx.canvas.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('keydown', this.onKeyDown);

    ctx.sync.on('stateChange', this.onStateChange);

    if (ctx.isHost) {
      this.syncTimer = setInterval(() => {
        this.broadcastState();
      }, 60);
    }

    this.loop();
  }

  private initLevels() {
    this.levels = [
      // Nivel 1: Introducción a la reflexión
      {
        name: 'Nivel 1: Reflexión Básica',
        emitter: { x: 0.12, y: 0.5, angle: 0 },
        mirrors: [
          { id: 'm1', x: 0.5, y: 0.5, angle: 45, targetAngle: 45, size: 48 },
          { id: 'm2', x: 0.5, y: 0.22, angle: 135, targetAngle: 135, size: 48 },
        ],
        crystals: [
          { id: 'c1', x: 0.5, y: 0.35, radius: 24, powered: false, charge: 0 },
          { id: 'c2', x: 0.85, y: 0.22, radius: 24, powered: false, charge: 0 },
        ],
        barriers: [
          { x: 0.28, y: 0.15, w: 0.04, h: 0.25 },
        ]
      },
      // Nivel 2: Zig-zag y cristales duales
      {
        name: 'Nivel 2: Laberinto Prismático',
        emitter: { x: 0.1, y: 0.25, angle: 0 },
        mirrors: [
          { id: 'm1', x: 0.42, y: 0.25, angle: 90, targetAngle: 90, size: 46 },
          { id: 'm2', x: 0.42, y: 0.72, angle: 45, targetAngle: 45, size: 46 },
          { id: 'm3', x: 0.82, y: 0.72, angle: 135, targetAngle: 135, size: 46 },
          { id: 'm4', x: 0.82, y: 0.3, angle: 0, targetAngle: 0, size: 46 },
        ],
        crystals: [
          { id: 'c1', x: 0.42, y: 0.48, radius: 22, powered: false, charge: 0 },
          { id: 'c2', x: 0.62, y: 0.72, radius: 22, powered: false, charge: 0 },
          { id: 'c3', x: 0.82, y: 0.48, radius: 22, powered: false, charge: 0 },
        ],
        barriers: [
          { x: 0.24, y: 0.4, w: 0.03, h: 0.35 },
          { x: 0.6, y: 0.2, w: 0.03, h: 0.35 },
        ]
      },
      // Nivel 3: Circuito óptico maestro
      {
        name: 'Nivel 3: El Núcleo de Cristal',
        emitter: { x: 0.1, y: 0.78, angle: -0.4 },
        mirrors: [
          { id: 'm1', x: 0.32, y: 0.25, angle: 45, targetAngle: 45, size: 46 },
          { id: 'm2', x: 0.7, y: 0.25, angle: 90, targetAngle: 90, size: 46 },
          { id: 'm3', x: 0.85, y: 0.52, angle: 135, targetAngle: 135, size: 46 },
          { id: 'm4', x: 0.6, y: 0.78, angle: 45, targetAngle: 45, size: 46 },
          { id: 'm5', x: 0.32, y: 0.78, angle: 0, targetAngle: 0, size: 46 },
        ],
        crystals: [
          { id: 'c1', x: 0.5, y: 0.25, radius: 22, powered: false, charge: 0 },
          { id: 'c2', x: 0.85, y: 0.38, radius: 22, powered: false, charge: 0 },
          { id: 'c3', x: 0.72, y: 0.65, radius: 22, powered: false, charge: 0 },
          { id: 'c4', x: 0.46, y: 0.78, radius: 22, powered: false, charge: 0 },
        ],
        barriers: [
          { x: 0.48, y: 0.42, w: 0.04, h: 0.25 },
          { x: 0.2, y: 0.45, w: 0.15, h: 0.04 },
        ]
      }
    ];
  }

  private loadLevel(index: number) {
    this.currentLevelIndex = index;
    const lvl = this.levels[index % this.levels.length];
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    this.emitterX = lvl.emitter.x * w;
    this.emitterY = lvl.emitter.y * h;
    this.emitterAngle = lvl.emitter.angle;
    this.targetEmitterAngle = lvl.emitter.angle;

    this.mirrors = lvl.mirrors.map(m => ({
      ...m,
      x: m.x * w,
      y: m.y * h,
      angle: m.angle,
      targetAngle: m.angle,
    }));

    this.crystals = lvl.crystals.map(c => ({
      ...c,
      x: c.x * w,
      y: c.y * h,
      powered: false,
      charge: 0,
    }));

    this.barriers = lvl.barriers.map(b => ({
      x: b.x * w,
      y: b.y * h,
      w: b.w * w,
      h: b.h * h,
    }));

    this.levelWonTimer = 0;
    this.gameOver = false;
    this.won = false;
    showToast(`🔦 ${lvl.name}`);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Si somos P1 o estamos probando solos con bot
    const isP1 = this.ctx.isHost;
    if (isP1) {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        this.targetEmitterAngle -= 0.08;
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        this.targetEmitterAngle += 0.08;
      }
      this.syncEmitter();
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.gameOver || this.won) {
      this.handleRestart();
      return;
    }

    const rect = this.ctx.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const isP1 = this.ctx.isHost;

    // P2: Toca espejos para rotarlos 45 grados
    if (!isP1) {
      this.checkMirrorClick(px, py);
    } else {
      // P1: Toca o arrastra para orientar el emisor láser hacia el toque
      const dx = px - this.emitterX;
      const dy = py - this.emitterY;
      this.targetEmitterAngle = Math.atan2(dy, dx);
      sound.laserHum();
      this.syncEmitter();
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.ctx.isHost && (e.buttons & 1) === 1) {
      const rect = this.ctx.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dx = px - this.emitterX;
      const dy = py - this.emitterY;
      this.targetEmitterAngle = Math.atan2(dy, dx);
      this.syncEmitter();
    }
  };

  public checkMirrorClick(px: number, py: number) {
    for (const m of this.mirrors) {
      const dx = px - m.x;
      const dy = py - m.y;
      if (Math.sqrt(dx * dx + dy * dy) < m.size * 0.75) {
        m.targetAngle = (m.targetAngle + 45) % 360;
        sound.click();
        haptic(20);
        this.particles.spawnConfetti(m.x, m.y, 8);
        this.ctx.sync.setState({
          lmRotate: { id: m.id, targetAngle: m.targetAngle, ts: Date.now(), by: this.ctx.me.id }
        });
        break;
      }
    }
  }

  private syncEmitter() {
    this.ctx.sync.setState({
      lmAim: { angle: this.targetEmitterAngle, ts: Date.now() }
    });
  }

  private broadcastState() {
    this.ctx.sync.setState({
      lmState: {
        lvl: this.currentLevelIndex,
        eAngle: this.targetEmitterAngle,
        mirrors: this.mirrors.map(m => ({ id: m.id, targetAngle: m.targetAngle })),
        crystals: this.crystals.map(c => ({ id: c.id, powered: c.powered })),
        won: this.won,
        over: this.gameOver,
        ts: Date.now()
      }
    });
  }

  private onStateChange = (state: any) => {
    if (state.lmRotate && state.lmRotate.ts !== this.lastActionTs) {
      this.lastActionTs = state.lmRotate.ts;
      const m = this.mirrors.find(item => item.id === state.lmRotate.id);
      if (m) {
        m.targetAngle = state.lmRotate.targetAngle;
        sound.click();
      }
    }

    if (state.lmAim && state.lmAim.ts !== this.lastActionTs) {
      this.lastActionTs = state.lmAim.ts;
      this.targetEmitterAngle = state.lmAim.angle;
    }

    if (!this.ctx.isHost && state.lmState) {
      if (state.lmState.lvl !== this.currentLevelIndex) {
        this.loadLevel(state.lmState.lvl);
      }
      this.targetEmitterAngle = state.lmState.eAngle;
      if (state.lmState.mirrors) {
        state.lmState.mirrors.forEach((sm: any) => {
          const m = this.mirrors.find(x => x.id === sm.id);
          if (m) m.targetAngle = sm.targetAngle;
        });
      }
      if (state.lmState.won && !this.won) {
        this.triggerVictory();
      }
    }

    if (state.lmRestart && state.lmRestart.ts !== this.lastActionTs) {
      this.lastActionTs = state.lmRestart.ts;
      this.handleRestart();
    }
  };

  private handleRestart() {
    this.currentLevelIndex = 0;
    this.loadLevel(0);
    if (this.ctx.isHost) {
      this.broadcastState();
    } else {
      this.ctx.sync.setState({ lmRestart: { ts: Date.now() } });
    }
  }

  private triggerVictory() {
    this.won = true;
    sound.victory();
    profileManager.unlockBadge('laser-optics');
    const badge = profileManager.addWin('laser-mirror');
    this.particles.spawnConfetti(this.ctx.canvas.width / 2, this.ctx.canvas.height / 2, 60);

    showRematchModal({
      won: true,
      title: '¡Maestros del Prisma Láser! 🔦✨',
      statsText: `Completaron todos los niveles con éxito.`,
      stars: 3,
      newBadge: badge || undefined,
      canSwapRoles: true,
      onRematch: (swap) => {
        if (swap) {
          this.ctx.isHost = !this.ctx.isHost;
          showToast(this.ctx.isHost ? '🔦 Ahora manejas el Emisor Láser' : '🪞 Ahora rotas los Espejos');
        }
        this.handleRestart();
      },
      onLobby: () => {
        this.ctx.sync.setState({ host_location: null });
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
    if (this.won) return;

    // Suavizado de rotación del emisor
    this.emitterAngle += (this.targetEmitterAngle - this.emitterAngle) * 0.2;

    // Suavizado de rotación de espejos
    for (const m of this.mirrors) {
      let diff = m.targetAngle - m.angle;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      m.angle += diff * 0.25;
    }

    // Calcular trazado óptico del rayo láser
    this.traceLaser();

    // Comprobar si todos los cristales están encendidos
    const allPowered = this.crystals.every(c => c.powered);
    if (allPowered) {
      this.levelWonTimer++;
      if (this.levelWonTimer === 1) {
        sound.crystalChime();
        sound.star();
        haptic([30, 40, 60]);
        this.particles.spawnConfetti(this.ctx.canvas.width / 2, this.ctx.canvas.height * 0.3, 30);
      }

      if (this.levelWonTimer > 80) {
        if (this.currentLevelIndex < this.levels.length - 1) {
          this.loadLevel(this.currentLevelIndex + 1);
          if (this.ctx.isHost) this.broadcastState();
        } else {
          this.triggerVictory();
          if (this.ctx.isHost) this.broadcastState();
        }
      }
    } else {
      this.levelWonTimer = 0;
    }
  }

  private traceLaser() {
    this.raySegments = [];
    this.hitEffects = [];

    // Reset powered status
    for (const c of this.crystals) {
      c.powered = false;
    }

    let curX = this.emitterX;
    let curY = this.emitterY;
    let curAngle = this.emitterAngle;
    const maxBounces = 12;
    const maxDist = 2400;

    for (let bounce = 0; bounce < maxBounces; bounce++) {
      const cosA = Math.cos(curAngle);
      const sinA = Math.sin(curAngle);
      let closestDist = maxDist;
      let nextX = curX + cosA * maxDist;
      let nextY = curY + sinA * maxDist;
      let hitType: 'none' | 'barrier' | 'mirror' | 'crystal' = 'none';
      let hitMirror: Mirror | null = null;
      let hitNormal = 0;

      // 1. Intersección con paredes de la pantalla
      const w = this.ctx.canvas.width;
      const h = this.ctx.canvas.height;
      if (cosA > 0) {
        const d = (w - curX) / cosA;
        if (d > 0.1 && d < closestDist) { closestDist = d; hitType = 'barrier'; }
      } else if (cosA < 0) {
        const d = (0 - curX) / cosA;
        if (d > 0.1 && d < closestDist) { closestDist = d; hitType = 'barrier'; }
      }
      if (sinA > 0) {
        const d = (h - curY) / sinA;
        if (d > 0.1 && d < closestDist) { closestDist = d; hitType = 'barrier'; }
      } else if (sinA < 0) {
        const d = (0 - curY) / sinA;
        if (d > 0.1 && d < closestDist) { closestDist = d; hitType = 'barrier'; }
      }

      // 2. Intersección con barreras oscuras
      for (const bar of this.barriers) {
        const d = this.rayBoxIntersection(curX, curY, cosA, sinA, bar.x, bar.y, bar.w, bar.h);
        if (d !== null && d > 0.1 && d < closestDist) {
          closestDist = d;
          hitType = 'barrier';
        }
      }

      // 3. Intersección con cristales (atraviesa o activa)
      for (const cry of this.crystals) {
        const d = this.rayCircleIntersection(curX, curY, cosA, sinA, cry.x, cry.y, cry.radius);
        if (d !== null && d > 0.1 && d < closestDist) {
          cry.powered = true;
          this.hitEffects.push({ x: cry.x, y: cry.y, color: '#00cec9' });
        }
      }

      // 4. Intersección con espejos (segmento plano de reflexión)
      for (const m of this.mirrors) {
        const rad = (m.angle * Math.PI) / 180;
        const halfSize = m.size * 0.5;
        // Segmento del espejo: de p1 a p2
        const p1x = m.x - Math.cos(rad) * halfSize;
        const p1y = m.y - Math.sin(rad) * halfSize;
        const p2x = m.x + Math.cos(rad) * halfSize;
        const p2y = m.y + Math.sin(rad) * halfSize;

        const inter = this.raySegmentIntersection(curX, curY, curX + cosA * 2000, curY + sinA * 2000, p1x, p1y, p2x, p2y);
        if (inter && inter.dist > 1.0 && inter.dist < closestDist) {
          closestDist = inter.dist;
          hitType = 'mirror';
          hitMirror = m;
          // Normal del espejo perpendicular al segmento
          hitNormal = rad + Math.PI / 2;
        }
      }

      nextX = curX + cosA * closestDist;
      nextY = curY + sinA * closestDist;
      this.raySegments.push({ x1: curX, y1: curY, x2: nextX, y2: nextY });

      if (hitType === 'mirror' && hitMirror) {
        this.hitEffects.push({ x: nextX, y: nextY, color: '#fdcb6e' });
        // Ley de reflexión 2D: r = d - 2(d dot n)n
        // En ángulos: ángulo reflejado = 2 * hitNormal - rayAngle - PI
        curAngle = 2 * hitNormal - curAngle;
        curX = nextX;
        curY = nextY;
      } else {
        // Bloqueado por barrera o pared
        if (hitType === 'barrier') {
          this.hitEffects.push({ x: nextX, y: nextY, color: '#e17055' });
        }
        break;
      }
    }
  }

  private rayCircleIntersection(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, r: number): number | null {
    const fx = ox - cx;
    const fy = oy - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    return t > 0 ? t : null;
  }

  private rayBoxIntersection(ox: number, oy: number, dx: number, dy: number, bx: number, by: number, bw: number, bh: number): number | null {
    let tmin = -Infinity;
    let tmax = Infinity;

    if (dx !== 0) {
      const t1 = (bx - ox) / dx;
      const t2 = (bx + bw - ox) / dx;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (ox < bx || ox > bx + bw) return null;

    if (dy !== 0) {
      const t1 = (by - oy) / dy;
      const t2 = (by + bh - oy) / dy;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (oy < by || oy > by + bh) return null;

    if (tmax < tmin || tmax < 0) return null;
    return tmin > 0 ? tmin : tmax;
  }

  private raySegmentIntersection(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): { x: number; y: number; dist: number } | null {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      const ix = x1 + t * (x2 - x1);
      const iy = y1 + t * (y2 - y1);
      const dist = Math.hypot(ix - x1, iy - y1);
      return { x: ix, y: iy, dist };
    }
    return null;
  }

  private draw() {
    const c = this.canvasCtx;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    c.clearRect(0, 0, w, h);

    // Fondo óptico con sutil rejilla blueprint doodle
    c.save();
    c.strokeStyle = 'rgba(0, 206, 201, 0.05)';
    c.lineWidth = 1;
    for (let x = 0; x < w; x += 35) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
    }
    for (let y = 0; y < h; y += 35) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
    }

    // Dibujar barreras oscuras
    for (const bar of this.barriers) {
      c.fillStyle = '#2d3436';
      c.strokeStyle = '#636e72';
      c.lineWidth = 3;
      c.beginPath();
      c.roundRect(bar.x, bar.y, bar.w, bar.h, 6);
      c.fill();
      c.stroke();

      // Líneas de peligro rayadas
      c.strokeStyle = 'rgba(255,255,255,0.15)';
      c.lineWidth = 2;
      for (let s = bar.x - bar.h; s < bar.x + bar.w; s += 16) {
        c.beginPath();
        c.moveTo(s, bar.y + bar.h);
        c.lineTo(s + 14, bar.y);
        c.stroke();
      }
    }

    // Dibujar cristales diana
    for (const cry of this.crystals) {
      this.drawCrystal(c, cry);
    }

    // Dibujar espejos
    for (const m of this.mirrors) {
      this.drawMirror(c, m);
    }

    // Dibujar Rayos Láser (Bloom óptico multipaso)
    c.save();
    c.lineCap = 'round';

    // Resplandor exterior
    c.shadowColor = '#00cec9';
    c.shadowBlur = 14;
    c.strokeStyle = 'rgba(0, 206, 201, 0.4)';
    c.lineWidth = 8;
    for (const seg of this.raySegments) {
      c.beginPath();
      c.moveTo(seg.x1, seg.y1);
      c.lineTo(seg.x2, seg.y2);
      c.stroke();
    }

    // Núcleo brillante intenso
    c.shadowBlur = 0;
    c.strokeStyle = '#ffffff';
    c.lineWidth = 3;
    for (const seg of this.raySegments) {
      c.beginPath();
      c.moveTo(seg.x1, seg.y1);
      c.lineTo(seg.x2, seg.y2);
      c.stroke();
    }
    c.restore();

    // Chispas e impactos del rayo
    for (const hit of this.hitEffects) {
      c.save();
      c.beginPath();
      c.arc(hit.x, hit.y, 6 + Math.random() * 4, 0, Math.PI * 2);
      c.fillStyle = hit.color;
      c.shadowColor = hit.color;
      c.shadowBlur = 10;
      c.fill();
      c.restore();
    }

    // Dibujar Emisor Láser (P1)
    this.drawEmitter(c);

    // Partículas
    this.particles.updateAndDraw(c);

    // HUD Superior
    this.drawHUD(c, w, h);

    c.restore();
  }

  private drawEmitter(c: CanvasRenderingContext2D) {
    c.save();
    c.translate(this.emitterX, this.emitterY);
    c.rotate(this.emitterAngle);

    // Cañón del láser
    c.fillStyle = '#0984e3';
    c.strokeStyle = '#2d3436';
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(0, -12, 36, 24, 6);
    c.fill();
    c.stroke();

    // Base del emisor
    c.fillStyle = '#dfe6e9';
    c.beginPath();
    c.arc(0, 0, 20, 0, Math.PI * 2);
    c.fill();
    c.stroke();

    // Lente brillante
    c.fillStyle = '#00cec9';
    c.beginPath();
    c.arc(32, 0, 8, 0, Math.PI * 2);
    c.fill();
    c.stroke();

    c.restore();

    // Etiqueta P1
    c.save();
    c.fillStyle = '#0984e3';
    c.font = 'bold 14px "Patrick Hand", cursive';
    c.textAlign = 'center';
    c.fillText('P1 Láser 🔦', this.emitterX, this.emitterY - 28);
    c.restore();
  }

  private drawMirror(c: CanvasRenderingContext2D, m: Mirror) {
    c.save();
    c.translate(m.x, m.y);
    c.rotate((m.angle * Math.PI) / 180);

    // Marco soporte del espejo
    c.fillStyle = '#fdcb6e';
    c.strokeStyle = '#2d3436';
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(-m.size * 0.5 - 3, -7, m.size + 6, 14, 4);
    c.fill();
    c.stroke();

    // Superficie reflectante plateada/cian
    c.fillStyle = '#ffffff';
    c.shadowColor = '#74b9ff';
    c.shadowBlur = 6;
    c.beginPath();
    c.roundRect(-m.size * 0.5, -3, m.size, 6, 2);
    c.fill();

    // Indicador circular para tocar
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(0, 0, 5, 0, Math.PI * 2);
    c.stroke();

    c.restore();

    // Etiqueta P2 instructiva
    c.save();
    c.fillStyle = '#636e72';
    c.font = '12px "Patrick Hand", cursive';
    c.textAlign = 'center';
    c.fillText(`${Math.round(m.targetAngle)}° ↻`, m.x, m.y + m.size * 0.5 + 14);
    c.restore();
  }

  private drawCrystal(c: CanvasRenderingContext2D, cry: Crystal) {
    c.save();
    const isLit = cry.powered;

    // Resplandor si está cargado
    if (isLit) {
      c.shadowColor = '#00cec9';
      c.shadowBlur = 20;
    }

    // Diamante cristalino
    c.fillStyle = isLit ? '#00cec9' : '#b2bec3';
    c.strokeStyle = '#2d3436';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cry.x, cry.y - cry.radius);
    c.lineTo(cry.x + cry.radius, cry.y);
    c.lineTo(cry.x, cry.y + cry.radius);
    c.lineTo(cry.x - cry.radius, cry.y);
    c.closePath();
    c.fill();
    c.stroke();

    // Reflejo interior
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.beginPath();
    c.moveTo(cry.x, cry.y - cry.radius + 5);
    c.lineTo(cry.x + cry.radius * 0.4, cry.y);
    c.lineTo(cry.x, cry.y);
    c.closePath();
    c.fill();

    c.restore();
  }

  private drawHUD(c: CanvasRenderingContext2D, w: number, _h: number) {
    c.save();
    const lvl = this.levels[this.currentLevelIndex % this.levels.length];
    const poweredCount = this.crystals.filter(x => x.powered).length;

    c.font = 'bold 22px "Patrick Hand", cursive';
    c.textAlign = 'left';
    c.fillStyle = '#2d3436';
    c.fillText(`🔦 ${lvl.name}`, 20, 36);

    c.textAlign = 'center';
    c.fillStyle = poweredCount === this.crystals.length ? '#00b894' : '#e17055';
    c.fillText(`Cristales: ${poweredCount} / ${this.crystals.length} 💎`, w / 2, 36);

    c.textAlign = 'right';
    c.fillStyle = '#636e72';
    c.font = '16px "Patrick Hand", cursive';
    const roleText = this.ctx.isHost ? 'P1: Apunta el haz 🔦' : 'P2: Rota los espejos 🪞';
    c.fillText(roleText, w - 20, 36);

    c.restore();
  }

  destroy(): void {
    cancelAnimationFrame(this.animId);
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.ctx.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.ctx.canvas.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('keydown', this.onKeyDown);
    this.ctx.sync.off('stateChange', this.onStateChange);
  }
}
