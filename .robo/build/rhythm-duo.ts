/**
 * DuoPlay — Rhythm Duo (Duelo Rítmico Cooperativo)
 * 2 carriles en perfecta sincronía.
 * P1 = Carril Izquierdo (Teclas A/D, Toque Izquierdo)
 * P2 = Carril Derecho (Teclas J/L, Toque Derecho)
 * Multiplicador conjunto, síntesis procedural y partículas.
 */

import type { GameContext, GameModule } from './games';
import { sound, haptic, ParticleSystem } from './audio';
import { profileManager } from './badges';
import { showRematchModal } from './ui';

interface RhythmNote {
  id: string;
  lane: 0 | 1; // 0 = P1 (Izquierda), 1 = P2 (Derecha)
  targetTime: number; // ms offset from start
  hit: boolean;
  missed: boolean;
  noteFreq: number;
  isTwin?: boolean; // Nota sincronizada que cae a la vez en ambos carriles
}

interface HitFeedback {
  x: number;
  y: number;
  text: string;
  color: string;
  timer: number;
  scale: number;
}

export class RhythmDuoGame implements GameModule {
  private ctx!: GameContext;
  private animId = 0;
  private canvasCtx!: CanvasRenderingContext2D;
  private particles = new ParticleSystem();

  // Song & timing
  private bpm = 115;
  private startTime = 0;
  private songDurationMs = 52000; // ~52 segundos de sesión rítmica
  private notes: RhythmNote[] = [];
  private noteFallDuration = 1800; // ms from spawn top to target line
  
  // Scoring
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private multiplier = 1;
  private gameOver = false;
  private won = false;
  private feedbacks: HitFeedback[] = [];

  // Visual pulses
  private beatPulse = 1;
  private lastBeatIndex = -1;
  private lastHitTs: { 0: number; 1: number } = { 0: 0, 1: 0 };
  private p1Pressed = false;
  private p2Pressed = false;

  // Sync
  private lastActionTs = 0;
  private syncTimer: any = null;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvasCtx = ctx.canvas.getContext('2d')!;
    this.reset();

    ctx.canvas.addEventListener('pointerdown', this.onPointerDown);
    ctx.canvas.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    ctx.sync.on('stateChange', this.onStateChange);

    if (ctx.isHost) {
      this.generateChart();
      this.startTime = Date.now();
      this.syncTimer = setInterval(() => {
        this.broadcastState();
      }, 70);
    }

