import { DiscordSDK } from '@discord/embedded-app-sdk';
import { Sync } from './sync';
import { renderLobby, renderGameView, showToast, setWaitingOverlay } from './ui';
import type { GameId } from './types';
import { GAME_MODULES } from './games';
import type { GameModule } from './games';
import { GAMES } from './ui';
import './style.css';

// ── App State ──────────────────────────────────────────
const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID || '123456789012345678');
const sync = new Sync();

let currentGame: GameModule | null = null;
let me: any = null;
let participants: any[] = [];
let currentScreen: string = ''; // Track which screen we're on to prevent re-entry
let gamePendingInit: { mod: GameModule, canvas: HTMLCanvasElement, isHost: boolean } | null = null;

// ── Navigation state change handler (defined once) ──
function handleNavigationChange(state: any) {
  // Instead of forcing navigation, we just update the lobby if we are in it
  if (currentScreen === 'lobby') {
    renderLobby(participants, {
      onGameSelect: handleGameSelect,
      hostLocation: state.host_location
    });
  }
}

// ── Boot ───────────────────────────────────────────────
async function init() {
  const app = document.getElementById('app')!;
  app.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;font-size:2rem;color:var(--ink-secondary);">Conectando con Discord...</div>';

  try {
    // 1. Wait for Discord SDK to be ready (with timeout)
    await Promise.race([
      discordSdk.ready(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Discord SDK timeout')), 5000))
    ]);

    app.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;font-size:2rem;color:var(--ink-secondary);">Autorizando...</div>';

    // 2. Authorize
    const { code } = await discordSdk.commands.authorize({
      client_id: discordSdk.clientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify', 'rpc.voice.read'],
    });

    // 3. Authenticate
    const authResult = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).then(res => res.json()).catch(() => ({ access_token: 'mock_token' }));

    await discordSdk.commands.authenticate({
      access_token: authResult.access_token,
    });

    // 4. Get current user & initialize Sync
    me = await fetch(`https://discord.com/api/users/@me`, {
      headers: { Authorization: `Bearer ${authResult.access_token}` }
    }).then(res => res.json()).catch(() => ({ id: '1', username: 'HostUser', avatar: null }));
    participants = [me];

    await sync.init({
      channelId: discordSdk.channelId,
      userId: me.id,
    });
  } catch (e: any) {
    console.error('Init Error:', e);
    me = { id: 'local_user', username: 'DevUser', avatar: null };
    participants = [me];
    await sync.init({ channelId: 'local', userId: me.id });
  }

  sync.on('stateChange', handleNavigationChange);
  
  // Presence tracking: see other players
  sync.on('presence', (user: any) => {
    if (!participants.find(p => p.id === user.id)) {
      participants.push(user);
      
      if (currentScreen === 'lobby') {
        goLobby();
      } else if (participants.length >= 2) {
        setWaitingOverlay(false);
        // Start the game logic now that player 2 is here
        if (gamePendingInit) {
          gamePendingInit.mod.init({
            canvas: gamePendingInit.canvas,
            sync,
            me,
            isHost: gamePendingInit.isHost
          });
          gamePendingInit = null;
        }
      }
      // Send our presence back so they see us too
      sync.sendPresence(me);
      // Let them know where we are
      if (currentScreen !== 'lobby') {
        sync.setState({ host_location: currentScreen });
      }
    }
  });
  sync.sendPresence(me);

  goLobby();
}

// ═══════════════════════════════════════════════════════
//  NAVIGATION FUNCTIONS
// ═══════════════════════════════════════════════════════

function goLobby(): void {
  currentScreen = 'lobby';
  if (!gamePendingInit) {
    currentGame?.destroy();
  }
  currentGame = null;
  gamePendingInit = null;
  sync.setState({ host_location: null });

  renderLobby(participants, {
    onGameSelect: handleGameSelect,
    hostLocation: sync.getState().host_location
  });
}

function goGame(gameId: GameId): void {
  const entry = GAMES.find(g => g.id === gameId);
  if (!entry) return;

  currentScreen = gameId;
  if (!gamePendingInit) {
    currentGame?.destroy();
  }
  currentGame = null;

  const canvas = renderGameView(entry, {
    onBack: () => {
      goLobby();
    },
  });

  const mod = GAME_MODULES[gameId]?.();
  if (mod) {
    currentGame = mod;
    const isHost = participants.length > 0 && participants[0].id === me.id;

    if (participants.length < 2) {
      setWaitingOverlay(true);
      gamePendingInit = { mod, canvas, isHost };
    } else {
      setWaitingOverlay(false);
      mod.init({ canvas, sync, me, isHost });
    }
    showToast(`${entry.emoji} ${entry.name} cargado`);
  }
}

// ═══════════════════════════════════════════════════════
//  ACTION HANDLERS
// ═══════════════════════════════════════════════════════

function handleGameSelect(gameId: GameId): void {
  sync.setState({ host_location: gameId });
  goGame(gameId);
}

// Boot app
init();

