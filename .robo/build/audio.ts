/**
 * DuoPlay — Procedural Web Audio & Haptics Engine (0 KB Assets)
 * Synthesizes retro-arcade sound effects entirely in code via Web Audio API.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.35;
  private bgmVolume: number = 0.10;
  private bgmInterval: any = null;
  private bgmStep: number = 0;
  private currentBgmTrack: 'lobby' | 'game' | null = null;
  private nextBgmTime: number = 0;

  constructor() {
    // Restore mute preference
    const savedMute = localStorage.getItem('duoplay_muted');
    if (savedMute !== null) {
      this.isMuted = savedMute === 'true';
    }
    const savedVol = localStorage.getItem('duoplay_volume');
    if (savedVol !== null) {
      this.volume = parseFloat(savedVol) || 0.35;
    }

    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        this.initCtx();
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      };
      window.addEventListener('pointerdown', unlockAudio, { passive: true, once: true });
      window.addEventListener('keydown', unlockAudio, { passive: true, once: true });
    }
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
        this.masterGain.connect(this.ctx.destination);

        this.bgmGain = this.ctx.createGain();
        this.bgmGain.gain.value = this.isMuted ? 0 : this.bgmVolume;
        this.bgmGain.connect(this.masterGain);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    localStorage.setItem('duoplay_muted', String(muted));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.volume, this.ctx.currentTime);
    }
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setValueAtTime(muted ? 0 : this.bgmVolume, this.ctx.currentTime);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    localStorage.setItem('duoplay_volume', String(this.volume));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  // ── Procedural Sound Effects ─────────────────────────────

  /** Click / Tap sutil */
  public click() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  /** Boing elástico para el globo o saltos */
  public boing(freq = 220) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 2.4, now + 0.16);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  /** Golpe seco (Puck de hockey, colocación de pieza tetris) */
  public thud(freq = 130) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.09);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /** Captura de estrella o gol / punto */
  public star() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const notes = [587.33, 880, 1174.66]; // D5, A5, D6
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime + idx * 0.06;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.12);
    });
  }

  /** Limpieza de líneas en Tetris */
  public lineClear() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime + idx * 0.05;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.15);
    });
  }

  /** Explosión filtrada (Buscaminas, cristal roto) */
  public explosion() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const duration = 0.45;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(750, this.ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(60, this.ctx.currentTime + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start();
  }

  /** Fanfarria triunfal de victoria */
  public victory() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const notes = [
      { f: 523.25, d: 0.12 }, // C5
      { f: 659.25, d: 0.12 }, // E5
      { f: 783.99, d: 0.12 }, // G5
      { f: 1046.50, d: 0.35 } // C6
    ];

    let t = this.ctx.currentTime;
    notes.forEach((n) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, t);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + n.d);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + n.d);

      t += n.d * 0.9;
    });
  }

  /** Derrota sutil */
  public defeat() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const notes = [440, 392, 349.23, 293.66]; // A4, G4, F4, D4
    let t = this.ctx.currentTime;
    notes.forEach((freq) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.18);

      t += 0.15;
    });
  }

  /** Golpe rítmico con nota armónica sintetizada */
  public rhythmHit(rating: 'perfect' | 'great' | 'miss', baseFreq = 523.25) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    if (rating === 'miss') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.12);
      return;
    }

    const mult = rating === 'perfect' ? 1.5 : 1.0;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(baseFreq * mult, now);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(baseFreq * mult * 2, now); // Octave overtone

    const dur = rating === 'perfect' ? 0.22 : 0.16;
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + dur);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + dur);
    osc2.stop(now + dur);
  }

  /** Nota musical de escala pentatónica por índice de combo */
  public playScaleNote(index: number) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
    const freq = scale[Math.min(scale.length - 1, Math.max(0, index % scale.length))];
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  /** Acorde armónico placentero para revelaciones de buscaminas o combos */
  public pleasantChord() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    // Cmaj7 arpeggio (C4, E4, G4, B4, D5)
    const notes = [261.63, 329.63, 392.00, 493.88, 587.33];
    notes.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime + i * 0.035;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.005, t + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  }

  /** Pulso o zumbido láser */
  public laserHum() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.09);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /** Campanilla cristalina al encender un prisma o cristal */
  public crystalChime() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const freqs = [1318.51, 1760.00, 2093.00];
    freqs.forEach((f, i) => {
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime + i * 0.04;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  /** Silbato cómico de caída para Crystal Bridge */
  public comicWhistle() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.45);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.45);
  }

  /** Ráfaga de viento para el globo */
  public windGust() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(260, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.4);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  /** Power-up de fuego */
  public powerupFire() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(840, now + 0.2);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  /** Power-up de hielo */
  public powerupIce() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const notes = [880, 1174.66, 1567.98];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime + idx * 0.04;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  // ── Procedural Background Music (0 KB Assets) ───────────────

  private playBgmNote(freq: number, time: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.10) {
    if (!this.ctx || !this.bgmGain) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(type === 'triangle' ? 320 : 1500, time);

      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(gainVal, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);

      osc.start(time);
      osc.stop(time + duration);
    } catch (_) {}
  }

  /** Música relajante, acústica y acogedora para el Lobby */
  public startLobbyBgm() {
    if (this.currentBgmTrack === 'lobby') return;
    this.stopBgm();
    this.initCtx();
    if (!this.ctx) return;

    this.currentBgmTrack = 'lobby';
    this.bgmStep = 0;
    this.nextBgmTime = this.ctx.currentTime + 0.05;

    const stepDuration = 0.36; // ~83 BPM eighth-notes
    const totalSteps = 32;     // 4 bars

    // Notes: C3=130.81, A2=110, F2=87.31, G2=98
    // Chords: Cmaj7, Am7, Fmaj7, G6
    const scheduleLobbyStep = (step: number, time: number) => {
      // Bar 0: Cmaj7 (steps 0-7)
      if (step === 0) {
        this.playBgmNote(130.81, time, 0.7, 'triangle', 0.10); // C3 bass
        this.playBgmNote(261.63, time, 0.32, 'sine', 0.08);    // C4
      } else if (step === 2) {
        this.playBgmNote(329.63, time, 0.32, 'sine', 0.08);    // E4
      } else if (step === 4) {
        this.playBgmNote(392.00, time, 0.32, 'sine', 0.08);    // G4
      } else if (step === 6) {
        this.playBgmNote(493.88, time, 0.32, 'sine', 0.07);    // B4
      }
      // Bar 1: Am7 (steps 8-15)
      else if (step === 8) {
        this.playBgmNote(110.00, time, 0.7, 'triangle', 0.10); // A2 bass
        this.playBgmNote(261.63, time, 0.32, 'sine', 0.08);    // C4
      } else if (step === 10) {
        this.playBgmNote(329.63, time, 0.32, 'sine', 0.08);    // E4
      } else if (step === 12) {
        this.playBgmNote(392.00, time, 0.32, 'sine', 0.08);    // G4
      } else if (step === 14) {
        this.playBgmNote(440.00, time, 0.32, 'sine', 0.07);    // A4
      }
      // Bar 2: Fmaj7 (steps 16-23)
      else if (step === 16) {
        this.playBgmNote(87.31, time, 0.7, 'triangle', 0.10);  // F2 bass
        this.playBgmNote(220.00, time, 0.32, 'sine', 0.08);    // A3
      } else if (step === 18) {
        this.playBgmNote(261.63, time, 0.32, 'sine', 0.08);    // C4
      } else if (step === 20) {
        this.playBgmNote(329.63, time, 0.32, 'sine', 0.08);    // E4
      } else if (step === 22) {
        this.playBgmNote(392.00, time, 0.32, 'sine', 0.07);    // G4
      }
      // Bar 3: G6 (steps 24-31)
      else if (step === 24) {
        this.playBgmNote(98.00, time, 0.7, 'triangle', 0.10);  // G2 bass
        this.playBgmNote(246.94, time, 0.32, 'sine', 0.08);    // B3
      } else if (step === 26) {
        this.playBgmNote(293.66, time, 0.32, 'sine', 0.08);    // D4
      } else if (step === 28) {
        this.playBgmNote(329.63, time, 0.32, 'sine', 0.08);    // E4
      } else if (step === 30) {
        this.playBgmNote(392.00, time, 0.32, 'sine', 0.07);    // G4
      }
    };

    this.bgmInterval = setInterval(() => {
      if (!this.ctx || this.currentBgmTrack !== 'lobby') return;
      while (this.nextBgmTime < this.ctx.currentTime + 0.25) {
        scheduleLobbyStep(this.bgmStep, this.nextBgmTime);
        this.nextBgmTime += stepDuration;
        this.bgmStep = (this.bgmStep + 1) % totalSteps;
      }
    }, 70);
  }

  /** Música rítmica, alegre y dinámica para los minijuegos */
  public startGameBgm() {
    if (this.currentBgmTrack === 'game') return;
    this.stopBgm();
    this.initCtx();
    if (!this.ctx) return;

    this.currentBgmTrack = 'game';
    this.bgmStep = 0;
    this.nextBgmTime = this.ctx.currentTime + 0.05;

    const stepDuration = 0.22; // ~136 BPM eighth-notes
    const totalSteps = 16;     // 2 energetic bars

    const scheduleGameStep = (step: number, time: number) => {
      // Bass line on beats
      if (step === 0) this.playBgmNote(130.81, time, 0.38, 'triangle', 0.12); // C3
      if (step === 4) this.playBgmNote(164.81, time, 0.38, 'triangle', 0.12); // E3
      if (step === 8) this.playBgmNote(110.00, time, 0.38, 'triangle', 0.12); // A2
      if (step === 12) this.playBgmNote(98.00, time, 0.38, 'triangle', 0.12); // G2

      // Melody notes (pentatonic bounce)
      if (step === 0) this.playBgmNote(523.25, time, 0.18, 'sine', 0.09);     // C5
      else if (step === 2) this.playBgmNote(659.25, time, 0.18, 'sine', 0.09);// E5
      else if (step === 5) this.playBgmNote(783.99, time, 0.18, 'sine', 0.09);// G5
      else if (step === 7) this.playBgmNote(659.25, time, 0.18, 'sine', 0.08);// E5
      else if (step === 8) this.playBgmNote(880.00, time, 0.18, 'sine', 0.09);// A5
      else if (step === 10) this.playBgmNote(783.99, time, 0.18, 'sine', 0.09);// G5
      else if (step === 13) this.playBgmNote(659.25, time, 0.18, 'sine', 0.08);// E5
      else if (step === 15) this.playBgmNote(587.33, time, 0.18, 'sine', 0.08);// D5
    };

    this.bgmInterval = setInterval(() => {
      if (!this.ctx || this.currentBgmTrack !== 'game') return;
      while (this.nextBgmTime < this.ctx.currentTime + 0.25) {
        scheduleGameStep(this.bgmStep, this.nextBgmTime);
        this.nextBgmTime += stepDuration;
        this.bgmStep = (this.bgmStep + 1) % totalSteps;
      }
    }, 60);
  }

  public stopBgm() {
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
    this.currentBgmTrack = null;
  }
}

export const sound = new SoundEngine();

/** Feedback háptico seguro para móviles */
export function haptic(pattern: number | number[] = 25) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (_) {}
  }
}

/** Partículas Doodle para celebraciones y explosiones */
export interface DoodleParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  size: number;
  color: string;
  char?: string;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  public particles: DoodleParticle[] = [];

  public spawnConfetti(x: number, y: number, count = 30) {
    const colors = ['#0984e3', '#ff7675', '#fdcb6e', '#00b894', '#6c5ce7', '#e17055'];
    const chars = ['★', '✦', '▲', '●', '■', '✦'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.2,
        size: 10 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        char: chars[Math.floor(Math.random() * chars.length)],
        life: 0,
        maxLife: 40 + Math.random() * 30,
      });
    }
  }

  public updateAndDraw(ctx: CanvasRenderingContext2D) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life++;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15; // Gravity
      p.vx *= 0.98; // Friction
      p.rot += p.vRot;

      const alpha = 1 - p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.font = `${p.size}px 'Patrick Hand', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.char || '★', 0, 0);
      ctx.restore();
    }
  }
}
