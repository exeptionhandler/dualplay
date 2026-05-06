/**
 * Real-time Sync for DuoPlay.
 * Uses WebSockets to synchronize state between different devices/users.
 * Relays via the server.mjs WebSocket server.
 */

type StateListener = (state: any) => void;

export class Sync {
  private state: Record<string, any> = {};
  private listeners: Map<string, Set<StateListener>> = new Map();
  private channelId: string | null = null;
  private userId: string | null = null;
  private ws: WebSocket | null = null;

  async init(opts: { channelId: string | null; userId: string }) {
    this.channelId = opts.channelId;
    this.userId = opts.userId;

    // Determine WS URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}?channelId=${this.channelId || 'global'}`;

    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[Sync] Connected to relay server');
        resolve();
      };

      this.ws.onerror = (err) => {
        console.error('[Sync] WebSocket error:', err);
        reject(err);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.from === this.userId) return; // ignore own messages

          if (data.type === 'state') {
            Object.assign(this.state, data.state);
            this.emit('stateChange', this.state);
          } else if (data.type === 'presence') {
            this.emit('presence', data.user);
          }
        } catch (e) {
          console.error('[Sync] Failed to parse message:', e);
        }
      };
    });
  }

  sendPresence(user: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'presence',
        from: this.userId,
        user: user
      }));
    }
  }

  setState(partial: Record<string, any>) {
    Object.assign(this.state, partial);

    // Send to relay server
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'state',
        from: this.userId,
        state: partial, // Send only the partial update to save bandwidth
      }));
    }

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
    this.ws?.close();
    this.listeners.clear();
  }
}
