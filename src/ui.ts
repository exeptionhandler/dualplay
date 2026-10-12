/**
 * DuoPlay — UI Renderer (Doodle Style)
 * Pure DOM manipulation; no framework.
 */
import type { GameId } from './types';
import { ALL_BADGES, profileManager } from './badges';
import { sound, haptic } from './audio';

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

export function renderLobby(participants: any[], cbs: LobbyCallbacks): void {
  const tagClass = (t: GameEntry['tag']) => 'game-tag tag-' + t;
  const profile = profileManager.getProfile();
  const inviteType = cbs.inviteType ?? 'link';

  const getInviteButtonHtml = () => {
    if (inviteType === 'none') return '';
    if (inviteType === 'discord') {
      return `
        <button class="btn-icon-doodle btn-discord-invite" id="btn-invite" title="Invitar amigos de Discord">
          <span class="btn-icon">👥</span>
          <span class="btn-label">Invitar</span>
        </button>
      `;
    }
    return `
      <button class="btn-icon-doodle" id="btn-invite" title="Invitar a un amigo con link">
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
    return `<div class="avatar-icon-fallback">${icon}</div>`;
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
            <span>Racha: <strong>${profile.sessionStreak}</strong></span>
          </div>
        </div>

        <div class="header-actions-group">
          <button class="btn-icon-doodle" id="btn-sound-toggle" title="Alternar Sonido">
            <span class="btn-icon">${sound.getMuted() ? '🔇' : '🔊'}</span>
          </button>
          <button class="btn-icon-doodle btn-profile-action" id="btn-profile-open" title="Personalizar Perfil y Medallas">
            <span class="btn-icon">🎖️</span>
            <span class="btn-label">Perfil</span>
            <span class="badge-count-bubble">${profile.equippedBadgeIds.length}/3</span>
          </button>
          ${getInviteButtonHtml()}
          ${participants.length < 2 ? `
            <button class="btn-icon-doodle btn-bot-action" id="btn-add-bot" title="Invocar a DuoBot para jugar juntos">
              <span class="btn-icon">🤖</span>
              <span class="btn-label">DuoBot</span>
            </button>
          ` : ''}
        </div>

        <!-- Connected Players Roster -->
        <div class="header-roster-group">
          <div class="roster-card">
            <div class="roster-heading">JUGADORES EN SALA</div>
            <div class="roster-members">
              ${participants.map((p, i) => `
                <div class="roster-player" title="${p.username}">
                  <div class="player-avatar-wrap" style="--rot: ${i % 2 === 0 ? 2 : -2};">
                    ${p.accessory ? `<span class="player-accessory-badge">${p.accessory}</span>` : ''}
                    ${getAvatarDisplay(p)}
                  </div>
                  <div class="roster-player-meta">
                    <span class="roster-player-name">${p.username}</span>
                    ${getBadgesHtml(p)}
                  </div>
                </div>
              `).join('<span class="roster-connector">&</span>')}
              ${participants.length === 1 ? `
                <div class="roster-player empty-slot" id="slot-add-bot" title="Toca aquí para jugar con DuoBot">
                  <div class="player-avatar-wrap dashed-slot">
                    <span>+</span>
                  </div>
                  <div class="roster-player-meta">
                    <span class="roster-player-name text-muted">¿Jugar solo?</span>
                    <span class="bot-summon-hint">Toca para bot 🤖</span>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </header>

      <!-- Main Game Catalog (Responsive 2-column Grid) -->
      <main class="lobby-content">
        <div class="lobby-headline-card">
          <h2 class="lobby-title">Elige un minijuego cooperativo</h2>
          <p class="lobby-subtitle">Jueguen en tiempo real con su compañero en la misma pantalla</p>
        </div>

        <div class="games-grid">
          ${GAMES.map(g => `
            <div class="game-card" data-game="${g.id}" style="--game-accent: ${g.accentColor};" tabindex="0" role="button">
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
                <span class="game-play-btn">¡Jugar juntos! ✏️</span>
              </div>
            </div>
          `).join('')}
        </div>
      </main>
    </div>
  `);

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
    if (btn) btn.innerHTML = `<span class="btn-icon">${sound.getMuted() ? '🔇' : '🔊'}</span>`;
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

export function renderGameView(game: GameEntry, cbs: GameViewCallbacks): HTMLCanvasElement {
  setView(`
    <div class="view game-view" id="screen-game">
      <div class="game-topbar">
        <button class="btn btn-secondary btn-back" id="btn-back-lobby">← Volver</button>
        <div class="game-topbar-title">${game.emoji} ${game.name}</div>
        <div style="display:flex;align-items:center;gap:6px">
          <button class="btn-icon-doodle" id="btn-game-sound" style="padding:4px 8px;font-size:1rem;">
            ${sound.getMuted() ? '🔇' : '🔊'}
          </button>
        </div>
      </div>
      <div class="game-canvas-area" id="canvas-area">
        <canvas id="game-canvas"></canvas>
        <div id="game-waiting-overlay" class="waiting-overlay hidden">
          <div class="spinner"></div>
          <div>Esperando al Jugador 2...</div>
          <button class="btn btn-secondary" id="btn-overlay-play-bot" style="margin-top:12px;font-size:1.1rem;">
            🤖 Jugar con DuoBot
          </button>
        </div>
      </div>

      <!-- Floating Reaction Dock -->
      <div class="reaction-dock" id="reaction-dock">
        <button class="reaction-btn" data-emoji="👏" title="Aplauso">👏</button>
        <button class="reaction-btn" data-emoji="😂" title="Risa">😂</button>
        <button class="reaction-btn" data-emoji="🔥" title="Fuego">🔥</button>
        <button class="reaction-btn" data-emoji="😱" title="Pánico">😱</button>
        <button class="reaction-btn" data-emoji="❤️" title="Amor">❤️</button>
        <button class="reaction-btn" data-emoji="👑" title="Corona">👑</button>
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

  document.getElementById('btn-back-lobby')!.addEventListener('click', () => {
    sound.click();
    cbs.onBack();
  });

  document.getElementById('btn-game-sound')?.addEventListener('click', () => {
    sound.setMuted(!sound.getMuted());
    const btn = document.getElementById('btn-game-sound');
    if (btn) btn.textContent = sound.getMuted() ? '🔇' : '🔊';
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
