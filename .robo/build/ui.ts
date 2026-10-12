/**
 * DuoPlay — UI Renderer (Doodle Style)
 * Pure DOM manipulation; no framework.
 */
import type { GameId } from './types';
import { ALL_BADGES, profileManager } from './badges';
import { sound, haptic } from './audio';

let toastContainer: HTMLElement | null = null;
let activeResizeObserver: ResizeObserver | null = null;
let activeResizeListener: (() => void) | null = null;

export function cleanupGameView(): void {
  if (activeResizeObserver) {
    activeResizeObserver.disconnect();
    activeResizeObserver = null;
  }
  if (activeResizeListener) {
    window.removeEventListener('resize', activeResizeListener);
    activeResizeListener = null;
  }
}

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
  accentColor: string;
}

export const GAMES: GameEntry[] = [
  {
    id: 'tetris-dual', emoji: '🧩', name: 'Tetris Dual',
    desc: 'Tablero compartido. ¡Coordínate para limpiar líneas!',
    tag: 'coop', tagLabel: 'Co-op',
    accentColor: '#0984e3',
  },
  {
    id: 'balloon', emoji: '🎈', name: 'No dejes caer el globo',
    desc: 'Física cooperativa y combos. ¡Mantenlo en el aire!',
    tag: 'coop', tagLabel: 'Co-op',
    accentColor: '#e17055',
  },
  {
    id: 'minesweeper', emoji: '💣', name: 'Buscaminas en Pareja',
    desc: 'Escudo cooperativo y acordes. ¡Despejen sin detonar!',
    tag: 'coop', tagLabel: 'Co-op',
    accentColor: '#f39c12',
  },
  {
    id: 'crystal-bridge', emoji: '🌉', name: 'Puente de Cristal',
    desc: 'Uno ve el camino, el otro salta. Señales y memoria.',
    tag: 'async', tagLabel: 'Asimétrico',
    accentColor: '#00b894',
  },
  {
    id: 'star-fishing', emoji: '⭐', name: 'Pesca Estelar',
    desc: 'Sincronía rítmica y estrellas doradas en 45 segundos.',
    tag: 'coop', tagLabel: 'Co-op',
    accentColor: '#6c5ce7',
  },
  {
    id: 'inverse-gravity', emoji: '🚀', name: 'Gravedad Invertida',
    desc: 'El piloto altera la gravedad, el copiloto dispara láser.',
    tag: 'coop', tagLabel: 'Co-op',
    accentColor: '#00cec9',
  },
  {
    id: 'finger-hockey', emoji: '🏒', name: 'Hockey de Dedos',
    desc: '2 humanos vs IA con tiros de fuego y físicas elásticas.',
    tag: 'vs', tagLabel: 'vs IA',
    accentColor: '#d63031',
  },
  {
    id: 'rhythm-duo', emoji: '🎵', name: 'Duelo Rítmico',
    desc: '2 carriles en sincronía sonora. ¡Acordes, chispas y combos!',
    tag: 'coop', tagLabel: 'Co-op Rítmico',
    accentColor: '#e84393',
  },
  {
    id: 'laser-mirror', emoji: '🔦', name: 'Laberinto Láser',
    desc: 'Uno orienta el rayo y el otro rota espejos. ¡Enciendan los cristales!',
    tag: 'coop', tagLabel: 'Co-op Óptico',
    accentColor: '#00b894',
  },
];

export interface LobbyCallbacks {
  onGameSelect: (gameId: GameId) => void;
  hostLocation?: GameId | null;
  onInvite?: () => void;
  inviteType?: 'discord' | 'link' | 'none';
  onPlayBot?: () => void;
  onProfileUpdate?: () => void;
  onReaction?: (emoji: string) => void;
}

let activePartnerState: any = null;

