/**
 * DuoPlay — Main App Controller
 * Orchestrates PeerManager ↔ UI transitions ↔ Game modules.
 */
import './style.css';
import { PeerManager } from './PeerManager';
import type { GameId, DuoPlayMessage } from './types';

import {
  mountAura,
  renderHome,
  renderWaiting,
  renderConnecting,
  renderLobby,
  renderGameView,
  renderError,
  showToast,
  GAMES,
} from './ui';
import { GAME_MODULES } from './games';
import type { GameModule } from './games';

// ── App State ──────────────────────────────────────────
const peer = new PeerManager();
let currentGame: GameModule | null = null;

// ── Boot ───────────────────────────────────────────────
mountAura();
goHome();

// ═══════════════════════════════════════════════════════
//  NAVIGATION FUNCTIONS
// ═══════════════════════════════════════════════════════

function goHome(): void {
  currentGame?.destroy();
  currentGame = null;

  renderHome({
    onCreateRoom: handleCreateRoom,
    onJoinRoom:   handleJoinRoom,
  });
}

function goLobby(): void {
  currentGame?.destroy();
  currentGame = null;

  renderLobby(peer.role!, peer.myId!, {
    onGameSelect: handleGameSelect,
    onDisconnect: handleDisconnect,
  });
}

function goGame(gameId: GameId): void {
  const entry = GAMES.find(g => g.id === gameId);
  if (!entry) return;

  currentGame?.destroy();

  const canvas = renderGameView(entry, peer.role!, {
    onBack: () => {
      // Host navigates back → tell guest too
      if (peer.role === 'host') {
        peer.send({ type: 'navigate', target: 'lobby' });
      }
      goLobby();
    },
  });

  // Instantiate game module
  const mod = GAME_MODULES[gameId]?.();
  if (mod) {
    currentGame = mod;
    mod.init(canvas, peer.role!, (msg) => peer.send(msg));
    showToast(`${entry.emoji} ${entry.name} cargado`);
  }
}

// ═══════════════════════════════════════════════════════
//  P2P EVENT HANDLERS
// ═══════════════════════════════════════════════════════

peer.on('open', (id) => {
  console.log('[DuoPlay] Peer open, id=', id);
});

peer.on('connected', (role) => {
  console.log('[DuoPlay] Connected as', role);
  showToast(role === 'host' ? '✅ ¡Invitado conectado!' : '✅ ¡Conectado al host!');
  goLobby();
});

peer.on('message', (msg: DuoPlayMessage) => {
  switch (msg.type) {
    case 'navigate': {
      const target = msg.target;
      if (target === 'lobby') {
        goLobby();
      } else {
        goGame(target as GameId);
      }
      break;
    }
    case 'game-start':
      goGame(msg.gameId);
      break;
    case 'game-state':
    case 'player-input':
      currentGame?.onMessage(msg);
      break;
    default:
      break;
  }
});

peer.on('disconnected', () => {
  showToast('⚠️ Desconectado del compañero');
  renderError(
    'La conexión con tu compañero se perdió. ¿Quieres volver al inicio?',
    () => { peer.destroy(); goHome(); }
  );
});

peer.on('error', (err) => {
  console.error('[DuoPlay] PeerJS error', err);
  const msg = (err as { type?: string }).type === 'peer-unavailable'
    ? 'No se encontró la sala. Verifica el código e inténtalo de nuevo.'
    : `Error de conexión: ${err.message}`;
  showToast('❌ ' + msg);
  renderError(msg, () => { peer.destroy(); goHome(); });
});

// ═══════════════════════════════════════════════════════
//  ACTION HANDLERS
// ═══════════════════════════════════════════════════════

function handleCreateRoom(): void {
  peer.destroy();
  peer.createRoom();

  // Show waiting screen after open
  const unsubscribe = () => {};
  peer.on('open', (id) => {
    renderWaiting(id, {
      onCancel: () => {
        peer.destroy();
        goHome();
      },
    });
  });
  void unsubscribe;
}

function handleJoinRoom(roomId: string): void {
  peer.destroy();

  const normalized = roomId.trim().toUpperCase();
  renderConnecting(normalized, () => {
    peer.destroy();
    goHome();
  });

  peer.joinRoom(normalized);
}

function handleGameSelect(gameId: GameId): void {
  // Host sends navigation command to guest
  peer.send({ type: 'navigate', target: gameId });
  goGame(gameId);
}

function handleDisconnect(): void {
  peer.destroy();
  goHome();
  showToast('👋 Desconectado de la sala');
}
