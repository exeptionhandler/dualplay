/**
 * DuoPlay — UI Renderer
 * Pure DOM manipulation; no framework.
 * All screens are rendered into #app.
 */
import type { Role } from './PeerManager';
import type { GameId } from './types';

// ── Toast ──────────────────────────────────────────────
let toastContainer: HTMLElement | null = null;

export function showToast(text: string, duration = 2800): void {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = text;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

// ── Background aura (persistent) ──────────────────────
export function mountAura(): void {
  if (document.querySelector('.bg-aura')) return;
  const aura = document.createElement('div');
  aura.className = 'bg-aura';
  document.body.prepend(aura);
}

// ── Helper: render a view into #app ───────────────────
function setView(html: string): HTMLElement {
  const app = document.getElementById('app')!;
  app.innerHTML = html;
  return app;
}

// ═══════════════════════════════════════════════════════
//  SCREEN 1 — HOME (Crear / Unirse)
// ═══════════════════════════════════════════════════════
export interface HomeCallbacks {
  onCreateRoom: () => void;
  onJoinRoom:   (roomId: string) => void;
}

export function renderHome(cbs: HomeCallbacks): void {
  setView(`
    <div class="view" id="screen-home">
      <div class="logo-wrap">
        <div class="logo-icon">🎮</div>
        <div class="logo-title">DuoPlay</div>
        <div class="logo-sub">Minijuegos cooperativos P2P</div>
      </div>

      <div class="flex-col items-center gap-16 w-full" style="max-width:340px">

        <!-- Crear sala -->
        <button class="btn btn-primary" id="btn-create-room">
          <span class="btn-icon">✨</span>
          Crear Sala
        </button>

        <div class="section-title w-full">o únete a una sala</div>

        <!-- Unirse a sala -->
        <div class="input-group">
          <label class="input-label" for="input-room-id">Código de sala</label>
          <input
            class="input-field"
            id="input-room-id"
            type="text"
            maxlength="7"
            placeholder="DP-XXXX"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          />
        </div>

        <button class="btn btn-secondary" id="btn-join-room">
          <span class="btn-icon">🔗</span>
          Unirse a Sala
        </button>

      </div>
    </div>
  `);

  document.getElementById('btn-create-room')!.addEventListener('click', cbs.onCreateRoom);
  document.getElementById('btn-join-room')!.addEventListener('click', () => {
    const val = (document.getElementById('input-room-id') as HTMLInputElement).value.trim();
    if (!val) { showToast('⚠️ Ingresa un código de sala'); return; }
    cbs.onJoinRoom(val);
  });

  // Enter key shortcut
  document.getElementById('input-room-id')!.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = (e.target as HTMLInputElement).value.trim();
      if (val) cbs.onJoinRoom(val);
    }
  });
}

// ═══════════════════════════════════════════════════════
//  SCREEN 2 — WAITING (Host shows room code)
// ═══════════════════════════════════════════════════════
export interface WaitingCallbacks {
  onCancel: () => void;
}

export function renderWaiting(roomId: string, cbs: WaitingCallbacks): void {
  setView(`
    <div class="view" id="screen-waiting">
      <div class="logo-wrap">
        <div class="logo-icon">🎮</div>
        <div class="logo-title">DuoPlay</div>
      </div>

      <div class="flex-col items-center gap-20 w-full" style="max-width:340px">

        <div class="status-bar info">
          <div class="status-dot"></div>
          Esperando a tu compañero…
        </div>

        <div class="room-id-display" id="room-id-display" title="Toca para copiar">
          <div class="room-id-label">Código de sala</div>
          <div class="room-id-code" id="room-id-code">${roomId}</div>
          <div class="room-id-hint">Toca para copiar</div>
          <div class="copy-flash" id="copy-flash"></div>
        </div>

        <div class="card text-center" style="padding:16px 20px">
          <p style="font-size:0.82rem;color:var(--text-secondary);line-height:1.6">
            Comparte el código con tu compañero.<br/>
            La sala espira en <strong style="color:var(--text-primary)" id="timer-display">5:00</strong>.
          </p>
        </div>

        <button class="btn btn-ghost" id="btn-cancel-wait">
          Cancelar
        </button>

      </div>
    </div>
  `);

  // Copy to clipboard
  const display = document.getElementById('room-id-display')!;
  const flash = document.getElementById('copy-flash')!;
  display.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      showToast('📋 Código copiado');
    } catch {
      showToast('Código: ' + roomId);
    }
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 300);
  });

  document.getElementById('btn-cancel-wait')!.addEventListener('click', cbs.onCancel);

  // Countdown timer (5 min)
  let secs = 300;
  const timerEl = document.getElementById('timer-display')!;
  const tick = setInterval(() => {
    secs--;
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    if (timerEl) timerEl.textContent = `${m}:${s}`;
    if (secs <= 0) clearInterval(tick);
  }, 1000);
}