export function updateGamePartner(partner?: any): void {
  activePartnerState = partner;
  const statusEl = document.getElementById('hud-partner-status');
  if (!statusEl) return;
  if (partner) {
    statusEl.className = 'hud-partner-status is-connected';
    statusEl.title = `Compañero: ${partner.username}`;
    const avatarIcon = partner.isBot ? '🤖' : (partner.avatarIcon || '👤');
    statusEl.innerHTML = `
      <span class="hud-status-dot online"></span>
      <span class="hud-partner-avatar">${avatarIcon}</span>
      <span class="hud-partner-name">${partner.username}</span>
    `;
  } else {
    statusEl.className = 'hud-partner-status is-waiting';
    statusEl.title = 'Esperando a un segundo jugador';
    statusEl.innerHTML = `
      <span class="hud-status-dot pulse"></span>
      <span class="hud-partner-avatar">⏳</span>
      <span class="hud-partner-name">Esperando 2P...</span>
    `;
  }
}

export function renderLobby(participants: any[], cbs: LobbyCallbacks): void {
  cleanupGameView();
  const tagClass = (t: GameEntry['tag']) => 'game-tag tag-' + t;
  const profile = profileManager.getProfile();
  const inviteType = cbs.inviteType ?? 'link';

  const getInviteButtonHtml = () => {
    if (inviteType === 'none') return '';
    if (inviteType === 'discord') {
      return `
        <button class="btn-toolbar-doodle btn-discord-invite" id="btn-invite" title="Invitar amigos de Discord" aria-label="Invitar amigos de Discord">
          <span class="btn-icon">👥</span>
          <span class="btn-label">Invitar</span>
        </button>
      `;
    }
    return `
      <button class="btn-toolbar-doodle btn-link-invite" id="btn-invite" title="Copiar enlace de sala para un amigo" aria-label="Copiar enlace de invitación">
        <span class="btn-icon">🔗</span>
        <span class="btn-label">Invitar</span>
      </button>
    `;
  };

  const getAvatarDisplay = (p: any) => {
    if (p.avatar) {
      return `<img src="https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png" alt="${p.username}" />`;
    }
    const icon = p.avatarIcon || (p.isBot ? '🤖' : '🐱');
    const bgColors = ['#ffeaa7', '#a8e6cf', '#ffd3b6', '#dcedc1', '#a29bfe', '#74b9ff'];
    const charSum = (p.username || 'A').split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
    const bg = bgColors[charSum % bgColors.length];
    return `<div class="avatar-icon-fallback" style="background:${bg};">${icon}</div>`;
  };

  const getBadgesHtml = (p: any) => {
    const badgeIds: string[] = p.equippedBadges || (p.id === 'bot_duo' ? ['og-founder', 'bot-whisperer'] : profile.equippedBadgeIds);
    if (!badgeIds || badgeIds.length === 0) return '';
    return `
      <div class="player-badges-strip">
        ${badgeIds.map(bid => {
          const badge = ALL_BADGES.find(b => b.id === bid);
          if (!badge) return '';
          return `<span class="badge-pill" title="${badge.name}: ${badge.desc}">${badge.icon}</span>`;
        }).join('')}
      </div>
    `;
  };

  const allCount = GAMES.length;
  const coopCount = GAMES.filter(g => g.tag === 'coop').length;
  const asyncCount = GAMES.filter(g => g.tag === 'async').length;
  const vsCount = GAMES.filter(g => g.tag === 'vs').length;

  setView(`
    <div class="view" id="screen-lobby">
      <!-- Unified Header Strip -->
      <header class="app-header">
        <div class="header-brand-group">
          <div class="brand-title-wrap">
            <span class="brand-logo">DuoPlay</span>
            <span class="brand-badge-pill">2P CO-OP</span>
          </div>
          <div class="session-streak-badge" title="Racha de victorias consecutivas de la sesión">
            <span class="streak-flame">🔥</span>
            <span class="streak-label">Racha:</span>
            <strong class="streak-count">${profile.sessionStreak}</strong>
          </div>
        </div>

        <!-- Central Unified Action Bar -->
        <div class="header-control-bar" role="toolbar" aria-label="Herramientas del juego">
          <button class="btn-toolbar-doodle btn-sound-toggle" id="btn-sound-toggle" title="${sound.getMuted() ? 'Activar sonido' : 'Silenciar sonido'}" aria-label="Alternar sonido">
            <span class="btn-icon">${sound.getMuted() ? '🔇' : '🔊'}</span>
          </button>
          <button class="btn-toolbar-doodle btn-profile-action" id="btn-profile-open" title="Personalizar Perfil y Medallas" aria-label="Abrir perfil">
            <span class="btn-icon">🎖️</span>
            <span class="btn-label">Perfil</span>
            <span class="badge-count-bubble" title="${profile.equippedBadgeIds.length} de 3 medallas equipadas">${profile.equippedBadgeIds.length}/3</span>
          </button>
          ${getInviteButtonHtml()}
          ${participants.length < 2 ? `
            <button class="btn-toolbar-doodle btn-bot-action" id="btn-add-bot" title="Invocar a DuoBot para jugar juntos" aria-label="Invocar a DuoBot">
              <span class="btn-icon">🤖</span>
              <span class="btn-label">+ DuoBot</span>
            </button>
          ` : ''}
        </div>

        <!-- Connected Players Roster Desk -->
        <div class="header-roster-group">
          <div class="roster-desk-card">
            <div class="roster-desk-header">
              <span class="roster-pin-icon">📌</span>
              <span class="roster-heading">JUGADORES EN SALA</span>
              <span class="roster-count-pill">${participants.length}/2</span>
            </div>
            <div class="roster-members">
              ${participants.map((p, i) => `
                <div class="roster-player ${p.isBot ? 'is-bot' : ''}" title="${p.username}">
                  <div class="player-avatar-wrap" style="--rot: ${i % 2 === 0 ? -2 : 2};">
                    ${p.accessory ? `<span class="player-accessory-badge">${p.accessory}</span>` : ''}
                    ${getAvatarDisplay(p)}
                  </div>
                  <div class="roster-player-meta">
                    <span class="roster-player-name">${p.username}</span>
                    ${getBadgesHtml(p)}
                  </div>
                </div>
              `).join('<span class="roster-connector" aria-hidden="true">&</span>')}
              ${participants.length === 1 ? `
                <button class="roster-player empty-slot" id="slot-add-bot" title="¿Jugar solo? Toca para invocar a DuoBot 🤖" aria-label="Invocar a DuoBot">
                  <div class="player-avatar-wrap dashed-slot">
                    <span class="dashed-plus">+</span>
                  </div>
                  <div class="roster-player-meta">
                    <span class="roster-player-name text-muted">¿Jugar solo?</span>
                    <span class="bot-summon-hint">Toca para bot 🤖</span>
                  </div>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </header>

      <!-- Main Game Catalog -->
      <main class="lobby-content">
        <div class="lobby-headline-card">
          <h2 class="lobby-title">Elige un minijuego cooperativo</h2>
          <p class="lobby-subtitle">Jueguen en tiempo real con su compañero en la misma pantalla</p>
        </div>

        <!-- Interactive Category Filters Bar & Quick Play -->
        <div class="lobby-filter-container">
          <div class="lobby-filter-tabs" role="tablist" aria-label="Categorías de minijuegos">
            <button class="filter-tab-doodle active" data-filter="all" role="tab" aria-selected="true">
              <span class="filter-icon">⭐</span>
              <span class="filter-label">Todos</span>
              <span class="filter-count">(${allCount})</span>
            </button>
            <button class="filter-tab-doodle" data-filter="coop" role="tab" aria-selected="false">
              <span class="filter-icon">🤝</span>
              <span class="filter-label">Cooperativos</span>
              <span class="filter-count">(${coopCount})</span>
            </button>
            <button class="filter-tab-doodle" data-filter="async" role="tab" aria-selected="false">
              <span class="filter-icon">⚡</span>
              <span class="filter-label">Asimétricos</span>
              <span class="filter-count">(${asyncCount})</span>
            </button>
            <button class="filter-tab-doodle" data-filter="vs" role="tab" aria-selected="false">
              <span class="filter-icon">⚔️</span>
              <span class="filter-label">vs IA</span>
              <span class="filter-count">(${vsCount})</span>
            </button>
          </div>

          <button class="btn-quick-play-doodle" id="btn-quick-play" title="Elegir y abrir un juego al azar de inmediato">
            <span class="quick-play-dice">🎲</span>
            <span class="quick-play-label">Juego Aleatorio</span>
            <span class="quick-play-sparkle">✨</span>
          </button>
        </div>

        <div class="games-grid">
          ${GAMES.map((g, idx) => `
            <div class="game-card" data-game="${g.id}" data-tag="${g.tag}" style="--game-accent: ${g.accentColor}; --tilt: ${idx % 2 === 0 ? '-1' : '1'};" tabindex="0" role="button" aria-label="Jugar ${g.name}">
              <div class="game-card-tape" aria-hidden="true"></div>
              <div class="game-card-top">
                <div class="game-sticker-frame">
                  <span class="game-emoji">${g.emoji}</span>
                </div>
                <div class="game-badges-group">
                  <span class="${tagClass(g.tag)}">${g.tagLabel}</span>
                  ${cbs.hostLocation === g.id ? '<span class="host-star-badge" title="Jugador 1 está esperando aquí">⭐ Host aquí</span>' : ''}
                </div>
              </div>

              <div class="game-card-body">
                <h3 class="game-name">${g.name}</h3>
                <p class="game-desc">${g.desc}</p>
              </div>

              <div class="game-card-bottom">
                <span class="game-play-btn">
                  <span class="pencil-icon">✏️</span>
                  <span>¡Jugar juntos!</span>
                </span>
              </div>
            </div>
          `).join('')}
        </div>
      </main>
    </div>
  `);

  // Filter tabs logic
  const filterTabs = document.querySelectorAll('.filter-tab-doodle');
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sound.click();
      haptic(15);
      filterTabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const filter = tab.getAttribute('data-filter');
      document.querySelectorAll('.game-card').forEach(card => {
        const cardTag = card.getAttribute('data-tag');
        if (filter === 'all' || cardTag === filter) {
          card.classList.remove('is-hidden');
          card.classList.add('is-entering');
          setTimeout(() => card.classList.remove('is-entering'), 280);
        } else {
          card.classList.add('is-hidden');
        }
      });
    });
  });

  // Quick Play Random Game button
  document.getElementById('btn-quick-play')?.addEventListener('click', () => {
    sound.star();
    haptic(30);

    const activeTab = document.querySelector('.filter-tab-doodle.active');
    const currentCategory = activeTab?.getAttribute('data-filter') || 'all';
    const eligibleGames = currentCategory === 'all'
      ? GAMES
      : GAMES.filter(g => g.tag === currentCategory);

    const pool = eligibleGames.length > 0 ? eligibleGames : GAMES;
    const randomGame = pool[Math.floor(Math.random() * pool.length)];

    const dice = document.querySelector('.quick-play-dice');
    dice?.classList.add('roll-dice');

    showToast(`🎲 ¡Partida Aleatoria: ${randomGame.name}! ✨`);

    setTimeout(() => {
      cbs.onGameSelect(randomGame.id);
    }, 220);
  });

  // Game selection
  document.querySelectorAll('.game-card').forEach(card => {
    const activate = () => {
      sound.click();
      haptic(20);
      const gameId = card.getAttribute('data-game') as GameId;
      cbs.onGameSelect(gameId);
    };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') activate();
    });
  });

  // Sound toggle button
  document.getElementById('btn-sound-toggle')?.addEventListener('click', () => {
    sound.setMuted(!sound.getMuted());
    const btn = document.getElementById('btn-sound-toggle');
    if (btn) {
      btn.innerHTML = `<span class="btn-icon">${sound.getMuted() ? '🔇' : '🔊'}</span>`;
      btn.title = sound.getMuted() ? 'Activar sonido' : 'Silenciar sonido';
    }
    sound.click();
  });

  // Profile modal open
  document.getElementById('btn-profile-open')?.addEventListener('click', () => {
    sound.click();
    showProfileModal(() => {
      cbs.onProfileUpdate?.();
      renderLobby(participants, cbs);
    });
  });

  // Invite button
  document.getElementById('btn-invite')?.addEventListener('click', () => {
    sound.click();
    cbs.onInvite?.();
  });

  // Play with bot button
  document.getElementById('btn-add-bot')?.addEventListener('click', () => {
    sound.click();
    cbs.onPlayBot?.();
  });

  // Empty slot bot trigger
  document.getElementById('slot-add-bot')?.addEventListener('click', () => {
    sound.click();
    cbs.onPlayBot?.();
  });
}

// ═══════════════════════════════════════════════════════
//  SCREEN — GAME VIEW
// ═══════════════════════════════════════════════════════
export interface GameViewCallbacks {
  onBack: () => void;
  onPlayBot?: () => void;
  onReaction?: (emoji: string) => void;
}

export function renderGameView(game: GameEntry, cbs: GameViewCallbacks, partner?: any): HTMLCanvasElement {
  activePartnerState = partner;

  setView(`
    <div class="view game-view" id="screen-game">
      <!-- Game Topbar HUD -->
      <div class="game-topbar">
        <button class="btn-icon-doodle btn-back-lobby" id="btn-back-lobby" title="Volver al lobby">
          <span class="back-arrow">←</span>
          <span class="back-label">Lobby</span>
        </button>

        <div class="game-topbar-center">
          <div class="game-topbar-title-wrap">
            <span class="game-topbar-emoji">${game.emoji}</span>
            <span class="game-topbar-name">${game.name}</span>
          </div>
          <span class="game-tag tag-${game.tag} game-topbar-tag">${game.tagLabel}</span>
        </div>

        <div class="game-topbar-right">
          <div class="hud-partner-status ${partner ? 'is-connected' : 'is-waiting'}" id="hud-partner-status" title="${partner ? `Compañero: ${partner.username}` : 'Esperando a un segundo jugador'}">
            <span class="hud-status-dot ${partner ? 'online' : 'pulse'}"></span>
            <span class="hud-partner-avatar">${partner?.isBot ? '🤖' : (partner?.avatarIcon || '👤')}</span>
            <span class="hud-partner-name">${partner ? partner.username : 'Esperando 2P...'}</span>
          </div>

          <button class="btn-icon-doodle btn-sound-game" id="btn-game-sound" title="${sound.getMuted() ? 'Activar sonido' : 'Silenciar sonido'}">
            <span class="btn-icon">${sound.getMuted() ? '🔇' : '🔊'}</span>
          </button>
        </div>
      </div>

      <!-- Canvas Play Area with Doodle Waiting Overlay -->
      <div class="game-canvas-area" id="canvas-area">
        <canvas id="game-canvas"></canvas>
        <div id="game-waiting-overlay" class="waiting-overlay hidden">
          <div class="waiting-card-doodle">
            <div class="waiting-mascot-wrap">
              <div class="waiting-doodle-icon">⏳</div>
              <div class="waiting-spinner-doodle"></div>
            </div>
            <div class="waiting-content">
              <h3 class="waiting-title">¡Esperando al Jugador 2!</h3>
              <p class="waiting-subtitle">Este minijuego se juega en pareja en tiempo real. ¡Invita a un amigo o juega ahora con DuoBot!</p>
            </div>
            <button class="btn btn-primary btn-overlay-bot" id="btn-overlay-play-bot">
              <span class="btn-icon">🤖</span>
              <span class="btn-label">¡Jugar ahora con DuoBot!</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Floating Reaction Dock with Keyboard Hotkey Badges -->
      <div class="reaction-dock" id="reaction-dock" role="region" aria-label="Reacciones en tiempo real">
        <button class="reaction-btn" data-emoji="👏" data-key="1" title="Aplauso (Tecla 1)">
          <span class="reaction-key-badge">1</span>
          <span class="reaction-emoji">👏</span>
        </button>
        <button class="reaction-btn" data-emoji="😂" data-key="2" title="Risa (Tecla 2)">
          <span class="reaction-key-badge">2</span>
          <span class="reaction-emoji">😂</span>
        </button>
        <button class="reaction-btn" data-emoji="🔥" data-key="3" title="Fuego (Tecla 3)">
          <span class="reaction-key-badge">3</span>
          <span class="reaction-emoji">🔥</span>
        </button>
        <button class="reaction-btn" data-emoji="😱" data-key="4" title="Pánico (Tecla 4)">
          <span class="reaction-key-badge">4</span>
          <span class="reaction-emoji">😱</span>
        </button>
        <button class="reaction-btn" data-emoji="❤️" data-key="5" title="Amor (Tecla 5)">
          <span class="reaction-key-badge">5</span>
          <span class="reaction-emoji">❤️</span>
        </button>
        <button class="reaction-btn" data-emoji="👑" data-key="6" title="Corona (Tecla 6)">
          <span class="reaction-key-badge">6</span>
          <span class="reaction-emoji">👑</span>
        </button>
      </div>
    </div>
  `);

  cleanupGameView();
  const area = document.getElementById('canvas-area')!;
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  const resize = () => {
    if (!area || !canvas) return;
    canvas.width  = area.clientWidth - 24;
    canvas.height = area.clientHeight - 24;
  };
  resize();

  if (typeof ResizeObserver !== 'undefined') {
    activeResizeObserver = new ResizeObserver(() => {
      resize();
    });
    activeResizeObserver.observe(area);
  } else {
    activeResizeListener = resize;
    window.addEventListener('resize', activeResizeListener, { passive: true });
  }

  document.getElementById('btn-back-lobby')!.addEventListener('click', () => {
    sound.click();
    cbs.onBack();
  });

  document.getElementById('btn-game-sound')?.addEventListener('click', () => {
    sound.setMuted(!sound.getMuted());
    const btn = document.getElementById('btn-game-sound');
    if (btn) {
      btn.innerHTML = `<span class="btn-icon">${sound.getMuted() ? '🔇' : '🔊'}</span>`;
      btn.title = sound.getMuted() ? 'Activar sonido' : 'Silenciar sonido';
    }
    sound.click();
  });

  document.getElementById('btn-overlay-play-bot')?.addEventListener('click', () => {
    sound.click();
    cbs.onPlayBot?.();
  });

  // Reaction buttons
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji');
      if (emoji) {
        btn.classList.add('spring-pop');
        setTimeout(() => btn.classList.remove('spring-pop'), 400);
        sound.pop ? sound.boing(450) : sound.click();
        haptic(15);
        cbs.onReaction?.(emoji);
      }
    });
  });

  return canvas;
}

export function setWaitingOverlay(show: boolean): void {
  const overlay = document.getElementById('game-waiting-overlay');
  if (overlay) {
    if (show) overlay.classList.remove('hidden');
    else overlay.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════
//  FLOATING REACTIONS
// ═══════════════════════════════════════════════════════

export function triggerFloatingReaction(emoji: string, xRatio = 0.5): void {
  const span = document.createElement('span');
  span.className = 'floating-reaction';
  span.textContent = emoji;

  const xPercent = Math.max(10, Math.min(90, xRatio * 100));
  span.style.left = `calc(${xPercent}% - 20px)`;

  document.body.appendChild(span);
  sound.boing(400);

  setTimeout(() => {
    span.remove();
  }, 2400);
}

// ═══════════════════════════════════════════════════════
//  MODAL: PERFIL Y MEDALLAS (ESTILO DISCORD BADGES)
// ═══════════════════════════════════════════════════════

export function showProfileModal(onSave: () => void): void {
  const profile = profileManager.getProfile();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const accessories = ['', '👑', '🥳', '😎', '😈', '😇', '🥸'];
  const avatarIcons = ['🐱', '🤖', '🦊', '👾', '⭐', '👻', '🦆', '🚀'];

  backdrop.innerHTML = `
    <div class="modal-doodle">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h2 style="font-size:2rem;margin:0;">🎖️ Mi Perfil y Medallas</h2>
        <button class="btn-icon-doodle" id="btn-close-profile" style="padding:4px 8px;">✕</button>
      </div>

      <!-- Streak & Stats -->
      <div style="display:flex;gap:12px;background:#f0f8ff;border:2px dashed #0984e3;border-radius:12px;padding:10px;">
        <div style="flex:1;text-align:center;">
          <div style="font-size:0.9rem;color:var(--ink-secondary);">Racha Actual</div>
          <div style="font-size:1.8rem;font-weight:bold;">🔥 ${profile.sessionStreak}</div>
        </div>
        <div style="flex:1;text-align:center;">
          <div style="font-size:0.9rem;color:var(--ink-secondary);">Mejor Racha</div>
          <div style="font-size:1.8rem;font-weight:bold;">🏆 ${profile.bestStreak}</div>
        </div>
      </div>

      <!-- Nickname & Icon -->
      <div>
        <label style="font-size:1.1rem;font-weight:bold;display:block;margin-bottom:4px;">Nombre / Apodo:</label>
        <input type="text" id="input-nickname" value="${profile.customName || ''}" placeholder="Ej. GamerPro"
          style="width:100%;padding:8px 12px;font-family:inherit;font-size:1.2rem;border:2px solid var(--border);border-radius:var(--radius-doodle);" />
      </div>

      <!-- Accessory picker -->
      <div>
        <label style="font-size:1.1rem;font-weight:bold;display:block;margin-bottom:6px;">Accesorio para Avatar:</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${accessories.map(acc => `
            <button class="btn-icon-doodle btn-acc-select ${profile.accessory === acc ? 'equipped' : ''}" data-acc="${acc}" style="font-size:20px;padding:4px 10px;">
              ${acc || 'Ninguno'}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Avatar icon picker -->
      <div>
        <label style="font-size:1.1rem;font-weight:bold;display:block;margin-bottom:6px;">Icono de Avatar:</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${avatarIcons.map(icon => `
            <button class="btn-icon-doodle btn-avatar-select ${profile.avatarIcon === icon ? 'equipped' : ''}" data-icon="${icon}" style="font-size:22px;padding:4px 10px;">
              ${icon}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Medallas estilo Discord Badges -->
      <div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
          <label style="font-size:1.1rem;font-weight:bold;">Medallas DuoPlay (${profile.equippedBadgeIds.length}/3 equipadas):</label>
          <span style="font-size:0.85rem;color:var(--ink-secondary);">Toca para equipar</span>
        </div>
        <div class="badge-grid">
          ${ALL_BADGES.map(b => {
            const unlocked = profile.unlockedBadgeIds.includes(b.id);
            const equipped = profile.equippedBadgeIds.includes(b.id);
            return `
              <div class="badge-card ${unlocked ? 'unlocked' : 'locked'} ${equipped ? 'equipped' : ''}" data-badge="${b.id}">
                ${equipped ? '<span class="badge-equipped-tag">EQUIPADA</span>' : ''}
                <div class="badge-card-icon">${b.icon}</div>
                <div class="badge-card-name">${b.name}</div>
                <div class="badge-card-desc">${b.desc}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <button class="btn btn-primary" id="btn-save-profile" style="margin-top:8px;">
        Guardar Perfil
      </button>
    </div>
  `;

  document.body.appendChild(backdrop);

  // Close
  backdrop.querySelector('#btn-close-profile')!.addEventListener('click', () => {
    backdrop.remove();
  });

  // Accessory select
  let selectedAcc = profile.accessory;
  backdrop.querySelectorAll('.btn-acc-select').forEach(btn => {
    btn.addEventListener('click', () => {
      sound.click();
      selectedAcc = btn.getAttribute('data-acc') || '';
      backdrop.querySelectorAll('.btn-acc-select').forEach(b => b.classList.remove('equipped'));
      btn.classList.add('equipped');
    });
  });

  // Avatar select
  let selectedIcon = profile.avatarIcon;
  backdrop.querySelectorAll('.btn-avatar-select').forEach(btn => {
    btn.addEventListener('click', () => {
      sound.click();
      selectedIcon = btn.getAttribute('data-icon') || '🐱';
      backdrop.querySelectorAll('.btn-avatar-select').forEach(b => b.classList.remove('equipped'));
      btn.classList.add('equipped');
    });
  });

  // Badge toggle
  backdrop.querySelectorAll('.badge-card.unlocked').forEach(card => {
    card.addEventListener('click', () => {
      sound.click();
      const badgeId = card.getAttribute('data-badge')!;
      profileManager.toggleEquipBadge(badgeId);
      backdrop.remove();
      showProfileModal(onSave); // Re-render modal with updated badges
    });
  });

  // Save
  backdrop.querySelector('#btn-save-profile')!.addEventListener('click', () => {
    const inputNick = (backdrop.querySelector('#input-nickname') as HTMLInputElement).value.trim();
    profileManager.updateProfile({
      customName: inputNick,
      accessory: selectedAcc,
      avatarIcon: selectedIcon,
    });
    sound.victory();
    showToast('¡Perfil y medallas actualizados! ✨');
    backdrop.remove();
    onSave();
  });
}

// ═══════════════════════════════════════════════════════
//  MODAL: REVANCHA / FIN DE PARTIDA
// ═══════════════════════════════════════════════════════

export interface RematchModalOptions {
  won: boolean;
  title: string;
  statsText: string;
  canSwapRoles?: boolean;
  onRematch: (swapRoles: boolean) => void;
  onLobby: () => void;
}

export function showRematchModal(opts: RematchModalOptions): void {
  // Prevent duplicate modals
  document.querySelector('.rematch-backdrop')?.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop rematch-backdrop';

  backdrop.innerHTML = `
    <div class="modal-doodle rematch-card">
      <div style="font-size:64px;line-height:1;">${opts.won ? '🎉' : '💥'}</div>
      <div class="rematch-title">${opts.title}</div>
      <div class="rematch-stats">${opts.statsText}</div>

      <div class="rematch-buttons">
        <button class="btn btn-primary" id="btn-modal-rematch" style="font-size:1.3rem;">
          🔄 Jugar de Nuevo
        </button>
        ${opts.canSwapRoles ? `
          <button class="btn btn-secondary" id="btn-modal-swap" style="font-size:1.1rem;">
            🔀 Intercambiar Roles
          </button>
        ` : ''}
        <button class="btn btn-secondary" id="btn-modal-lobby" style="font-size:1.1rem;">
          🏠 Volver al Lobby
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  backdrop.querySelector('#btn-modal-rematch')?.addEventListener('click', () => {
    sound.click();
    backdrop.remove();
    opts.onRematch(false);
  });

  backdrop.querySelector('#btn-modal-swap')?.addEventListener('click', () => {
    sound.click();
    backdrop.remove();
    opts.onRematch(true);
  });

  backdrop.querySelector('#btn-modal-lobby')?.addEventListener('click', () => {
    sound.click();
    backdrop.remove();
    opts.onLobby();
  });
}
