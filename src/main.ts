import { DiscordSDK } from '@discord/embedded-app-sdk';
import { Sync } from '@robojs/sync';
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

// ── Boot ───────────────────────────────────────────────
async function init() {
  try {
    // 1. Wait for Discord SDK to be ready
    await discordSdk.ready();

    // 2. Authorize
    const { code } = await discordSdk.commands.authorize({
      client_id: discordSdk.clientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify', 'rpc.voice.read'],
    });

    // Note: In a real app, you would exchange this code for an access token via your backend.
    // For this prototype, we'll authenticate directly if possible, or mock the user.
    // Assuming Robo.js backend handles the token exchange if configured, but for client-side:
    const authResult = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).then(res => res.json()).catch(() => ({ access_token: 'mock_token' }));

    await discordSdk.commands.authenticate({
      access_token: authResult.access_token,
    });

    // 3. Get current user & participants
    me = await fetch(`https://discord.com/api/users/@me`, {
      headers: { Authorization: `Bearer ${authResult.access_token}` }
    }).then(res => res.json()).catch(() => ({ id: '1', username: 'HostUser', avatar: null }));
    participants = [me]; // In a real app, listen to SPEAKING / voice events or use Robo Sync for presence.

    // 4. Initialize Robo Sync
    await sync.init({
      channelId: discordSdk.channelId,
      userId: me.id,
    });

    sync.on('stateChange', (state: any) => {
      if (state.navigate && state.navigate !== 'lobby') {
        goGame(state.navigate);
      } else if (state.navigate === 'lobby') {
        goLobby();
      }
    });

    goLobby();
  } catch (e) {
    console.error(e);
    // Fallback to local dev lobby if not in Discord
    me = { id: 'local_user', username: 'DevUser', avatar: null };
    participants = [me];
    goLobby();
  }
}

// ═══════════════════════════════════════════════════════
//  NAVIGATION FUNCTIONS
// ═══════════════════════════════════════════════════════

function goLobby(): void {
  currentGame?.destroy();
  currentGame = null;

  renderLobby(participants, {
    onGameSelect: handleGameSelect,
  });
}

function goGame(gameId: GameId): void {
  const entry = GAMES.find(g => g.id === gameId);
  if (!entry) return;

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
    // First user to join the lobby becomes host, or just whoever has the smallest ID
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