// ═══════════════════════════════════════════════════════
//  SCREEN 2b — CONNECTING (Guest view while joining)
// ═══════════════════════════════════════════════════════
export function renderConnecting(roomId: string, onCancel: () => void): void {
  setView(`
    <div class="view" id="screen-connecting">
      <div class="logo-wrap">
        <div class="logo-icon">🎮</div>
        <div class="logo-title">DuoPlay</div>
      </div>
      <div class="flex-col items-center gap-20 w-full" style="max-width:340px">
        <div class="status-bar info">
          <div class="spinner"></div>
          Conectando a <strong>&nbsp;${roomId}&nbsp;</strong>…
        </div>
        <button class="btn btn-ghost" id="btn-cancel-connect">Cancelar</button>
      </div>
    </div>
  `);
  document.getElementById('btn-cancel-connect')!.addEventListener('click', onCancel);
}

// ═══════════════════════════════════════════════════════
//  SCREEN 3 — LOBBY (Game selection menu)
// ═══════════════════════════════════════════════════════

export interface GameEntry {
  id: GameId;
  emoji: string;
  name: string;
  desc: string;
  tag: 'coop' | 'vs' | 'async';
  tagLabel: string;
  color: string;
  gradient: string;
}

export const GAMES: GameEntry[] = [
  {
    id: 'tetris-dual',
    emoji: '🧩',
    name: 'Tetris Dual',
    desc: 'Tablero compartido, piezas simultáneas. ¡Coordínate para limpiar líneas!',
    tag: 'coop', tagLabel: 'Co-op',
    color: 'rgba(168,85,247,0.4)',
    gradient: 'linear-gradient(135deg,rgba(168,85,247,0.18) 0%,rgba(168,85,247,0.04) 100%)',
  },
  {
    id: 'balloon',
    emoji: '🎈',
    name: 'No dejes caer el globo',
    desc: 'Gravedad real. Toca para impulsar. ¡Mantenlo en el aire juntos!',
    tag: 'coop', tagLabel: 'Co-op',
    color: 'rgba(244,63,94,0.4)',
    gradient: 'linear-gradient(135deg,rgba(244,63,94,0.18) 0%,rgba(244,63,94,0.04) 100%)',
  },
  {
    id: 'minesweeper',
    emoji: '💣',
    name: 'Buscaminas en Pareja',
    desc: 'Revelan juntos, pierden juntos. ¡Cuidado con las minas!',
    tag: 'coop', tagLabel: 'Co-op',
    color: 'rgba(34,211,238,0.4)',
    gradient: 'linear-gradient(135deg,rgba(34,211,238,0.18) 0%,rgba(34,211,238,0.04) 100%)',
  },
  {
    id: 'crystal-bridge',
    emoji: '🌉',
    name: 'Puente de Cristal',
    desc: 'Uno ve, el otro mueve. Asimetría pura de información.',
    tag: 'async', tagLabel: 'Asimétrico',
    color: 'rgba(251,191,36,0.4)',
    gradient: 'linear-gradient(135deg,rgba(251,191,36,0.18) 0%,rgba(251,191,36,0.04) 100%)',
  },
  {
    id: 'star-fishing',
    emoji: '⭐',
    name: 'Pesca Estelar',
    desc: 'Toca la misma estrella al mismo tiempo. ¡Sincronía perfecta!',
    tag: 'coop', tagLabel: 'Co-op',
    color: 'rgba(163,230,53,0.4)',
    gradient: 'linear-gradient(135deg,rgba(163,230,53,0.18) 0%,rgba(163,230,53,0.04) 100%)',
  },
  {
    id: 'inverse-gravity',
    emoji: '🚀',
    name: 'Gravedad Invertida',
    desc: 'P1 invierte la gravedad, P2 salta. Avance automático sin parar.',
    tag: 'coop', tagLabel: 'Co-op',
    color: 'rgba(99,102,241,0.4)',
    gradient: 'linear-gradient(135deg,rgba(99,102,241,0.18) 0%,rgba(99,102,241,0.04) 100%)',
  },
  {
    id: 'finger-hockey',
    emoji: '🏒',
    name: 'Hockey de Dedos',
    desc: '2 jugadores vs IA. Controla tu mazo y protege la portería.',
    tag: 'vs', tagLabel: 'vs IA',
    color: 'rgba(249,115,22,0.4)',
    gradient: 'linear-gradient(135deg,rgba(249,115,22,0.18) 0%,rgba(249,115,22,0.04) 100%)',
  },
];

export interface LobbyCallbacks {
  onGameSelect: (gameId: GameId) => void;
  onDisconnect: () => void;
}

