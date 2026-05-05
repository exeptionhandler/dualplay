/**
 * DuoPlay — UI Renderer (Doodle Style)
 * Pure DOM manipulation; no framework.
 */
import type { GameId } from './types';

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

function setView(html: string): HTMLElement {
  const app = document.getElementById('app')!;
  app.innerHTML = html;
  return app;
}

export interface GameEntry {
  id: GameId;
  emoji: string;
  name: string;
  desc: string;
  tag: 'coop' | 'vs' | 'async';
  tagLabel: string;
}

export const GAMES: GameEntry[] = [
  {
    id: 'tetris-dual', emoji: '🧩', name: 'Tetris Dual',
    desc: 'Tablero compartido. ¡Coordínate para limpiar líneas!',
    tag: 'coop', tagLabel: 'Co-op',
  },
  {
    id: 'balloon', emoji: '🎈', name: 'No dejes caer el globo',
    desc: 'Gravedad real. Toca para impulsar. ¡Mantenlo en el aire!',
    tag: 'coop', tagLabel: 'Co-op',
  },
  {
    id: 'minesweeper', emoji: '💣', name: 'Buscaminas en Pareja',
    desc: 'Revelan juntos, pierden juntos. ¡Cuidado!',
    tag: 'coop', tagLabel: 'Co-op',
  },
  {
    id: 'crystal-bridge', emoji: '🌉', name: 'Puente de Cristal',
    desc: 'Uno ve, el otro mueve. Asimetría pura.',
    tag: 'async', tagLabel: 'Asimétrico',
  },
  {
    id: 'star-fishing', emoji: '⭐', name: 'Pesca Estelar',
    desc: 'Toca al mismo tiempo. ¡Sincronía perfecta!',
    tag: 'coop', tagLabel: 'Co-op',
  },
  {
    id: 'inverse-gravity', emoji: '🚀', name: 'Gravedad Invertida',
    desc: 'Avance automático sin parar.',
    tag: 'coop', tagLabel: 'Co-op',
  },
  {
    id: 'finger-hockey', emoji: '🏒', name: 'Hockey de Dedos',
    desc: '2 jugadores vs IA. Protege la portería.',
    tag: 'vs', tagLabel: 'vs IA',
  },
];

export interface LobbyCallbacks {
  onGameSelect: (gameId: GameId) => void;
}

export function renderLobby(participants: any[], cbs: LobbyCallbacks): void {
  const tagClass = (t: GameEntry['tag']) => 'game-tag tag-' + t;

  const getAvatarUrl = (p: any) => {
    if (p.avatar) return `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png`;
    return 'https://cdn.discordapp.com/embed/avatars/0.png'; // Default
  };

  setView(`
    <div class="view" id="screen-lobby" style="padding:0;justify-content:flex-start">
      <!-- Header with Avatars -->
      <div class="lobby-header">
        <div class="logo-title" style="font-size:2rem;margin-bottom:0">DuoPlay</div>
        <div class="lobby-players">
          ${participants.map((p, i) => `
            <div class="player-avatar-wrap" style="--rot: ${i % 2 === 0 ? 3 : -4}" title="${p.username}">
              <img src="${getAvatarUrl(p)}" alt="${p.username}" />
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Game grid -->
      <div class="lobby-content">
        <div class="section-title">Elige un minijuego:</div>
        <div class="games-grid">
          ${GAMES.map(g => `
            <div class="game-card" data-game="${g.id}" tabindex="0" role="button">
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

  // Game selection
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

// ═══════════════════════════════════════════════════════
//  SCREEN — GAME VIEW
// ═══════════════════════════════════════════════════════
export interface GameViewCallbacks {
  onBack: () => void;
}

export function renderGameView(game: GameEntry, cbs: GameViewCallbacks): HTMLCanvasElement {
  setView(`
    <div class="view game-view" id="screen-game">
      <div class="game-topbar">
        <button class="btn btn-secondary btn-back" id="btn-back-lobby">← Volver</button>
        <div class="game-topbar-title">${game.emoji} ${game.name}</div>
      </div>
      <div class="game-canvas-area" id="canvas-area">
        <canvas id="game-canvas"></canvas>
      </div>
    </div>
  `);

  const area = document.getElementById('canvas-area')!;
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  const resize = () => {
    canvas.width  = area.clientWidth - 24;
    canvas.height = area.clientHeight - 24;
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const ctx = canvas.getContext('2d')!;
  const drawPlaceholder = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.font = `${Math.min(canvas.width, canvas.height) * 0.2}px 'Patrick Hand'`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(game.emoji, canvas.width / 2, canvas.height / 2 - 30);

    ctx.font = `30px 'Patrick Hand', cursive`;
    ctx.fillStyle = 'var(--ink-primary)';
    ctx.fillText(game.name, canvas.width / 2, canvas.height / 2 + 40);

    ctx.font = `20px 'Patrick Hand', cursive`;
    ctx.fillStyle = 'var(--ink-secondary)';
    ctx.fillText('(Próximamente en Fase 2)', canvas.width / 2, canvas.height / 2 + 75);
  };
  drawPlaceholder();
  window.addEventListener('resize', drawPlaceholder, { passive: true });

  document.getElementById('btn-back-lobby')!.addEventListener('click', cbs.onBack);

  return canvas;
}
