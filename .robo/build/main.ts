import { DiscordSDK } from '@discord/embedded-app-sdk';
import { Sync } from './sync';
import { renderLobby, renderGameView, showToast, setWaitingOverlay, triggerFloatingReaction, updateGamePartner, cleanupGameView } from './ui';
import type { GameId } from './types';
import { GAME_MODULES } from './games';
import type { GameModule } from './games';
import { GAMES } from './ui';
import { profileManager } from './badges';
import { DuoBot, DUOBOT_USER } from './bot';
import { sound, haptic } from './audio';
import './style.css';

// ── App State ──────────────────────────────────────────
const sync = new Sync();
const duoBot = new DuoBot(sync);

let currentGame: GameModule | null = null;
let me: any = null;
let participants: any[] = [];
let currentScreen: string = 'lobby';
let gamePendingInit: { mod: GameModule, canvas: HTMLCanvasElement, isHost: boolean } | null = null;
let currentRoomId = 'global';
let reactionCounter = 0;
let discordSdkInstance: DiscordSDK | null = null;
let isDiscordMode = false;

// Deterministic Host Arbitrage (Prevents Split-Brain)
function getIsHost(): boolean {
  if (participants.length === 0) return true;
  // DuoBot is a client-side simulated companion, NOT a network host client!
  const humans = participants.filter(p => !p.isBot && p.id !== DUOBOT_USER.id);
  if (humans.length <= 1) return true;
  const sorted = [...humans].sort((a, b) => a.id.localeCompare(b.id));
  return sorted[0]?.id === me.id;
}

// ── Navigation state change handler ───────────────────
function handleNavigationChange(state: any) {
  if (state.host_location === null && currentScreen !== 'lobby') {
    goLobby();
    return;
  }
  if (currentScreen === 'lobby') {
    renderLobby(participants, {
      onGameSelect: handleGameSelect,
      hostLocation: state.host_location,
      onInvite: handleInvite,
      inviteType: getInviteType(),
      onPlayBot: handlePlayWithBot,
      onProfileUpdate: handleProfileUpdate,
    });
  }
}

// ── Bootstrapping ──────────────────────────────────────
async function init() {
  const app = document.getElementById('app')!;
  app.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;font-size:2rem;color:var(--ink-secondary);">Cargando DuoPlay...</div>';

  const urlParams = new URLSearchParams(window.location.search);
  const isDiscordEnv = urlParams.has('frame_id') || navigator.userAgent.includes('Discord');

  // Room identification
  currentRoomId = urlParams.get('room') || (isDiscordEnv ? 'discord_main' : `SALA-${Math.floor(100 + Math.random() * 900)}`);
  if (!urlParams.has('room') && !isDiscordEnv) {
    urlParams.set('room', currentRoomId);
    window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`);
  }

  // Load user profile
  const profile = profileManager.getProfile();

  if (isDiscordEnv) {
    try {
      const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID || '123456789012345678');
      await Promise.race([
        discordSdk.ready(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Discord timeout')), 4000))
      ]);

      const { code } = await discordSdk.commands.authorize({
        client_id: discordSdk.clientId,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'rpc.voice.read'],
      });

      const authResult = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }).then(res => res.json()).catch(() => ({ access_token: 'mock_token' }));

      await discordSdk.commands.authenticate({ access_token: authResult.access_token });

      const discordUser = await fetch(`https://discord.com/api/users/@me`, {
        headers: { Authorization: `Bearer ${authResult.access_token}` }
      }).then(res => res.json()).catch(() => null);

      discordSdkInstance = discordSdk;
      isDiscordMode = true;

      me = {
        id: discordUser?.id || `u_${Math.random().toString(36).slice(2, 7)}`,
        username: profile.customName || discordUser?.username || 'Gamer Discord',
        avatar: discordUser?.avatar || null,
        avatarIcon: profile.avatarIcon,
        accessory: profile.accessory,
        equippedBadges: profile.equippedBadgeIds,
      };

      currentRoomId = discordSdk.channelId || currentRoomId;
    } catch (e) {
      console.warn('Fallback a modo Web Standalone desde Discord:', e);
      discordSdkInstance = null;
      isDiscordMode = false;
      setupStandaloneUser(profile);
    }
  } else {
    discordSdkInstance = null;
    isDiscordMode = false;
    setupStandaloneUser(profile);
  }

  participants = [me];

  // Initialize WebSocket Relay
  try {
    await sync.init({
      channelId: currentRoomId,
      userId: me.id,
    });
  } catch (err) {
    console.error('Error conectando a relay:', err);
  }

  setupSyncListeners();
  sync.sendPresence(me);
  goLobby();
}

