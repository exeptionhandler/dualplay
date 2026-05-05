/**
 * DuoPlay — PeerManager
 * Wraps PeerJS and exposes a clean event-based API.
 */
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { DuoPlayMessage } from './types';

export type Role = 'host' | 'guest';

type EventMap = {
  open:       (peerId: string) => void;
  connected:  (role: Role) => void;
  message:    (msg: DuoPlayMessage) => void;
  disconnected: () => void;
  error:      (err: Error) => void;
};

export class PeerManager {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private handlers: Partial<{ [K in keyof EventMap]: EventMap[K][] }> = {};
  public role: Role | null = null;
  public myId: string | null = null;
  public peerId: string | null = null;
  public latency = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private pingTs = 0;

  // ── Event bus ──────────────────────────────────
  on<K extends keyof EventMap>(event: K, handler: EventMap[K]) {
    if (!this.handlers[event]) this.handlers[event] = [];
    (this.handlers[event] as EventMap[K][]).push(handler);
    return this;
  }
  private emit<K extends keyof EventMap>(event: K, ...args: Parameters<EventMap[K]>) {
    (this.handlers[event] as ((...a: Parameters<EventMap[K]>) => void)[] | undefined)
      ?.forEach(h => (h as (...a: Parameters<EventMap[K]>) => void)(...args));
  }

  // ── Create room (Host) ─────────────────────────
  createRoom(): void {
    this._initPeer();
  }

  // ── Join room (Guest) ──────────────────────────
  joinRoom(hostId: string): void {
    this._initPeer(() => {
      if (!this.peer) return;
      this.role = 'guest';
      const conn = this.peer.connect(hostId.trim().toUpperCase(), {
        reliable: true,
        serialization: 'json',
      });
      this._bindConn(conn);
    });
  }

  // ── Send message ───────────────────────────────
  send(msg: DuoPlayMessage): boolean {
    if (!this.conn?.open) return false;
    this.conn.send(msg);
    return true;
  }

  // ── Destroy ────────────────────────────────────
  destroy(): void {
    this._stopPing();
    this.conn?.close();
    this.peer?.destroy();
    this.conn = null;
    this.peer = null;
    this.myId = null;
    this.peerId = null;
    this.role = null;
  }

  // ── Internal: init Peer ────────────────────────
  private _initPeer(onOpen?: () => void): void {
    this.destroy();

    // Generate a short 6-char uppercase room code for host
    const customId = this._genId();

    this.peer = new Peer(customId, {
      // Use the public PeerJS cloud server
      host: '0.peerjs.com',
      port: 443,
      path: '/',
      secure: true,
      debug: 0,
    });

    this.peer.on('open', (id) => {
      this.myId = id;
      this.role = this.role ?? 'host'; // guest sets role before calling _initPeer
      this.emit('open', id);
      onOpen?.();
    });

    this.peer.on('connection', (conn) => {
      if (this.role !== 'host') return;
      this._bindConn(conn);
    });

    this.peer.on('error', (err) => {
      this.emit('error', err as Error);
    });

    this.peer.on('disconnected', () => {
      this.emit('disconnected');
    });
  }

  // ── Internal: bind data connection ─────────────
  private _bindConn(conn: DataConnection): void {
    this.conn = conn;
    this.peerId = conn.peer;

    conn.on('open', () => {
      this.emit('connected', this.role!);
      this._startPing();
    });

    conn.on('data', (raw) => {
      const msg = raw as DuoPlayMessage;
      // Handle ping/pong internally
      if (msg.type === 'ping') {
        this.send({ type: 'pong', ts: (msg as { type: 'ping'; ts: number }).ts });
        return;
      }
      if (msg.type === 'pong') {
        this.latency = Math.round((Date.now() - this.pingTs) / 2);
        return;
      }
      this.emit('message', msg);
    });

    conn.on('close', () => {
      this._stopPing();
      this.emit('disconnected');
    });

    conn.on('error', (err) => {
      this.emit('error', err as Error);
    });
  }

  // ── Internal: ping loop ─────────────────────────
  private _startPing(): void {
    this._stopPing();
    this.pingInterval = setInterval(() => {
      this.pingTs = Date.now();
      this.send({ type: 'ping', ts: this.pingTs });
    }, 2000);
  }
  private _stopPing(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ── Internal: generate short room ID ───────────
  private _genId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = 'DP-';
    for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }
}