    this.loop();
  }

  private reset() {
    this.notes = [];
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.multiplier = 1;
    this.gameOver = false;
    this.won = false;
    this.feedbacks = [];
    this.feedbacks = [];
    this.startTime = Date.now();
  }

  private generateChart() {
    this.notes = [];
    const beatMs = (60 / this.bpm) * 1000;
    const pentatonicScale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
    let noteId = 1;

    // Primeros 4 compases de introducción (calentamiento)
    const totalBeats = Math.floor(this.songDurationMs / beatMs);
    for (let b = 4; b < totalBeats - 4; b++) {
      const time = b * beatMs;
      const freq = pentatonicScale[b % pentatonicScale.length];

      // Patrones cooperativos inteligentes
      if (b % 8 === 0) {
        // NOTAS GEMELAS: Ambos tocan al unísono para combo cooperativo
        this.notes.push({
          id: `note_${noteId++}`,
          lane: 0,
          targetTime: time,
          hit: false,
          missed: false,
          noteFreq: freq,
          isTwin: true,
        });
        this.notes.push({
          id: `note_${noteId++}`,
          lane: 1,
          targetTime: time,
          hit: false,
          missed: false,
          noteFreq: freq * 1.5,
          isTwin: true,
        });
      } else if (b % 4 === 1 || b % 4 === 3) {
        // Llamada y respuesta alternada
        const lane: 0 | 1 = (b % 2 === 0) ? 0 : 1;
        this.notes.push({
          id: `note_${noteId++}`,
          lane,
          targetTime: time,
          hit: false,
          missed: false,
          noteFreq: freq,
        });
      } else if (b % 6 === 2) {
        // Sincopa ligera
        this.notes.push({
          id: `note_${noteId++}`,
          lane: 0,
          targetTime: time,
          hit: false,
          missed: false,
          noteFreq: freq,
        });
        this.notes.push({
          id: `note_${noteId++}`,
          lane: 1,
          targetTime: time + beatMs * 0.5,
          hit: false,
          missed: false,
          noteFreq: pentatonicScale[(b + 2) % pentatonicScale.length],
        });
      }
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.gameOver) return;
    const key = e.key.toLowerCase();
    // P1: A o D
    if (key === 'a' || key === 'd') {
      if (!this.p1Pressed) {
        this.p1Pressed = true;
        this.registerHit(0, this.ctx.me.id);
      }
    }
    // P2: J o L
    if (key === 'j' || key === 'l') {
      if (!this.p2Pressed) {
        this.p2Pressed = true;
        this.registerHit(1, this.ctx.me.id);
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key === 'a' || key === 'd') this.p1Pressed = false;
    if (key === 'j' || key === 'l') this.p2Pressed = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.gameOver) {
      this.handleRestart();
      return;
    }

    const rect = this.ctx.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const w = this.ctx.canvas.width;

    // Carril izquierdo o derecho según coordenada X del toque
    if (px < w / 2) {
      this.p1Pressed = true;
      this.registerHit(0, this.ctx.me.id);
    } else {
      this.p2Pressed = true;
      this.registerHit(1, this.ctx.me.id);
    }
  };

  private onPointerUp = () => {
    this.p1Pressed = false;
    this.p2Pressed = false;
  };

  public registerHit(lane: 0 | 1, by: string) {
    const now = Date.now();
    const songElapsed = now - this.startTime;
    this.lastHitTs[lane] = now;

    // Buscar la nota activa más cercana en este carril
    let closestNote: RhythmNote | null = null;
    let minDiff = Infinity;

    for (const note of this.notes) {
      if (note.lane === lane && !note.hit && !note.missed) {
        const diff = Math.abs(songElapsed - note.targetTime);
        if (diff < minDiff && diff < 380) { // Ventana de impacto máxima
          minDiff = diff;
          closestNote = note;
        }
      }
    }

    const targetY = this.ctx.canvas.height * 0.8;
    const laneX = lane === 0 ? this.ctx.canvas.width * 0.28 : this.ctx.canvas.width * 0.72;

    if (!closestNote) {
      // Golpe en vacío
      sound.click();
      return;
    }

    let rating: 'perfect' | 'great' | 'miss' = 'miss';
    let pts = 0;
    let text = 'MISS';
    let color = '#d63031';

    if (minDiff <= 110) {
      rating = 'perfect';
      pts = 100;
      text = closestNote.isTwin ? '¡ARMONÍA PERFECTA! ⭐' : 'PERFECT! ✦';
      color = '#fdcb6e';
    } else if (minDiff <= 230) {
      rating = 'great';
      pts = 50;
      text = 'GREAT! ✨';
      color = '#00cec9';
    } else {
      rating = 'miss';
      pts = 0;
      text = 'MISS ❌';
      color = '#ff7675';
    }

    closestNote.hit = rating !== 'miss';
    closestNote.missed = rating === 'miss';

    if (rating !== 'miss') {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.multiplier = this.combo >= 25 ? 4 : this.combo >= 15 ? 3 : this.combo >= 6 ? 2 : 1;
      this.score += pts * this.multiplier * (closestNote.isTwin ? 2 : 1);

      sound.rhythmHit(rating, closestNote.noteFreq);
      haptic(rating === 'perfect' ? 35 : 18);
      this.particles.spawnConfetti(laneX, targetY, rating === 'perfect' ? 24 : 10);

      if (this.combo >= 10) {
        profileManager.unlockBadge('rhythm-virtuoso');
      }
    } else {
      this.combo = 0;
      this.multiplier = 1;
      sound.rhythmHit('miss');
      haptic([30, 40]);
    }

    this.feedbacks.push({
      x: laneX,
      y: targetY - 40,
      text,
      color,
      timer: 35,
      scale: 1.4,
    });

    // Sincronizar acción con el otro jugador
    this.ctx.sync.setState({
      rdHit: { lane, rating, noteId: closestNote.id, ts: Date.now(), by }
    });
  }

  private broadcastState() {
    this.ctx.sync.setState({
      rdState: {
        startTime: this.startTime,
        score: this.score,
        combo: this.combo,
        mult: this.multiplier,
        notes: this.notes.map(n => ({ id: n.id, lane: n.lane, targetTime: n.targetTime, hit: n.hit, missed: n.missed, isTwin: n.isTwin })),
        over: this.gameOver,
        won: this.won,
        ts: Date.now()
      }
    });
  }

  private onStateChange = (state: any) => {
    if (state.rdHit && state.rdHit.ts !== this.lastActionTs) {
      this.lastActionTs = state.rdHit.ts;
      if (state.rdHit.by !== this.ctx.me.id) {
        // Feedback visual del compañero
        const laneX = state.rdHit.lane === 0 ? this.ctx.canvas.width * 0.28 : this.ctx.canvas.width * 0.72;
        const targetY = this.ctx.canvas.height * 0.8;
        const rating = state.rdHit.rating;
        const note = this.notes.find(n => n.id === state.rdHit.noteId);
        if (note) {
          note.hit = rating !== 'miss';
          note.missed = rating === 'miss';
        }

        if (rating === 'perfect') {
          sound.rhythmHit('perfect', note?.noteFreq || 523.25);
          this.particles.spawnConfetti(laneX, targetY, 18);
        } else if (rating === 'great') {
          sound.rhythmHit('great', note?.noteFreq || 523.25);
        }
      }
    }

    if (!this.ctx.isHost && state.rdState) {
      this.score = state.rdState.score;
      this.combo = state.rdState.combo;
      this.multiplier = state.rdState.mult;
      this.startTime = state.rdState.startTime;
      if (state.rdState.notes && this.notes.length === 0) {
        this.notes = state.rdState.notes;
      } else if (state.rdState.notes) {
        // Mantener sincronía de notas golpeadas
        state.rdState.notes.forEach((sn: any) => {
          const local = this.notes.find(n => n.id === sn.id);
          if (local) {
            local.hit = sn.hit;
            local.missed = sn.missed;
          }
        });
      }
      if (state.rdState.over && !this.gameOver) {
        this.triggerEnd(state.rdState.won);
      }
    }

    if (state.rdRestart && state.rdRestart.ts !== this.lastActionTs) {
      this.lastActionTs = state.rdRestart.ts;
      this.handleRestart();
    }
  };

  private handleRestart() {
    this.reset();
    if (this.ctx.isHost) {
      this.generateChart();
      this.startTime = Date.now();
      this.broadcastState();
    } else {
      this.ctx.sync.setState({ rdRestart: { ts: Date.now() } });
    }
  }

  private triggerEnd(won: boolean) {
    this.gameOver = true;
    this.won = won;

    if (won) {
      sound.victory();
      profileManager.addWin();
      this.particles.spawnConfetti(this.ctx.canvas.width / 2, this.ctx.canvas.height / 2, 50);
    } else {
      sound.defeat();
      profileManager.resetStreak();
    }

    showRematchModal({
      won,
      title: won ? '¡Sinfonía Cooperativa! 🎵' : '¡Fin de la Melodía!',
      statsText: `Puntuación: ${this.score} · Combo Máximo: x${this.maxCombo}`,
      onRematch: () => this.handleRestart(),
      onLobby: () => this.ctx.sync.setState({ host_location: null })
    });
  }

  private loop = () => {
    this.update();
    this.draw();
    this.animId = requestAnimationFrame(this.loop);
  };

  private update() {
    if (this.gameOver) return;

    const now = Date.now();
    const elapsed = now - this.startTime;

    // Pulsación rítmica del compás
    const beatMs = (60 / this.bpm) * 1000;
    const currentBeat = Math.floor(elapsed / beatMs);
    if (currentBeat !== this.lastBeatIndex) {
      this.lastBeatIndex = currentBeat;
      this.beatPulse = 1.35;
    }
    this.beatPulse += (1.0 - this.beatPulse) * 0.12;

    // Detectar notas perdidas que pasaron la línea de meta
    for (const note of this.notes) {
      if (!note.hit && !note.missed && elapsed > note.targetTime + 220) {
        note.missed = true;
        this.combo = 0;
        this.multiplier = 1;
        const laneX = note.lane === 0 ? this.ctx.canvas.width * 0.28 : this.ctx.canvas.width * 0.72;
        const targetY = this.ctx.canvas.height * 0.8;
        this.feedbacks.push({
          x: laneX,
          y: targetY - 20,
          text: 'MISS ❌',
          color: '#ff7675',
          timer: 25,
          scale: 1.0,
        });
      }
    }

    // Actualizar feedbacks flotantes
    for (let i = this.feedbacks.length - 1; i >= 0; i--) {
      const f = this.feedbacks[i];
      f.timer--;
      f.y -= 1.2;
      f.scale += (1.0 - f.scale) * 0.15;
      if (f.timer <= 0) this.feedbacks.splice(i, 1);
    }

    // Fin de canción
    if (this.ctx.isHost && elapsed > this.songDurationMs) {
      const won = this.score >= 1200;
      this.triggerEnd(won);
      this.broadcastState();
    }
  }

  private draw() {
    const c = this.canvasCtx;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

    c.clearRect(0, 0, w, h);

    const targetY = h * 0.8;
    const lane1X = w * 0.28;
    const lane2X = w * 0.72;
    const laneWidth = w * 0.38;

    // Fondo rítmico estilo Doodle Paper con ondas sonoras
    c.save();
    c.strokeStyle = 'rgba(0,0,0,0.06)';
    c.lineWidth = 2;
    for (let y = 0; y < h; y += 40) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }

    // Carriles (Left = P1 🔵, Right = P2 🔴)
    // Carril 1 (P1)
    c.fillStyle = this.p1Pressed ? 'rgba(9, 132, 227, 0.14)' : 'rgba(9, 132, 227, 0.05)';
    c.fillRect(w * 0.09, 0, laneWidth, h);

    // Carril 2 (P2)
    c.fillStyle = this.p2Pressed ? 'rgba(232, 67, 147, 0.14)' : 'rgba(232, 67, 147, 0.05)';
    c.fillRect(w * 0.53, 0, laneWidth, h);

    // Líneas divisorias doodle
    c.strokeStyle = 'var(--ink-primary)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(w / 2, 0);
    c.lineTo(w / 2, h);
    c.stroke();

    // Línea de Impacto (Hit Zone) con vibración rítmica
    const pulseHeight = (this.beatPulse - 1) * 8;
    c.strokeStyle = 'var(--ink-primary)';
    c.lineWidth = 4 + pulseHeight;
    c.beginPath();
    c.moveTo(w * 0.06, targetY);
    c.lineTo(w * 0.94, targetY);
    c.stroke();

    // Dianas de impacto de los carriles
    this.drawHitTarget(c, lane1X, targetY, '#0984e3', 'P1 [A/D]', this.p1Pressed);
    this.drawHitTarget(c, lane2X, targetY, '#e84393', 'P2 [J/L]', this.p2Pressed);

    // Dibujar notas cayendo
    const elapsed = Date.now() - this.startTime;
    for (const note of this.notes) {
      if (note.hit || note.missed) continue;

      const timeUntilTarget = note.targetTime - elapsed;
      if (timeUntilTarget > this.noteFallDuration || timeUntilTarget < -250) continue;

      const progress = 1 - (timeUntilTarget / this.noteFallDuration);
      const noteY = progress * targetY;
      const noteX = note.lane === 0 ? lane1X : lane2X;

      this.drawNote(c, noteX, noteY, note);
    }

    // Partículas
    this.particles.updateAndDraw(c);

    // Textos flotantes de rating
    for (const f of this.feedbacks) {
      c.save();
      c.fillStyle = f.color;
      c.strokeStyle = 'var(--ink-primary)';
      c.lineWidth = 3;
      c.font = `bold ${Math.floor(22 * f.scale)}px "Patrick Hand", cursive`;
      c.textAlign = 'center';
      c.strokeText(f.text, f.x, f.y);
      c.fillText(f.text, f.x, f.y);
      c.restore();
    }

    // HUD Superior: Puntuación, Combo, Multiplicador y Barra de Progreso
    this.drawHUD(c, w, h, elapsed);

    c.restore();
  }

  private drawHitTarget(c: CanvasRenderingContext2D, x: number, y: number, color: string, label: string, pressed: boolean) {
    const r = (pressed ? 32 : 36) * this.beatPulse;
    c.save();
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = pressed ? color : 'white';
    c.strokeStyle = 'var(--ink-primary)';
    c.lineWidth = 4;
    c.fill();
    c.stroke();

    // Círculo interior
    c.beginPath();
    c.arc(x, y, r * 0.5, 0, Math.PI * 2);
    c.strokeStyle = pressed ? 'white' : color;
    c.lineWidth = 3;
    c.stroke();

    // Etiqueta del botón
    c.font = 'bold 15px "Patrick Hand", cursive';
    c.textAlign = 'center';
    c.fillStyle = 'var(--ink-primary)';
    c.fillText(label, x, y + 54);
    c.restore();
  }

  private drawNote(c: CanvasRenderingContext2D, x: number, y: number, note: RhythmNote) {
    c.save();
    const isTwin = !!note.isTwin;
    const color = isTwin ? '#fdcb6e' : note.lane === 0 ? '#0984e3' : '#e84393';
    const w = 58;
    const h = 26;

    // Resplandor de nota gemela
    if (isTwin) {
      c.shadowColor = '#fdcb6e';
      c.shadowBlur = 12;
    }

    c.beginPath();
    c.roundRect(x - w / 2, y - h / 2, w, h, 8);
    c.fillStyle = color;
    c.strokeStyle = 'var(--ink-primary)';
    c.lineWidth = 3;
    c.fill();
    c.stroke();

    // Símbolo musical o estrella
    c.fillStyle = isTwin ? '#2d3436' : 'white';
    c.font = '16px "Patrick Hand", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(isTwin ? '★ DUO ★' : '♪', x, y);

    c.restore();
  }

  private drawHUD(c: CanvasRenderingContext2D, w: number, h: number, elapsed: number) {
    c.save();
    // Barra de tiempo superior
    const progress = Math.min(1, Math.max(0, elapsed / this.songDurationMs));
    c.fillStyle = 'rgba(0,0,0,0.06)';
    c.fillRect(20, 14, w - 40, 10);
    c.fillStyle = '#00b894';
    c.fillRect(20, 14, (w - 40) * progress, 10);
    c.strokeStyle = 'var(--ink-primary)';
    c.lineWidth = 2;
    c.strokeRect(20, 14, w - 40, 10);

    // Marcador
    c.font = 'bold 22px "Patrick Hand", cursive';
    c.textAlign = 'left';
    c.fillStyle = 'var(--ink-primary)';
    c.fillText(`🎵 ${this.score}`, 24, 52);

    // Combo cooperativo y multiplicador conjunto
    c.textAlign = 'center';
    if (this.combo > 1) {
      c.fillStyle = '#e17055';
      c.font = 'bold 24px "Patrick Hand", cursive';
      c.fillText(`🔥 COMBO x${this.combo} (Mult: ${this.multiplier}x)`, w / 2, 52);
    } else {
      c.fillStyle = 'var(--ink-secondary)';
      c.font = '19px "Patrick Hand", cursive';
      c.fillText(`¡Sincronía Rítmica!`, w / 2, 52);
    }

    c.textAlign = 'right';
    c.fillStyle = 'var(--ink-primary)';
    c.font = 'bold 20px "Patrick Hand", cursive';
    const remainingSec = Math.max(0, Math.ceil((this.songDurationMs - elapsed) / 1000));
    c.fillText(`⏱️ ${remainingSec}s`, w - 24, 52);

    c.restore();
  }

  destroy(): void {
    cancelAnimationFrame(this.animId);
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.ctx.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.ctx.canvas.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.ctx.sync.off('stateChange', this.onStateChange);
  }
}
