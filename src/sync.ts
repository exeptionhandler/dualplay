/**
 * Real-time Sync for DuoPlay.
 * Uses WebSockets to synchronize state between different devices/users.
 * Relays via the server.mjs WebSocket server with auto-reconnection and telemetry.
 */

type Listener = (data: any) => void;

export class Sync {
  private state: Record<string, any> = {};
  private listeners: Map<string, Set<Listener>> = new Map();
  private channelId: string | null = null;
  private userId: string | null = null;
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimeout: number | null = null;
  private pingInterval: number | null = null;
  private lastPingSent = 0;
  private currentPingMs = 0;
  private isDestroyed = false;
  private currentUserData: any = null;

  async init(opts: { channelId: string | null; userId: string }) {
    this.channelId = opts.channelId;
    this.userId = opts.userId;
    this.isDestroyed = false;

    return this.connect();
  }

  private connect(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.isDestroyed) return resolve();

      let settled = false;
      const settle = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      // Guard against hanging on slow or blocked network
      const connTimeout = window.setTimeout(() => {
        settle();
      }, 3500);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}?channelId=${encodeURIComponent(this.channelId || 'global')}`;

      try {
        this.ws = new WebSocket(wsUrl);
      } catch (err) {
        clearTimeout(connTimeout);
        this.scheduleReconnect();
        settle();
        return;
      }

      this.ws.onopen = () => {
        clearTimeout(connTimeout);
        console.log('[Sync] Conectado al servidor relay');
        const wasReconnect = this.reconnectAttempt > 0;
        this.reconnectAttempt = 0;
        this.emit('connectionStatus', { status: 'connected' });
        this.startPingLoop();

        // Resend presence on reconnect
        if (this.currentUserData) {
          this.sendPresence(this.currentUserData);
        }

        // If reconnecting, request latest game state snapshot from room cache/host
        if (wasReconnect) {
          try {
            this.ws?.send(JSON.stringify({ type: 'request_full_state', from: this.userId }));
          } catch (_) {}
        }

        settle();
      };

      this.ws.onerror = (err) => {
        clearTimeout(connTimeout);
        console.warn('[Sync] Error en WebSocket:', err);
        settle();
      };

      this.ws.onclose = () => {
        clearTimeout(connTimeout);
        settle();
        if (!this.isDestroyed) {
          console.log('[Sync] Conexión cerrada. Intentando reconexión...');
          this.emit('connectionStatus', { status: 'reconnecting' });
          this.scheduleReconnect();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.from === this.userId) return; // Ignore own messages

          if (data.type === 'pong') {
            this.currentPingMs = Math.round(performance.now() - this.lastPingSent);
            this.emit('ping', this.currentPingMs);
          } else if (data.type === 'state') {
            Object.assign(this.state, data.state);
            this.emit('stateChange', this.state);
          } else if (data.type === 'presence') {
            this.emit('presence', data.user);
          } else if (data.type === 'peer_disconnect') {
            this.emit('peerDisconnect', data);
          } else if (data.type === 'reaction') {
            this.emit('reaction', data);
          } else if (data.type === 'rematch') {
            this.emit('rematch', data);
          } else if (data.type === 'ping-marker') {
            this.emit('pingMarker', data);
          }
        } catch (e) {
          console.error('[Sync] Error parseando mensaje:', e);
        }
      };
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout !== null || this.isDestroyed) return;
    this.reconnectAttempt++;
    const delay = Math.min(8000, 500 * Math.pow(1.5, this.reconnectAttempt));

    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect().catch(() => {});
    }, delay);
  }

  private startPingLoop() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingSent = performance.now();
        try {
          this.ws.send(JSON.stringify({ type: 'ping', ts: Date.now(), from: this.userId }));
        } catch (_) {}
      }
    }, 4000);
  }

  public getPing(): number {
    return this.currentPingMs;
  }

  sendPresence(user: any) {
    this.currentUserData = user;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'presence',
          from: this.userId,
          user: user
        }));
      } catch (e) {
        console.warn('[Sync] Error enviando presencia:', e);
      }
    }
  }

  setState(partial: Record<string, any>) {
    Object.assign(this.state, partial);

    // Send to relay server
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'state',
          from: this.userId,
          state: partial,
        }));
      } catch (e) {
        console.warn('[Sync] Error enviando estado:', e);
      }
    }

    // Also notify local listeners
    this.emit('stateChange', this.state);
  }

  sendReaction(emoji: string, userName: string, xRatio = 0.5) {
    const payload = {
      type: 'reaction',
      from: this.userId,
      emoji,
      userName,
      xRatio
    };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (_) {}
    }
    this.emit('reaction', payload);
  }

  sendRematch(requestedBy: string, swapRoles = false) {
    const payload = {
      type: 'rematch',
      from: this.userId,
      requestedBy,
      swapRoles,
    };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (_) {}
    }
    this.emit('rematch', payload);
  }

  sendPingMarker(x: number, y: number) {
    const payload = {
      type: 'ping-marker',
      from: this.userId,
      x,
      y
    };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (_) {}
    }
    this.emit('pingMarker', payload);
  }

  requestFullState() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'request_full_state',
          from: this.userId,
        }));
      } catch (_) {}
    }
  }

  getState(): Record<string, any> {
    return { ...this.state };
  }

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  destroy() {
    this.isDestroyed = true;
    if (this.reconnectTimeout !== null) clearTimeout(this.reconnectTimeout);
    if (this.pingInterval !== null) clearInterval(this.pingInterval);
    this.ws?.close();
    this.listeners.clear();
  }
}
