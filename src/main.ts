import { DiscordSDK } from '@discord/embedded-app-sdk';
import { Sync } from './sync';
import { renderLobby, renderGameView, showToast } from './ui';
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

// ── Navigation state change handler (defined once) ──
function handleNavigationChange(state: any) {
  const target = state.navigate;
  if (!target || target === currentScreen) return; // ← KEY FIX: skip if already on this screen

  if (target === 'lobby') {
    goLobby();
  } else {
    goGame(target);
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

    sync.on('stateChange', handleNavigationChange);
    goLobby();
  } catch (e: any) {
    console.error('Init Error:', e);
    // Fallback to local dev lobby if not in Discord or if error occurs
    me = { id: 'local_user', username: 'DevUser', avatar: null };
    participants = [me];
    
    await sync.init({ channelId: 'local', userId: me.id });
    sync.on('stateChange', handleNavigationChange);
    goLobby();
  }
}

// ═══════════════════════════════════════════════════════
//  NAVIGATION FUNCTIONS
// ═══════════════════════════════════════════════════════

function goLobby(): void {
  currentScreen = 'lobby';
  currentGame?.destroy();
  currentGame = null;

  renderLobby(participants, {
    onGameSelect: handleGameSelect,
  });
}

function goGame(gameId: GameId): void {
  const entry = GAMES.find(g => g.id === gameId);
  if (!entry) return;

  currentScreen = gameId; // ← Set BEFORE init to prevent re-entry
  currentGame?.destroy();

  const canvas = renderGameView(entry, {
    onBack: () => {
      sync.setState({ navigate: 'lobby' });
      goLobby();
    },
  });

  const mod = GAME_MODULES[gameId]?.();
  if (mod) {
    currentGame = mod;
    const isHost = participants.length > 0 && participants[0].id === me.id;

    mod.init({
      canvas,
      sync,
      me,
      isHost
    });
    showToast(`${entry.emoji} ${entry.name} cargado`);
  }
}

// ═══════════════════════════════════════════════════════
//  ACTION HANDLERS
// ═══════════════════════════════════════════════════════

function handleGameSelect(gameId: GameId): void {
  sync.setState({ navigate: gameId });
  goGame(gameId);
}

// Boot app
init();