export function renderLobby(role: Role, roomId: string, cbs: LobbyCallbacks): void {
  const tagClass = (t: GameEntry['tag']) => 'game-tag tag-' + t;
  const hostLock  = role === 'guest';

  setView(`
    <div class="view" id="screen-lobby" style="padding:0;justify-content:flex-start">

      <!-- Header -->
      <div class="lobby-header">
        <div class="lobby-players">
          <div class="player-badge host">
            <div class="player-dot"></div>
            ${role === 'host' ? 'Tú (Host)' : 'Host'}
          </div>
          <div class="player-badge guest">
            <div class="player-dot"></div>
            ${role === 'guest' ? 'Tú' : 'Invitado'}
          </div>
        </div>
        <div class="lobby-title">${roomId}</div>
        <button class="btn btn-ghost" id="btn-lobby-disconnect" style="padding:8px 12px;width:auto;font-size:0.75rem;max-width:none">
          Salir
        </button>
      </div>

      <!-- Game grid -->
      <div class="lobby-content">
        ${hostLock ? `
          <div class="status-bar warning" style="max-width:460px;margin:0 auto 16px">
            <div class="status-dot" style="animation:none;opacity:1"></div>
            El host elegirá el juego. Espera su selección.
          </div>
        ` : ''}

        <div class="section-title">Elige un juego</div>

        <div class="games-grid">
          ${GAMES.map(g => `
            <div
              class="game-card ${hostLock ? 'guest-lock' : 'host-only'}"
              id="game-card-${g.id}"
              data-game="${g.id}"
              style="--card-color:${g.color};--card-gradient:${g.gradient}"
              ${hostLock ? '' : 'tabindex="0" role="button"'}
            >
              <div class="game-emoji">${g.emoji}</div>
              <div class="game-info">
                <div class="game-name">${g.name}</div>
                <div class="game-desc">${g.desc}</div>
              </div>
              <div class="${tagClass(g.tag)}">${g.tagLabel}</div>
            </div>
          `).join('')}
        </div>
      </div>

    </div>
  `);

  // Disconnect
  document.getElementById('btn-lobby-disconnect')!.addEventListener('click', cbs.onDisconnect);

  // Game selection (host only)
  if (!hostLock) {
    document.querySelectorAll('.game-card').forEach(card => {
      const activate = () => {
        const gameId = card.getAttribute('data-game') as GameId;
        cbs.onGameSelect(gameId);
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') activate();
      });
    });
  }
}

// ═══════════════════════════════════════════════════════
//  SCREEN 4 — GAME VIEW (Canvas wrapper)
// ═══════════════════════════════════════════════════════
export interface GameViewCallbacks {
  onBack: () => void;
}

export function renderGameView(game: GameEntry, role: Role, cbs: GameViewCallbacks): HTMLCanvasElement {
  setView(`
    <div class="view game-view" id="screen-game" style="padding:0;justify-content:flex-start">
      <div class="game-topbar">
        <button class="btn btn-ghost btn-back" id="btn-back-lobby">← Lobby</button>
        <div class="game-topbar-title">${game.emoji} ${game.name}</div>
        <div class="player-badge ${role}" style="flex-shrink:0">
          ${role === 'host' ? 'Host' : 'Invitado'}
        </div>
      </div>
      <div class="game-canvas-area" id="canvas-area">
        <canvas id="game-canvas"></canvas>
      </div>
    </div>
  `);

  // Resize canvas to fill available area
  const area = document.getElementById('canvas-area')!;
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  const resize = () => {
    canvas.width  = area.clientWidth;
    canvas.height = area.clientHeight;
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // Draw a "Coming Soon" placeholder in canvas (removed when game is implemented)
  const ctx = canvas.getContext('2d')!;
  const drawPlaceholder = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Emoji
    ctx.font = `${Math.min(canvas.width, canvas.height) * 0.2}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(game.emoji, canvas.width / 2, canvas.height / 2 - 30);

    // Name
    ctx.font = `bold 20px 'Outfit', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(game.name, canvas.width / 2, canvas.height / 2 + 40);

    // Sub text
    ctx.font = `14px 'Outfit', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('Fase 2 — próximamente', canvas.width / 2, canvas.height / 2 + 66);
  };
  drawPlaceholder();
  window.addEventListener('resize', drawPlaceholder, { passive: true });

  document.getElementById('btn-back-lobby')!.addEventListener('click', cbs.onBack);

  return canvas;
}

// ═══════════════════════════════════════════════════════
//  SCREEN — ERROR
// ═══════════════════════════════════════════════════════
export function renderError(message: string, onRetry: () => void): void {
  setView(`
    <div class="view" id="screen-error">
      <div class="logo-icon" style="background:linear-gradient(135deg,#f43f5e,#be123c);margin-bottom:24px;font-size:2.5rem">💥</div>
      <h1 style="font-size:1.3rem;margin-bottom:8px">¡Oops!</h1>
      <p style="color:var(--text-secondary);text-align:center;max-width:300px;margin-bottom:32px;font-size:0.9rem">${message}</p>
      <button class="btn btn-primary" id="btn-retry">Volver al inicio</button>
    </div>
  `);
  document.getElementById('btn-retry')!.addEventListener('click', onRetry);
}
