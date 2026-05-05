/**
 * Lightweight Sync replacement for DuoPlay.
 * Uses a simple WebSocket-like event system for state sharing.
 * Replaces @robojs/sync which has React dependencies that break Vite bundling.
 */

type StateListener = (state: any) => void;

export class Sync {
  private state: Record<string, any> = {};
  private listeners: Map<string, Set<StateListener>> = new Map();
  private channelId: string | null = null;
  private userId: string | null = null;
  private bc: BroadcastChannel | null = null;

  async init(opts: { channelId: string | null; userId: string }) {
    this.channelId = opts.channelId;
    this.userId = opts.userId;

    // Use BroadcastChannel for cross-tab sync (works in Activities iframe)
    const channelName = `dualplay-sync-${this.channelId || 'local'}`;
    this.bc = new BroadcastChannel(channelName);

    this.bc.onmessage = (event) => {
      if (event.data?.from === this.userId) return; // ignore own messages
      const newState = event.data?.state;
      if (newState) {
        Object.assign(this.state, newState);
        this.emit('stateChange', this.state);
      }
    };
  }

  setState(partial: Record<string, any>) {
    Object.assign(this.state, partial);

    // Broadcast to other participants
    this.bc?.postMessage({
      from: this.userId,
      state: this.state,
    });

    // Also notify local listeners
    this.emit('stateChange', this.state);
  }

  getState(): Record<string, any> {
    return { ...this.state };
  }

  on(event: string, listener: StateListener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: string, listener: StateListener) {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  destroy() {
    this.bc?.close();
    this.listeners.clear();
  }
}
