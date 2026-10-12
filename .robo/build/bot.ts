/**
 * DuoPlay — DuoBot Autonomous Partner
 * Allows 100% playable single-player practice & local testing across all 7 minigames.
 */

import type { Sync } from './sync';

export interface BotUser {
  id: string;
  username: string;
  avatar: null;
  isBot: boolean;
  accessory: string;
  badges: string[];
}

export const DUOBOT_USER: BotUser = {
  id: 'bot_duo',
  username: 'DuoBot 🤖',
  avatar: null,
  isBot: true,
  accessory: '👑',
  badges: ['og-founder', 'bot-whisperer'],
};

export class DuoBot {
  private sync: Sync;
  private active = false;
  private intervalId: number | null = null;
  private currentScreen = '';

  constructor(sync: Sync) {
    this.sync = sync;
  }

  public start(screen: string) {
    this.active = true;
    this.currentScreen = screen;
    this.stopLoop();

    // Listen to game states
    this.sync.on('stateChange', this.handleStateChange);

    // Active tick for games that need autonomous actions
    this.intervalId = window.setInterval(() => {
      this.tick();
    }, 400);
  }

  public stop() {
    this.active = false;
    this.stopLoop();
    this.sync.off('stateChange', this.handleStateChange);
  }

  private stopLoop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private handleStateChange = (state: Record<string, any>) => {
    if (!this.active) return;

    // 1. Star Fishing Co-Tapping
    if (state.sfTap && state.sfTap.by !== DUOBOT_USER.id) {
      const starId = state.sfTap.starId;
      // React with human-like delay (120ms - 220ms)
      const delay = 120 + Math.random() * 100;
      setTimeout(() => {
        if (!this.active) return;
        this.sync.setState({
          sfTap: { starId, ts: Date.now(), by: DUOBOT_USER.id }
        });
      }, delay);
    }

    // 2. Inverse Gravity Shield
    if (state.igState && state.igState.obs && Array.isArray(state.igState.obs)) {
      // Check if any obstacle is close to the player x (avatar ~ 80px)
      const danger = state.igState.obs.some((o: any) => o.x > 80 && o.x < 190);
      if (danger && !state.igShieldActive) {
        // Trigger shield
        this.sync.setState({
          igShield: { active: true, by: DUOBOT_USER.id, ts: Date.now() }
        });
      }
    }

    // 3. Balloon Emergency Boost
    if (state.balloonState) {
      const b = state.balloonState;
      if (b.y > 0.72 && (!b.lastTapBy || b.lastTapBy !== DUOBOT_USER.id)) {
        setTimeout(() => {
          if (!this.active) return;
          this.sync.setState({
            balloonTap: { ts: Date.now(), by: DUOBOT_USER.id }
          });
        }, 150);
      }
    }
  };

  private tick() {
    if (!this.active) return;

    // 4. Tetris Dual P2 autonomous movements
    if (this.currentScreen === 'tetris-dual') {
      const moves = ['left', 'right', 'rot', 'drop'];
      const action = moves[Math.floor(Math.random() * moves.length)];
      if (Math.random() < 0.6) {
        this.sync.setState({
          tInput: { by: DUOBOT_USER.id, action, ts: Date.now() }
        });
      }
    }

    // 5. Crystal Bridge: If bot is the walker, step on next tile
    if (this.currentScreen === 'crystal-bridge') {
      const st = this.sync.getState();
      if (st.cbState && st.cbState.step !== undefined) {
        // Step forward periodically
        if (Math.random() < 0.35 && !st.cbState.gameOver && !st.cbState.won) {
          const side = Math.random() > 0.5 ? 0 : 1;
          this.sync.setState({
            cbStep: { side, by: DUOBOT_USER.id, ts: Date.now() }
          });
        }
      }
    }
  }
}