function setupStandaloneUser(profile: ReturnType<typeof profileManager.getProfile>) {
  // Tab-isolated unique ID for local testing and web play
  let tabUid = sessionStorage.getItem('duoplay_tab_uid');
  if (!tabUid) {
    tabUid = `web_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('duoplay_tab_uid', tabUid);
  }

  me = {
    id: tabUid,
    username: profile.customName || `Jugador_${tabUid.slice(-3)}`,
    avatar: null,
    avatarIcon: profile.avatarIcon,
    accessory: profile.accessory,
    equippedBadges: profile.equippedBadgeIds,
  };
}

function setupSyncListeners() {
  sync.on('stateChange', handleNavigationChange);

  // Presence: new user joined
  sync.on('presence', (user: any) => {
    if (!user || user.id === me.id) return;

    const existingIdx = participants.findIndex(p => p.id === user.id);
    if (existingIdx >= 0) {
      participants[existingIdx] = user; // Update profile/badges
    } else {
      participants.push(user);
      showToast(`👋 ${user.username} se unió a la sala`);
      sound.victory();
      haptic(30);

      // Reply with our presence so they know we are here
      sync.sendPresence(me);

      if (currentScreen === 'lobby') {
        goLobby();
      } else if (participants.length >= 2) {
        setWaitingOverlay(false);
        const partner = participants.find(p => p.id !== me?.id);
        updateGamePartner(partner);
        if (gamePendingInit) {
          gamePendingInit.mod.init({
            canvas: gamePendingInit.canvas,
            sync,
            me,
            isHost: getIsHost(),
          });
          gamePendingInit = null;
        }
      }
    }
  });

  // Peer disconnected
  sync.on('peerDisconnect', (data: any) => {
    const idx = participants.findIndex(p => p.id === data.userId);
    if (idx >= 0) {
      const leftUser = participants[idx];
      participants.splice(idx, 1);
      showToast(`⚠️ ${leftUser.username} se ha desconectado`);

      if (currentScreen !== 'lobby' && participants.length < 2) {
        setWaitingOverlay(true);
        updateGamePartner(null);
      } else if (currentScreen === 'lobby') {
        goLobby();
      }
    }
  });

  // Social reaction received
  sync.on('reaction', (data: any) => {
    triggerFloatingReaction(data.emoji, data.xRatio);
  });
}

// ═══════════════════════════════════════════════════════
//  NAVIGATION FUNCTIONS
// ═══════════════════════════════════════════════════════

function goLobby(): void {
  currentScreen = 'lobby';
  const hasBot = participants.some(p => p.id === DUOBOT_USER.id);
  if (hasBot) {
    duoBot.start('lobby');
  } else {
    duoBot.stop();
  }
  cleanupGameView();
  document.querySelectorAll('.rematch-backdrop, .modal-backdrop').forEach(el => el.remove());

  if (!gamePendingInit) {
    currentGame?.destroy();
  }
  currentGame = null;
  gamePendingInit = null;
  sync.setState({ host_location: null });

  renderLobby(participants, {
    onGameSelect: handleGameSelect,
    hostLocation: sync.getState().host_location,
    onInvite: handleInvite,
    inviteType: getInviteType(),
    onPlayBot: handlePlayWithBot,
    onProfileUpdate: handleProfileUpdate,
  });
}

function goGame(gameId: GameId): void {
  const entry = GAMES.find(g => g.id === gameId);
  if (!entry) return;

  currentScreen = gameId;
  cleanupGameView();
  document.querySelectorAll('.rematch-backdrop, .modal-backdrop').forEach(el => el.remove());

  if (!gamePendingInit) {
    currentGame?.destroy();
  }
  currentGame = null;

  const partner = participants.find(p => p.id !== me?.id);

  const canvas = renderGameView(entry, {
    onBack: () => goLobby(),
    onPlayBot: () => handlePlayWithBot(),
    onReaction: (emoji) => handleSendReaction(emoji),
  }, partner);

  const mod = GAME_MODULES[gameId]?.();
  if (mod) {
    currentGame = mod;
    const isHost = getIsHost();

    if (participants.length < 2) {
      setWaitingOverlay(true);
      gamePendingInit = { mod, canvas, isHost };
    } else {
      setWaitingOverlay(false);
      mod.init({ canvas, sync, me, isHost });
    }

    const hasBot = participants.some(p => p.id === DUOBOT_USER.id);
    if (hasBot) {
      duoBot.start(gameId);
    }

    showToast(`${entry.emoji} ${entry.name}`);
  }
}

// ═══════════════════════════════════════════════════════
//  ACTIONS & HANDLERS
// ═══════════════════════════════════════════════════════

function handleGameSelect(gameId: GameId): void {
  sync.setState({ host_location: gameId });
  goGame(gameId);
}

function getInviteType(): 'discord' | 'link' | 'none' {
  if (isDiscordMode) {
    // Discord openInviteDialog requires a guild context (throws RPCError.INVALID_CHANNEL in DMs/GDMs)
    if (discordSdkInstance && discordSdkInstance.guildId != null && typeof discordSdkInstance.commands?.openInviteDialog === 'function') {
      return 'discord';
    }
    return 'none';
  }
  return 'link';
}

async function handleInvite(): Promise<void> {
  if (isDiscordMode) {
    if (discordSdkInstance && typeof discordSdkInstance.commands?.openInviteDialog === 'function') {
      try {
        await discordSdkInstance.commands.openInviteDialog();
      } catch (err) {
        console.warn('Error abriendo diálogo de invitación de Discord:', err);
        showToast('⚠️ No se puede invitar en este canal de Discord.');
      }
    }
    return;
  }

  // Standalone Web mode
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoomId)}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('📋 ¡Enlace copiado! Pégaselo a tu compañero.');
    }).catch(() => {
      prompt('Copia este enlace de sala:', shareUrl);
    });
  } else {
    prompt('Copia este enlace de sala:', shareUrl);
  }
}

function handlePlayWithBot(): void {
  if (!participants.find(p => p.id === DUOBOT_USER.id)) {
    participants.push(DUOBOT_USER);
  }
  profileManager.unlockBadge('bot-whisperer');
  showToast('🤖 DuoBot se ha unido como compañero.');

  setWaitingOverlay(false);
  updateGamePartner(DUOBOT_USER);
  duoBot.start(currentScreen);

  if (gamePendingInit) {
    gamePendingInit.mod.init({
      canvas: gamePendingInit.canvas,
      sync,
      me,
      isHost: true,
    });
    gamePendingInit = null;
  } else if (currentScreen === 'lobby') {
    goLobby();
  }
}

function handleProfileUpdate(): void {
  const profile = profileManager.getProfile();
  me.username = profile.customName || me.username;
  me.avatarIcon = profile.avatarIcon;
  me.accessory = profile.accessory;
  me.equippedBadges = profile.equippedBadgeIds;
  sync.sendPresence(me);
}

function handleSendReaction(emoji: string): void {
  reactionCounter++;
  if (reactionCounter >= 5) {
    profileManager.unlockBadge('party-soul');
  }
  const xRatio = 0.2 + Math.random() * 0.6;
  sync.sendReaction(emoji, me.username, xRatio);
}

// Keyboard shortcuts for reactions (1-6)
window.addEventListener('keydown', (e) => {
  // Prevent hotkey interference while user is typing (e.g. nickname in profile modal)
  const target = e.target as HTMLElement | null;
  const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  if (isInput) return;

  // Also prevent when any modal or backdrop is active
  if (document.querySelector('.modal-backdrop')) return;

  const keyMap: Record<string, string> = {
    '1': '👏', '2': '😂', '3': '🔥', '4': '😱', '5': '❤️', '6': '👑'
  };
  if (keyMap[e.key] && currentScreen !== 'lobby') {
    const btn = document.querySelector(`.reaction-btn[data-key="${e.key}"]`);
    if (btn) {
      btn.classList.add('spring-pop');
      setTimeout(() => btn.classList.remove('spring-pop'), 400);
    }
    sound.pop ? sound.boing(450) : sound.click();
    haptic(15);
    handleSendReaction(keyMap[e.key]);
  }
});

// Boot app
init();
